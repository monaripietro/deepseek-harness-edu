import { describe, expect, it } from 'vitest'
import { validateArgs } from './validate'

const schema = {
  type: 'object',
  properties: {
    nome: { type: 'string', minLength: 2 },
    qta: { type: 'integer', minimum: 1 },
    cat: { type: 'string', enum: ['A', 'B'] },
  },
  required: ['nome', 'qta'],
  additionalProperties: false,
}

describe('validateArgs', () => {
  it('accepts valid args', () => {
    expect(validateArgs(schema, { nome: 'ab', qta: 2, cat: 'A' })).toEqual({ ok: true })
  })
  it('reports a missing required field in Italian', () => {
    const r = validateArgs(schema, { nome: 'ab' })
    expect(r).toEqual({ ok: false, errors: ["manca il campo obbligatorio 'qta'"] })
  })
  it('reports wrong type', () => {
    const r = validateArgs(schema, { nome: 'ab', qta: 'due' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors).toContain("'qta' deve essere un intero")
  })
  it('reports additional properties', () => {
    const r = validateArgs(schema, { nome: 'ab', qta: 1, extra: 1 })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors).toContain("campo non previsto 'extra'")
  })
  it('reports enum, minimum and minLength messages', () => {
    const r = validateArgs(schema, { nome: 'a', qta: 0, cat: 'Z' })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.errors).toContain("'cat' deve essere uno tra: A, B")
      expect(r.errors).toContain("'qta' deve essere maggiore o uguale a 1")
      expect(r.errors).toContain("'nome' deve avere almeno 2 caratteri")
    }
  })
  it('reports non-object args', () => {
    const r = validateArgs(schema, 'x')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors[0]).toContain("l'oggetto degli argomenti deve essere un oggetto")
  })
  it('does not throw on an invalid schema', () => {
    const r = validateArgs({ type: 'nonsense' }, {})
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors[0]).toMatch(/schema degli argomenti non valido/)
  })
})
