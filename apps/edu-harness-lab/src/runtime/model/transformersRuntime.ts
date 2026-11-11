import type { LoadProgress, ModelInfo, ModelRequest, ModelResponse, ModelRuntime, ThinkingEffort } from '../../domain/types'
import { REAL_LOCAL } from '../../domain/types'
import { detectCapabilities } from './capabilities'
import { fingerprintFor, PROFILES, resolveVariant, type TransformersProfileId, THINKING_BUDGET } from './profiles'
import type { WorkerEvent, WorkerRequest } from './workerProtocol'
import { WORKER_MESSAGES_EN } from './textUtils'
import { tr } from '../../i18n'

/** A message from the worker (Italian), shown in the interface language. */
const localizeWorkerMessage = (message: string): string => tr(message, WORKER_MESSAGES_EN[message] ?? message)

export interface TransformersRuntimeOptions {
  /** Test seam: supply a fake worker. */
  workerFactory?: () => Worker
  /** Current reasoning effort (read at every request). */
  thinking?: () => ThinkingEffort
}

let idCounter = 0
const nextId = () => `gen-${Date.now().toString(36)}-${++idCounter}`

const abortError = () => {
  const e = new Error(tr('Operazione annullata.', 'Operation cancelled.'))
  e.name = 'AbortError'
  return e
}

/**
 * ModelRuntime backed by Transformers.js running in a dedicated module worker (WebGPU, WASM only for the light
 * profile). The worker is created lazily on the first load and terminated on unload.
 */
export function createTransformersRuntime(profileId: TransformersProfileId, options: TransformersRuntimeOptions = {}): ModelRuntime {
  const profile = PROFILES[profileId]
  if (profile.runtime === 'wllama') throw new Error(tr(`${profile.label} richiede il runtime GGUF.`, `${profile.label} needs the GGUF runtime.`))
  const info: ModelInfo = {
    profile: profile.id,
    id: profile.repo,
    label: profile.label,
    backend: 'none',
    dtype: (profile.cpu ?? profile.gpu)?.dtype,
    sizeBytes: (profile.cpu ?? profile.gpu)?.sizeBytes,
    fingerprint: '—',
    license: profile.license,
    nativeTools: true,
    reasoning: !!profile.thinking,
    provenance: REAL_LOCAL,
  }

  let worker: Worker | null = null
  let ready = false
  let loadPromise: Promise<void> | null = null
  // Listeners receive every worker event; each operation registers/unregisters its own.
  const listeners = new Set<(e: WorkerEvent) => void>()

  const createWorker = (): Worker =>
    options.workerFactory
      ? options.workerFactory()
      : new Worker(new URL('./model.worker.ts', import.meta.url), { type: 'module' })

  const ensureWorker = (): Worker => {
    if (worker) return worker
    const w = createWorker()
    w.addEventListener('message', (ev: MessageEvent<WorkerEvent>) => {
      for (const l of [...listeners]) l(ev.data)
    })
    w.addEventListener('error', (ev: ErrorEvent) => {
      const evt: WorkerEvent = {
        type: 'error',
        code: 'unknown',
        message: tr('Il processo del modello si è interrotto in modo imprevisto.', 'The model process stopped unexpectedly.'),
        detail: ev.message,
      }
      for (const l of [...listeners]) l(evt)
    })
    worker = w
    return w
  }

  const send = (msg: WorkerRequest) =>{  ensureWorker().postMessage(msg) }

  const terminate = () => {
    worker?.terminate()
    worker = null
    ready = false
    loadPromise = null
    info.backend = 'none'
  }

  const runtime: ModelRuntime = {
    info,
    isReady: () => ready,

    load(onProgress, signal, opts) {
      if (ready) return Promise.resolve()
      if (loadPromise) return loadPromise
      loadPromise = (async () => {
        if (signal?.aborted) throw abortError()
        onProgress({ phase: 'checking', loadedBytes: 0, totalBytes: info.sizeBytes ?? 0, message: tr('Verifica del dispositivo…', 'Checking the device…') })
        const caps = await detectCapabilities()
        const variant = resolveVariant(profile, caps.webgpu, caps.shaderF16)
        if (!variant) {
          throw new Error(
            tr(
              `${profile.label} richiede una scheda grafica compatibile (WebGPU), che qui non è disponibile. Scegli LFM2.5 350M o Qwen3 0.6B: girano sulla CPU.`,
              `${profile.label} needs a compatible graphics card (WebGPU), which is not available here. Choose LFM2.5 350M or Qwen3 0.6B: they run on the CPU.`,
            ),
          )
        }
        info.dtype = variant.dtype
        info.sizeBytes = variant.sizeBytes
        info.fingerprint = fingerprintFor(profile, variant)

        await new Promise<void>((resolve, reject) => {
          const cleanup = () => {
            listeners.delete(onEvent)
            signal?.removeEventListener('abort', onAbort)
          }
          const onAbort = () => {
            cleanup()
            terminate()
            onProgress({ phase: 'idle', loadedBytes: 0, totalBytes: 0 })
            reject(abortError())
          }
          const onEvent = (e: WorkerEvent) => {
            if (e.type === 'progress') {
              const total = e.total > 0 ? e.total : (info.sizeBytes ?? 0)
              const p: LoadProgress =
                e.phase === 'downloading'
                  ? { phase: 'downloading', loadedBytes: e.loaded, totalBytes: total, file: e.file }
                  : { phase: 'initializing', loadedBytes: total, totalBytes: total, message: variant.device === 'webgpu'
                    ? tr('Avvio sulla scheda grafica (WebGPU)…', 'Starting on the graphics card (WebGPU)…')
                    : tr('Avvio sul processore (CPU)…', 'Starting on the processor (CPU)…') }
              onProgress(p)
            } else if (e.type === 'ready') {
              info.backend = e.backend
              info.label = `${profile.label} · ${e.backend === 'webgpu' ? 'GPU' : e.threads > 1 ? `CPU ${e.threads} thread` : 'CPU'}`
              ready = true
              cleanup()
              onProgress({ phase: 'ready', loadedBytes: 1, totalBytes: 1 })
              resolve()
            } else if (e.type === 'error' && e.id === undefined) {
              cleanup()
              terminate()
              onProgress({ phase: 'error', loadedBytes: 0, totalBytes: 0, message: localizeWorkerMessage(e.message) })
              reject(new Error(localizeWorkerMessage(e.message)))
            }
          }
          listeners.add(onEvent)
          signal?.addEventListener('abort', onAbort, { once: true })
          send({ type: 'load', profile: profileId, device: variant.device, dtype: variant.dtype, expectedBytes: variant.sizeBytes, cacheOnly: opts?.cacheOnly })
        })
      })()
      loadPromise.catch(() => {
        loadPromise = null
      })
      return loadPromise
    },

    generate(req: ModelRequest, onToken, signal, onThinking) {
      return new Promise<ModelResponse>((resolve, reject) => {
        if (!ready || !worker) {
          reject(new Error(tr('Il modello reale non è caricato.', 'The real model is not loaded.')))
          return
        }
        const id = nextId()
        const finish = () => {
          listeners.delete(onEvent)
          signal.removeEventListener('abort', onAbort)
        }
        const onAbort = () => {
          // The worker interrupts at the next token and answers with finishReason 'aborted'.
          send({ type: 'abort', id })
        }
        const onEvent = (e: WorkerEvent) => {
          if (e.type === 'token' && e.id === id) onToken(e.text)
          else if (e.type === 'thinking' && e.id === id) onThinking?.(e.tokens, e.text)
          else if (e.type === 'done' && e.id === id) {
            finish()
            resolve({
              text: e.text,
              tokensIn: e.tokensIn,
              tokensOut: e.tokensOut,
              durationMs: e.durationMs,
              finishReason: e.finishReason,
              provenance: { ...REAL_LOCAL },
            })
          } else if (e.type === 'error' && (e.id === id || e.id === undefined)) {
            finish()
            reject(new Error(localizeWorkerMessage(e.message)))
          }
        }
        listeners.add(onEvent)
        signal.addEventListener('abort', onAbort, { once: true })
        // Reasoning: switched on in the chat template, with extra tokens for the hidden thinking (never for a guided call).
        const effort = profile.thinking ? (options.thinking?.() ?? 'off') : 'off'
        const think = effort !== 'off' && !req.forceTool && !req.prefill
        send({
          type: 'generate',
          id,
          messages: req.messages,
          ...(req.tools ? { tools: req.tools } : {}),
          ...(req.forceTool ? { forceTool: req.forceTool } : {}),
          ...(req.prefill ? { prefill: req.prefill } : {}),
          ...(req.stop?.length ? { stop: req.stop } : {}),
          ...(profile.thinking ? { thinking: think } : {}),
          maxNewTokens: req.maxNewTokens + (think ? THINKING_BUDGET[effort] : 0),
        })
        if (signal.aborted) onAbort()
      })
    },

    async unload() {
      if (worker) {
        try {
          worker.postMessage({ type: 'unload' } satisfies WorkerRequest)
        } catch {
          /* worker already gone */
        }
      }
      terminate()
      return Promise.resolve()
    },
  }
  return runtime
}
