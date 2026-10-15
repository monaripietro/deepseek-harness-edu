/// <reference lib="webworker" />
/**
 * Module worker that owns the real language model (Transformers.js). Runs fully in the browser:
 * on the CPU through ONNX Runtime WASM (multi-threaded when the page is cross-origin isolated),
 * or on the GPU through WebGPU when available.
 *
 * Tools are given to the model through its own chat template (`tools` option), and tool calls /
 * tool results keep their native roles, so a small model sees exactly the format it was trained on.
 */
import {
  AutoModelForCausalLM,
  AutoTokenizer,
  DynamicCache,
  InterruptableStoppingCriteria,
  Tensor,
  TextStreamer,
  env,
} from '@huggingface/transformers'
import type { PreTrainedModel, PreTrainedTokenizer, ProgressInfo } from '@huggingface/transformers'
import { opfsAvailable, opfsCache } from './opfsCache'
import type { ChatMessage } from '../../domain/types'
import { MODEL_SOURCE, PROFILES, toolCallPrefix } from './profiles'
import type { ModelProfile } from './profiles'
import { classifyError, reasoningText, visibleText } from './textUtils'
import type { WorkerEvent, WorkerRequest } from './workerProtocol'

env.allowRemoteModels = !MODEL_SOURCE.selfHosted
env.allowLocalModels = MODEL_SOURCE.selfHosted
if (MODEL_SOURCE.selfHosted) env.localModelPath = MODEL_SOURCE.localModelPath
// Keep downloaded files in the private file system (the Cache API is unreliable on some setups).
if (opfsAvailable()) {
  env.useBrowserCache = false
  env.useCustomCache = true
  env.customCache = opfsCache
} else {
  env.useBrowserCache = true
}

const ctx = self
const post = (e: WorkerEvent) => { ctx.postMessage(e) }

/** CPU threads: ONNX Runtime WASM can use several cores only in a cross-origin isolated page. */
const THREADS = ctx.crossOriginIsolated ? Math.max(1, Math.min(navigator.hardwareConcurrency || 4, 8)) : 1
const onnxEnv = env.backends.onnx
if (onnxEnv.wasm) onnxEnv.wasm.numThreads = THREADS

let tokenizer: PreTrainedTokenizer | null = null
let model: PreTrainedModel | null = null
let profile: ModelProfile | null = null
let loading = false
let current: { id: string; criteria: InterruptableStoppingCriteria } | null = null
let device: 'wasm' | 'webgpu' = 'wasm'
/**
 * KV cache of the previous call. In the agent loop every step resends the same instructions, documents
 * and history: only the tokens after the longest common prefix need to be read again.
 */
let kv: { ids: number[]; cache: DynamicCache } | null = null

const MIN_REUSE = 16

/** Keep only the first `len` positions of every attention cache tensor ([batch, heads, seq, dim]). */
function cropCache(cache: DynamicCache, len: number): DynamicCache | null {
  const entries: Record<string, Tensor> = {}
  for (const [key, tensor] of Object.entries(cache)) {
    if (!key.startsWith('past_key_values.')) return null
    entries[key] = tensor.slice(null, null, [0, len], null)
  }
  return new DynamicCache(entries)
}

/** Reusable cache for this prompt, or undefined (then the whole prompt is read). */
function reusableCache(ids: number[]): { cache: DynamicCache; reused: number } | undefined {
  if (!kv || !profile?.kvReuse || device !== 'wasm') return undefined
  const max = Math.min(kv.ids.length, ids.length - 1)
  let common = 0
  while (common < max && kv.ids[common] === ids[common]) common++
  if (common < MIN_REUSE) return undefined
  const cache = common === kv.ids.length ? kv.cache : cropCache(kv.cache, common)
  return cache ? { cache, reused: common } : undefined
}
let pendingAbort = new Set<string>()

/** Tool-call markers must survive decoding: the harness parses them. */
// Special tokens that carry tool-call structure stay in the text (LFM/Qwen/Gemma markers, Gemma's <|"|> string quotes).
const KEEP = (tok: string) => !/tool_call|tool_response|<\|"\|>/.test(tok)

async function load(req: Extract<WorkerRequest, { type: 'load' }>): Promise<void> {
  if (loading) return
  loading = true
  try {
    profile = PROFILES[req.profile]
    device = req.device
    kv = null
    let initializingSent = false
    // Per-file bookkeeping as a fallback when the library does not emit `progress_total`.
    const perFile = new Map<string, { loaded: number; total: number }>()
    let sawTotal = false
    let lastPost = 0
    const report = (loaded: number, total: number, file?: string) => {
      const done = total > 0 && loaded >= total
      // At most ~7 updates per second: one message per read chunk slowed the load down.
      const now = performance.now()
      if (!done && now - lastPost < 150) return
      lastPost = now
      post({ type: 'progress', loaded, total, file, phase: 'downloading' })
      if (done && !initializingSent) {
        initializingSent = true
        post({ type: 'progress', loaded: total, total, phase: 'initializing' })
      }
    }
    // Text-only loads skip these sessions, but the library still counts them in the expected total.
    const SKIPPED = /vision_encoder|audio_encoder/
    const progress_callback = (info: ProgressInfo) => {
      if (info.status === 'progress_total') {
        sawTotal = true
        const files = Object.entries(info.files).filter(([name]) => !SKIPPED.test(name))
        const loaded = files.reduce((n, [, f]) => n + f.loaded, 0)
        const total = files.reduce((n, [, f]) => n + f.total, 0)
        const active = files.find(([, f]) => f.total > 0 && f.loaded < f.total)?.[0]
        report(loaded, total || info.total, active)
        return
      }
      if (sawTotal || !('file' in info)) return
      if (info.status === 'progress') {
        perFile.set(info.file, { loaded: info.loaded, total: info.total })
      } else if (info.status === 'done') {
        const f = perFile.get(info.file)
        if (f) perFile.set(info.file, { loaded: f.total || f.loaded, total: f.total || f.loaded })
      } else {
        return
      }
      let loaded = 0
      let total = 0
      for (const f of perFile.values()) {
        loaded += f.loaded
        total += f.total
      }
      const big = [...perFile.entries()].sort((a, b) => b[1].total - a[1].total)[0]
      report(loaded, Math.max(total, req.expectedBytes ?? 0), big?.[0])
    }
    // cacheOnly: the model is already on disk — no network request at all, and no per-chunk progress:
    // without a progress callback Transformers.js reads each file in one go instead of tiny chunks (much faster).
    const local_files_only = !!req.cacheOnly
    post(
      local_files_only
        ? { type: 'progress', loaded: 0, total: 0, phase: 'initializing' }
        : { type: 'progress', loaded: 0, total: 0, file: 'tokenizer', phase: 'downloading' },
    )
    tokenizer = await AutoTokenizer.from_pretrained(profile.repo, { local_files_only })
    model = await AutoModelForCausalLM.from_pretrained(profile.repo, {
      dtype: req.dtype,
      device: req.device,
      ...(local_files_only ? {} : { progress_callback }),
      local_files_only,
    })
    post({ type: 'progress', loaded: 1, total: 1, phase: 'initializing' })
    post({ type: 'ready', backend: req.device, threads: req.device === 'wasm' ? THREADS : 0 })
  } catch (err) {
    tokenizer = null
    model = null
    const { code, message, detail } = classifyError(err)
    console.error('[model.worker] load failed', err)
    post({ type: 'error', code, message, detail })
  } finally {
    loading = false
  }
}

/** Our messages -> the Hugging Face chat format (tool calls with object arguments, tool role kept). */
function toTemplateMessages(messages: ChatMessage[]) {
  return messages.map((m) => {
    if (m.role === 'assistant' && m.tool_calls?.length) {
      return {
        role: 'assistant',
        content: m.content,
        tool_calls: m.tool_calls.map(tc => ({ type: 'function', function: { name: tc.name, arguments: tc.arguments } })),
      }
    }
    if (m.role === 'tool') return { role: 'tool', content: m.content, ...(m.name ? { name: m.name } : {}) }
    return { role: m.role, content: m.content }
  })
}

/** Fallback for templates that reject the system role: fold it into the first user turn. */
function foldSystem(msgs: ReturnType<typeof toTemplateMessages>): ReturnType<typeof toTemplateMessages> {
  const sys = msgs.filter(m => m.role === 'system').map(m => m.content)
  if (!sys.length) return msgs
  const rest = msgs.filter(m => m.role !== 'system')
  const i = rest.findIndex(m => m.role === 'user')
  if (i < 0) return [{ role: 'user', content: sys.join('\n\n') }, ...rest]
  return rest.map((m, j) => (j === i ? { ...m, content: `${sys.join('\n\n')}\n\n${m.content}` } : m))
}

async function generate(req: Extract<WorkerRequest, { type: 'generate' }>): Promise<void> {
  const { id, maxNewTokens } = req
  if (!model || !tokenizer || !profile) {
    post({ type: 'error', id, code: 'unknown', message: 'Il modello non è caricato.' })
    return
  }
  const started = performance.now()
  const criteria = new InterruptableStoppingCriteria()
  current = { id, criteria }
  if (pendingAbort.has(id)) {
    pendingAbort.delete(id)
    criteria.interrupt()
  }
  try {
    const msgs = toTemplateMessages(req.messages)
    // Thinking switch (Qwen3, Gemma 4): the per-request setting overrides the profile default.
    const thinkingKw = profile.thinking && req.thinking !== undefined ? { enable_thinking: req.thinking } : {}
    const opts = {
      add_generation_prompt: true,
      return_dict: true as const,
      ...(req.tools?.length ? { tools: req.tools } : {}),
      ...(profile.templateKwargs ?? {}),
      ...thinkingKw,
    }
    let inputs
    let chat = msgs
    try {
      inputs = tokenizer.apply_chat_template(chat, opts)
    } catch {
      chat = foldSystem(msgs)
      inputs = tokenizer.apply_chat_template(chat, opts)
    }
    // Guided call: the prompt ends with the opening of the tool call, the model writes only the argument.
    const prefix = req.forceTool ? toolCallPrefix(profile.toolFormat, req.forceTool) : (req.prefill ?? '')
    if (prefix) {
      const promptText = tokenizer.apply_chat_template(chat, { ...opts, tokenize: false, return_dict: false })
      inputs = tokenizer(promptText + prefix, { add_special_tokens: false })
    }
    const tokensIn = inputs.input_ids.dims.at(-1)
    if (tokensIn === undefined) throw new Error('Il tokenizer ha restituito un tensore senza dimensioni.')
    const specials = tokenizer.all_special_tokens.filter(KEEP)

    let raw = ''
    let emitted = ''
    // Stop sequences: generation ends as soon as one appears (e.g. the closing tag of a block).
    const stops = (req.stop ?? []).filter(Boolean)
    const streaming = { stopHit: false }
    let generatedTokens = 0
    let lastThinkingPost = 0
    let reasoningSoFar = ''
    const streamer = new TextStreamer(tokenizer, {
      // Before the first visible text a thinking model is reasoning: report it (throttled).
      token_callback_function: () => {
        generatedTokens += 1
        if (!req.thinking || emitted) return
        const now = performance.now()
        if (now - lastThinkingPost < 250) return
        lastThinkingPost = now
        post({ type: 'thinking', id, tokens: generatedTokens, text: reasoningSoFar })
      },
      skip_prompt: true,
      skip_special_tokens: false,
      callback_function: (chunk: string) => {
        raw += chunk
        if (!streaming.stopHit && stops.some(stop => raw.includes(stop))) {
          streaming.stopHit = true
          criteria.interrupt()
        }
        if (req.thinking) reasoningSoFar = reasoningText(raw)
        const visible = visibleText(raw, specials, true)
        if (visible.length > emitted.length && visible.startsWith(emitted)) {
          post({ type: 'token', id, text: visible.slice(emitted.length) })
          emitted = visible
        }
      },
    })

    const ids = Array.from<number | bigint, number>(inputs.input_ids.data, Number)
    const reuse = reusableCache(ids)
    // No cap on the answer: at most the rest of the context window (the model normally stops much earlier).
    const config: { max_position_embeddings?: number; text_config?: { max_position_embeddings?: number } } = model.config
    const window = config.max_position_embeddings ?? config.text_config?.max_position_embeddings ?? 32768
    const maxNew = Math.max(1, Math.min(maxNewTokens, window - ids.length))
    const outputs = await model.generate({
      ...inputs,
      ...(reuse ? { past_key_values: reuse.cache } : {}),
      max_new_tokens: maxNew,
      do_sample: false,
      repetition_penalty: profile.repetitionPenalty,
      streamer,
      stopping_criteria: criteria,
      return_dict_in_generate: true,
    })
    if (!('sequences' in outputs) || !(outputs.sequences instanceof Tensor)) {
      throw new Error('Il modello non ha restituito una sequenza di token valida.')
    }
    const sequences = outputs.sequences
    const cache = 'past_key_values' in outputs ? outputs.past_key_values : undefined
    if (profile.kvReuse && device === 'wasm' && cache != null) {
      if (!(cache instanceof DynamicCache)) throw new Error('Il modello ha restituito una cache dei token non valida.')
      const all = Array.from<number | bigint, number>(sequences.data, Number)
      const len = cache.get_seq_length()
      kv = { ids: all.slice(0, len), cache }
    }
    if (reuse) console.info(`[model.worker] riuso cache: ${reuse.reused}/${ids.length} token già letti`)

    const totalTokens = sequences.dims.at(-1)
    if (totalTokens === undefined) throw new Error('Il modello ha restituito un tensore senza dimensioni.')
    const generated = sequences.slice(null, [tokensIn, totalTokens])
    const tokensOut = generated.dims.at(-1)
    if (tokensOut === undefined) throw new Error('Il modello ha restituito un tensore senza dimensioni.')
    const decoded = tokenizer.batch_decode(generated, { skip_special_tokens: false })[0] ?? ''
    let text = visibleText(prefix + decoded, specials, false)
    if (streaming.stopHit) {
      // Keep the text up to the end of the first stop sequence (the tokens decoded after it are dropped).
      const ends = stops.map(stop => (text.includes(stop) ? text.indexOf(stop) + stop.length : -1)).filter(end => end >= 0)
      if (ends.length) text = text.slice(0, Math.min(...ends))
    }
    const eos = model.generation_config?.eos_token_id
    const eosIds: number[] = Array.isArray(eos) ? eos : eos != null ? [eos] : []
    const lastId = Number(generated.data[generated.data.length - 1])
    const finishReason = streaming.stopHit
      ? 'stop'
      : criteria.interrupted ? 'aborted' : !eosIds.includes(lastId) && tokensOut >= maxNew ? 'length' : 'stop'
    // The complete reasoning of this call (the streamed one may miss the last words).
    if (req.thinking) post({ type: 'thinking', id, tokens: tokensOut, text: reasoningText(prefix + decoded) })
    post({ type: 'done', id, text, tokensIn, tokensOut, durationMs: performance.now() - started, finishReason })
  } catch (err) {
    const { code, message, detail } = classifyError(err)
    console.error('[model.worker] generate failed', err)
    post({ type: 'error', id, code, message, detail })
  } finally {
    current = null
  }
}

async function unload(): Promise<void> {
  try {
    await model?.dispose()
  } catch (error) {
    console.error('[model.worker] unload failed', error)
  }
  model = null
  tokenizer = null
  kv = null
  post({ type: 'unloaded' })
}

ctx.addEventListener('message', (ev: MessageEvent<WorkerRequest>) => {
  const msg = ev.data
  switch (msg.type) {
    case 'load':
      void load(msg)
      break
    case 'generate':
      void generate(msg)
      break
    case 'abort':
      if (current?.id === msg.id) current.criteria.interrupt()
      else pendingAbort.add(msg.id)
      break
    case 'unload':
      pendingAbort = new Set()
      void unload()
      break
  }
})
