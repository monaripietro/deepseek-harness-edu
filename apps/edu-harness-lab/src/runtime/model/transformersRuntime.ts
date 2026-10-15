import type { LoadProgress, ModelInfo, ModelRequest, ModelResponse, ModelRuntime, ThinkingEffort } from '../../domain/types'
import { REAL_LOCAL } from '../../domain/types'
import { detectCapabilities } from './capabilities'
import { fingerprintFor, PROFILES, resolveVariant, type RealProfileId, THINKING_BUDGET } from './profiles'
import type { WorkerEvent, WorkerRequest } from './workerProtocol'

export interface TransformersRuntimeOptions {
  /** Test seam: supply a fake worker. */
  workerFactory?: () => Worker
  /** Current reasoning effort (read at every request). */
  thinking?: () => ThinkingEffort
}

let idCounter = 0
const nextId = () => `gen-${Date.now().toString(36)}-${++idCounter}`

const abortError = () => {
  const e = new Error('Operazione annullata.')
  e.name = 'AbortError'
  return e
}

/**
 * ModelRuntime backed by Transformers.js running in a dedicated module worker (WebGPU, WASM only for the light
 * profile). The worker is created lazily on the first load and terminated on unload.
 */
export function createTransformersRuntime(profileId: RealProfileId, options: TransformersRuntimeOptions = {}): ModelRuntime {
  const profile = PROFILES[profileId]
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
        message: 'Il processo del modello si è interrotto in modo imprevisto.',
        detail: ev.message,
      }
      for (const l of [...listeners]) l(evt)
    })
    worker = w
    return w
  }

  const send = (msg: WorkerRequest) => ensureWorker().postMessage(msg)

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
        onProgress({ phase: 'checking', loadedBytes: 0, totalBytes: info.sizeBytes ?? 0, message: 'Verifica del dispositivo…' })
        const caps = await detectCapabilities()
        const variant = resolveVariant(profile, caps.webgpu, caps.shaderF16)
        if (!variant) {
          throw new Error(`${profile.label} richiede una scheda grafica compatibile (WebGPU), che qui non è disponibile. Scegli LFM2.5 350M o Qwen3 0.6B: girano sulla CPU.`)
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
                  : { phase: 'initializing', loadedBytes: total, totalBytes: total, message: variant.device === 'webgpu' ? 'Avvio sulla scheda grafica (WebGPU)…' : 'Avvio sul processore (CPU)…' }
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
              onProgress({ phase: 'error', loadedBytes: 0, totalBytes: 0, message: e.message })
              reject(new Error(e.message))
            }
          }
          listeners.add(onEvent)
          signal?.addEventListener('abort', onAbort, { once: true })
          send({ type: 'load', profile: profile.id, device: variant.device, dtype: variant.dtype, expectedBytes: variant.sizeBytes, cacheOnly: opts?.cacheOnly })
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
          reject(new Error('Il modello reale non è caricato.'))
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
            reject(new Error(e.message))
          }
        }
        listeners.add(onEvent)
        signal.addEventListener('abort', onAbort, { once: true })
        // Reasoning: switched on in the chat template, with extra tokens for the hidden thinking (never for a guided call).
        const effort = profile.thinking ? (options.thinking?.() ?? 'off') : 'off'
        const think = effort !== 'off' && !req.forceTool
        send({
          type: 'generate',
          id,
          messages: req.messages,
          ...(req.tools ? { tools: req.tools } : {}),
          ...(req.forceTool ? { forceTool: req.forceTool } : {}),
          ...(profile.thinking ? { thinking: think } : {}),
          maxNewTokens: req.maxNewTokens + (think ? THINKING_BUDGET[effort as Exclude<ThinkingEffort, 'off'>] : 0),
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
    },
  }
  return runtime
}
