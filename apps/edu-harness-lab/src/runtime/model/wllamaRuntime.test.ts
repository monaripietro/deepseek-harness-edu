import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ChatCompletionChunk, LoadModelParams } from '@wllama/wllama/esm/index.js'
import type { LoadProgress, ModelRequest } from '../../domain/types'
import { EMMA_MODEL_URL, type WllamaCacheManager } from './wllamaCache'
import { createWllamaRuntime } from './wllamaRuntime'
import type { WllamaRuntimeClient, WllamaRuntimeFactory } from './wllamaRuntime'

const WASM_URL = 'https://lab.test/assets/wllama.wasm'
const MODEL_BYTES = 1_024_069_952
const contextInfo = {
  n_vocab: 100,
  n_ctx: 4096,
  n_batch: 512,
  n_ubatch: 512,
  n_ctx_train: 4096,
  n_embd: 32,
  n_layer: 2,
  metadata: {},
  token_bos: 1,
  token_eos: 2,
  token_eot: 2,
  list_tokens_eog: [2],
  has_encoder: false,
  token_decoder_start: -1,
  add_bos_token: true,
  add_eos_token: false,
  has_image_input: false,
  has_audio_input: false,
}

function sizedBlob(size: number): Blob {
  const blob = new Blob(['test'])
  Object.defineProperty(blob, 'size', { value: size })
  return blob
}

function chunk({
  content = null,
  finish = null,
  usage,
}: {
  content?: string | null
  finish?: ChatCompletionChunk['choices'][number]['finish_reason']
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
} = {}): ChatCompletionChunk {
  return {
    id: 'chunk',
    object: 'chat.completion.chunk',
    created: 1,
    model: 'emma-6',
    choices: [{ index: 0, delta: { content }, finish_reason: finish ?? null, logprobs: null }],
    ...(usage ? { usage } : {}),
  }
}

function chunks(...items: ChatCompletionChunk[]): AsyncIterable<ChatCompletionChunk> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const item of items) yield item
    },
  }
}

type DownloadOptions = NonNullable<Parameters<WllamaRuntimeClient['loadModelFromHF']>[1]>
type TestStream = AsyncIterable<ChatCompletionChunk> | ((signal: AbortSignal | undefined) => AsyncIterable<ChatCompletionChunk>)

const request = (patch: Partial<ModelRequest> = {}): ModelRequest => ({
  messages: [{ role: 'user', content: 'Ciao' }],
  maxNewTokens: 32,
  hints: {
    scenarioId: 'test',
    presentKinds: [],
    availableTools: [],
    toolResults: [],
    docIds: [],
    memoryKeys: [],
    protocol: 'text',
    mustAnswer: true,
    repairAttempt: 0,
    stepIndex: 0,
  },
  ...patch,
})

function rig({
  device = 'webgpu',
  modelCached = false,
  stream = chunks(
    chunk({ content: 'Ciao', finish: null }),
    chunk({ content: '!', finish: 'length', usage: { prompt_tokens: 18, completion_tokens: 4, total_tokens: 22 } }),
  ),
  loadFromHF,
}: {
  device?: 'wasm' | 'webgpu'
  modelCached?: boolean
  stream?: TestStream
  loadFromHF?: (options: DownloadOptions) => Promise<void>
} = {}) {
  const files = new Map<string, Blob>([[WASM_URL, new Blob(['wasm'])]])
  if (modelCached) files.set(EMMA_MODEL_URL, sizedBlob(MODEL_BYTES))
  const cache: WllamaCacheManager = {
    delete: vi.fn(async () => {}),
    download: vi.fn(async () => {}),
    getNameFromURL: vi.fn(async url => `key:${url}`),
    getSize: vi.fn(async () => MODEL_BYTES),
    list: vi.fn(async () => []),
    open: vi.fn(async url => files.get(url) ?? null),
  }
  let loaded = false
  const client: WllamaRuntimeClient = {
    setCompat: vi.fn(),
    loadModel: vi.fn(async (_blobs: Blob[], _params?: LoadModelParams) => {
      loaded = true
    }),
    loadModelFromHF: vi.fn(async (_source, options) => {
      if (loadFromHF) {
        if (!options) throw new Error('Wllama download options were not passed')
        await loadFromHF(options)
      } else {
        options?.progressCallback?.({ loaded: Math.floor(MODEL_BYTES / 2), total: MODEL_BYTES })
        options?.progressCallback?.({ loaded: MODEL_BYTES, total: MODEL_BYTES })
      }
      loaded = true
    }),
    createChatCompletion: vi.fn(async options =>
      typeof stream === 'function' ? stream(options.abortSignal) : stream,
    ),
    getLoadedContextInfo: vi.fn(() => contextInfo),
    isModelLoaded: () => loaded,
    exit: vi.fn(async () => {
      loaded = false
    }),
  }
  const paths: string[] = []
  const factory: WllamaRuntimeFactory = (assetPaths) => {
    paths.push(assetPaths.default)
    return client
  }
  const createObjectURL = vi.fn(() => 'blob:emma-wasm')
  const revokeObjectURL = vi.fn()
  const runtime = createWllamaRuntime({
    cacheManager: cache,
    detectDevice: async () => device,
    wllamaFactory: factory,
    wasmAssetUrl: WASM_URL,
    createObjectURL,
    revokeObjectURL,
  })
  return { runtime, client, cache, paths, createObjectURL, revokeObjectURL }
}

let runtime: ReturnType<typeof createWllamaRuntime> | undefined

afterEach(async () => {
  await runtime?.unload()
  runtime = undefined
})

describe('Wllama Emma-6 runtime', () => {
  it('loads the exact GGUF through Wllama and maps streamed output and metadata', async () => {
    const test = rig()
    runtime = test.runtime
    const progress: LoadProgress[] = []
    await runtime.load(item => progress.push(item))

    expect(test.paths).toEqual(['blob:emma-wasm'])
    expect(test.client.setCompat).toHaveBeenCalledWith(null)
    expect(test.client.loadModelFromHF).toHaveBeenCalledWith(
      { repo: 'PaoloneSborracchione/emma-6-GGUF', file: 'emma-6-Q4_K_M.gguf' },
      expect.objectContaining({ n_ctx: 4096, useCache: true }),
    )
    expect(test.client.loadModel).not.toHaveBeenCalled()
    expect(progress.map(item => item.phase)).toContain('downloading')
    expect(runtime.info).toMatchObject({
      profile: 'emma-6',
      backend: 'webgpu',
      contextLength: 4096,
      dtype: 'Q4_K_M',
      nativeTools: false,
      reasoning: false,
    })

    const onToken = vi.fn()
    const response = await runtime.generate(request({ prefill: '<final_answer>' }), onToken, new AbortController().signal)
    expect(response).toMatchObject({
      text: '<final_answer>Ciao!',
      tokensIn: 18,
      tokensOut: 4,
      finishReason: 'length',
    })
    expect(onToken.mock.calls.map(([text]) => text)).toEqual(['<final_answer>', 'Ciao', '!'])
    expect(test.client.createChatCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        stream: true,
        max_tokens: 32,
        messages: [{ role: 'user', content: 'Ciao' }, { role: 'assistant', content: '<final_answer>' }],
      }),
    )

    await expect(
      runtime.generate(
        request({ tools: [{ type: 'function', function: { name: 'search', description: '', parameters: {} } }] }),
        vi.fn(),
        new AbortController().signal,
      ),
    ).rejects.toThrow('non supporta chiamate native')
    await runtime.unload()
    expect(test.client.exit).toHaveBeenCalledOnce()
    expect(test.revokeObjectURL).toHaveBeenCalledWith('blob:emma-wasm')
  })

  it('loads a cached GGUF without a network request and honors the selected CPU backend', async () => {
    const test = rig({ device: 'wasm', modelCached: true })
    runtime = test.runtime
    await runtime.load(vi.fn(), undefined, { cacheOnly: true })

    expect(test.client.loadModelFromHF).not.toHaveBeenCalled()
    expect(test.client.loadModel).toHaveBeenCalledWith(
      [expect.objectContaining({ size: MODEL_BYTES })],
      expect.objectContaining({ n_ctx: 4096, n_gpu_layers: 0 }),
    )
    expect(test.cache.download).not.toHaveBeenCalled()
    expect(runtime.info.backend).toBe('wasm')
    expect(runtime.info.label).toContain('CPU (WASM)')
  })

  it('waits for a pending download to settle and ignores its late progress after unload', async () => {
    const started = Promise.withResolvers<DownloadOptions>()
    const release = Promise.withResolvers<void>()
    const test = rig({
      loadFromHF: async (options) => {
        started.resolve(options)
        await release.promise
        options.progressCallback?.({ loaded: MODEL_BYTES, total: MODEL_BYTES })
      },
    })
    runtime = test.runtime
    const progress = vi.fn()
    const loading = runtime.load(progress)
    const downloadOptions = await started.promise
    const progressCount = progress.mock.calls.length
    const unloading = runtime.unload()

    expect(downloadOptions.signal?.aborted).toBe(true)
    downloadOptions.progressCallback?.({ loaded: MODEL_BYTES, total: MODEL_BYTES })
    expect(progress).toHaveBeenCalledTimes(progressCount)

    let quiesced = false
    void unloading.then(() => {
      quiesced = true
    })
    expect(quiesced).toBe(false)
    release.resolve()
    await unloading
    await expect(loading).rejects.toMatchObject({ name: 'AbortError' })
    expect(quiesced).toBe(true)
    expect(test.runtime.isReady()).toBe(false)
    expect(test.revokeObjectURL).toHaveBeenCalledWith('blob:emma-wasm')
  })

  it('aborts and awaits active generation before disposing Wllama', async () => {
    const firstToken = Promise.withResolvers<void>()
    let generationSettled = false
    const test = rig({
      stream: signal => ({
        async *[Symbol.asyncIterator]() {
          try {
            yield chunk({ content: 'Parziale' })
            firstToken.resolve()
            await new Promise<void>(resolve => signal?.addEventListener('abort', () => resolve(), { once: true }))
            throw new Error('generation aborted')
          } finally {
            generationSettled = true
          }
        },
      }),
    })
    runtime = test.runtime
    await runtime.load(vi.fn())
    const result = runtime.generate(request(), vi.fn(), new AbortController().signal)
    await firstToken.promise
    const unload = runtime.unload()

    await expect(result).resolves.toMatchObject({ text: 'Parziale', finishReason: 'aborted' })
    await unload
    expect(generationSettled).toBe(true)
    expect(test.client.exit).toHaveBeenCalledOnce()
    expect(runtime.isReady()).toBe(false)
  })
})
