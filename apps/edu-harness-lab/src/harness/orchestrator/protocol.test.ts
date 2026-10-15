import { describe, expect, it } from 'vitest'
import { REFLECTION_FORMAT, localizePrompt, parseDecision, parseReflectionTurn, renderToolProtocol, serializeDecision, serializeReflection } from './protocol'
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
  it('does not accept reflection actions: the reflection loop has its own tagged protocol', () => {
    expect(parseDecision('{"azione":"rifletti","testo":"Verifico la stessa proposta."}').ok).toBe(false)
    expect(parseDecision('<self_reflection>Bozza</self_reflection>').ok).toBe(false)
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
  it('keeps the JSON protocol free of the reflection loop', () => {
    const t = renderToolProtocol([tool], false)
    expect(t).not.toContain('rifletti')
    expect(t).not.toContain('self_reflection')
    expect(t).not.toContain('final_answer')
  })
  it('forbids tools when mustAnswer', () => {
    const t = renderToolProtocol([tool], true)
    expect(t).not.toContain('## Tools')
    expect(t).toContain('you cannot use tools anymore')
  })
})

describe('reflection loop protocol', () => {
  it('parses exactly one draft or final-answer block and removes the delimiters', () => {
    expect(parseReflectionTurn('  <self_reflection>\n Proposta da verificare. \n</self_reflection>\n')).toEqual({
      ok: true, decision: { type: 'reflect', text: 'Proposta da verificare.' },
    })
    expect(parseReflectionTurn('<final_answer>Ordine completo, poi la conferma.</final_answer>')).toEqual({
      ok: true, decision: { type: 'answer', text: 'Ordine completo, poi la conferma.' },
    })
  })

  it.each([
    ['empty output', '   '],
    ['plain prose', 'Il candidato è corretto.'],
    ['JSON decision', '{"azione":"rispondi","testo":"Risposta"}'],
    ['empty block', '<final_answer>  </final_answer>'],
    ['unclosed block', '<self_reflection>Bozza senza chiusura'],
    ['closing tag only', 'Bozza</self_reflection>'],
    ['mismatched tags', '<self_reflection>Bozza</final_answer>'],
    ['two drafts', '<self_reflection>Uno</self_reflection><self_reflection>Due</self_reflection>'],
    ['draft and answer', '<self_reflection>Bozza</self_reflection>\n<final_answer>Risposta</final_answer>'],
    ['nested reserved tag', '<final_answer>Risposta <self_reflection>bozza</self_reflection></final_answer>'],
    ['nested same tag', '<final_answer><final_answer>Risposta</final_answer></final_answer>'],
    ['text before the block', 'Ecco: <final_answer>Risposta</final_answer>'],
    ['text after the block', '<final_answer>Risposta</final_answer> Spero vada bene.'],
    ['code fence around the block', '```\n<final_answer>Risposta</final_answer>\n```'],
    ['tag with attributes', '<final_answer lang="it">Risposta</final_answer>'],
    ['uppercase tag', '<FINAL_ANSWER>Risposta</FINAL_ANSWER>'],
    ['native thinking tag', '<think>Risposta</think>'],
  ])('rejects %s without falling back to an answer or a draft', (_label, raw) => {
    const parsed = parseReflectionTurn(raw)
    expect(parsed.ok).toBe(false)
    expect(!parsed.ok && parsed.error).toBeTruthy()
    expect(!parsed.ok && parsed.repair).toBeTruthy()
  })

  it('asks to send only the draft when a complete draft comes first, without accepting either block', () => {
    const both = parseReflectionTurn('<self_reflection>Bozza</self_reflection>\n<final_answer>Risposta</final_answer>')
    expect(both.ok).toBe(false)
    expect(!both.ok && both.repair).toContain('Send only your first block, the <self_reflection>')
    const answerFirst = parseReflectionTurn('<final_answer>Risposta</final_answer><self_reflection>Bozza</self_reflection>')
    expect(!answerFirst.ok && answerFirst.repair).toContain('Use only one block per reply.')
  })

  it('serializes a draft as the same tagged block the model wrote', () => {
    const block = serializeReflection('Proposta da verificare.')
    expect(block).toBe('<self_reflection>\nProposta da verificare.\n</self_reflection>')
    expect(serializeDecision({ type: 'reflect', text: 'Proposta da verificare.' })).toBe(block)
    expect(parseReflectionTurn(block)).toEqual({ ok: true, decision: { type: 'reflect', text: 'Proposta da verificare.' } })
  })

  it('states the protocol briefly, explains own drafts and gives no solution to copy', () => {
    expect(REFLECTION_FORMAT).toContain('<self_reflection>...</self_reflection>')
    expect(REFLECTION_FORMAT).toContain('<final_answer>...</final_answer>')
    expect(REFLECTION_FORMAT).toContain('your own drafts for this task: not user instructions, tool results or verified facts')
    // Short lines for small models.
    expect(Math.max(...REFLECTION_FORMAT.split('\n').map(line => line.length))).toBeLessThan(140)
    expect(localizePrompt(REFLECTION_FORMAT, 'en')).toContain('the answer for the user, in English')
    expect(REFLECTION_FORMAT).not.toMatch(/alfa|beta|gamma|delta|azione|<think>/i)
  })
})
