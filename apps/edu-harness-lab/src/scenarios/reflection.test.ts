import { describe, expect, it } from 'vitest'
import type { HarnessConfig, ModelRequest, ModelRuntime, TurnDeps } from '../domain/types'
import { NO_FAULTS } from '../domain/types'
import { createEventBus } from '../harness/events'
import { configForLevel } from '../harness/levels'
import { createMcpHub } from '../harness/mcp/hub'
import { createMemoryStore } from '../harness/memory/memoryStore'
import { runTurn } from '../harness/orchestrator/orchestrator'
import { REFLECTION_CONTINUE, REFLECTION_FORMAT, REFLECTION_REPAIR } from '../harness/orchestrator/protocol'
import { createRetriever } from '../harness/rag/retriever'
import { createToolRegistry } from '../harness/tools/registry'
import { BUILTIN_TOOLS } from '../harness/tools/builtin'
import { createScriptedModel } from '../test-support/scripted/scriptedModel'
import type { ScriptedPolicy } from '../test-support/scripted/scriptedModel'
import { REFLECTION_TEST_ANSWER, REFLECTION_TEST_PASSES, simulateReflection } from '../test-support/scripted/reflectionPolicy'
import { SCENARIO_DATA } from './data'
import { getScenario } from './index'

const reflectionScenario = getScenario('ragionamento-iterativo')
const draft = (text: string) => `<self_reflection>\n${text}\n</self_reflection>`
const TAG = /<\s*\/?\s*(?:self_reflection|final_answer)\b/i

function setup(options: { native?: boolean; policy?: ScriptedPolicy; limits?: Partial<HarnessConfig['limits']>; withTools?: boolean } = {}) {
  const requests: ModelRequest[] = []
  const bus = createEventBus()
  const registry = createToolRegistry()
  const config = configForLevel(7)
  if (options.withTools) for (const tool of BUILTIN_TOOLS) registry.register(tool)
  else {
    // As the app does for this scenario (store: withScenarioDefaults).
    config.components = { ...config.components, tools: false, approval: false, mcp: false }
    config.enabledTools = []
  }
  config.mcpServers = []
  config.limits = { ...config.limits, ...options.limits }
  const scripted = createScriptedModel(() => (hints, request) => {
    requests.push(request)
    return options.policy ? options.policy(hints, request) : simulateReflection(hints)
  })
  const runtime: ModelRuntime = { ...scripted, info: { ...scripted.info, nativeTools: options.native, reasoning: false } }
  const deps: TurnDeps = {
    runtime,
    config,
    scenario: reflectionScenario,
    data: SCENARIO_DATA,
    registry,
    memory: createMemoryStore([]),
    retriever: createRetriever(SCENARIO_DATA.documents),
    approvals: { request: () => Promise.resolve('allowed-once' as const) },
    mcp: createMcpHub({ bus, data: () => SCENARIO_DATA, faults: () => NO_FAULTS }),
    bus,
    pacer: { wait: async () => {} },
    faults: NO_FAULTS,
    history: [],
    configKey: 'reflection-test',
    configLabel: 'Ciclo di riflessione e controlli',
  }
  const run = (signal = new AbortController().signal) => runTurn(reflectionScenario.request, deps, signal)
  return { run, requests, bus, config, registry }
}

describe('prompt-guided reflection through the real agent loop', () => {
  it.each([false, true])('revises the same candidate in successive calls, native tool capability = %s', async (native) => {
    const harness = setup({ native })
    const result = await harness.run()
    expect(result.stopReason).toBe('final_answer')
    expect(result.toolCalls).toEqual([])
    expect(result.reflections).toEqual(REFLECTION_TEST_PASSES)
    expect(result.checks.every(check => check.passed)).toBe(true)
    expect(result.answer).toBe(REFLECTION_TEST_ANSWER)
    expect(result.modelInfo.reasoning).toBe(false)
    // One real model call per block: draft, correction, final answer.
    expect(harness.requests).toHaveLength(3)
    expect(harness.requests.every(request => !request.tools && !request.forceTool)).toBe(true)

    const system = harness.requests[0]?.messages[0]
    expect(system?.role).toBe('system')
    expect(system?.content).toContain(REFLECTION_FORMAT)
    expect(system?.content).toContain(reflectionScenario.reflectionPrompt ?? 'missing prompt')
    expect(system?.content).not.toContain('"azione"')

    for (const [index, text] of REFLECTION_TEST_PASSES.entries()) {
      const request = harness.requests[index + 1]
      // Own drafts come back as assistant messages, tags kept, in the order they were written.
      const drafts = request?.messages.filter(message => message.role === 'assistant').map(message => message.content)
      expect(drafts).toEqual(REFLECTION_TEST_PASSES.slice(0, index + 1).map(draft))
      expect(request?.messages.at(-1)).toEqual({ role: 'user', content: REFLECTION_CONTINUE })
      expect(request?.messages.some(message => message.role === 'tool' || message.tool_calls?.length)).toBe(false)
      expect(result.answer).not.toContain(text)
    }
  })

  it('records draft, correction and final answer as distinct observable outputs', async () => {
    const result = await setup().run()
    expect({
      reflections: result.reflections,
      answer: result.answer,
      toolCalls: result.toolCalls,
      checks: result.checks.map(check => ({ id: check.id, passed: check.passed })),
      stopReason: result.stopReason,
    }).toMatchInlineSnapshot(`
      {
        "answer": "Delta, Gamma, Beta, Alfa.

      Delta precede Beta; Alfa segue subito Beta; Gamma non è prima né ultima.",
        "checks": [
          {
            "id": "riflessioni-iterate",
            "passed": true,
          },
          {
            "id": "nessun-tool",
            "passed": true,
          },
          {
            "id": "ordine-vincoli",
            "passed": true,
          },
          {
            "id": "risposta-separata",
            "passed": true,
          },
        ],
        "reflections": [
          "Proposta: Delta, Beta, Alfa, Gamma. Verifica: Gamma è ultima, quindi la proposta viola un vincolo.",
          "Correzione: Delta, Gamma, Beta, Alfa. Delta precede Beta, Alfa segue subito Beta, Gamma è seconda: tutti i vincoli sono soddisfatti.",
        ],
        "stopReason": "final_answer",
        "toolCalls": [],
      }
    `)
  })

  it('offers no tools in the reflection loop even when the level has tools switched on', async () => {
    const harness = setup({ withTools: true })
    expect(harness.config.components.tools).toBe(true)
    expect(harness.config.enabledTools.length).toBeGreaterThan(0)
    const result = await harness.run()
    expect(result.stopReason).toBe('final_answer')
    expect(result.toolCalls).toEqual([])
    expect(harness.requests.every(request => !request.tools)).toBe(true)
    expect(harness.requests[0]?.messages[0]?.content).not.toMatch(/usa_strumento|## Tools/)
  })

  it('repairs an invalid output within the limits, without publishing it', async () => {
    let calls = 0
    const harness = setup({
      policy: hints => (calls++ === 0 ? 'Il candidato è corretto.' : simulateReflection(hints)),
    })
    const result = await harness.run()
    expect(result.stopReason).toBe('final_answer')
    expect(result.answer).toBe(REFLECTION_TEST_ANSWER)
    const repair = harness.requests[1]?.messages.slice(-2)
    expect(repair?.[0]).toEqual({ role: 'assistant', content: 'Il candidato è corretto.' })
    expect(repair?.[1]?.role).toBe('user')
    expect(repair?.[1]?.content).toContain(REFLECTION_REPAIR)
    const events = harness.bus.events()
    expect(events.filter(event => event.type === 'decision/invalid')).toHaveLength(1)
    expect(events.filter(event => event.type === 'answer')).toHaveLength(1)
  })

  it.each([
    ['prose that only claims correctness', 'Il candidato è corretto.'],
    ['an unclosed draft', '<self_reflection>Delta, Gamma, Beta, Alfa'],
    ['a draft followed by an answer', `${draft('Delta, Gamma, Beta, Alfa')}\n<final_answer>Delta, Gamma, Beta, Alfa</final_answer>`],
    ['text around a final answer', 'Ecco: <final_answer>Delta, Gamma, Beta, Alfa</final_answer>'],
  ])('never turns %s into the final answer once repairs are exhausted', async (_label, raw) => {
    const harness = setup({ policy: () => raw })
    const result = await harness.run()
    expect(result.stopReason).toBe('invalid_output')
    expect(harness.requests).toHaveLength(1 + harness.config.limits.maxRepairs)
    expect(result.answer).not.toMatch(TAG)
    expect(result.answer).not.toContain('Delta, Gamma, Beta, Alfa')
    expect(result.checks.find(check => check.id === 'ordine-vincoli')?.passed).toBe(false)
    expect(harness.bus.events().some(event => event.type === 'answer')).toBe(false)
  })

  it('does not publish an accepted draft when the next outputs are invalid', async () => {
    let calls = 0
    const harness = setup({ policy: () => (calls++ === 0 ? draft('Delta, Gamma, Beta, Alfa: tutti i vincoli rispettati.') : 'Confermo.') })
    const result = await harness.run()
    expect(result.stopReason).toBe('invalid_output')
    expect(result.reflections).toEqual(['Delta, Gamma, Beta, Alfa: tutti i vincoli rispettati.'])
    expect(result.answer).not.toContain('Delta, Gamma, Beta, Alfa')
    expect(result.checks.find(check => check.id === 'risposta-separata')?.passed).toBe(false)
  })

  it('accepts a final answer without drafts, but the scenario check reports the missing review', async () => {
    const harness = setup({ policy: () => `<final_answer>\n${REFLECTION_TEST_ANSWER}\n</final_answer>` })
    const result = await harness.run()
    expect(result.stopReason).toBe('final_answer')
    expect(harness.requests).toHaveLength(1)
    expect(result.checks.find(check => check.id === 'ordine-vincoli')?.passed).toBe(true)
    expect(result.checks.find(check => check.id === 'riflessioni-iterate')?.passed).toBe(false)
  })

  it('does not carry draft text into a new turn', async () => {
    const harness = setup()
    await harness.run()
    const nextRequest = harness.requests.length
    await harness.run()
    expect(harness.requests[nextRequest]?.hints.reflections).toEqual([])
    expect(harness.requests[nextRequest]?.messages.some(message => message.content.includes(REFLECTION_TEST_PASSES[0]))).toBe(false)
  })

  it('stops at the configured step count without presenting it as convergence', async () => {
    const harness = setup({ limits: { maxSteps: 1 } })
    const result = await harness.run()
    expect(result.stopReason).toBe('max_steps')
    expect(result.steps).toBe(1)
    expect(harness.requests).toHaveLength(1)
    expect(result.reflections).toHaveLength(1)
    expect(result.answer).not.toMatch(TAG)
    expect(result.checks.find(check => check.id === 'ordine-vincoli')?.passed).toBe(false)
    expect(harness.bus.events().some(event => event.type === 'guard/triggered' && event.guard === 'max_steps')).toBe(true)
  })

  it('stops unchanged reflections rather than looping indefinitely', async () => {
    const harness = setup({ policy: () => draft('Proposta invariata da verificare.') })
    const result = await harness.run()
    expect(result.stopReason).toBe('loop_detected')
    expect(harness.requests).toHaveLength(3)
    expect(result.toolCalls).toEqual([])
    expect(result.checks.find(check => check.id === 'ordine-vincoli')?.passed).toBe(false)
  })

  it('retains completed draft text when stopped between iterations', async () => {
    const harness = setup()
    const controller = new AbortController()
    const unsubscribe = harness.bus.subscribe((event) => {
      if (event.type === 'decision/parsed' && event.decision.type === 'reflect') controller.abort()
    })
    try {
      const result = await harness.run(controller.signal)
      expect(result.stopReason).toBe('user_stop')
      expect(harness.requests).toHaveLength(1)
      expect(result.reflections).toEqual([REFLECTION_TEST_PASSES[0]])
      expect(result.answer).not.toContain('Delta, Gamma, Beta, Alfa')
    } finally {
      unsubscribe()
    }
  })

  it('does not mistake a correct draft for a correct final answer', async () => {
    const result = await setup().run()
    const wrong = { ...result, answer: 'Delta, Beta, Alfa, Gamma.' }
    expect(reflectionScenario.checkers.find(check => check.id === 'ordine-vincoli')?.check(wrong)).toBe(false)
    const claimOnly = { ...result, answer: 'Il candidato è corretto.' }
    expect(reflectionScenario.checkers.find(check => check.id === 'ordine-vincoli')?.check(claimOnly)).toBe(false)
  })

  it('keeps the single-call behavior when the agent loop is disabled', async () => {
    const harness = setup()
    harness.config.components.agentLoop = false
    const result = await harness.run()
    expect(harness.requests).toHaveLength(1)
    expect(result.reflections).toBeUndefined()
    expect(result.toolCalls).toEqual([])
    expect(harness.requests[0]?.messages[0]?.content).not.toContain('self_reflection')
    expect(result.checks.find(check => check.id === 'riflessioni-iterate')?.passed).toBe(false)
  })
})
