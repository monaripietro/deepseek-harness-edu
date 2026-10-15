import { describe, expect, it } from 'vitest'
import type { PolicyDoc, RagSettings } from '../../domain/types'
import { GUIDE_REQUEST } from '../../scenarios/guide'
import { SCENARIO_DATA } from '../../scenarios'
import { DEFAULT_RAG } from '../levels'
import { CHUNK_WORDS, chunkDocument } from './chunker'
import { createRetriever } from './retriever'

const settings = (p: Partial<RagSettings> = {}): RagSettings => ({ ...DEFAULT_RAG, ...p })
const mk = () => createRetriever(SCENARIO_DATA.documents)
function at<T>(items: readonly T[], i: number): T {
  const item = items[i]
  if (item === undefined) throw new Error(`missing item ${i}`)
  return item
}

describe('chunker', () => {
  const doc: PolicyDoc = { id: 'D', title: 'Titolo', version: '1', status: 'valid', category: 'x', text: 'Intro.\n\n## Uno\nTesto uno.\n\n## Due\nTesto due.\n\n## Vuota\n' }
  it('splits on ## headings with ids docId#n and skips empty sections', () => {
    const chunks = chunkDocument(doc)
    expect(chunks.map(c => c.id)).toEqual(['D#0', 'D#1', 'D#2'])
    expect(chunks.map(c => c.heading)).toEqual(['Titolo', 'Uno', 'Due'])
    expect(chunks[1]?.text).toBe('Testo uno.')
    expect(chunks.every(c => c.docId === 'D')).toBe(true)
  })
  it('splits long sections into pieces of at most CHUNK_WORDS words', () => {
    const sentence = Array.from({ length: 50 }, (_, i) => `parola${i}`).join(' ') + '.'
    const long: PolicyDoc = { ...doc, text: `## Lunga\n${[sentence, sentence, sentence, sentence].join(' ')}` }
    const chunks = chunkDocument(long)
    expect(chunks.length).toBeGreaterThan(1)
    for (const c of chunks) expect(c.text.split(/\s+/).length).toBeLessThanOrEqual(CHUNK_WORDS)
    expect(chunks.map(c => c.index)).toEqual(chunks.map((_, i) => i))
  })
})

describe('retriever', () => {
  it('the guide request selects POL-IT-04 (2026) chunks', () => {
    const hits = mk().search(GUIDE_REQUEST, settings())
    const selected = hits.filter(h => h.status === 'selected')
    expect(selected.length).toBeGreaterThan(0)
    expect(selected.some(h => h.doc.id === 'POL-IT-04')).toBe(true)
    expect(selected.some(h => h.doc.id === 'POL-IT-04-2024')).toBe(false)
    expect(hits[0]?.normalized).toBe(1)
  })

  it('excludes the outdated 2024 policy unless includeOutdated', () => {
    const r = mk()
    const hits = r.search(GUIDE_REQUEST, settings({ topK: 20, minScore: 0 }))
    const old = hits.filter(h => h.doc.id === 'POL-IT-04-2024')
    expect(old.length).toBeGreaterThan(0)
    expect(old.every(h => h.status === 'excluded' && h.reason === 'outdated')).toBe(true)
    const incl = r.search(GUIDE_REQUEST, settings({ topK: 20, minScore: 0, includeOutdated: true }))
    expect(incl.filter(h => h.doc.id === 'POL-IT-04-2024').every(h => h.status === 'selected')).toBe(true)
  })

  it('hides distractors unless includeDistractors', () => {
    const r = mk()
    const q = 'mensa pranzo parcheggio'
    expect(r.search(q, settings()).some(h => h.doc.status === 'distractor')).toBe(false)
    const hits = r.search(q, settings({ includeDistractors: true, minScore: 0 }))
    expect(hits.some(h => h.doc.status === 'distractor')).toBe(true)
  })

  it('honours excluded chunk ids', () => {
    const r = mk()
    const top = at(r.search(GUIDE_REQUEST, settings()), 0)
    expect(top).toBeDefined()
    const hits = r.search(GUIDE_REQUEST, settings({ excludedChunkIds: [top.chunk.id] }))
    const h = hits.find(x => x.chunk.id === top.chunk.id)
    expect(h).toMatchObject({ status: 'excluded', reason: 'userExcluded' })
  })

  it('honours pinned chunk ids, even for an unmatched query and an outdated doc', () => {
    const r = mk()
    const oldChunk = r.chunks().find(c => c.docId === 'POL-IT-04-2024')
    if (!oldChunk) throw new Error('missing POL-IT-04-2024 chunk')
    const hits = r.search('zzzzqqq', settings({ pinnedChunkIds: [oldChunk.id] }))
    expect(hits).toHaveLength(1)
    expect(hits[0]).toMatchObject({ status: 'selected' })
    expect(hits[0]?.chunk.id).toBe(oldChunk.id)
  })

  it('topK produces budget exclusions', () => {
    const hits = mk().search(GUIDE_REQUEST, settings({ topK: 1, minScore: 0 }))
    expect(hits.filter(h => h.status === 'selected')).toHaveLength(1)
    expect(hits.some(h => h.reason === 'budget')).toBe(true)
  })

  it('minScore produces lowScore exclusions', () => {
    const hits = mk().search(GUIDE_REQUEST, settings({ topK: 50, minScore: 0.99 }))
    expect(hits.some(h => h.reason === 'lowScore')).toBe(true)
  })

  it('is deterministic and ordered by score descending', () => {
    const a = mk().search(GUIDE_REQUEST, settings({ topK: 10, minScore: 0 }))
    const b = mk().search(GUIDE_REQUEST, settings({ topK: 10, minScore: 0 }))
    expect(a.map(h => [h.chunk.id, h.score])).toEqual(b.map(h => [h.chunk.id, h.score]))
    for (let i = 1; i < a.length; i++) expect(at(a, i - 1).score).toBeGreaterThanOrEqual(at(a, i).score)
  })

  it('empty query returns nothing; add/remove documents work', () => {
    const r = mk()
    expect(r.search('   ', settings())).toEqual([])
    r.addDocument({ id: 'X', title: 'Giraffa', version: '1', status: 'valid', category: 'z', text: '## Animali\nLa giraffa mangia foglie alte.', userAdded: true })
    expect(r.documents().some(d => d.id === 'X')).toBe(true)
    expect(r.search('giraffa', settings()).some(h => h.doc.id === 'X')).toBe(true)
    r.removeDocument('X')
    expect(r.documents().some(d => d.id === 'X')).toBe(false)
    expect(r.search('giraffa', settings()).some(h => h.doc.id === 'X')).toBe(false)
  })
})
