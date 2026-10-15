import type { ChatMessage, ModelInfo, ModelRequest, ModelResponse, ModelRuntime, ThinkingEffort } from '../../domain/types'
import { REAL_EXTERNAL } from '../../domain/types'

/**
 * Bigger models through OpenRouter (https://openrouter.ai), called from the browser with the user's key.
 * The request leaves the browser: provenance is REAL · ESTERNO. Tool calls come back as structured
 * `tool_calls` and are rewritten as <tool_call>{…}</tool_call> so the harness parses them like a local model.
 * Reasoning is requested with `exclude: true`: the model may think, but its reasoning is never received or shown.
 */

const API = 'https://openrouter.ai/api/v1'

export interface RemoteModel {
  id: string
  name: string
  contextLength: number
  /** USD per million tokens. */
  promptPrice: number
  completionPrice: number
  /** Supports reasoning (effort applies). */
  reasoning: boolean
  /** Supports tool calling (required by the harness). */
  tools: boolean
}

let modelsCache: RemoteModel[] | null = null

/** Public model list (no key needed). */
export async function fetchOpenRouterModels(signal?: AbortSignal): Promise<RemoteModel[]> {
  if (modelsCache) return modelsCache
  const res = await fetch(`${API}/models`, { signal, credentials: 'omit' })
  if (!res.ok) throw new Error(`OpenRouter non risponde (errore ${res.status}).`)
  const json = (await res.json()) as { data?: Record<string, unknown>[] }
  modelsCache = (json.data ?? []).map((m) => {
    const params = (m.supported_parameters as string[] | undefined) ?? []
    const pricing = (m.pricing as Record<string, string> | undefined) ?? {}
    return {
      id: String(m.id),
      name: String(m.name ?? m.id),
      contextLength: Number(m.context_length ?? 0),
      promptPrice: Number(pricing.prompt ?? 0) * 1e6,
      completionPrice: Number(pricing.completion ?? 0) * 1e6,
      reasoning: params.includes('reasoning') || params.includes('include_reasoning'),
      tools: params.includes('tools'),
    }
  })
  return modelsCache
}

function fnv(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0
  return h.toString(16).padStart(8, '0')
}

/** Our messages → OpenAI format (assistant tool_calls with ids, tool results bound to those ids). */
function toOpenAI(messages: ChatMessage[]): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = []
  const pending: string[] = []
  let n = 0
  for (const m of messages) {
    if (m.role === 'assistant' && m.tool_calls?.length) {
      const calls = m.tool_calls.map(tc => ({ id: `call_${++n}`, type: 'function', function: { name: tc.name, arguments: JSON.stringify(tc.arguments ?? {}) } }))
      pending.push(...calls.map(c => c.id))
      out.push({ role: 'assistant', content: m.content || null, tool_calls: calls })
    } else if (m.role === 'tool') {
      out.push({ role: 'tool', tool_call_id: pending.shift() ?? `call_${++n}`, content: m.content })
    } else {
      out.push({ role: m.role, content: m.content })
    }
  }
  return out
}

function describeError(status: number, body: string): string {
  if (status === 401) return 'Chiave OpenRouter non valida o revocata.'
  if (status === 402) return 'Credito OpenRouter esaurito: ricarica il conto o scegli un modello gratuito.'
  if (status === 429) return 'Troppe richieste a OpenRouter: attendi qualche secondo e riprova.'
  let detail = ''
  try {
    detail = (JSON.parse(body) as { error?: { message?: string } }).error?.message ?? ''
  } catch {
    /* not JSON */
  }
  return `OpenRouter ha risposto con un errore (${status})${detail ? `: ${detail.slice(0, 160)}` : ''}.`
}

/** One streamed tool-call fragment: name and arguments arrive in pieces, grouped by `index`. */
interface StreamToolCallDelta {
  index?: unknown
  function?: { name?: string; arguments?: string }
}

interface StreamDelta {
  content?: unknown
  reasoning?: unknown
  tool_calls?: StreamToolCallDelta[]
}

/** One `data:` line of the OpenAI-compatible SSE stream (only the fields read here). */
interface StreamChunk {
  error?: { message?: unknown }
  choices?: { delta?: StreamDelta; finish_reason?: string | null }[]
  usage?: { prompt_tokens?: number; completion_tokens?: number }
}

export interface OpenRouterRuntimeOptions {
  model: RemoteModel
  apiKey: () => Promise<string | null>
  thinking: () => ThinkingEffort
}

export function createOpenRouterRuntime({ model, apiKey, thinking }: OpenRouterRuntimeOptions): ModelRuntime {
  const info: ModelInfo = {
    profile: 'openrouter',
    id: model.id,
    label: `${model.name} · OpenRouter`,
    backend: 'remote',
    fingerprint: fnv(model.id),
    nativeTools: true,
    reasoning: model.reasoning,
    provenance: { ...REAL_EXTERNAL, note: 'Modello su OpenRouter: la richiesta esce dal browser.' },
  }
  let ready = false

  const post = async (key: string, body: Record<string, unknown>, signal: AbortSignal) =>
    fetch(`${API}/chat/completions`, {
      method: 'POST',
      credentials: 'omit',
      signal,
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': location.origin,
        'X-Title': 'Harness Lab',
      },
      body: JSON.stringify(body),
    })

  return {
    info,
    isReady: () => ready,

    async load(onProgress) {
      onProgress({ phase: 'checking', loadedBytes: 0, totalBytes: 0, source: 'network' })
      const key = await apiKey()
      if (!key) throw new Error('Manca la chiave OpenRouter: inseriscila nella scheda OpenRouter.')
      ready = true
      onProgress({ phase: 'ready', loadedBytes: 1, totalBytes: 1, source: 'network' })
    },

    async generate(req: ModelRequest, onToken, signal, onThinking): Promise<ModelResponse> {
      const key = await apiKey()
      if (!key) throw new Error('Manca la chiave OpenRouter.')
      const started = performance.now()
      const effort = thinking()
      const body: Record<string, unknown> = {
        model: model.id,
        messages: toOpenAI(req.messages),
        stream: true,
        temperature: 0,
        // No max_tokens: no cap on the answer (hidden reasoning would also eat into it and cut the answer off).
        usage: { include: true },
      }
      if (req.tools?.length) {
        body.tools = req.tools
        body.parallel_tool_calls = false
      }
      const forceName = req.forceTool?.name
      const forced = forceName !== undefined && req.tools?.some(t => t.function.name === forceName)
      if (forced) body.tool_choice = { type: 'function', function: { name: forceName } }
      // Reasoning: off for guided calls (some providers reject both). Its text, when the provider returns it,
      // is shown only if the user expands it.
      if (model.reasoning) body.reasoning = effort === 'off' || forced ? { enabled: false } : { effort, exclude: false }
      if (model.reasoning && effort !== 'off' && !forced) onThinking?.(0)

      let res = await post(key, body, signal)
      if (res.status === 400 && (forced || body.reasoning)) {
        // Some providers reject forced tool choice or the reasoning switch: retry once without them.
        delete body.tool_choice
        delete body.reasoning
        res = await post(key, body, signal)
      }
      if (!res.ok || !res.body) throw new Error(describeError(res.status, await res.text().catch(() => '')))

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let content = ''
      let reasoning = ''
      let lastReasoningPost = 0
      const calls: { name: string; args: string }[] = []
      let finish = 'stop'
      let usage: { prompt_tokens?: number; completion_tokens?: number } | undefined
      try {
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          let nl: number
          while ((nl = buffer.indexOf('\n')) >= 0) {
            const line = buffer.slice(0, nl).trim()
            buffer = buffer.slice(nl + 1)
            if (!line.startsWith('data:')) continue
            const data = line.slice(5).trim()
            if (!data || data === '[DONE]') continue
            let chunk: StreamChunk
            try {
              chunk = JSON.parse(data) as StreamChunk
            } catch {
              continue
            }
            if (chunk.error) throw new Error(`OpenRouter: ${String(chunk.error.message ?? 'errore').slice(0, 160)}`)
            const choice = chunk.choices?.[0]
            const delta: StreamDelta = choice?.delta ?? {}
            if (typeof delta.reasoning === 'string' && delta.reasoning) {
              reasoning += delta.reasoning
              const now = performance.now()
              if (now - lastReasoningPost > 250) {
                lastReasoningPost = now
                onThinking?.(0, reasoning)
              }
            }
            if (typeof delta.content === 'string' && delta.content) {
              content += delta.content
              onToken(delta.content)
            }
            for (const tc of delta.tool_calls ?? []) {
              const k = typeof tc.index === 'number' ? tc.index : 0
              const slot = (calls[k] ??= { name: '', args: '' })
              if (tc.function?.name) slot.name += tc.function.name
              if (tc.function?.arguments) slot.args += tc.function.arguments
            }
            if (choice?.finish_reason) finish = choice.finish_reason
            if (chunk.usage) usage = chunk.usage
          }
        }
      } catch (err) {
        if (signal.aborted) {
          return { text: content, durationMs: performance.now() - started, finishReason: 'aborted', provenance: info.provenance }
        }
        throw err
      }

      // The harness handles one call at a time: the first one, in the format its parser reads.
      const call = calls.find(c => c?.name)
      let text = content
      if (call) {
        let args: unknown = {}
        try {
          args = call.args.trim() ? JSON.parse(call.args) : {}
        } catch {
          args = {}
        }
        text = `${content.trim() ? `${content.trim()}\n` : ''}<tool_call>${JSON.stringify({ name: call.name, arguments: args })}</tool_call>`
      }
      return {
        text,
        tokensIn: usage?.prompt_tokens,
        tokensOut: usage?.completion_tokens,
        durationMs: performance.now() - started,
        finishReason: signal.aborted ? 'aborted' : finish === 'length' ? 'length' : 'stop',
        provenance: info.provenance,
      }
    },

    async unload() {
      ready = false
    },
  }
}
