import Ajv2020 from 'ajv/dist/2020'
import { beforeEach, describe, expect, it } from 'vitest'
import type { ToolDefinition, ToolExecContext, ToolOutcome } from '../../domain/types'
import { NO_FAULTS } from '../../domain/types'
import { SCENARIO_DATA } from '../../scenarios'
import { createRetriever } from '../rag/retriever'
import { BUILTIN_TOOLS } from './builtin'
import { businessLog } from './businessLog'

const ctx: ToolExecContext = {
  signal: new AbortController().signal,
  data: SCENARIO_DATA,
  faults: NO_FAULTS,
  mcp: {} as never,
  retriever: createRetriever(SCENARIO_DATA.documents),
}
const tool = (id: string): ToolDefinition => BUILTIN_TOOLS.find(t => t.id === id) as ToolDefinition
const run = (id: string, args: Record<string, unknown>): Promise<ToolOutcome> => tool(id).execute(args, ctx)

describe('builtin tools', () => {
  beforeEach(() =>{  businessLog.clear() })

  it('every tool has a compilable JSON schema, an English model-facing description and an Italian title', () => {
    const ajv = new Ajv2020({ strict: false })
    const english = /\b(the|a|an|of|for|and|with|to|in|it)\b/i
    const italian = /\b(di|il|la|un|una|per|del|che|con|nel|nella|dei|delle)\b/
    expect(BUILTIN_TOOLS.length).toBeGreaterThan(10)
    for (const t of BUILTIN_TOOLS) {
      expect(() => ajv.compile(t.inputSchema), t.id).not.toThrow()
      expect(t.inputSchema.type).toBe('object')
      expect(t.description.length, t.id).toBeGreaterThan(20)
      // The model reads the description: English, like the rest of the model-facing prompt.
      expect(t.description, t.id).toMatch(english)
      expect(t.description, t.id).not.toMatch(italian)
      // The person reads the title in the UI: Italian.
      expect(t.title.length, t.id).toBeGreaterThan(3)
      expect(t.title, t.id).not.toMatch(/\b(the|of|and|with|for|to)\b/i)
      expect(t.source).toBe('builtin')
    }
    expect(new Set(BUILTIN_TOOLS.map(t => t.id)).size).toBe(BUILTIN_TOOLS.length)
  })

  it('calcolatrice computes and reports errors', async () => {
    const r = await run('calcolatrice', { espressione: '4*1219*1.22' })
    expect(r).toMatchObject({ ok: true, data: { risultato: 5948.72 } })
    expect(await run('calcolatrice', { espressione: '1/0' })).toMatchObject({ ok: false, code: 'TOOL_ERROR' })
    expect(await run('calcolatrice', { espressione: 'abc' })).toMatchObject({ ok: false, code: 'INVALID_ARGS' })
  })

  it('cerca_catalogo category B returns NB-B14 and NB-V14P', async () => {
    const r = await run('cerca_catalogo', { categoria: 'B' })
    expect(r.ok).toBe(true)
    if (r.ok) {
      const codes = (r.data as { prodotti: { codice: string }[] }).prodotti.map(p => p.codice)
      expect(codes).toEqual(['NB-B14', 'NB-V14P'])
    }
    expect(await run('cerca_catalogo', { categoria: 'C', prezzo_max: 10 })).toMatchObject({ ok: false, code: 'EMPTY' })
  })

  it('verifica_disponibilita', async () => {
    const b14 = await run('verifica_disponibilita', { codice: 'NB-B14', quantita: 4 })
    expect(b14).toMatchObject({ ok: true, data: { disponibili: 2, sufficiente: false } })
    const v14 = await run('verifica_disponibilita', { codice: 'NB-V14P', quantita: 4 })
    expect(v14).toMatchObject({ ok: true, data: { sufficiente: true } })
    expect(await run('verifica_disponibilita', { codice: 'XX', quantita: 1 })).toMatchObject({ ok: false, code: 'EMPTY' })
  })

  it('leggi_budget authorizes only the user cost center', async () => {
    expect(await run('leggi_budget', { centro_di_costo: 'CC-410' })).toMatchObject({ ok: true, data: { residuo_eur_iva_esclusa: 6200 } })
    expect(await run('leggi_budget', { centro_di_costo: 'CC-220' })).toMatchObject({ ok: false, code: 'NOT_AUTHORIZED' })
  })

  it('crea_richiesta_acquisto returns an RDA-SIM id and logs it', async () => {
    const r = await run('crea_richiesta_acquisto', {
      centro_di_costo: 'CC-410',
      codice_articolo: 'NB-V14P',
      quantita: 4,
      prezzo_unitario: 1219,
      motivazione: 'nuovi assunti',
      consegna: 'Bologna',
    })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect((r.data as { id: string }).id).toContain('RDA-SIM')
      expect((r.data as { totale: number }).totale).toBe(5948.72)
    }
    expect(businessLog.list()).toHaveLength(1)
  })

  it('crea_richiesta_acquisto rejects wrong price, cost center and article', async () => {
    const base = { centro_di_costo: 'CC-410', codice_articolo: 'NB-V14P', quantita: 4, prezzo_unitario: 1219, motivazione: 'm', consegna: 'c' }
    expect(await run('crea_richiesta_acquisto', { ...base, prezzo_unitario: 1000 })).toMatchObject({ ok: false, code: 'INVALID_ARGS' })
    expect(await run('crea_richiesta_acquisto', { ...base, centro_di_costo: 'CC-220' })).toMatchObject({ ok: false, code: 'NOT_AUTHORIZED' })
    expect(await run('crea_richiesta_acquisto', { ...base, codice_articolo: 'ZZ' })).toMatchObject({ ok: false, code: 'INVALID_ARGS' })
    expect(businessLog.list()).toHaveLength(0)
  })

  it('converti_valuta uses the fixed rates', async () => {
    const r = await run('converti_valuta', { importo: 100, da: 'EUR', a: 'USD' })
    expect(r).toMatchObject({ ok: true, data: { risultato: 108, data_tassi: '2026-10-01' } })
    const back = await run('converti_valuta', { importo: 108, da: 'USD', a: 'EUR' })
    expect(back).toMatchObject({ ok: true, data: { risultato: 100 } })
    expect(await run('converti_valuta', { importo: 1, da: 'EUR', a: 'JPY' })).toMatchObject({ ok: false, code: 'INVALID_ARGS' })
  })

  it('sensitive and forbidden tools are refused', async () => {
    expect(await run('leggi_scheda_dipendente', { nome: 'Marco Rinaldi' })).toMatchObject({ ok: false, code: 'NOT_AUTHORIZED' })
    expect(await run('modifica_dato', { entita: 'x', campo: 'y', valore: 'z' })).toMatchObject({ ok: false, code: 'NOT_AUTHORIZED' })
  })

  it('cerca_policy finds the 2026 policy', async () => {
    const r = await run('cerca_policy', { domanda: 'notebook categoria B limite di spesa' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(JSON.stringify(r.data)).toContain('POL-IT-04')
  })
})
