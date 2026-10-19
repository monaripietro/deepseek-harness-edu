import { describe, expect, it, vi } from 'vitest'
import type { CacheEntry } from '@wllama/wllama/esm/index.js'
import { cachedEmmaModelBytes, deleteCachedEmmaModelCache, EMMA_MODEL_URL, openCachedEmmaModel } from './wllamaCache'
import type { WllamaCacheManager } from './wllamaCache'

const MODEL_BYTES = 1_024_069_952

function cache({ size = MODEL_BYTES, blobSize = size }: { size?: number; blobSize?: number } = {}) {
  const entry: CacheEntry = {
    name: 'emma-model',
    size,
    metadata: { etag: 'etag', originalSize: MODEL_BYTES, originalURL: EMMA_MODEL_URL },
  }
  const modelBlob = new Blob([])
  Object.defineProperty(modelBlob, 'size', { value: blobSize })
  const open = vi.fn(async () => (blobSize > 0 ? modelBlob : null))
  const manager: WllamaCacheManager = {
    delete: vi.fn(async () => {}),
    download: vi.fn(async () => {}),
    getNameFromURL: vi.fn(async url => `key:${url}`),
    getSize: vi.fn(async () => size),
    list: vi.fn(async () => [entry]),
    open,
  }
  return { manager, open }
}

describe('Wllama model cache', () => {
  it('reports and opens the complete Emma-6 file without requesting a download', async () => {
    const { manager, open } = cache()

    await expect(cachedEmmaModelBytes(manager)).resolves.toBe(MODEL_BYTES)
    await expect(openCachedEmmaModel(manager)).resolves.toBeInstanceOf(Blob)
    expect(manager.getNameFromURL).toHaveBeenCalledWith(EMMA_MODEL_URL)
    expect(manager.getSize).toHaveBeenCalledWith(`key:${EMMA_MODEL_URL}`)
    expect(open).toHaveBeenCalledWith(EMMA_MODEL_URL)
    expect(manager.download).not.toHaveBeenCalled()

    await deleteCachedEmmaModelCache(manager)
    expect(manager.delete).toHaveBeenCalledWith(EMMA_MODEL_URL)
  })

  it('does not treat a partial GGUF as cached or loadable', async () => {
    const { manager } = cache({ size: MODEL_BYTES - 1, blobSize: MODEL_BYTES - 1 })

    await expect(cachedEmmaModelBytes(manager)).resolves.toBe(0)
    await expect(openCachedEmmaModel(manager)).rejects.toThrow('non è completo')
    expect(manager.download).not.toHaveBeenCalled()
  })
})
