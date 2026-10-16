import type { Disposer, MemoryRecord, MemoryScope, MemoryStore } from '../../domain/types'
import { newId } from '../events'
import { clearMemory, deleteMemory, loadMemory, saveMemory } from '../../persistence/db'

type Seed = Omit<MemoryRecord, 'id' | 'createdAt'>

/**
 * Memory store: persistent records are mirrored to IndexedDB (async, best effort),
 * session records live in memory only. Seeds become persistent records with stable ids.
 */
export function createMemoryStore(seeds: Seed[]): MemoryStore {
  const createdAt = new Date().toISOString()
  const records = new Map<string, MemoryRecord>()
  const subs = new Set<() => void>()
  let snapshot: MemoryRecord[] = []
  const deleted = new Set<string>()

  const refresh = () => {
    snapshot = [...records.values()]
  }
  const notify = () => {
    refresh()
    for (const cb of subs) cb()
  }

  for (const s of seeds) {
    const id = `seed-${s.key}`
    records.set(id, { ...s, scope: 'persistent', id, createdAt })
  }
  refresh()

  // Merge what was saved in previous sessions (user-written records, and seeds the user deleted are not restored).
  void loadMemory()
    .then((saved) => {
      let changed = false
      for (const rec of saved) {
        if (rec.scope !== 'persistent' || deleted.has(rec.id)) continue
        if (!records.has(rec.id)) {
          records.set(rec.id, rec)
          changed = true
        }
      }
      if (changed) notify()
    })
    .catch(() => undefined)

  return {
    list: () => snapshot,
    write(rec) {
      const full: MemoryRecord = { ...rec, id: newId('mem'), createdAt: new Date().toISOString() }
      records.set(full.id, full)
      if (full.scope === 'persistent') void saveMemory(full)
      notify()
      return full
    },
    delete(id) {
      const rec = records.get(id)
      if (!rec) return
      records.delete(id)
      deleted.add(id)
      if (rec.scope === 'persistent') void deleteMemory(id)
      notify()
    },
    clear(scope?: MemoryScope) {
      let persistentRemoved = false
      for (const [id, rec] of [...records]) {
        if (scope && rec.scope !== scope) continue
        if (rec.scope === 'persistent') persistentRemoved = true
        records.delete(id)
        deleted.add(id)
      }
      if (persistentRemoved) {
        if (!scope || scope === 'persistent') void clearMemory()
      }
      notify()
    },
    subscribe(cb): Disposer {
      subs.add(cb)
      return () => subs.delete(cb)
    },
  }
}
