import { describe, expect, it, vi } from 'vitest'
import { SCENARIO_DATA } from '../../scenarios'
import { createMemoryStore } from './memoryStore'

const mk = () => createMemoryStore(SCENARIO_DATA.memorySeeds)

describe('memoryStore', () => {
  it('seeds are persistent records with stable ids', () => {
    const s = mk()
    const list = s.list()
    expect(list).toHaveLength(SCENARIO_DATA.memorySeeds.length)
    expect(list.every(r => r.scope === 'persistent' && r.source === 'seed')).toBe(true)
    expect(list.map(r => r.id)).toContain('seed-centro_di_costo')
  })

  it('writes and clears session records without touching seeds', () => {
    const s = mk()
    const rec = s.write({ scope: 'session', kind: 'fact', key: 'k', text: 't', source: 'user' })
    expect(rec.id).toMatch(/\S/)
    expect(s.list().some(r => r.id === rec.id)).toBe(true)
    s.clear('session')
    expect(s.list().some(r => r.id === rec.id)).toBe(false)
    expect(s.list()).toHaveLength(SCENARIO_DATA.memorySeeds.length)
  })

  it('delete removes a record; unknown id is a no-op', () => {
    const s = mk()
    const rec = s.write({ scope: 'session', kind: 'fact', key: 'k', text: 't', source: 'tool' })
    s.delete(rec.id)
    expect(s.list().some(r => r.id === rec.id)).toBe(false)
    expect(() =>{  s.delete('nope') }).not.toThrow()
  })

  it('clear() without scope removes everything; clear persistent keeps session', () => {
    const s = mk()
    const sess = s.write({ scope: 'session', kind: 'fact', key: 'k', text: 't', source: 'user' })
    s.clear('persistent')
    expect(s.list().map(r => r.id)).toEqual([sess.id])
    s.clear()
    expect(s.list()).toEqual([])
  })

  it('notifies subscribers and stops after dispose', () => {
    const s = mk()
    const cb = vi.fn()
    const dispose = s.subscribe(cb)
    const rec = s.write({ scope: 'session', kind: 'fact', key: 'k', text: 't', source: 'user' })
    s.delete(rec.id)
    s.clear()
    expect(cb).toHaveBeenCalledTimes(3)
    dispose()
    s.write({ scope: 'session', kind: 'fact', key: 'k', text: 't', source: 'user' })
    expect(cb).toHaveBeenCalledTimes(3)
  })

  it('list() returns a stable snapshot between changes', () => {
    const s = mk()
    expect(s.list()).toBe(s.list())
  })

  it('works without IndexedDB (persistent write/delete/clear do not throw)', async () => {
    expect(typeof indexedDB).toBe('undefined')
    const s = mk()
    const rec = s.write({ scope: 'persistent', kind: 'preference', key: 'p', text: 't', source: 'user' })
    expect(() =>{  s.delete(rec.id) }).not.toThrow()
    expect(() =>{  s.clear() }).not.toThrow()
    await new Promise(r => setTimeout(r, 10))
  })
})
