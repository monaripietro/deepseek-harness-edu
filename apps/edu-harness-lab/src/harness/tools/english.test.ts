import { beforeEach, describe, expect, it } from 'vitest'
import type { FaultInjection, PromptLanguage, ScenarioData, ToolDefinition, ToolExecContext, ToolOutcome } from '../../domain/types'
import { NO_FAULTS } from '../../domain/types'
import { SCENARIO_DATA } from '../../scenarios'
import { createEventBus } from '../events'
import { createMcpHub } from '../mcp/hub'
import { createRetriever } from '../rag/retriever'
import { BUILTIN_TOOLS } from './builtin'
import { businessLog } from './businessLog'
import { calculate } from './calculator'
import { executeTool } from './executor'
import { LocalizedError, argumentText, formatEnDate, formatEur } from './lang'
import { PLAN_TOOL, recordPlan } from './planning'
import { validateArgs } from './validate'

describe('tool argument text', () => {
  it.each([
    { value: undefined, expected: '' },
    { value: null, expected: '' },
    { value: '  text  ', expected: '  text  ' },
    { value: 12.5, expected: '12.5' },
    { value: true, expected: 'true' },
    { value: false, expected: 'false' },
    { value: 12n, expected: '12' },
    { value: Symbol('key'), expected: 'Symbol(key)' },
    { value: [1, 'text'], expected: '[1,"text"]' },
    { value: { status: 'ready' }, expected: '{"status":"ready"}' },
  ])('formats $value as $expected', ({ value, expected }) => {
    expect(argumentText(value)).toBe(expected)
  })
})

/** English demo data for the tests: same ids, codes and numbers as the Italian data, English texts. */
const SPECS_EN: Record<string, string> = {
  'NB-A13': '13", 8 GB RAM, 256 GB SSD, 1.2 kg. Office and back-office use.',
  'NB-B14': '14", 16 GB RAM, 512 GB SSD, 1.4 kg, 12-hour battery. Mobile roles.',
  'NB-V14P': '14", 16 GB RAM, 512 GB SSD, 1.3 kg, 14-hour battery, optional 5G. Mobile roles.',
  'NB-C16': '16", 32 GB RAM, 1 TB SSD, dedicated graphics card. CAD and data analysis.',
}
const DATA_EN: ScenarioData = {
  ...SCENARIO_DATA,
  user: { ...SCENARIO_DATA.user, role: 'Sales Director' },
  catalog: SCENARIO_DATA.catalog.map(p => ({ ...p, specs: SPECS_EN[p.code] ?? p.specs })),
  budgets: { 'CC-410': { residualEur: 6200, period: 'Q4 2026, IT equipment, VAT excluded', owner: 'Laura Bianchi' } },
  orders: {
    'ORD-2026-1187': {
      customer: 'Ferramenta Rossi S.r.l. (fictional)',
      status: 'Delayed',
      expected: '16 October 2026',
      note: 'Hinge batch delayed at the supplier: full delivery expected on 16 October 2026.',
    },
  },
  supplierDelivery: { ...SCENARIO_DATA.supplierDelivery, 'NB-V14P': '28 October 2026' },
}

const ITALIAN = / il | della | per | non |disponibil|Richiesta/i
const ITALIAN_MARKERS = /\bIVA\b|\bSIMULATO\b|\bpezzi\b|\bgiorni\b/
const IT_MONEY = /\d\.\d{3},\d{2}|\d,\d{2} €/

function mkCtx(lang: PromptLanguage | undefined, data: ScenarioData, faults: Partial<FaultInjection> = {}): ToolExecContext {
  return {
    signal: new AbortController().signal,
    data,
    ...(lang ? { lang } : {}),
    faults: { ...NO_FAULTS, ...faults },
    mcp: {} as never,
    retriever: createRetriever(data.documents),
  }
}
const tool = (id: string): ToolDefinition => {
  const found = BUILTIN_TOOLS.find(t => t.id === id)
  if (!found) throw new Error(`missing tool ${id}`)
  return found
}
const runEn = (id: string, args: Record<string, unknown>): Promise<ToolOutcome> => tool(id).execute(args, mkCtx('en', DATA_EN))
const runIt = (id: string, args: Record<string, unknown>, lang?: PromptLanguage): Promise<ToolOutcome> =>
  tool(id).execute(args, mkCtx(lang, SCENARIO_DATA))

/** The text the model reads: summary or error message. */
function text(o: ToolOutcome): string {
  return o.ok ? o.summary : o.message
}
function expectEnglish(o: ToolOutcome): string {
  const s = text(o)
  expect(s, s).not.toMatch(ITALIAN)
  expect(s, s).not.toMatch(ITALIAN_MARKERS)
  expect(s, s).not.toMatch(IT_MONEY)
  return s
}

const RDA_ARGS = {
  centro_di_costo: 'CC-410',
  codice_articolo: 'NB-V14P',
  quantita: 4,
  prezzo_unitario: 1219,
  motivazione: 'new sales hires',
  consegna: 'Bologna office, by 2 November 2026',
}

describe('tool results in English (prompt language en)', () => {
  beforeEach(() =>{  businessLog.clear() })

  it('formats amounts and dates the English way', () => {
    expect(formatEur(1219, 'en')).toBe('€1,219.00')
    expect(formatEur(-1234.5, 'en')).toBe('-€1,234.50')
    expect(formatEur(1219, 'it')).toBe('1.219,00 €')
    expect(formatEnDate('2026-10-16')).toBe('16 October 2026')
    expect(formatEnDate('03/11/2026')).toBe('3 November 2026')
    expect(formatEnDate('16 October 2026')).toBe('16 October 2026')
    expect(calculate('4*1219*1.22', 'en').text).toBe('5,948.72')
    expect(calculate('4*1219*1.22').text).toBe('5.948,72')
  })

  it('cerca_catalogo', async () => {
    const s = expectEnglish(await runEn('cerca_catalogo', { categoria: 'B' }))
    expect(s).toContain('Found 2 products')
    expect(s).toContain('NB-V14P - Notebook Vega 14 Pro (Category B, €1,219.00 excl. VAT;')
    const fallback = expectEnglish(await runEn('cerca_catalogo', { categoria: 'B', testo: 'Zeta' }))
    expect(fallback).toContain('no product contains "Zeta": here are all the products in category B')
    const empty = await runEn('cerca_catalogo', { categoria: 'C', prezzo_max: 10 })
    expect(empty).toMatchObject({ ok: false, code: 'EMPTY' })
    expectEnglish(empty)
  })

  it('verifica_disponibilita, sufficient and not', async () => {
    const ok = expectEnglish(await runEn('verifica_disponibilita', { codice: 'NB-V14P', quantita: 4 }))
    expect(ok).toBe('NB-V14P: requested 4, in stock 12 - quantity SUFFICIENT. Estimated delivery: 5 working days.')
    const short = expectEnglish(await runEn('verifica_disponibilita', { codice: 'NB-B14', quantita: 4 }))
    expect(short).toBe('NB-B14: requested 4, in stock 2 - quantity NOT sufficient (2 units short). Estimated delivery: 3 working days.')
    expectEnglish(await runEn('verifica_disponibilita', { codice: 'XX', quantita: 1 }))
  })

  it('leggi_budget', async () => {
    const s = expectEnglish(await runEn('leggi_budget', { centro_di_costo: 'CC-410' }))
    expect(s).toBe('Remaining budget of CC-410 (Q4 2026, IT equipment, VAT excluded): €6,200.00 excl. VAT. Budget owner: Laura Bianchi.')
    const denied = await runEn('leggi_budget', { centro_di_costo: 'CC-220' })
    expect(denied).toMatchObject({ ok: false, code: 'NOT_AUTHORIZED' })
    expect(expectEnglish(denied)).toContain('You are not authorized')
  })

  it('converti_valuta', async () => {
    const s = expectEnglish(await runEn('converti_valuta', { importo: 1000, da: 'EUR', a: 'USD' }))
    expect(s).toBe('1,000.00 EUR = 1,080.00 USD (fixed teaching rate 1.08 as of 1 October 2026, not a market rate)')
    expectEnglish(await runEn('converti_valuta', { importo: 1, da: 'EUR', a: 'JPY' }))
  })

  it('leggi_ordine_cliente', async () => {
    const s = expectEnglish(await runEn('leggi_ordine_cliente', { numero_ordine: 'ord-2026-1187' }))
    expect(s).toContain('Order ORD-2026-1187 for customer Ferramenta Rossi S.r.l. (fictional): ')
    expect(s).toContain('status "Delayed", expected delivery 16 October 2026.')
    // Italian-style dates are rewritten too (e.g. if the English data is not loaded yet).
    const itDates = await tool('leggi_ordine_cliente').execute({ numero_ordine: 'ORD-2026-1203' }, mkCtx('en', SCENARIO_DATA))
    expect(text(itDates)).toContain('expected delivery 22 October 2026')
    expectEnglish(await runEn('leggi_ordine_cliente', { numero_ordine: 'ORD-0' }))
  })

  it('crea_richiesta_acquisto: English summary, Italian business log', async () => {
    const r = await runEn('crea_richiesta_acquisto', RDA_ARGS)
    const s = expectEnglish(r)
    expect(s).toBe(
      'Purchase request RDA-SIM-2026-0042 created: 4 × NB-V14P at €1,219.00 = €4,876.00 excl. VAT ' +
        '(VAT 22% €1,072.72, total €5,948.72) - CC-410 - delivery: Bologna office, by 2 November 2026 - reason: new sales hires ' +
        '(SIMULATED: no real system was changed)',
    )
    expect(r).toMatchObject({ ok: true, data: { prezzo_unitario: 1219, totale: 5948.72, simulato: true } })
    // The business log is shown in the app: it stays Italian.
    expect(businessLog.list()[0]?.details).toContain('IVA esclusa')
    for (const bad of [{ prezzo_unitario: 1000 }, { centro_di_costo: 'CC-220' }, { codice_articolo: 'ZZ' }, { quantita: 0 }]) {
      const o = await runEn('crea_richiesta_acquisto', { ...RDA_ARGS, ...bad })
      expect(o.ok).toBe(false)
      expectEnglish(o)
    }
    expect(text(await runEn('crea_richiesta_acquisto', { ...RDA_ARGS, prezzo_unitario: 1000 }))).toContain('€1,000.00')
  })

  it('calcolatrice', async () => {
    expect(expectEnglish(await runEn('calcolatrice', { espressione: '4*1219*1.22' }))).toBe('4*1219*1.22 = 5,948.72')
    expect(expectEnglish(await runEn('calcolatrice', { espressione: '1/0' }))).toBe('Calculation error: division by zero.')
    const invalid = await runEn('calcolatrice', { espressione: 'abc' })
    expect(expectEnglish(invalid)).toBe("Invalid expression: invalid character 'a' in the expression.")
  })

  it('the other built-in tools', async () => {
    const calls: [string, Record<string, unknown>][] = [
      ['cerca_policy', { domanda: 'zzzz qqqq' }],
      ['leggi_scheda_dipendente', { nome: 'Marco Rinaldi' }],
      ['registra_evento', { tipo: 'note', descrizione: 'Customer called back' }],
      ['registra_evento', { tipo: '', descrizione: '' }],
      ['crea_attivita', { titolo: 'Call', scadenza: '2026-12-01', assegnatario: 'Laura Bianchi', cliente: 'Ferramenta Rossi' }],
      ['crea_attivita', { titolo: 'Call', scadenza: 'tomorrow', assegnatario: 'Laura Bianchi' }],
      ['richiedi_approvazione', { tipo: 'purchase', riferimento: 'RDA-SIM-2026-0042', approvatore: 'CFO' }],
      ['invia_messaggio', { destinatario: 'Laura Bianchi', oggetto: 'Update', testo: 'The order is late.' }],
      ['modifica_dato', { entita: 'customer', campo: 'name', valore: 'x' }],
    ]
    for (const [id, args] of calls) expectEnglish(await runEn(id, args))
    const task = await runEn('crea_attivita', { titolo: 'Call the customer', scadenza: '2026-12-01', assegnatario: 'Laura Bianchi' })
    expect(text(task)).toBe(
      'Task ATT-SIM-2026-0002 created: Call the customer - due 1 December 2026 - assigned to Laura Bianchi ' +
        '(SIMULATED: no real system was changed)',
    )
  })

  it('executor errors, plan and argument validation', async () => {
    const t1: ToolDefinition = { ...tool('calcolatrice'), latencyMs: [0, 0] }
    const args = { espressione: '1+1' }
    const ctx = (faults: Partial<FaultInjection>) => mkCtx('en', DATA_EN, faults)
    const failed = await executeTool(t1, args, ctx({ error: ['calcolatrice'] }), 500)
    expect(expectEnglish(failed)).toBe('Simulated error: the tool returned an internal error.')
    expect(expectEnglish(await executeTool(t1, args, ctx({ empty: ['calcolatrice'] }), 500))).toContain('No result')
    expect(expectEnglish(await executeTool(t1, args, ctx({ timeout: ['calcolatrice'] }), 20))).toBe('The tool did not respond within 1 s')
    const throwing: ToolDefinition = {
      ...t1,
      execute: () => Promise.reject(new LocalizedError('Server MCP non raggiungibile', 'MCP server unreachable')),
    }
    expect(expectEnglish(await executeTool(throwing, args, ctx({}), 500))).toBe('Tool error: MCP server unreachable')
    const aborted = new AbortController()
    aborted.abort()
    expect(expectEnglish(await executeTool(t1, args, { ...ctx({}), signal: aborted.signal }, 500))).toBe('Execution stopped by the user.')

    expect(text(recordPlan({ piano: '1) calcolatrice 2) answer' }, 'en'))).toBe('Plan recorded:\n1) calcolatrice 2) answer')
    expectEnglish(recordPlan({ piano: ' ' }, 'en'))
    expect(text(await PLAN_TOOL.execute({ piano: '' }, mkCtx('en', DATA_EN)))).toBe('The plan is empty: write the numbered steps.')

    const v = validateArgs(tool('verifica_disponibilita').inputSchema, { codice: 1, quantita: 0, extra: true }, 'en')
    expect(v).toEqual({
      ok: false,
      errors: ["unexpected field 'extra'", "'codice' must be a text string", "'quantita' must be greater than or equal to 1"],
    })
  })

  it('simulated MCP server (TechSupply)', async () => {
    const faults: FaultInjection = { ...NO_FAULTS }
    const lang = (): PromptLanguage => 'en'
    const hub = createMcpHub({ bus: createEventBus(), data: () => DATA_EN, faults: () => faults, lang, simulatedLatencyMs: [0, 0] })
    await hub.connect('techsupply')
    const [delivery, priceList] = hub.toolDefinitions()
    if (!delivery || !priceList) throw new Error('missing MCP tools')
    const ctx = { ...mkCtx('en', DATA_EN), mcp: hub }
    const d = await delivery.execute({ codice: 'NB-V14P', quantita: 4, cap: '40128' }, ctx)
    expect(expectEnglish(d)).toBe('Estimated delivery to Bologna: 28 October 2026 (SIMULATED) for 4 × NB-V14P.')
    const milan = await delivery.execute({ codice: 'NB-B14', quantita: 1, cap: '20100' }, ctx)
    expect(expectEnglish(milan)).toBe('Estimated delivery to Milan: 30 October 2026 (SIMULATED) for 1 × NB-B14.')
    const p = await priceList.execute({ codice: 'NB-V14P' }, ctx)
    expect(expectEnglish(p)).toBe('NB-V14P - Notebook Vega 14 Pro: TechSupply list price €1,219.00 excl. VAT (SIMULATED).')
    const missing = await priceList.execute({ codice: 'ZZ' }, ctx)
    expect(missing).toMatchObject({ ok: false, code: 'EMPTY' })
    expectEnglish(missing)
    faults.mcpDown = true
    const down = await priceList.execute({ codice: 'NB-V14P' }, ctx)
    expect(down).toMatchObject({ ok: false, code: 'TOOL_ERROR' })
    expect(expectEnglish(down)).toBe('MCP server unreachable (simulated fault)')
  })
})

describe('tool results in Italian (default) are unchanged', () => {
  beforeEach(() =>{  businessLog.clear() })

  it('lang "it" and no lang give the same Italian texts', async () => {
    const calls: [string, Record<string, unknown>][] = [
      ['calcolatrice', { espressione: '4*1219*1.22' }],
      ['calcolatrice', { espressione: '1/0' }],
      ['converti_valuta', { importo: 100, da: 'EUR', a: 'USD' }],
      ['cerca_catalogo', { categoria: 'B' }],
      ['verifica_disponibilita', { codice: 'NB-B14', quantita: 4 }],
      ['leggi_budget', { centro_di_costo: 'CC-410' }],
      ['leggi_ordine_cliente', { numero_ordine: 'ORD-2026-1187' }],
      ['crea_richiesta_acquisto', { ...RDA_ARGS, motivazione: 'nuovi assunti', consegna: 'Bologna' }],
    ]
    for (const [id, args] of calls) {
      businessLog.clear()
      const none = await runIt(id, args)
      businessLog.clear()
      expect(await runIt(id, args, 'it'), id).toEqual(none)
    }
  })

  it('keeps the exact Italian wording and number format', async () => {
    expect(text(await runIt('verifica_disponibilita', { codice: 'NB-B14', quantita: 4 }))).toBe(
      'NB-B14: richiesti 4, disponibili 2 - quantità NON sufficiente (mancano 2 pezzi). Consegna stimata: 3 giorni lavorativi.',
    )
    expect(text(await runIt('converti_valuta', { importo: 100, da: 'EUR', a: 'USD' }))).toBe(
      '100,00 EUR = 108,00 USD (tasso 1,08 fisso didattico del 2026-10-01, non un tasso di mercato)',
    )
    expect(text(await runIt('leggi_budget', { centro_di_costo: 'CC-410' }))).toBe(
      'Budget residuo CC-410 (Q4 2026, dotazioni IT, IVA esclusa): 6.200,00 € IVA esclusa. Responsabile: Laura Bianchi.',
    )
    expect(text(await runIt('calcolatrice', { espressione: '4*1219*1.22' }))).toBe('4*1219*1.22 = 5.948,72')
    const rda = text(await runIt('crea_richiesta_acquisto', { ...RDA_ARGS, motivazione: 'nuovi assunti', consegna: 'Bologna' }))
    expect(rda).toBe(
      "Richiesta d'acquisto RDA-SIM-2026-0042 creata: 4 × NB-V14P a 1.219,00 € = 4.876,00 € IVA esclusa " +
        '(IVA 22% 1.072,72 €, totale 5.948,72 €) - CC-410 - consegna: Bologna - motivo: nuovi assunti ' +
        '(SIMULATO: nessun sistema reale è stato modificato)',
    )
    expect(validateArgs(tool('verifica_disponibilita').inputSchema, { codice: 'NB-B14' })).toEqual({
      ok: false,
      errors: ["manca il campo obbligatorio 'quantita'"],
    })
  })

  it('simulated MCP server answers in Italian without the lang option', async () => {
    const hub = createMcpHub({ bus: createEventBus(), data: () => SCENARIO_DATA, faults: () => NO_FAULTS, simulatedLatencyMs: [0, 0] })
    await hub.connect('techsupply')
    const signal = new AbortController().signal
    const r = await hub.callTool('techsupply', 'listino', { codice: 'NB-V14P' }, signal)
    expect(r.text).toBe('NB-V14P - Notebook Vega 14 Pro: listino TechSupply 1.219,00 € IVA esclusa (SIMULATO).')
    const d = await hub.callTool('techsupply', 'verifica_consegna', { codice: 'NB-V14P', quantita: 4, cap: '40128' }, signal)
    expect(d.text).toBe('Consegna stimata a Bologna: 28/10/2026 (SIMULATO) per 4 × NB-V14P.')
  })
})
