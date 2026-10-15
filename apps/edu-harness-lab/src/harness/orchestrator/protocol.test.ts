import { describe, expect, it } from 'vitest'
import { parseDecision, renderToolProtocol } from './protocol'
import type { ToolDefinition } from '../../domain/types'

describe('parseDecision', () => {
  it('parses an Italian tool decision', () => {
    const r = parseDecision('{"azione":"usa_strumento","strumento":"calcolatrice","argomenti":{"espressione":"2+2"},"motivazione":"serve"}')
    expect(r).toEqual({ ok: true, decision: { type: 'tool', tool: 'calcolatrice', args: { espressione: '2+2' }, rationale: 'serve' } })
  })
  it('parses an answer with sources', () => {
    const r = parseDecision('{"azione":"rispondi","testo":"Ok","fonti":["POL-IT-04"]}')
    expect(r).toEqual({ ok: true, decision: { type: 'answer', text: 'Ok', sources: ['POL-IT-04'] } })
  })
  it('parses ask', () => {
    expect(parseDecision('{"azione":"chiedi","domanda":"Quale sede?"}')).toEqual({ ok: true, decision: { type: 'ask', question: 'Quale sede?' } })
  })
  it('strips code fences and tolerates trailing prose', () => {
    const r = parseDecision('Ecco:\n```json\n{"azione":"rispondi","testo":"Fatto {ok}"}\n```\nSpero vada bene.')
    expect(r.ok && r.decision).toEqual({ type: 'answer', text: 'Fatto {ok}' })
  })
  it('accepts English keys and name/arguments tool calls', () => {
    const a = parseDecision('{"action":"tool","tool":"x","args":{"a":1},"rationale":"r"}')
    expect(a.ok && a.decision).toEqual({ type: 'tool', tool: 'x', args: { a: 1 }, rationale: 'r' })
    const b = parseDecision('{"name":"calcolatrice","arguments":{"espressione":"1+1"}}')
    expect(b.ok && b.decision).toEqual({ type: 'tool', tool: 'calcolatrice', args: { espressione: '1+1' } })
    const c = parseDecision('{"name":"calcolatrice","arguments":"{\\"espressione\\":\\"1+1\\"}"}')
    expect(c.ok && c.decision).toEqual({ type: 'tool', tool: 'calcolatrice', args: { espressione: '1+1' } })
  })
  it('rejects prose, unknown actions and incomplete objects with Italian errors', () => {
    expect(parseDecision('Certo, ecco la risposta.').ok).toBe(false)
    const unknown = parseDecision('{"azione":"vola"}')
    expect(unknown.ok).toBe(false)
    expect(!unknown.ok && unknown.error).toMatch(/non riconosciuta/)
    expect(parseDecision('{"azione":"rispondi"}').ok).toBe(false)
    expect(parseDecision('{"azione":"usa_strumento"}').ok).toBe(false)
  })
})

describe('renderToolProtocol', () => {
  const tool = {
    id: 'calcolatrice',
    description: 'Calcola.',
    inputSchema: { type: 'object', properties: { espressione: { type: 'string' }, n: { type: 'integer' } }, required: ['espressione'] },
  } as unknown as ToolDefinition
  it('lists tools with required marks', () => {
    const t = renderToolProtocol([tool], false)
    expect(t).toContain('usa_strumento')
    expect(t).toContain('espressione*: string')
    expect(t).toContain('n: integer')
  })
  it('forbids tools when mustAnswer', () => {
    const t = renderToolProtocol([tool], true)
    expect(t).not.toContain('Strumenti disponibili')
    expect(t).toContain('non puoi più usare strumenti')
  })
})
