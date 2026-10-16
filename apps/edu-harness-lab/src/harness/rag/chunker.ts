import type { Chunk, PolicyDoc } from '../../domain/types'

/** Target maximum words per chunk for long sections. */
export const CHUNK_WORDS = 120

function splitWords(text: string, maxWords: number): string[] {
  // Prefer sentence boundaries; fall back to hard word windows.
  const sentences = text.split(/(?<=[.!?;])\s+/).filter(s => s.trim().length > 0)
  const parts: string[] = []
  let cur: string[] = []
  let count = 0
  const flush = () => {
    if (cur.length) parts.push(cur.join(' ').trim())
    cur = []
    count = 0
  }
  for (const sentence of sentences) {
    const words = sentence.split(/\s+/).filter(Boolean)
    if (words.length > maxWords) {
      flush()
      for (let i = 0; i < words.length; i += maxWords) parts.push(words.slice(i, i + maxWords).join(' '))
      continue
    }
    if (count + words.length > maxWords) flush()
    cur.push(sentence.trim())
    count += words.length
  }
  flush()
  return parts
}

/**
 * Split a document on lines starting with '## ' (headings); sections longer than ~120 words are
 * split further. Chunk ids are `<docId>#<n>` (n counts from 0 in document order).
 */
export function chunkDocument(doc: PolicyDoc): Chunk[] {
  const lines = doc.text.split(/\r?\n/)
  const sections: { heading: string; body: string[] }[] = []
  let current: { heading: string; body: string[] } = { heading: doc.title, body: [] }
  for (const line of lines) {
    const m = /^##\s+(.*)$/.exec(line)
    if (m) {
      sections.push(current)
      current = { heading: (m[1] ?? '').trim() || doc.title, body: [] }
    } else {
      current.body.push(line)
    }
  }
  sections.push(current)

  const chunks: Chunk[] = []
  for (const sec of sections) {
    const body = sec.body.join('\n').trim()
    if (!body) continue
    const pieces = body.split(/\s+/).length > CHUNK_WORDS ? splitWords(body, CHUNK_WORDS) : [body]
    for (const piece of pieces) {
      const index = chunks.length
      chunks.push({ id: `${doc.id}#${index}`, docId: doc.id, index, heading: sec.heading, text: piece })
    }
  }
  return chunks
}
