import { beforeEach, describe, expect, it } from 'vitest'
import type { ApprovalService, FaultInjection, HarnessConfig, RunRecord, Scenario, TurnDeps } from '../domain/types'
import { NO_FAULTS } from '../domain/types'
import { createEventBus } from '../harness/events'
import { EXPERIMENT } from '../harness/levels'
import { createMcpHub } from '../harness/mcp/hub'
import { createMemoryStore } from '../harness/memory/memoryStore'
import { runTurn } from '../harness/orchestrator/orchestrator'
import { createRetriever } from '../harness/rag/retriever'
import { businessLog } from '../harness/tools/businessLog'
import { BUILTIN_TOOLS } from '../harness/tools/builtin'
import { createToolRegistry } from '../harness/tools/registry'
import { POLICIES, createScriptedModel } from '../test-support/scripted/scriptedModel'
import { SCENARIOS, SCENARIO_DATA } from './index'

const FAST_TOOLS = BUILTIN_TOOLS.map(t => ({ ...t, latencyMs: [0, 0] as [number, number] }))

async function run(
  scenario: Scenario,
  config: HarnessConfig,
  opts: { faults?: FaultInjection; approve?: 'allowed-once' | 'rejected'; input?: string } = {},
): Promise<RunRecord> {
  businessLog.clear()
  const bus = createEventBus()
  const registry = createToolRegistry()
  for (const t of FAST_TOOLS) registry.register(t)
  const faults = opts.faults ?? NO_FAULTS
  const approvals: ApprovalService = { request: () => Promise.resolve(opts.approve ?? 'allowed-once') }
  const deps: TurnDeps = {
    runtime: createScriptedModel(() => {
      const policy = POLICIES[scenario.id]
      if (!policy) throw new Error(`no scripted policy for scenario ${scenario.id}`)
      return policy
    }),
    config,
    scenario,
    data: SCENARIO_DATA,
    registry,
    memory: createMemoryStore(SCENARIO_DATA.memorySeeds),
    retriever: createRetriever(SCENARIO_DATA.documents),
    approvals,
    mcp: createMcpHub({ bus, data: () => SCENARIO_DATA, faults: () => faults, simulatedLatencyMs: [0, 0] }),
    bus,
    pacer: { wait: async () => {} },
    faults,
    history: [],
    configKey: 'test',
    configLabel: 'test',
  }
  return runTurn(opts.input ?? scenario.request, deps, new AbortController().signal)
}

const guide = SCENARIOS[0] as Scenario
const cfg = (n: number): HarnessConfig => (EXPERIMENT[n - 1] as (typeof EXPERIMENT)[number]).config
const check = (r: RunRecord, id: string): boolean | undefined => r.checks.find(c => c.id === id)?.passed
const quick = (c: HarnessConfig): HarnessConfig => ({ ...c, limits: { ...c.limits, toolTimeoutMs: 30 } })
const tools = (r: RunRecord): string[] => r.toolCalls.map(c => c.tool)
/** The full chain of the guide scenario with the loop, before any MCP tool. */
const LOOP_CHAIN = [
  'cerca_catalogo',
  'verifica_disponibilita',
  'verifica_disponibilita',
  'calcolatrice',
  'leggi_budget',
  'crea_richiesta_acquisto',
]

describe('guide scenario through the real orchestrator (spine §17)', () => {
  beforeEach(() =>{  businessLog.clear() })

  it('config 1: isolated model invents a product and a price, no tools', async () => {
    const r = await run(guide, cfg(1))
    expect(r.toolCalls).toHaveLength(0)
    expect(r.answer).toContain('UltraBook Pro 15')
    expect(r.answer).toMatch(/inviare l’ordine/)
    expect(check(r, 'prezzi-veri')).toBe(false)
    expect(check(r, 'totale-corretto')).toBe(false)
    expect(check(r, 'fonti')).toBe(false)
  })

  it('config 2: instructions make it prudent and honest', async () => {
    const r = await run(guide, cfg(2))
    expect(r.answer).toMatch(/Non conosco la policy/)
    expect(r.answer).not.toContain('UltraBook')
    expect(check(r, 'prezzi-veri')).toBe(true)
  })

  it('config 3: task data gives names and the date', async () => {
    const r = await run(guide, cfg(3))
    for (const n of ['Marco Rinaldi', 'Giulia Ferri', 'Ahmed Benali', 'Sara Colombo', '3/11/2026']) expect(r.answer).toContain(n)
  })

  it('config 4: memory gives cost center, site and the table format', async () => {
    const r = await run(guide, cfg(4))
    expect(r.answer).toContain('CC-410')
    expect(r.answer).toContain('Bologna')
    expect(r.answer).toContain('|---|')
  })

  it('config 5: RAG gives the policy, only a vague ceiling', async () => {
    const r = await run(guide, cfg(5))
    expect(r.toolCalls).toHaveLength(0)
    expect(r.answer).toContain('Categoria B')
    expect(r.answer).toContain('1.250')
    expect(r.answer).toMatch(/stesso modello/)
    expect(r.answer).toContain('circa 6.000')
    expect(r.answer).toContain('POL-ACQ-01')
    expect(check(r, 'fonti')).toBe(true)
    expect(check(r, 'prezzi-veri')).toBe(true)
    expect(check(r, 'totale-corretto')).toBe(false)
  })

  it('config 6: the calculator computes the exact ceiling only', async () => {
    const r = await run(guide, cfg(6))
    expect(tools(r)).toEqual(['calcolatrice'])
    expect(r.toolCalls[0]?.args).toEqual({ espressione: '4*1250*1.22' })
    expect(r.answer).toContain('6.100,00')
    expect(r.answer).toMatch(/non posso consultare il catalogo/)
    expect(r.sourcesUsed).toContain('POL-IT-04')
    expect(check(r, 'totale-corretto')).toBe(false)
  })

  it('tools without the agent loop (manual toggle): single round, proposes NB-B14 without discovering the stock problem', async () => {
    // The guided path switches the loop on together with the tools; turning it off by hand leaves one round of tools.
    const singleRound: HarnessConfig = { ...cfg(7), components: { ...cfg(7).components, agentLoop: false } }
    const r = await run(guide, singleRound)
    expect(tools(r)).toEqual(['cerca_catalogo'])
    expect(r.answer).toContain('NB-B14')
    expect(check(r, 'modello-ammesso')).toBe(false)
    expect(check(r, 'totale-corretto')).toBe(false)
    expect(check(r, 'prezzi-veri')).toBe(true)
  })

  it('config 7: more tools and the loop find the stock problem and fall back on NB-V14P; the write is not gated', async () => {
    const r = await run(guide, cfg(7))
    expect(tools(r)).toEqual(LOOP_CHAIN)
    expect(check(r, 'modello-ammesso')).toBe(true)
    expect(check(r, 'totale-corretto')).toBe(true)
    expect(check(r, 'prezzi-veri')).toBe(true)
    expect(check(r, 'azione-supervisionata')).toBe(false)
    expect(r.actions).toEqual([{ tool: 'crea_richiesta_acquisto', id: 'RDA-SIM-2026-0042', approved: null }])
    expect(r.humanInterventions).toBe(0)
    expect(r.answer).toMatch(/SIMULATA/)
  })

  it('config 8: controls block the write (DENIED) and the answer is a draft', async () => {
    const r = await run(guide, cfg(8))
    const write = r.toolCalls.find(c => c.tool === 'crea_richiesta_acquisto')
    expect(write?.ok).toBe(false)
    expect(write?.code).toBe('DENIED')
    expect(r.actions).toHaveLength(0)
    expect(r.answer).toMatch(/supervisione umana/)
    expect(check(r, 'totale-corretto')).toBe(true)
    expect(check(r, 'azione-supervisionata')).toBe(false)
    expect(r.stopReason).toBe('final_answer')
  })

  it('config 9: human approval lets the write through, without a supplier delivery check', async () => {
    const r = await run(guide, cfg(9))
    expect(tools(r)).toEqual(LOOP_CHAIN)
    expect(r.actions).toEqual([{ tool: 'crea_richiesta_acquisto', id: 'RDA-SIM-2026-0042', approved: true }])
    expect(r.humanInterventions).toBe(1)
    expect(check(r, 'azione-supervisionata')).toBe(true)
    expect(check(r, 'totale-corretto')).toBe(true)
    expect(check(r, 'consegna-verificata')).toBe(false)
    expect(r.answer).toMatch(/SIMULATA/)
    expect(r.stopReason).toBe('final_answer')
  })

  it('config 9 with a stock-check timeout: retries once, then stops honestly', async () => {
    const r = await run(guide, quick(cfg(9)), { faults: { ...NO_FAULTS, timeout: ['verifica_disponibilita'] } })
    expect(r.toolCalls.filter(c => c.tool === 'verifica_disponibilita')).toHaveLength(2)
    expect(r.stopReason).toBe('tool_failures')
    expect(r.actions).toHaveLength(0)
  })

  it('config 10: full system, every checker passes and the RDA is human-approved', async () => {
    const r = await run(guide, cfg(10))
    expect(tools(r)).toEqual([
      'cerca_catalogo',
      'verifica_disponibilita',
      'verifica_disponibilita',
      'calcolatrice',
      'leggi_budget',
      'mcp__techsupply__verifica_consegna',
      'crea_richiesta_acquisto',
    ])
    expect(r.stopReason).toBe('final_answer')
    expect(r.checks.map(c => `${c.id}:${c.passed}`)).toEqual([
      'modello-ammesso:true',
      'totale-corretto:true',
      'fonti:true',
      'prezzi-veri:true',
      'azione-supervisionata:true',
      'consegna-verificata:true',
    ])
    expect(r.actions).toEqual([{ tool: 'crea_richiesta_acquisto', id: 'RDA-SIM-2026-0042', approved: true }])
    expect(r.sourcesUsed).toEqual(expect.arrayContaining(['POL-IT-04', 'POL-ACQ-01']))
    for (const s of ['4.876,00', '1.072,72', '5.948,72', '6.200,00', '28/10/2026', 'RDA-SIM-2026-0042', 'SIMULATA']) expect(r.answer).toContain(s)
    expect(r.humanInterventions).toBe(1)
  })

  it('config 10 with the write rejected: acknowledges that nothing was created', async () => {
    const r = await run(guide, cfg(10), { approve: 'rejected' })
    expect(r.actions).toHaveLength(0)
    expect(r.answer).toMatch(/non è stata creata/)
    expect(check(r, 'azione-supervisionata')).toBe(false)
  })

  it('config 10 survives an argument fault injected once', async () => {
    const r = await run(guide, cfg(10), { faults: { ...NO_FAULTS, invalidArgsOnce: true } })
    expect(check(r, 'totale-corretto')).toBe(true)
    expect(r.actions[0]?.id).toBe('RDA-SIM-2026-0042')
  })
})

describe('other scenarios through the real orchestrator', () => {
  const sc = (id: string): Scenario => SCENARIOS.find(s => s.id === id) as Scenario
  const passed = (r: RunRecord): string[] => r.checks.filter(c => c.passed).map(c => c.id)
  const failed = (r: RunRecord): string[] => r.checks.filter(c => !c.passed).map(c => c.id)

  it('S1: guesses when isolated, admits with instructions, precise with RAG', async () => {
    const s = sc('rimborso-chilometrico')
    expect(failed(await run(s, cfg(1)))).toContain('importo-corretto')
    expect((await run(s, cfg(2))).answer).toMatch(/Non conosco/)
    const r = await run(s, cfg(5))
    expect(failed(r)).toEqual([])
  })

  it('S1 with tools and without RAG uses cerca_policy', async () => {
    const s = sc('rimborso-chilometrico')
    const config = { ...cfg(7), components: { ...cfg(7).components, rag: false } }
    const r = await run(s, config)
    expect(tools(r)).toEqual(['cerca_policy'])
    expect(r.answer).toContain('0,42')
  })

  it('S2: lavoro agile', async () => {
    const s = sc('lavoro-agile')
    expect(failed(await run(s, cfg(1)))).toContain('giorni-corretti')
    expect(failed(await run(s, cfg(5)))).toEqual([])
  })

  it('S3: margin needs the calculator', async () => {
    const s = sc('margine-commessa')
    expect(failed(await run(s, cfg(1)))).toEqual(expect.arrayContaining(['margine-corretto', 'calcolo-con-strumento']))
    expect(failed(await run(s, cfg(6)))).toEqual([])
  })

  it('S4: comparison uses the catalogue', async () => {
    const s = sc('confronto-notebook')
    expect(failed(await run(s, cfg(1)))).toContain('confronto-completo')
    expect(failed(await run(s, cfg(7)))).toEqual([])
  })

  it('S5: late order, draft and supervised task', async () => {
    const s = sc('ordine-in-ritardo')
    expect(failed(await run(s, cfg(1)))).toContain('data-corretta')
    // Controls without approval: the task is blocked (DENIED), the answer keeps the draft.
    const r8 = await run(s, cfg(8))
    expect(passed(r8)).toEqual(expect.arrayContaining(['data-corretta', 'bozza-presente']))
    expect(check(r8, 'azione-supervisionata')).toBe(false)
    expect(r8.actions).toHaveLength(0)
    // Human approval: the task is created after a person approves it.
    const r9 = await run(s, cfg(9))
    expect(failed(r9)).toEqual([])
    expect(r9.actions[0]?.id).toMatch(/^ATT-SIM-2026-/)
    expect(r9.actions[0]?.approved).toBe(true)
  })

  it('S6: does not claim an action it cannot perform', async () => {
    const s = sc('followup-cliente')
    expect(failed(await run(s, cfg(1)))).toContain('nessuna-azione-inventata')
    expect(failed(await run(s, cfg(2)))).not.toContain('nessuna-azione-inventata')
    expect(failed(await run(s, cfg(10)))).toEqual([])
  })

  it('S7: retries once, then answers honestly (no controls) or is stopped by the controls', async () => {
    const s = sc('timeout-magazzino')
    expect(failed(await run(s, cfg(1)))).toContain('quantita-non-inventata')
    expect(failed(await run(s, cfg(8)))).toEqual([])
    const faults: FaultInjection = { ...NO_FAULTS, error: ['verifica_disponibilita'] }
    // Loop without controls: no failure guard, the model itself gives up after one retry and says so.
    const free = await run(s, cfg(7), { faults })
    expect(free.toolCalls).toHaveLength(2)
    expect(free.stopReason).toBe('final_answer')
    expect(failed(free)).toEqual([])
    expect(free.answer).toMatch(/non sono riuscito/i)
    // With controls: after maxToolFailures (2) consecutive errors the harness stops the turn and answers for it.
    const guarded = await run(s, cfg(8), { faults })
    expect(guarded.toolCalls).toHaveLength(2)
    expect(guarded.stopReason).toBe('tool_failures')
    expect(failed(guarded)).toEqual([])
    expect(guarded.answer).toMatch(/continua a dare errore/)
  })

  it('S8: asks instead of booking', async () => {
    const s = sc('sala-senza-data')
    expect(failed(await run(s, cfg(1)))).toContain('nessuna-prenotazione-inventata')
    expect(failed(await run(s, cfg(2)))).toEqual([])
    const r = await run(s, cfg(10))
    expect(r.stopReason).toBe('needs_user_input')
    expect(failed(r)).toEqual([])
  })

  it('S9: catalogue plus currency converter', async () => {
    const s = sc('prezzo-in-dollari')
    expect(failed(await run(s, cfg(1)))).toEqual(expect.arrayContaining(['conversione-corretta', 'prezzi-veri']))
    const r = await run(s, cfg(8))
    expect(failed(r)).toEqual([])
    expect(tools(r)).toEqual(['converti_valuta', 'cerca_catalogo'])
  })
})
