import { describe, expect, it } from 'vitest'
import type { ModelRequest, PolicyDoc, Scenario, TurnDeps } from '../domain/types'
import { NO_FAULTS } from '../domain/types'
import { createEventBus } from '../harness/events'
import { configForLevel } from '../harness/levels'
import { createMcpHub } from '../harness/mcp/hub'
import { createMemoryStore } from '../harness/memory/memoryStore'
import { runTurn } from '../harness/orchestrator/orchestrator'
import { serializeDecision } from '../harness/orchestrator/protocol'
import { createRetriever } from '../harness/rag/retriever'
import { BUILTIN_TOOLS } from '../harness/tools/builtin'
import { createToolRegistry } from '../harness/tools/registry'
import { createScriptedModel, POLICIES } from '../test-support/scripted/scriptedModel'
import type { ScriptedPolicy } from '../test-support/scripted/scriptedModel'
import { getScenario, SCENARIOS, SCENARIO_DATA } from './index'

const ONBOARDING_FACTS = /Marco Rinaldi|Giulia Ferri|Ahmed Benali|Sara Colombo|3\/11\/2026/

function setup(scenario: Scenario, policy?: ScriptedPolicy) {
  const requests: ModelRequest[] = []
  const bus = createEventBus()
  const registry = createToolRegistry()
  for (const tool of BUILTIN_TOOLS) registry.register({ ...tool, latencyMs: [0, 0] })
  const config = configForLevel(7)
  config.components = { ...config.components, tools: false, approval: false, mcp: false }
  config.enabledTools = []
  config.mcpServers = []
  const deps: TurnDeps = {
    scenario,
    config,
    runtime: createScriptedModel(() => (hints, request) => {
      requests.push(request)
      if (policy) return policy(hints, request)
      // The reflection loop has its own tagged protocol; the other scenarios use JSON or plain text.
      if (hints.reflections) return '<final_answer>Risposta di controllo.</final_answer>'
      return hints.protocol === 'json' ? serializeDecision({ type: 'answer', text: 'Risposta di controllo.' }) : 'Risposta di controllo.'
    }),
    data: SCENARIO_DATA,
    registry,
    memory: createMemoryStore(SCENARIO_DATA.memorySeeds),
    retriever: createRetriever(SCENARIO_DATA.documents),
    approvals: { request: () => Promise.resolve('allowed-once' as const) },
    mcp: createMcpHub({ bus, data: () => SCENARIO_DATA, faults: () => NO_FAULTS }),
    bus,
    pacer: { wait: async () => {} },
    faults: scenario.faults ?? NO_FAULTS,
    history: [],
    configKey: 'context-test',
    configLabel: 'Contesto dello scenario',
  }
  const run = () => runTurn(scenario.request, deps, new AbortController().signal)
  return { deps, requests, bus, run }
}

function documentById(id: string): PolicyDoc {
  const doc = SCENARIO_DATA.documents.find(item => item.id === id)
  if (!doc) throw new Error(`Missing fixture document: ${id}`)
  return doc
}

describe('scenario-specific model context', () => {
  it.each(SCENARIOS)('$id selects its own facts, instructions, memory and documents', async (scenario) => {
    const { context } = scenario
    expect(context.taskData.length).toBeGreaterThan(0)
    expect(context.instructions.trim()).not.toBe('')
    for (const id of context.documentIds) expect(SCENARIO_DATA.documents.some(doc => doc.id === id)).toBe(true)
    for (const key of context.memoryKeys) expect(SCENARIO_DATA.memorySeeds.some(record => record.key === key)).toBe(true)

    const harness = setup(scenario)
    const result = await harness.run()
    expect(result.stopReason).toBe('final_answer')
    const assembled = harness.bus.events().find(event => event.type === 'context/assembled')
    if (assembled?.type !== 'context/assembled') throw new Error('No assembled context')
    const included = assembled.snapshot.items.filter(item => item.status === 'included')
    expect(included.filter(item => item.kind === 'taskData').map(item => item.text)).toEqual(context.taskData.map(item => item.text))
    expect(included.some(item => item.kind === 'instruction' && item.text === context.instructions)).toBe(true)
    expect(included.filter(item => item.kind === 'memory').every(item => context.memoryKeys.includes(item.title))).toBe(true)
    expect(included.filter(item => item.kind === 'document').every(item => context.documentIds.includes(item.refs?.[0] ?? ''))).toBe(true)
    if (scenario.id !== 'notebook-nuovi-assunti') {
      expect(harness.requests[0]?.messages.map(message => message.content).join('\n')).not.toMatch(ONBOARDING_FACTS)
    }
  })

  it('keeps task data and task instructions behind their own component switches', async () => {
    const harness = setup(getScenario('margine-commessa'))
    harness.deps.config.components.context = false
    harness.deps.config.components.instructions = false
    await harness.run()
    const assembled = harness.bus.events().find(event => event.type === 'context/assembled')
    if (assembled?.type !== 'context/assembled') throw new Error('No assembled context')
    expect(assembled.snapshot.items.some(item => item.kind === 'taskData' || item.kind === 'instruction')).toBe(false)
  })

  it('filters unrelated documents before ranking and top-K selection', async () => {
    const harness = setup(getScenario('lavoro-agile'))
    harness.deps.config.rag.topK = 1
    harness.deps.retriever = createRetriever([
      documentById('POL-HR-02'),
      { ...documentById('POL-FIN-07'), text: '# Quanti giorni a settimana posso lavorare in lavoro agile\nQuanti giorni a settimana posso lavorare in lavoro agile.' },
    ])
    await harness.run()
    expect(harness.requests[0]?.hints.docIds).toEqual(['POL-HR-02'])
  })

  it('uses the same scoped corpus for the policy-search tool when automatic RAG is off', async () => {
    const harness = setup(getScenario('lavoro-agile'), hints => hints.toolResults.length
      ? serializeDecision({ type: 'answer', text: 'Regole recuperate.' })
      : serializeDecision({ type: 'tool', tool: 'cerca_policy', args: { domanda: 'lavoro agile' } }))
    harness.deps.config.components.rag = false
    harness.deps.config.components.tools = true
    harness.deps.config.enabledTools = ['cerca_policy']
    const result = await harness.run()
    expect(result.toolCalls).toEqual([{ tool: 'cerca_policy', args: { domanda: 'lavoro agile' }, ok: true }])
    const observation = harness.requests[1]?.messages.find(message => message.content.includes('[RESULT of cerca_policy]'))
    expect(observation?.content).toContain('POL-HR-02')
    expect(observation?.content).not.toContain('POL-FIN-07')
    expect(observation?.content).not.toContain('POL-IT-04')
  })

  it('preserves user-added documents and explicitly pinned passages from the lab', async () => {
    const harness = setup(getScenario('ragionamento-iterativo'))
    harness.deps.retriever.addDocument({
      id: 'DOC-USER-CHECKS', title: 'Verifica dimostrazioni', version: '1', status: 'valid', category: 'lab', userAdded: true,
      text: '# Verifica\nAlfa Beta Gamma Delta: verifica i vincoli delle dimostrazioni.',
    })
    const pinned = harness.deps.retriever.chunks().find(chunk => chunk.docId === 'POL-HR-02')
    if (!pinned) throw new Error('No HR passage to pin')
    harness.deps.config.rag.pinnedChunkIds = [pinned.id]
    await harness.run()
    expect(harness.requests[0]?.hints.docIds).toContain('DOC-USER-CHECKS')
    expect(harness.requests[0]?.hints.docIds).toContain('POL-HR-02')
    expect(harness.requests[0]?.hints.docIds).not.toContain('POL-IT-04')
  })

  it('retains only same-scenario task state while preserving user-authored memory', async () => {
    const harness = setup(getScenario('ragionamento-iterativo'))
    harness.deps.memory = createMemoryStore([
      ...SCENARIO_DATA.memorySeeds,
      { scope: 'persistent', kind: 'preference', key: 'nota_personale', text: 'Usa frasi brevi.', source: 'user' },
    ])
    const memory = harness.deps.memory
    memory.write({ scope: 'session', kind: 'taskState', key: 'stato_attivita:notebook-nuovi-assunti', text: 'Marco Rinaldi: compito precedente.', source: 'model' })
    memory.write({ scope: 'session', kind: 'taskState', key: 'stato_attivita:ragionamento-iterativo', text: 'Esito precedente dello stesso scenario.', source: 'model' })
    await harness.run()
    expect(harness.requests[0]?.hints.memoryKeys).toEqual(['nota_personale', 'stato_attivita:ragionamento-iterativo'])
    expect(harness.requests[0]?.messages.map(message => message.content).join('\n')).not.toMatch(ONBOARDING_FACTS)
    expect(harness.requests[0]?.messages.some(message => message.content.includes('Usa frasi brevi.'))).toBe(true)
  })

  it('does not infer meeting details from the onboarding task pack', async () => {
    const scenario = getScenario('sala-senza-data')
    const result = await setup(scenario, POLICIES[scenario.id]).run()
    expect(result.answer).toMatch(/quale giorno.*che ora/i)
    expect(result.answer).not.toMatch(ONBOARDING_FACTS)
    expect(result.checks.every(check => check.passed)).toBe(true)
    const checker = scenario.checkers.find(check => check.id === 'chiede-chiarimento')
    expect(checker?.check({ ...result, answer: 'Ti serve la sala per quattro persone?' })).toBe(false)
    expect(checker?.check({ ...result, answer: 'A che ora?' })).toBe(false)
  })

  it('runs the stock scenario with its timeout fault and only one retry', async () => {
    const scenario = getScenario('timeout-magazzino')
    const harness = setup(scenario, POLICIES[scenario.id])
    harness.deps.config.components.tools = true
    harness.deps.config.enabledTools = ['verifica_disponibilita']
    harness.deps.config.limits.toolTimeoutMs = 20
    const result = await harness.run()
    expect(result.toolCalls).toHaveLength(2)
    expect(result.toolCalls.every(call => call.tool === 'verifica_disponibilita' && !call.ok && call.code === 'TIMEOUT')).toBe(true)
    expect(result.stopReason).toBe('tool_failures')
    expect(result.checks.every(check => check.passed)).toBe(true)
    expect(harness.bus.events().filter(event => event.type === 'tool/error')).toHaveLength(2)
  })

  it('reports the fixed teaching exchange rate and unknown quote taxes', async () => {
    const scenario = getScenario('prezzo-in-dollari')
    const harness = setup(scenario, POLICIES[scenario.id])
    harness.deps.config.components.tools = true
    harness.deps.config.enabledTools = ['converti_valuta', 'cerca_catalogo', 'verifica_disponibilita']
    const result = await harness.run()
    expect(result.checks.every(check => check.passed)).toBe(true)
    expect(result.answer).toContain('trattamento IVA dell’offerta non è indicato')
    expect(result.answer).toContain('non posso confermare la convenienza complessiva')
    expect(harness.requests.some(request => request.messages.some(message =>
      message.content.includes('If stock is needed for this request'),
    ))).toBe(true)
    const checker = scenario.checkers.find(check => check.id === 'imposte-non-presunte')
    expect(checker?.check({ ...result, answer: 'L’offerta conviene.' })).toBe(false)
  })
})
