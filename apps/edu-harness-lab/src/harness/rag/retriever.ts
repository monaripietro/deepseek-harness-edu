import MiniSearch from 'minisearch'
import type { Chunk, ExclusionReason, PolicyDoc, RagSettings, RetrievalHit, Retriever } from '../../domain/types'
import { chunkDocument } from './chunker'
import { STOPWORDS_IT, stem, tokenizeText } from './text'

export const MAX_HITS = 10

function makeIndex(): MiniSearch<Chunk> {
  return new MiniSearch<Chunk>({
    fields: ['heading', 'text'],
    idField: 'id',
    tokenize: tokenizeText,
    processTerm: term => (STOPWORDS_IT.has(term) ? null : stem(term)),
    searchOptions: { boost: { heading: 2 }, prefix: true, fuzzy: 0.15, combineWith: 'OR' },
  })
}

/**
 * Deterministic lexical retriever over the policy documents (MiniSearch + Italian normalization).
 * 'vector' mode is a later feature: it currently returns the same deterministic result.
 */
export function createRetriever(initialDocs: PolicyDoc[]): Retriever {
  const docs = new Map<string, PolicyDoc>()
  const chunksByDoc = new Map<string, Chunk[]>()
  const index = makeIndex()

  function addDoc(doc: PolicyDoc): void {
    if (docs.has(doc.id)) removeDoc(doc.id)
    const chunks = chunkDocument(doc)
    docs.set(doc.id, doc)
    chunksByDoc.set(doc.id, chunks)
    index.addAll(chunks)
  }
  function removeDoc(docId: string): void {
    const chunks = chunksByDoc.get(docId)
    if (chunks) for (const c of chunks) if (index.has(c.id)) index.discard(c.id)
    chunksByDoc.delete(docId)
    docs.delete(docId)
    // Rebuild occasionally so discarded entries do not accumulate.
    index.vacuum().catch(() => undefined)
  }
  function allChunks(): Chunk[] {
    return [...chunksByDoc.values()].flat()
  }
  function chunkById(id: string): Chunk | undefined {
    return allChunks().find(c => c.id === id)
  }

  for (const d of initialDocs) addDoc(d)

  return {
    addDocument: addDoc,
    removeDocument: removeDoc,
    documents: () => [...docs.values()],
    chunks: allChunks,
    search(query: string, settings: RagSettings): RetrievalHit[] {
      const visible = (chunkId: string): PolicyDoc | undefined => {
        const chunk = chunkById(chunkId)
        const doc = chunk ? docs.get(chunk.docId) : undefined
        if (!doc) return undefined
        if (doc.status === 'distractor' && !settings.includeDistractors) return undefined
        return doc
      }
      const matches = query.trim() ? index.search(query) : []
      const scored: { chunk: Chunk; doc: PolicyDoc; score: number }[] = []
      for (const m of matches) {
        const doc = visible(String(m.id))
        const chunk = chunkById(String(m.id))
        if (doc && chunk) scored.push({ chunk, doc, score: m.score })
      }
      // Pinned chunks always appear, even when the query did not match them.
      for (const id of settings.pinnedChunkIds) {
        if (scored.some(s => s.chunk.id === id)) continue
        const chunk = chunkById(id)
        const doc = chunk ? docs.get(chunk.docId) : undefined
        if (chunk && doc) scored.push({ chunk, doc, score: 0 })
      }
      scored.sort((a, b) => b.score - a.score || (a.chunk.id < b.chunk.id ? -1 : a.chunk.id > b.chunk.id ? 1 : 0))
      const maxScore = scored.reduce((mx, s) => Math.max(mx, s.score), 0)

      const hits: RetrievalHit[] = []
      let selectedCount = 0
      for (const s of scored) {
        const normalized = maxScore > 0 ? s.score / maxScore : 0
        const pinned = settings.pinnedChunkIds.includes(s.chunk.id)
        let reason: ExclusionReason | undefined
        if (settings.excludedChunkIds.includes(s.chunk.id)) reason = 'userExcluded'
        else if (pinned) reason = undefined
        else if (s.doc.status === 'outdated' && !settings.includeOutdated) reason = 'outdated'
        else if (normalized < settings.minScore) reason = 'lowScore'
        else if (selectedCount >= settings.topK) reason = 'budget'
        if (!reason && !pinned) selectedCount += 1
        hits.push({
          chunk: s.chunk,
          doc: s.doc,
          score: s.score,
          normalized,
          status: reason ? 'excluded' : 'selected',
          ...(reason ? { reason } : {}),
        })
      }
      return hits.slice(0, MAX_HITS)
    },
  }
}
