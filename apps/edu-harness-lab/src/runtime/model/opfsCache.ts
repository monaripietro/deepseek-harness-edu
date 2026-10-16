/**
 * Model file cache in the Origin Private File System (OPFS), shared by the model worker and the page.
 *
 * Why not the Cache API: on some setups `caches.open()` fails ("Unexpected internal error") and
 * Transformers.js then silently re-downloads the model at every visit. OPFS writes large files as a
 * stream straight to disk, works in workers and only commits a file when it is complete
 * (FileSystemWritableFileStream applies changes on close), so an interrupted download never leaves
 * a half-written model behind.
 *
 * Keys are the Hugging Face URLs used by Transformers.js:
 *   https://huggingface.co/<repo>/resolve/<revision>/<file>
 */

const DIR = 'harness-lab-models'

function fnv(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0
  return h.toString(16).padStart(8, '0')
}

/** File name for a key: the encoded URL (reversible), or a hash for very long keys. */
export function fileNameFor(key: string): string {
  const enc = encodeURIComponent(key)
  return enc.length <= 230 ? enc : `h-${fnv(key)}-${encodeURIComponent(key.split('/').pop() ?? 'file').slice(0, 80)}`
}

export function keyForFileName(name: string): string | null {
  if (name.startsWith('h-')) return null
  try {
    return decodeURIComponent(name)
  } catch {
    return null
  }
}

export function opfsAvailable(): boolean {
  const nav: { storage?: Partial<StorageManager> } = typeof navigator !== 'undefined' ? navigator : {}
  return typeof nav.storage?.getDirectory === 'function'
}

async function dir(create = true): Promise<FileSystemDirectoryHandle | null> {
  try {
    const root = await navigator.storage.getDirectory()
    return await root.getDirectoryHandle(DIR, { create })
  } catch {
    return null
  }
}

/** The subset of the Web Cache API that Transformers.js needs (`env.customCache`). */
export const opfsCache = {
  async match(request: string | Request): Promise<Response | undefined> {
    const key = typeof request === 'string' ? request : request.url
    if (!/^https?:\/\//.test(key)) return undefined
    const d = await dir(false)
    if (!d) return undefined
    try {
      const file = await (await d.getFileHandle(fileNameFor(key))).getFile()
      // An empty file is a download that never completed.
      if (file.size === 0) return undefined
      return new Response(file, { headers: { 'content-length': String(file.size) } })
    } catch {
      return undefined
    }
  },

  async put(request: string | Request, response: Response): Promise<void> {
    const key = typeof request === 'string' ? request : request.url
    if (!/^https?:\/\//.test(key)) return
    const d = await dir(true)
    if (!d) return
    const name = fileNameFor(key)
    try {
      const handle = await d.getFileHandle(name, { create: true })
      const writable = await handle.createWritable()
      if (response.body) await response.body.pipeTo(writable)
      else {
        await writable.write(await response.arrayBuffer())
        await writable.close()
      }
    } catch (err) {
      try {
        await d.removeEntry(name)
      } catch {
        /* nothing to clean */
      }
      console.warn('[model cache] impossibile salvare', key, err)
    }
  },
}

export interface CachedFile {
  key: string
  name: string
  size: number
}

/** Every complete file in the model cache. */
export async function listCachedFiles(): Promise<CachedFile[]> {
  const d = await dir(false)
  if (!d) return []
  const out: CachedFile[] = []
  // `entries()` is part of the File System Access API; the DOM typings may lag behind.
  for await (const [name, handle] of (d as unknown as { entries(): AsyncIterable<[string, FileSystemHandle]> }).entries()) {
    if (handle.kind !== 'file') continue
    const key = keyForFileName(name)
    if (!key) continue
    const size = (await (handle as FileSystemFileHandle).getFile()).size
    if (size > 0) out.push({ key, name, size })
  }
  return out
}

export async function removeCachedFiles(names: string[]): Promise<void> {
  const d = await dir(false)
  if (!d) return
  for (const n of names) {
    try {
      await d.removeEntry(n)
    } catch {
      /* already gone */
    }
  }
}

/** Remove the whole model cache directory. */
export async function clearOpfsCache(): Promise<boolean> {
  try {
    const root = await navigator.storage.getDirectory()
    await root.removeEntry(DIR, { recursive: true })
    return true
  } catch {
    return false
  }
}
