import type { CacheManager } from '@wllama/wllama/esm/index.js'
import { EMMA_PROFILE } from './profiles'
import { tr } from '../../i18n'

export type WllamaCacheManager = Pick<CacheManager, 'delete' | 'download' | 'getNameFromURL' | 'getSize' | 'list' | 'open'>

export const EMMA_MODEL_URL = `https://huggingface.co/${EMMA_PROFILE.repo}/resolve/main/${EMMA_PROFILE.modelFile}`

let cacheManagerPromise: Promise<CacheManager> | null = null

/** Return Wllama's default OPFS-backed cache shared by the model runtime and the picker. */
export function getWllamaCacheManager(): Promise<CacheManager> {
  if (!cacheManagerPromise) {
    cacheManagerPromise = import('@wllama/wllama/esm/index.js')
      .then(({ CacheManager }) => new CacheManager())
      .catch((error: unknown) => {
        cacheManagerPromise = null
        throw error
      })
  }
  return cacheManagerPromise
}

/** Report the cached size only when the full Emma-6 GGUF is available. */
export async function cachedEmmaModelBytes(cache?: WllamaCacheManager): Promise<number> {
  try {
    const manager = cache ?? await getWllamaCacheManager()
    const name = await manager.getNameFromURL(EMMA_MODEL_URL)
    const size = await manager.getSize(name)
    if (size !== EMMA_PROFILE.modelSizeBytes) return 0
    const entry = (await manager.list()).find(item => item.metadata.originalURL === EMMA_MODEL_URL)
    return entry?.size === size && entry.metadata.originalSize === size ? size : 0
  } catch {
    return 0
  }
}

/** Open the cached model without contacting Hugging Face. */
export async function openCachedEmmaModel(cache?: WllamaCacheManager): Promise<Blob> {
  const manager = cache ?? await getWllamaCacheManager()
  const model = await manager.open(EMMA_MODEL_URL)
  if (!model || model.size !== EMMA_PROFILE.modelSizeBytes) {
    throw new Error(tr('Il file di Emma-6 non è completo nella cache del browser. Scaricalo di nuovo.', 'The Emma-6 file is incomplete in the browser cache. Download it again.'))
  }
  return model
}

/** Remove Emma-6 GGUF data and metadata from Wllama's cache. */
export async function deleteCachedEmmaModelCache(cache?: WllamaCacheManager): Promise<void> {
  const manager = cache ?? await getWllamaCacheManager()
  await manager.delete(EMMA_MODEL_URL)
}
