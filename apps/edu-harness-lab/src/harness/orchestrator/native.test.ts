import { describe, expect, it } from 'vitest'
import { parseNative, parsePythonicCall } from './protocol'

describe('parseNative — native tool-call formats of small models', () => {
  it('reads Gemma 4 calls with <|"|> strings, numbers and booleans', () => {
    const r = parseNative('<|tool_call>call:cerca_catalogo{categoria:<|"|>notebook, 14"<|"|>,max_prezzo:900,solo_disponibili:true}<tool_call|>')
    expect(r).toEqual({
      ok: true,
      decision: { type: 'tool', tool: 'cerca_catalogo', args: { categoria: 'notebook, 14"', max_prezzo: 900, solo_disponibili: true } },
    })
  })

  it('reads a Gemma 4 call without arguments and drops thinking and turn markers from answers', () => {
    expect(parseNative('<|tool_call>call:leggi_budget{}<tool_call|>')).toEqual({ ok: true, decision: { type: 'tool', tool: 'leggi_budget', args: {} } })
    expect(parseNative('<|channel>thought\nragiono<channel|>Il totale è 4.344 €.<turn|>')).toEqual({ ok: true, decision: { type: 'answer', text: 'Il totale è 4.344 €.' } })
  })

  it('reads LFM2 Pythonic calls between markers', () => {
    const r = parseNative('<|tool_call_start|>[verifica_disponibilita(codice="NB-B14", quantita=4)]<|tool_call_end|>Controllo il magazzino.')
    expect(r).toEqual({
      ok: true,
      decision: { type: 'tool', tool: 'verifica_disponibilita', args: { codice: 'NB-B14', quantita: 4 }, rationale: 'Controllo il magazzino.' },
    })
  })
  it('reads LFM2 JSON calls between markers', () => {
    const r = parseNative('<|tool_call_start|>[{"name": "calcolatrice", "arguments": {"espressione": "4*1219*1.22"}}]<|tool_call_end|>')
    expect(r.ok && r.decision).toMatchObject({ type: 'tool', tool: 'calcolatrice', args: { espressione: '4*1219*1.22' } })
  })
  it('reads Qwen-style <tool_call> JSON', () => {
    const r = parseNative('<tool_call>\n{"name": "cerca_catalogo", "arguments": {"categoria": "B"}}\n</tool_call>')
    expect(r.ok && r.decision).toMatchObject({ type: 'tool', tool: 'cerca_catalogo', args: { categoria: 'B' } })
  })
  it('reads a bare Pythonic list without markers', () => {
    const r = parseNative('[leggi_budget(centro_di_costo="CC-410")]')
    expect(r.ok && r.decision).toMatchObject({ type: 'tool', tool: 'leggi_budget', args: { centro_di_costo: 'CC-410' } })
  })
  it('treats plain text as the final answer and hides thinking', () => {
    const r = parseNative('<think>interno</think>Il totale è 5.948,72 € IVA inclusa (POL-IT-04).')
    expect(r).toEqual({ ok: true, decision: { type: 'answer', text: 'Il totale è 5.948,72 € IVA inclusa (POL-IT-04).' } })
  })
  it('reports an unreadable call so the harness can ask for a repair', () => {
    expect(parseNative('<|tool_call_start|>???<|tool_call_end|>').ok).toBe(false)
  })
})

describe('parsePythonicCall', () => {
  it('handles booleans, None, lists and escaped quotes', () => {
    expect(parsePythonicCall('[f(a=True, b=None, c=[1, 2], d="l\\"uno", e=\'x\')]')).toEqual({
      name: 'f',
      arguments: { a: true, b: null, c: [1, 2], d: 'l"uno', e: 'x' },
    })
  })
  it('keeps only the first call of a list', () => {
    expect(parsePythonicCall('[a(x=1), b(y=2)]')).toEqual({ name: 'a', arguments: { x: 1 } })
  })
})
