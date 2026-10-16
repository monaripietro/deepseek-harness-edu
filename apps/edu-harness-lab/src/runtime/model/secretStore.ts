/**
 * OpenRouter API key, kept out of plain text.
 *
 * - "Remember on this browser": the key is encrypted with AES-GCM and only the ciphertext goes to
 *   localStorage. The AES key is a non-extractable CryptoKey stored in IndexedDB: page code can use it
 *   to decrypt, but it can never be read out, copied or found in plain text on disk.
 * - Otherwise the key lives only in memory and disappears with the tab.
 * The key is never logged, never put in events or traces, and only shown masked.
 * Limit (said in the UI): any script running on this page could still use it, as with any web app.
 */

const LS_KEY = 'harness-lab:openrouter-key'
const DB_NAME = 'harness-lab-secrets'
const STORE = 'keys'
const CRYPTO_ID = 'openrouter-aes'

let memoryKey: string | null = null

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () =>{  resolve(req.result) }
    req.onerror = () => { reject(req.error ?? new Error('Impossibile aprire l’archivio delle credenziali.')) }
  })
}

async function idb<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb()
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode)
      const req = fn(tx.objectStore(STORE))
      req.onsuccess = () =>{  resolve(req.result) }
      req.onerror = () => { reject(req.error ?? new Error('Operazione sull’archivio delle credenziali non riuscita.')) }
    })
  } finally {
    db.close()
  }
}

async function cryptoKey(create: boolean): Promise<CryptoKey | null> {
  const existing = (await idb('readonly', s => s.get(CRYPTO_ID))) as CryptoKey | undefined
  if (existing || !create) return existing ?? null
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
  await idb('readwrite', s => s.put(key, CRYPTO_ID))
  return key
}

const toB64 = (b: Uint8Array) => btoa(String.fromCharCode(...b))
const fromB64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0))

/** Keep the key for this tab, and (if asked) encrypted on this browser. */
export async function saveApiKey(key: string, remember: boolean): Promise<void> {
  memoryKey = key.trim()
  if (!remember) {
    localStorage.removeItem(LS_KEY)
    return
  }
  const ck = await cryptoKey(true)
  if (!ck) throw new Error('Cifratura non disponibile in questo browser.')
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, ck, new TextEncoder().encode(memoryKey)))
  localStorage.setItem(LS_KEY, JSON.stringify({ v: 1, iv: toB64(iv), data: toB64(data) }))
}

/** The key, from memory or decrypted from this browser; null when there is none. */
export async function loadApiKey(): Promise<string | null> {
  if (memoryKey) return memoryKey
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return null
    const { iv, data } = JSON.parse(raw) as { iv: string; data: string }
    const ck = await cryptoKey(false)
    if (!ck) return null
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(iv) }, ck, fromB64(data))
    memoryKey = new TextDecoder().decode(plain)
    return memoryKey
  } catch {
    return null
  }
}

export function hasRememberedApiKey(): boolean {
  try {
    return !!localStorage.getItem(LS_KEY)
  } catch {
    return false
  }
}

/** Remove the key everywhere (memory, ciphertext, encryption key). */
export async function forgetApiKey(): Promise<void> {
  memoryKey = null
  try {
    localStorage.removeItem(LS_KEY)
  } catch {
    /* storage unavailable */
  }
  try {
    await idb('readwrite', s => s.delete(CRYPTO_ID))
  } catch {
    /* nothing stored */
  }
}

/** Remove the whole secrets database (used by "delete all local data"). */
export function deleteSecretsDatabase(): void {
  memoryKey = null
  try {
    indexedDB.deleteDatabase(DB_NAME)
  } catch {
    /* unavailable */
  }
}

export const maskKey = (k: string) => (k.length > 12 ? `${k.slice(0, 7)}…${k.slice(-4)}` : '••••')
