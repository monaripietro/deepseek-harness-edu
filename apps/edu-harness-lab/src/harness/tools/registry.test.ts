import { describe, expect, it } from 'vitest'
import type { ToolDefinition } from '../../domain/types'
import { createToolRegistry } from './registry'

const mk = (id: string, title = id): ToolDefinition => ({ id, title, source: 'builtin' }) as unknown as ToolDefinition

describe('createToolRegistry', () => {
  it('registers, lists and gets', () => {
    const r = createToolRegistry()
    const a = mk('a')
    r.register(a)
    expect(r.get('a')).toBe(a)
    expect(r.list()).toEqual([a])
    expect(r.get('zzz')).toBeUndefined()
  })
  it('dispose removes the tool', () => {
    const r = createToolRegistry()
    const dispose = r.register(mk('a'))
    dispose()
    expect(r.get('a')).toBeUndefined()
    expect(r.list()).toEqual([])
  })
  it('dispose of a replaced registration does not remove the newer tool', () => {
    const r = createToolRegistry()
    const disposeOld = r.register(mk('a', 'old'))
    const neu = mk('a', 'new')
    r.register(neu)
    disposeOld()
    expect(r.get('a')).toBe(neu)
  })
  it('dispose is idempotent', () => {
    const r = createToolRegistry()
    const d = r.register(mk('a'))
    d()
    expect(() =>{  d() }).not.toThrow()
  })
})
