import { describe, expect, it } from 'vitest'
import type { ContextHints, RunRecord, ToolObservation, ToolOutcome } from '../domain/types'
import { parseDecision } from '../harness/orchestrator/protocol'
import { GUIDE_CHECKERS, amountsBelongTo, containsNumber, extractEuroAmounts, guideAllowedAmounts, parseItNumber } from './checkers'
import { guideScenario } from './guide'
import { simulateGuide } from '../test-support/scripted/guidePolicy'
import { SCENARIOS } from './index'

const ALL_TOOLS = ['calcolatrice', 'cerca_policy', 'cerca_catalogo', 'verifica_disponibilita', 'leggi_budget', 'crea_richiesta_acquisto']
const MCP = 'mcp__techsupply__verifica_consegna'

function hints(over: Partial<ContextHints> = {}): ContextHints {
  return {
    scenarioId: guideScenario.id,
    presentKinds: ['message'],
    availableTools: [],
    toolResults: [],
    docIds: [],
    memoryKeys: [],
    protocol: 'text',
    mustAnswer: false,
    repairAttempt: 0,
    stepIndex: 1,
    ...over,
  }
}
const ok = (data: unknown, summary = 'ok'): ToolOutcome => ({ ok: true, data, summary })
const err = (code: Extract<ToolOutcome, { ok: false }>['code'], message = 'm'): ToolOutcome => ({ ok: false, code, message })
let n = 0
const obs = (tool: string, args: Record<string, unknown>, outcome: ToolOutcome): ToolObservation => ({ callId: `c${(n += 1)}`, tool, args, outcome })

const CATALOG = obs('cerca_catalogo', { categoria: 'B' }, ok({
  prodotti: [
    { codice: 'NB-B14', nome: 'Notebook Aurora B14', categoria: 'B', prezzo_eur_iva_esclusa: 1149, specifiche: '' },
    { codice: 'NB-V14P', nome: 'Notebook Vega 14 Pro', categoria: 'B', prezzo_eur_iva_esclusa: 1219, specifiche: '' },
  ],
}))
const B14_KO = obs('verifica_disponibilita', { codice: 'NB-B14', quantita: 4 }, ok({ codice: 'NB-B14', richiesti: 4, disponibili: 2, sufficiente: false, consegna_giorni_lavorativi: 3 }))
const V14_OK = obs('verifica_disponibilita', { codice: 'NB-V14P', quantita: 4 }, ok({ codice: 'NB-V14P', richiesti: 4, disponibili: 12, sufficiente: true, consegna_giorni_lavorativi: 5 }))
const CALC = obs('calcolatrice', { espressione: '4*1219*1.22' }, ok({ risultato: 5948.72 }))
const BUDGET = obs('leggi_budget', { centro_di_costo: 'CC-410' }, ok({ residuo_eur_iva_esclusa: 6200 }))
const DELIVERY = obs(MCP, { codice: 'NB-V14P', quantita: 4, cap: '40128' }, ok({ text: 'Consegna stimata a Bologna: 28/10/2026 (SIMULATO)' }, 'Consegna stimata a Bologna: 28/10/2026 (SIMULATO)'))
const RDA = obs('crea_richiesta_acquisto', {}, ok({ id: 'RDA-SIM-2026-0042' }))

const json = (over: Partial<ContextHints>) =>
  hints({ protocol: 'json', presentKinds: ['instruction', 'toolSchema', 'message'], availableTools: ALL_TOOLS, docIds: ['POL-IT-04', 'POL-ACQ-01'], memoryKeys: ['centro_di_costo'], ...over })

function decide(h: ContextHints) {
  const raw = simulateGuide(h)
  const p = parseDecision(raw)
  expect(p.ok, raw).toBe(true)
  return p.ok ? p.decision : (undefined as never)
}

describe('guide policy, text protocol', () => {
  it('no instructions: confident, invents a product and a price, offers to send the order', () => {
    const t = simulateGuide(hints())
    expect(t).toContain('UltraBook Pro 15')
    expect(t).toContain('intorno ai 1.400 €')
    expect(t).toContain('inviare l’ordine')
    expect(t).not.toContain('POL-')
  })

  it('instructions: admits and lists needs', () => {
    const t = simulateGuide(hints({ presentKinds: ['instruction', 'message'] }))
    expect(t).toContain('Non conosco la policy')
    expect(t).toContain('Per rispondere mi servono')
    expect(t).not.toContain('UltraBook')
  })

  it('task data adds names and date; memory adds CC, site and a table', () => {
    const kinds: ContextHints['presentKinds'] = ['instruction', 'taskData', 'message']
    const t3 = simulateGuide(hints({ presentKinds: kinds }))
    expect(t3).toContain('Sara Colombo')
    expect(t3).toContain('3/11/2026')
    const t4 = simulateGuide(hints({ presentKinds: [...kinds, 'memory'], memoryKeys: ['centro_di_costo', 'sede_consegna', 'formato'] }))
    expect(t4).toContain('CC-410')
    expect(t4).toContain('Bologna')
    expect(t4).toContain('|---|')
  })

  it('documents: policy facts and a vague ceiling; outdated policy alone gives the wrong 1.000 €', () => {
    const kinds: ContextHints['presentKinds'] = ['instruction', 'document', 'message']
    const t = simulateGuide(hints({ presentKinds: kinds, docIds: ['POL-IT-04', 'POL-ACQ-01'] }))
    expect(t).toContain('Categoria B')
    expect(t).toContain('1.250 €')
    expect(t).toContain('stesso modello')
    expect(t).toContain('circa 6.000 €')
    expect(t).toContain('POL-ACQ-01')
    expect(t).not.toContain('6.100')
    expect(simulateGuide(hints({ presentKinds: kinds, docIds: ['POL-IT-04-2024'] }))).toContain('1.000 €')
    expect(simulateGuide(hints({ presentKinds: kinds, docIds: ['POL-IT-04', 'POL-IT-04-2024'] }))).toContain('1.250 €')
  })
})

describe('guide policy, json protocol', () => {
  it('calculator only: asks for 4*1250*1.22, then answers 6.100,00 citing POL-IT-04', () => {
    const h = json({ availableTools: ['calcolatrice'] })
    expect(decide(h)).toMatchObject({ type: 'tool', tool: 'calcolatrice', args: { espressione: '4*1250*1.22' } })
    const d = decide({ ...h, mustAnswer: true, toolResults: [obs('calcolatrice', { espressione: '4*1250*1.22' }, ok({ risultato: 6100 }))] })
    expect(d).toMatchObject({ type: 'answer', sources: ['POL-IT-04', 'POL-ACQ-01'] })
    expect((d as { text: string }).text).toContain('6.100,00 €')
    expect((d as { text: string }).text).toMatch(/non posso consultare il catalogo/)
  })

  it('several tools, single round: cerca_catalogo then NB-B14 with no stock check', () => {
    expect(decide(json({}))).toMatchObject({ type: 'tool', tool: 'cerca_catalogo', args: { categoria: 'B' } })
    const d = decide(json({ mustAnswer: true, toolResults: [CATALOG] }))
    expect(d.type).toBe('answer')
    const text = (d as { text: string }).text
    expect(text).toContain('NB-B14')
    expect(text).toMatch(/Non ho verificato la disponibilità/)
    expect(text).not.toContain('NB-V14P')
  })

  it('loop: follows the whole chain of observations', () => {
    const base = { availableTools: [...ALL_TOOLS, MCP] }
    const steps: [ToolObservation[], string, Record<string, unknown>][] = [
      [[CATALOG], 'verifica_disponibilita', { codice: 'NB-B14', quantita: 4 }],
      [[CATALOG, B14_KO], 'verifica_disponibilita', { codice: 'NB-V14P', quantita: 4 }],
      [[CATALOG, B14_KO, V14_OK], 'calcolatrice', { espressione: '4*1219*1.22' }],
      [[CATALOG, B14_KO, V14_OK, CALC], 'leggi_budget', { centro_di_costo: 'CC-410' }],
      [[CATALOG, B14_KO, V14_OK, CALC, BUDGET], MCP, { codice: 'NB-V14P', quantita: 4, cap: '40128' }],
    ]
    for (const [toolResults, tool, args] of steps) expect(decide(json({ ...base, toolResults }))).toMatchObject({ type: 'tool', tool, args })
    expect(decide(json({ ...base, toolResults: [CATALOG, B14_KO, V14_OK, CALC, BUDGET, DELIVERY] }))).toMatchObject({
      type: 'tool',
      tool: 'crea_richiesta_acquisto',
      args: { centro_di_costo: 'CC-410', codice_articolo: 'NB-V14P', quantita: 4, prezzo_unitario: 1219 },
    })
    const fin = decide(json({ ...base, toolResults: [CATALOG, B14_KO, V14_OK, CALC, BUDGET, DELIVERY, RDA] }))
    expect(fin).toMatchObject({ type: 'answer', sources: ['POL-IT-04', 'POL-ACQ-01'] })
    const t = (fin as { text: string }).text
    for (const s of ['4.876,00 €', '1.072,72 €', '5.948,72 €', '6.200,00 €', 'POL-ACQ-01', '28/10/2026', 'RDA-SIM-2026-0042', 'SIMULATA']) expect(t).toContain(s)
  })

  it('without the MCP tool the delivery is not claimed as verified', () => {
    const fin = decide(json({ toolResults: [CATALOG, B14_KO, V14_OK, CALC, BUDGET, RDA] }))
    expect((fin as { text: string }).text).not.toContain('28/10/2026')
  })

  it('DENIED write -> draft asking for human supervision; rejection -> nothing created', () => {
    const pre = [CATALOG, B14_KO, V14_OK, CALC, BUDGET]
    const denied = decide(json({ toolResults: [...pre, obs('crea_richiesta_acquisto', {}, err('DENIED', 'Azione con effetti: richiede supervisione umana, non ancora attiva.'))] }))
    expect((denied as { text: string }).text).toMatch(/supervisione umana/)
    expect((denied as { text: string }).text).toContain('5.948,72 €')
    const rejected = decide(json({ mustAnswer: true, toolResults: [...pre, obs('crea_richiesta_acquisto', {}, err('DENIED', 'La persona ha rifiutato l’azione: non è stata eseguita.'))] }))
    expect((rejected as { text: string }).text).toMatch(/non è stata creata/)
  })

  it('first failure retries the same call once, the second one answers honestly', () => {
    const t1 = obs('verifica_disponibilita', { codice: 'NB-B14', quantita: 4 }, err('TIMEOUT', 'Lo strumento non ha risposto'))
    expect(decide(json({ toolResults: [CATALOG, t1] }))).toMatchObject({ type: 'tool', tool: 'verifica_disponibilita', args: { codice: 'NB-B14', quantita: 4 } })
    const d = decide(json({ toolResults: [CATALOG, t1, t1] }))
    expect(d.type).toBe('answer')
    expect((d as { text: string }).text).toMatch(/non posso confermarlo/i)
  })

  it('INVALID_ARGS with corrupted args: the corrected call is sent again', () => {
    const bad = obs('verifica_disponibilita', { quantita: 4 }, err('INVALID_ARGS', 'manca codice'))
    expect(decide(json({ toolResults: [CATALOG, bad] }))).toMatchObject({ tool: 'verifica_disponibilita', args: { codice: 'NB-B14', quantita: 4 } })
  })

  it('guardNotice and mustAnswer force an answer; no cost center -> asks', () => {
    expect(decide(json({ guardNotice: 'ripetuto', toolResults: [CATALOG, B14_KO, V14_OK] })).type).toBe('answer')
    expect(decide(json({ mustAnswer: true, toolResults: [CATALOG, B14_KO, V14_OK, CALC] })).type).toBe('answer')
    expect(decide(json({ memoryKeys: [], toolResults: [CATALOG, B14_KO, V14_OK, CALC] })).type).toBe('ask')
  })

  it('searches the policy when the context lacks it; outputs are single JSON objects with one-sentence rationales', () => {
    expect(decide(json({ docIds: [] }))).toMatchObject({ type: 'tool', tool: 'cerca_policy' })
    for (const h of [json({}), json({ toolResults: [CATALOG] }), json({ repairAttempt: 2 })]) {
      expect(JSON.parse(simulateGuide(h))).toBeTypeOf('object')
      const dec = decide(h)
      if (dec.type === 'tool') expect((dec.rationale ?? '').split('.').filter(Boolean).length).toBeLessThanOrEqual(1)
    }
  })
})

describe('checkers', () => {
  const base: RunRecord = {
    id: 'r', scenarioId: 'x', configKey: 'k', configLabel: 'l', input: '', answer: '', startedAt: '', durationMs: 0, steps: 1,
    toolCalls: [], sourcesUsed: [], memoryUsed: [], errors: [], humanInterventions: 0, actions: [], stopReason: 'final_answer', checks: [],
    modelInfo: {} as never, modelProvenance: { provenance: 'simulated', locality: 'local' },
  }
  const run = (over: Partial<RunRecord>): Record<string, boolean> => {
    const r = { ...base, ...over }
    return Object.fromEntries(GUIDE_CHECKERS.map(c => [c.id, c.check(r)]))
  }

  it('guide checkers have the expected ids', () => {
    expect(GUIDE_CHECKERS.map(c => c.id)).toEqual(['modello-ammesso', 'totale-corretto', 'fonti', 'prezzi-veri', 'azione-supervisionata', 'consegna-verificata'])
    expect(guideScenario.checkers).toBe(GUIDE_CHECKERS)
  })

  it('totale-corretto tolerates Italian number formatting', () => {
    for (const a of ['5.948,72 €', '5948,72', 'totale 5 948,72 euro', '5948.72']) expect(run({ answer: a })['totale-corretto'], a).toBe(true)
    expect(run({ answer: '5.948,71 €' })['totale-corretto']).toBe(false)
  })

  it('modello-ammesso, fonti, consegna-verificata', () => {
    expect(run({ answer: 'Scelgo il Notebook Vega 14 Pro' })['modello-ammesso']).toBe(true)
    expect(run({ answer: 'Scelgo NB-B14' })['modello-ammesso']).toBe(false)
    expect(run({ sourcesUsed: ['POL-IT-04'] }).fonti).toBe(true)
    expect(run({ sourcesUsed: ['POL-ACQ-01'] }).fonti).toBe(false)
    expect(run({ answer: 'consegna il 28/10/2026' })['consegna-verificata']).toBe(true)
    expect(run({ answer: 'consegna a novembre' })['consegna-verificata']).toBe(false)
  })

  it('prezzi-veri: vacuous when no amounts, rejects invented ones', () => {
    expect(run({ answer: 'nessun importo' })['prezzi-veri']).toBe(true)
    expect(run({ answer: 'Prezzo 1.219,00 € e totale 5.948,72 €' })['prezzi-veri']).toBe(true)
    expect(run({ answer: 'circa 1.400 € a unità' })['prezzi-veri']).toBe(false)
    expect(run({ answer: '€ 1.219' })['prezzi-veri']).toBe(true)
    expect(run({ answer: 'circa 6.000 € IVA inclusa' })['prezzi-veri']).toBe(true)
  })

  it('azione-supervisionata', () => {
    const rda = (approved: boolean | null) => [{ tool: 'crea_richiesta_acquisto', id: 'RDA-SIM-2026-0042', approved }]
    expect(run({ actions: rda(true) })['azione-supervisionata']).toBe(true)
    expect(run({ actions: rda(null) })['azione-supervisionata']).toBe(false)
    expect(run({ actions: rda(null), humanInterventions: 1 })['azione-supervisionata']).toBe(true)
    expect(run({ humanInterventions: 1 })['azione-supervisionata']).toBe(false)
  })

  it('number helpers', () => {
    expect(parseItNumber('1.219,00')).toBe(1219)
    expect(parseItNumber('1.250')).toBe(1250)
    expect(parseItNumber('0,42')).toBe(0.42)
    expect(extractEuroAmounts('da 1.149 € a € 1.219,50 e 20 euro')).toEqual(expect.arrayContaining([1149, 1219.5, 20]))
    expect(containsNumber('Il margine è 24%', 24)).toBe(true)
    expect(amountsBelongTo('1.249 €', guideAllowedAmounts())).toBe(false)
  })

  it('scenario registry', () => {
    expect(SCENARIOS).toHaveLength(10)
    expect(SCENARIOS[0]?.id).toBe('notebook-nuovi-assunti')
    expect(new Set(SCENARIOS.map(s => s.id)).size).toBe(10)
    for (const s of SCENARIOS) {
      expect(s.title && s.shortTitle && s.lesson && s.request).toBeTruthy()
      expect(s.checkers.length).toBeGreaterThan(0)
    }
  })
})
