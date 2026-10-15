import type { Disposer } from '../../domain/types'

/** One entry of the simulated company systems log ("what happened in the company"). */
export interface BusinessLogEntry {
  id: string
  tool: string
  title: string
  details: string
  at: number
}

export interface BusinessLog {
  list(): BusinessLogEntry[]
  add(entry: Omit<BusinessLogEntry, 'at'> & { at?: number }): BusinessLogEntry
  subscribe(cb: () => void): Disposer
  clear(): void
}

export function createBusinessLog(): BusinessLog {
  let entries: BusinessLogEntry[] = []
  const subs = new Set<() => void>()
  const notify = () => {
    for (const cb of subs) cb()
  }
  return {
    list: () => entries,
    add(entry) {
      const full: BusinessLogEntry = { ...entry, at: entry.at ?? Date.now() }
      entries = [...entries, full]
      notify()
      return full
    },
    subscribe(cb) {
      subs.add(cb)
      return () => subs.delete(cb)
    },
    clear() {
      entries = []
      notify()
    },
  }
}

/** Shared simulated business log used by the write tools. */
export const businessLog: BusinessLog = createBusinessLog()
