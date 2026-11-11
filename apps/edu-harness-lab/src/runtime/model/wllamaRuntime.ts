import {
  Wllama,
  WllamaAbortError,
} from '@wllama/wllama/esm/index.js'
import type {
  AssetsPathConfig,
  ChatCompletionChunk,
  ChatCompletionParams,
  LoadedContextInfo,
  LoadModelParams,
} from '@wllama/wllama/esm/index.js'
import type { LoadProgress, ModelInfo, ModelRequest, ModelResponse, ModelRuntime } from '../../domain/types'
import { REAL_LOCAL } from '../../domain/types'
import { tr } from '../../i18n'
import { detectCapabilities } from './capabilities'
import { EMMA_PROFILE, fingerprintFor } from './profiles'
import { getWllamaCacheManager, openCachedEmmaModel } from './wllamaCache'
import type { WllamaCacheManager } from './wllamaCache'
import wllamaWasmUrl from '@wllama/wllama/src/wasm/wllama.wasm?url'

const profile = EMMA_PROFILE

export type WllamaRuntimeClient = Omit<Pick<
  Wllama,
  'createChatCompletion' | 'exit' | 'getLoadedContextInfo' | 'isModelLoaded' | 'loadModel' | 'loadModelFromHF' | 'setCompat'
>, 'createChatCompletion'> & {
  createChatCompletion: (options: ChatCompletionParams & { stream: true }) => Promise<AsyncIterable<ChatCompletionChunk>>
}

export type WllamaRuntimeFactory = (paths: AssetsPathConfig, cache: WllamaCacheManager) => WllamaRuntimeClient

export interface WllamaRuntimeOptions {
  /** Test seam for model/cache calls; the default cache is Wllama's OPFS-backed CacheManager. */
  cacheManager?: WllamaCacheManager
  /** Test seam for device selection. */
  detectDevice?: () => Promise<'wasm' | 'webgpu'>
  /** Test seam for the Wllama instance. */
  wllamaFactory?: WllamaRuntimeFactory
  /** Test seams for the package WASM asset and object URL lifecycle. */
  wasmAssetUrl?: string
  createObjectURL?: (blob: Blob) => string
  revokeObjectURL?: (url: string) => void
}

const abortError = () => {
  const error = new Error(tr('Operazione annullata.', 'Operation cancelled.'))
  error.name = 'AbortError'
  return error
}

const isAbortError = (error: unknown) =>
  error instanceof WllamaAbortError || (error instanceof Error && error.name === 'AbortError')

const abortedResponse = (text: string, started: number): ModelResponse => ({
  text,
  durationMs: performance.now() - started,
  finishReason: 'aborted',
  provenance: { ...REAL_LOCAL },
})

function chatMessages(req: ModelRequest) {
  if (req.tools?.length || req.forceTool) {
    throw new Error(tr('Emma-6 non supporta chiamate native agli strumenti; usa il protocollo testuale dell’harness.', 'Emma-6 does not support native tool calls; use the harness text protocol.'))
  }
  const messages = req.messages.map((message) => {
    if (message.role === 'tool' || message.tool_calls?.length) {
      throw new Error(tr('Emma-6 accetta solo messaggi system, user e assistant.', 'Emma-6 only accepts system, user and assistant messages.'))
    }
    return { role: message.role, content: message.content }
  })
  if (req.prefill) {
    const last = messages.at(-1)
    if (last?.role === 'assistant') last.content += req.prefill
    else messages.push({ role: 'assistant', content: req.prefill })
  }
  return messages
}

function responseFinishReason(reason: ChatCompletionChunk['choices'][number]['finish_reason']): ModelResponse['finishReason'] {
  if (reason === 'length') return 'length'
  if (reason === 'tool_calls') {
    throw new Error(tr('Emma-6 ha restituito una chiamata nativa non supportata.', 'Emma-6 returned an unsupported native tool call.'))
  }
  return 'stop'
}

/** Adapt Wllama's GGUF worker and streamed chat API to the app's ModelRuntime. */
export function createWllamaRuntime(options: WllamaRuntimeOptions = {}): ModelRuntime {
  const initialVariant = {
    runtime: 'wllama' as const,
    device: 'wasm' as const,
    dtype: profile.quantization,
    sizeBytes: profile.modelSizeBytes,
  }
  const info: ModelInfo = {
    profile: profile.id,
    id: profile.repo,
    label: profile.label,
    backend: 'none',
    dtype: profile.quantization,
    sizeBytes: profile.modelSizeBytes,
    contextLength: profile.contextLength,
    fingerprint: fingerprintFor(profile, initialVariant),
    license: profile.license,
    nativeTools: false,
    reasoning: false,
    provenance: REAL_LOCAL,
  }

  const assetUrl = options.wasmAssetUrl ?? wllamaWasmUrl
  const createObjectURL = options.createObjectURL ?? ((blob: Blob) => URL.createObjectURL(blob))
  const revokeObjectURL = options.revokeObjectURL ?? ((url: string) => URL.revokeObjectURL(url))
  const detectDevice =
    options.detectDevice ??
    (async () => ((await detectCapabilities()).webgpu ? 'webgpu' : 'wasm'))

  let client: WllamaRuntimeClient | null = null
  let wasmObjectUrl: string | null = null
  let ready = false
  let lifecycle = 0
  let loadPromise: Promise<void> | null = null
  let loadController: AbortController | null = null
  let unloadPromise: Promise<void> | null = null
  const generationControllers = new Set<AbortController>()
  const generationPromises = new Set<Promise<ModelResponse>>()

  const current = (id: number) => lifecycle === id && unloadPromise === null
  const releaseWasm = () => {
    if (!wasmObjectUrl) return
    revokeObjectURL(wasmObjectUrl)
    wasmObjectUrl = null
  }

  const runtime: ModelRuntime = {
    info,
    isReady: () => ready && !!client?.isModelLoaded(),

    load(onProgress, signal, opts) {
      if (unloadPromise) return unloadPromise.then(() => runtime.load(onProgress, signal, opts))
      if (runtime.isReady()) return Promise.resolve()
      if (loadPromise) return loadPromise

      const id = ++lifecycle
      const controller = new AbortController()
      const forwardAbort = () => controller.abort()
      if (signal?.aborted) return Promise.reject(abortError())
      signal?.addEventListener('abort', forwardAbort, { once: true })
      loadController = controller
      const report = (progress: LoadProgress) => {
        if (current(id) && !controller.signal.aborted) onProgress(progress)
      }

      const operation = (async () => {
        let operationClient: WllamaRuntimeClient | null = null
        try {
          report({ phase: 'checking', loadedBytes: 0, totalBytes: profile.modelSizeBytes })
          const cache = options.cacheManager ?? await getWllamaCacheManager()
          if (controller.signal.aborted || !current(id)) throw abortError()
          const cachedModel = opts?.cacheOnly ? await openCachedEmmaModel(cache) : null
          if (controller.signal.aborted || !current(id)) throw abortError()
          report({ phase: 'initializing', loadedBytes: 0, totalBytes: 0, message: tr('Preparazione del runtime locale.', 'Preparing the local runtime.') })
          let wasm = await cache.open(assetUrl)
          if (!wasm) {
            if (opts?.cacheOnly) throw new Error(tr('Il runtime Wllama non è disponibile nella cache del browser.', 'The Wllama runtime is not available in the browser cache.'))
            await cache.download(assetUrl, { signal: controller.signal })
            wasm = await cache.open(assetUrl)
          }
          if (!wasm) throw new Error(tr('Impossibile aprire il runtime WASM di Wllama.', 'Could not open the Wllama WASM runtime.'))
          if (controller.signal.aborted || !current(id)) throw abortError()

          wasmObjectUrl = createObjectURL(new Blob([wasm], { type: 'application/wasm' }))
          const paths: AssetsPathConfig = { default: wasmObjectUrl }
          let defaultCache: Awaited<ReturnType<typeof getWllamaCacheManager>> | null = null
          if (options.wllamaFactory) {
            operationClient = options.wllamaFactory(paths, cache)
          } else {
            defaultCache = await getWllamaCacheManager()
            if (cache !== defaultCache) throw new Error(tr('Una cache Wllama personalizzata richiede una factory del runtime.', 'A custom Wllama cache requires a runtime factory.'))
            operationClient = new Wllama(paths, { cacheManager: defaultCache, suppressNativeLog: true })
          }
          operationClient.setCompat(null)
          client = operationClient
          if (controller.signal.aborted || !current(id)) throw abortError()

          const device = await detectDevice()
          if (controller.signal.aborted || !current(id)) throw abortError()
          const modelOptions: LoadModelParams = {
            n_ctx: profile.contextLength,
            prefill_assistant: true,
            ...(device === 'wasm' ? { n_gpu_layers: 0 } : {}),
          }

          if (cachedModel) {
            await operationClient.loadModel([cachedModel], modelOptions)
          } else {
            report({ phase: 'downloading', loadedBytes: 0, totalBytes: profile.modelSizeBytes, file: profile.modelFile })
            await operationClient.loadModelFromHF(
              { repo: profile.repo, file: profile.modelFile },
              {
                ...modelOptions,
                useCache: true,
                signal: controller.signal,
                progressCallback: ({ loaded, total }) => {
                  const totalBytes = total > 0 ? total : profile.modelSizeBytes
                  report(
                    loaded >= totalBytes
                      ? { phase: 'initializing', loadedBytes: totalBytes, totalBytes, file: profile.modelFile }
                      : { phase: 'downloading', loadedBytes: Math.min(loaded, totalBytes), totalBytes, file: profile.modelFile },
                  )
                },
              },
            )
          }
          if (controller.signal.aborted || !current(id)) throw abortError()

          const context: LoadedContextInfo = operationClient.getLoadedContextInfo()
          info.backend = device
          info.label = `${profile.label} · ${device === 'webgpu' ? 'GPU (WebGPU)' : 'CPU (WASM)'}`
          info.contextLength = context.n_ctx || profile.contextLength
          ready = true
          report({ phase: 'ready', loadedBytes: 1, totalBytes: 1 })
        } catch (error) {
          ready = false
          info.backend = 'none'
          info.label = profile.label
          if (operationClient) {
            try {
              await operationClient.exit()
            } catch (cleanupError) {
              console.warn('[emma-6 runtime] cleanup after load failure failed', cleanupError)
            }
            if (client === operationClient) client = null
          }
          releaseWasm()
          if (current(id) && !controller.signal.aborted) {
            report({
              phase: 'error',
              loadedBytes: 0,
              totalBytes: 0,
              message: error instanceof Error ? error.message : String(error),
            })
          }
          throw controller.signal.aborted ? abortError() : error
        } finally {
          signal?.removeEventListener('abort', forwardAbort)
          if (loadController === controller) loadController = null
        }
      })()
      loadPromise = operation
      void operation.then(
        () => {
          if (loadPromise === operation) loadPromise = null
        },
        () => {
          if (loadPromise === operation) loadPromise = null
        },
      )
      return operation
    },

    generate(req, onToken, signal, _onThinking) {
      if (!runtime.isReady() || !client) return Promise.reject(new Error(tr('Il modello Emma-6 non è caricato.', 'The Emma-6 model is not loaded.')))
      if (signal.aborted) return Promise.resolve(abortedResponse('', performance.now()))

      const id = lifecycle
      const activeClient = client
      const controller = new AbortController()
      const forwardAbort = () => controller.abort()
      signal.addEventListener('abort', forwardAbort, { once: true })
      generationControllers.add(controller)
      const started = performance.now()
      const operation = (async (): Promise<ModelResponse> => {
        let text = req.prefill ?? ''
        let finishReason: ModelResponse['finishReason'] = 'stop'
        let tokensIn: number | undefined
        let tokensOut: number | undefined
        try {
          const messages = chatMessages(req)
          if (text) onToken(text)
          const stream = await activeClient.createChatCompletion({
            messages,
            stream: true,
            abortSignal: controller.signal,
            max_tokens: req.maxNewTokens,
            temperature: 0,
            penalty_repeat: profile.repetitionPenalty,
            ...(req.stop?.length ? { stop: req.stop } : {}),
            return_tokens: true,
          })
          for await (const chunk of stream) {
            if (controller.signal.aborted || !current(id)) break
            const choice = chunk.choices[0]
            if (choice?.delta.tool_calls?.length) {
              throw new Error(tr('Emma-6 ha restituito una chiamata nativa non supportata.', 'Emma-6 returned an unsupported native tool call.'))
            }
            const delta = choice?.delta.content
            if (typeof delta === 'string' && delta) {
              text += delta
              onToken(delta)
            }
            if (choice?.finish_reason) finishReason = responseFinishReason(choice.finish_reason)
            if (chunk.usage) {
              tokensIn = chunk.usage.prompt_tokens
              tokensOut = chunk.usage.completion_tokens
            }
          }
          if (controller.signal.aborted || !current(id)) return abortedResponse(text, started)
          return {
            text,
            tokensIn,
            tokensOut,
            durationMs: performance.now() - started,
            finishReason,
            provenance: { ...REAL_LOCAL },
          }
        } catch (error) {
          if (controller.signal.aborted || isAbortError(error) || !current(id)) return abortedResponse(text, started)
          throw error
        } finally {
          signal.removeEventListener('abort', forwardAbort)
          generationControllers.delete(controller)
        }
      })()
      generationPromises.add(operation)
      void operation.then(
        () => generationPromises.delete(operation),
        () => generationPromises.delete(operation),
      )
      return operation
    },

    unload() {
      if (unloadPromise) return unloadPromise
      lifecycle += 1
      ready = false
      loadController?.abort()
      for (const controller of generationControllers) controller.abort()
      const pendingLoad = loadPromise
      const pendingGenerations = [...generationPromises]
      unloadPromise = (async () => {
        await Promise.allSettled([...(pendingLoad ? [pendingLoad] : []), ...pendingGenerations])
        try {
          await client?.exit()
        } finally {
          client = null
          info.backend = 'none'
          info.label = profile.label
          info.contextLength = profile.contextLength
          releaseWasm()
        }
      })().finally(() => {
        unloadPromise = null
      })
      return unloadPromise
    },
  }

  return runtime
}
