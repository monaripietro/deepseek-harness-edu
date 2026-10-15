/** SHA-256 helpers on top of SubtleCrypto (available in secure contexts and in jsdom/node test runs). */

const toHex = (buf: ArrayBuffer): string =>
  Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('')

/** Full SHA-256 of a UTF-8 string, lowercase hex (64 chars). */
export async function sha256Hex(text: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle
  if (!subtle) throw new Error('SubtleCrypto non disponibile (serve un contesto sicuro HTTPS o localhost).')
  const data = new TextEncoder().encode(text)
  return toHex(await subtle.digest('SHA-256', data))
}

/** Short fingerprint: first 8 hex chars of the SHA-256. */
export async function shortHash(text: string): Promise<string> {
  return (await sha256Hex(text)).slice(0, 8)
}
