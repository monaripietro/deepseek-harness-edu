import { listCachedFiles, removeCachedFiles } from './opfsCache'
import type { ModelVariant, RealProfileId } from './profiles'
import type { RemoteModel } from './openrouter'

/**
 * What is already on disk. The model worker stores every downloaded file in the browser's private
 * file system (see opfsCache.ts), keyed by its Hugging Face URL:
 *   https://huggingface.co/<repo>/resolve/main/<file>
 * This module reads that store (to know what is already downloaded), deletes it on request,
 * remembers the last model used and asks the browser not to evict it.
 */

const HUB = 'https://huggingface.co/'
const LAST_MODEL_KEY = 'harness-lab:last-model'

/** Transformers.js file suffix of each quantization (onnx/<session><suffix>.onnx). */
const DTYPE_SUFFIX: Record<ModelVariant['dtype'], string> = { q4: '_q4', q4f16: '_q4f16', q8: '_quantized' }

const repoPrefix = (repo: string) => `${HUB}${repo}/resolve/`

/** True when the config, the tokenizer and the weights of this quantization are all on disk. */
export async function isVariantCached(repo: string, dtype: ModelVariant['dtype']): Promise<boolean> {
  const prefix = repoPrefix(repo)
  const keys = (await listCachedFiles()).map(f => f.key).filter(k => k.startsWith(prefix))
  const has = (file: string) => keys.some(k => k.endsWith(`/${file}`))
  return has('config.json') && has('tokenizer.json') && keys.some(k => k.includes('/onnx/') && k.endsWith(`${DTYPE_SUFFIX[dtype]}.onnx`))
}

/** Bytes used on disk by a repo. */
export async function cachedBytes(repo: string): Promise<number> {
  const prefix = repoPrefix(repo)
  return (await listCachedFiles()).filter(f => f.key.startsWith(prefix)).reduce((n, f) => n + f.size, 0)
}

/** Remove one model's files. */
export async function deleteCachedRepo(repo: string): Promise<void> {
  const prefix = repoPrefix(repo)
  await removeCachedFiles((await listCachedFiles()).filter(f => f.key.startsWith(prefix)).map(f => f.name))
}

/**
 * Ask the browser to keep the downloaded model even under storage pressure.
 * Browsers may grant it silently or refuse; either way nothing else changes.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    const nav: { storage?: Partial<StorageManager> } = navigator
    if (!nav.storage?.persist) return false
    if (await nav.storage.persisted?.()) return true
    return await nav.storage.persist()
  } catch {
    return false
  }
}

export async function isStoragePersistent(): Promise<boolean> {
  try {
    const nav: { storage?: Partial<StorageManager> } = navigator
    return (await nav.storage?.persisted?.()) ?? false
  } catch {
    return false
  }
}

/** The model loaded last time, to restart it from the cache at the next visit. */
const LAST_REMOTE_KEY = 'harness-lab:last-remote'

/** The OpenRouter model chosen last time (no secret in it: the key is stored apart, encrypted). */
export function rememberRemoteModel(model: RemoteModel): void {
  try {
    localStorage.setItem(LAST_REMOTE_KEY, JSON.stringify(model))
  } catch {
    /* storage unavailable */
  }
}

export function lastRemoteModel(): RemoteModel | null {
  try {
    const raw = localStorage.getItem(LAST_REMOTE_KEY)
    return raw ? (JSON.parse(raw) as RemoteModel) : null
  } catch {
    return null
  }
}

export function rememberLastModel(profile: RealProfileId | 'openrouter'): void {
  try {
    localStorage.setItem(LAST_MODEL_KEY, profile)
  } catch {
    /* storage unavailable */
  }
}

export function lastModel(): RealProfileId | 'openrouter' | null {
  try {
    const v = localStorage.getItem(LAST_MODEL_KEY)
    return v === 'lfm-350m' || v === 'qwen3-0.6b' || v === 'lfm-1.2b' || v === 'gemma4-e2b' || v === 'openrouter' ? v : null
  } catch {
    return null
  }
}

export function forgetLastModel(): void {
  try {
    localStorage.removeItem(LAST_MODEL_KEY)
  } catch {
    /* storage unavailable */
  }
}
