import { describe, expect, it } from 'vitest'
import type { MemoryRecord, RunRecord } from '../domain/types'
import {
  clearMemory,
  deleteMemory,
  deleteModelCache,
  findRecording,
  listRuns,
  loadMemory,
  saveMemory,
  saveRecording,
  saveRun,
  wipeAllLocalData,
} from './db'

describe('db without IndexedDB', () => {
  it('IndexedDB is absent in this environment', () => {
    expect(typeof indexedDB).toBe('undefined')
  })

  it('memory functions do not throw and use the in-memory fallback', async () => {
    const rec: MemoryRecord = { id: 'm1', scope: 'persistent', kind: 'fact', key: 'k', text: 't', createdAt: 'now', source: 'user' }
    await expect(saveMemory(rec)).resolves.toBeUndefined()
    expect((await loadMemory()).map(r => r.id)).toContain('m1')
    await expect(deleteMemory('m1')).resolves.toBeUndefined()
    expect((await loadMemory()).map(r => r.id)).not.toContain('m1')
    await saveMemory(rec)
    await expect(clearMemory()).resolves.toBeUndefined()
    expect(await loadMemory()).toEqual([])
  })

  it('recordings and runs work through the fallback', async () => {
    const row = { key: 'a', text: 'x', modelId: 'm', modelLabel: 'M', recordedAt: 'now' }
    await saveRecording(row)
    expect(await findRecording('a')).toEqual(row)
    expect(await findRecording('missing')).toBeUndefined()

    const older = { id: 'r1', startedAt: '2026-01-01' } as RunRecord
    const newer = { id: 'r2', startedAt: '2026-02-01' } as RunRecord
    await saveRun(older)
    await saveRun(newer)
    expect((await listRuns()).map(r => r.id)).toEqual(['r2', 'r1'])
  })

  it('wipeAllLocalData clears fallbacks and harness-lab localStorage keys only', async () => {
    localStorage.setItem('harness-lab:x', '1')
    localStorage.setItem('other', '2')
    await expect(wipeAllLocalData()).resolves.toBeUndefined()
    expect(localStorage.getItem('harness-lab:x')).toBeNull()
    expect(localStorage.getItem('other')).toBe('2')
    expect(await listRuns()).toEqual([])
    expect(await findRecording('a')).toBeUndefined()
  })

  it('deleteModelCache returns false when the Cache API is missing', async () => {
    await expect(deleteModelCache()).resolves.toBe(false)
  })
})
