import { deleteSecretsDatabase } from '../runtime/model/secretStore'
import { clearOpfsCache } from '../runtime/model/opfsCache'
import Dexie from 'dexie'
import type { Table } from 'dexie'
import type { MemoryRecord, RunRecord } from '../domain/types'

export interface RecordingRow {
  key: string
  text: string
  modelId: string
  modelLabel: string
  recordedAt: string
}

export interface SettingRow {
  key: string
  value: unknown
}

export interface StoredRun {
  id: string
  startedAt: string
  record: RunRecord
}

class HarnessLabDb extends Dexie {
  memory!: Table<MemoryRecord, string>
  recordings!: Table<RecordingRow, string>
  runs!: Table<StoredRun, string>
  settings!: Table<SettingRow, string>

  constructor() {
    super('harness-lab')
    this.version(1).stores({
      memory: 'id',
      recordings: 'key',
      runs: 'id',
      settings: 'key',
    })
  }
}

let db: HarnessLabDb | null = null
let dbBroken = false

/** Returns the database, or null when IndexedDB is unavailable (e.g. private mode). */
function getDb(): HarnessLabDb | null {
  if (dbBroken) return null
  if (db) return db
  try {
    if (typeof indexedDB === 'undefined') {
      dbBroken = true
      return null
    }
    db = new HarnessLabDb()
    return db
  } catch {
    dbBroken = true
    return null
  }
}

// In-memory fallbacks used when IndexedDB is unavailable or fails.
const fallbackMemory = new Map<string, MemoryRecord>()
const fallbackRecordings = new Map<string, RecordingRow>()
const fallbackRuns = new Map<string, StoredRun>()

async function guarded<T>(op: (d: HarnessLabDb) => Promise<T>, fallback: () => T): Promise<T> {
  const d = getDb()
  if (!d) return fallback()
  try {
    return await op(d)
  } catch {
    dbBroken = true
    return fallback()
  }
}

// ───────────── memory ─────────────

export async function saveMemory(rec: MemoryRecord): Promise<void> {
  fallbackMemory.set(rec.id, rec)
  await guarded(
    async (d) => {
      await d.memory.put(rec)
    },
    () => undefined,
  )
}

export async function loadMemory(): Promise<MemoryRecord[]> {
  return guarded(
    d => d.memory.toArray(),
    () => [...fallbackMemory.values()],
  )
}

export async function deleteMemory(id: string): Promise<void> {
  fallbackMemory.delete(id)
  await guarded(
    async (d) => {
      await d.memory.delete(id)
    },
    () => undefined,
  )
}

export async function clearMemory(): Promise<void> {
  fallbackMemory.clear()
  await guarded(
    async (d) => {
      await d.memory.clear()
    },
    () => undefined,
  )
}

// ───────────── recordings (replay mode) ─────────────

export async function saveRecording(rec: RecordingRow): Promise<void> {
  fallbackRecordings.set(rec.key, rec)
  await guarded(
    async (d) => {
      await d.recordings.put(rec)
    },
    () => undefined,
  )
}

export async function findRecording(key: string): Promise<RecordingRow | undefined> {
  return guarded(
    d => d.recordings.get(key),
    () => fallbackRecordings.get(key),
  )
}

// ───────────── runs ─────────────

export async function saveRun(record: RunRecord): Promise<void> {
  const row: StoredRun = { id: record.id, startedAt: record.startedAt, record }
  fallbackRuns.set(row.id, row)
  await guarded(
    async (d) => {
      await d.runs.put(row)
    },
    () => undefined,
  )
}

export async function listRuns(): Promise<RunRecord[]> {
  const rows = await guarded(
    d => d.runs.toArray(),
    () => [...fallbackRuns.values()],
  )
  return rows.sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1)).map(r => r.record)
}

// ───────────── housekeeping ─────────────

/** Delete everything stored locally: IndexedDB tables and localStorage keys starting with 'harness-lab'. */
export async function wipeAllLocalData(): Promise<void> {
  deleteSecretsDatabase()
  fallbackMemory.clear()
  fallbackRecordings.clear()
  fallbackRuns.clear()
  await guarded(
    async (d) => {
      await Promise.all([d.memory.clear(), d.recordings.clear(), d.runs.clear(), d.settings.clear()])
    },
    () => undefined,
  )
  try {
    if (typeof localStorage !== 'undefined') {
      const keys: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        if (k && k.startsWith('harness-lab')) keys.push(k)
      }
      for (const k of keys) localStorage.removeItem(k)
    }
  } catch {
    /* storage unavailable: nothing to wipe */
  }
}

/** Remove the downloaded model files (Transformers.js Cache API). Returns true if a cache was deleted. */
export async function deleteModelCache(): Promise<boolean> {
  const opfs = await clearOpfsCache()
  try {
    if (typeof caches === 'undefined') return opfs
    return (await caches.delete('transformers-cache')) || opfs
  } catch {
    return opfs
  }
}
