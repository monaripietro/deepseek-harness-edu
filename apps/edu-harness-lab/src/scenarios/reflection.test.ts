import { describe, expect, it } from 'vitest'
import type { HarnessConfig, ModelRequest, ModelRuntime, TurnDeps } from '../domain/types'
import { NO_FAULTS } from '../domain/types'
import { createEventBus } from '../harness/events'
import { configForLevel } from '../harness/levels'
import { createMcpHub } from '../harness/mcp/hub'
import { createMemoryStore } from '../harness/memory/memoryStore'
import { runTurn } from '../harness/orchestrator/orchestrator'
import { REFLECTION_FORMAT, REFLECTION_PASS, REFLECTION_REPAIR } from '../harness/orchestrator/protocol'
import { createRetriever } from '../harness/rag/retriever'
import { createToolRegistry } from '../harness/tools/registry'
import { BUILTIN_TOOLS } from '../harness/tools/builtin'
import { createScriptedModel } from '../test-support/scripted/scriptedModel'
import type { ScriptedPolicy } from '../test-support/scripted/scriptedModel'
import { REFLECTION_TEST_ANSWER, REFLECTION_TEST_DRAFTS, simulateReflection } from '../test-support/scripted/reflectionPolicy'
import { SCENARIO_DATA } from './data'
import { getScenario } from './index'
import { lastOrder, orderVerdict, readBackOrder } from './reflection'

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

describe('deterministic reflection feedback', () => {
  it('requires the exact names and explains the Alpha spelling error without accepting it', () => {
    const candidate = 'My order: 1) Delta, 2) Alpha, 3) Gamma, 4) Beta'

    expect(lastOrder(candidate)).toBeNull()
    expect(orderVerdict(candidate)).toBeNull()
    expect(readBackOrder(candidate)).toEqual({
      complete: false,
      text: expect.stringContaining('Use the exact name Alfa, not Alpha.'),
    })
    expect(reflectionScenario.reflectionPrompt).toContain('exact names Alfa, Beta, Gamma and Delta')
  })

  it('checks positions rather than the model claims and never requests a fifth position', () => {
    const candidate = 'My order: 1) Delta, 2) Alfa, 3) Gamma, 4) Beta.\nRule 1: no. Rule 2: yes.'
    const feedback = readBackOrder(candidate)

    expect(orderVerdict(candidate)).toBe('fail')
    expect(feedback.complete).toBe(true)
    expect(feedback.text).toContain('Rule 1 passes: Delta at position 1 is before Beta at position 4.')
    expect(feedback.text).toContain('Rule 2 fails: Alfa at position 2 is not immediately after Beta at position 4')
    expect(feedback.text).toContain('place Beta immediately before Alfa')
    expect(feedback.text).not.toContain('position 5')
    expect(feedback.text).toContain('Rule 3 passes: Gamma at position 3 is neither first nor last.')
  })
})

describe('prompt-guided reflection through the real agent loop', () => {
  it.each([false, true])('revises the same candidate in successive calls, native tool capability = %s', async (native) => {
    const harness = setup({ native })
    const result = await harness.run()
    expect(result.stopReason).toBe('final_answer')
    expect(result.toolCalls).toEqual([])
    expect(result.reflections).toEqual(REFLECTION_TEST_DRAFTS)
    expect(result.checks.every(check => check.passed)).toBe(true)
    expect(result.answer).toBe(REFLECTION_TEST_ANSWER)
    expect(result.modelInfo.reasoning).toBe(false)
    // One model call per block: candidate, corrected order, final answer.
    expect(harness.requests).toHaveLength(3)
    expect(harness.requests.every(request => !request.tools && !request.forceTool)).toBe(true)

    const system = harness.requests[0]?.messages[0]
    expect(system?.role).toBe('system')
    expect(system?.content).toContain(REFLECTION_FORMAT)
    expect(system?.content).toContain(reflectionScenario.reflectionPrompt ?? 'missing prompt')
    expect(reflectionScenario.reflectionPrompt).toContain('Use the harness feedback in the next turn')
    expect(reflectionScenario.reflectionPrompt).toContain('do not grade the rules yourself')
    expect(reflectionScenario.reflectionPrompt).not.toMatch(/answer yes or no|Rule 1:|Rule 2:/i)
    expect(system?.content).not.toContain('"azione"')

    for (const [index, text] of REFLECTION_TEST_DRAFTS.entries()) {
      const request = harness.requests[index + 1]
      // Own drafts come back as assistant messages, tags kept, in the order they were written.
      const drafts = request?.messages.filter(message => message.role === 'assistant').map(message => message.content)
      expect(drafts).toEqual(REFLECTION_TEST_DRAFTS.slice(0, index + 1).map(draft))
      expect(request?.messages.at(-1)?.role).toBe('user')
      if (index === 0) expect(request?.messages.at(-1)?.content).toContain('Rule 3 fails:')
      else expect(request?.messages.at(-1)?.content).toBe(REFLECTION_PASS)
      expect(request?.messages.some(message => message.role === 'tool' || message.tool_calls?.length)).toBe(false)
      expect(result.answer).not.toContain(text)
    }
  })

  it('records draft, correction and final answer as distinct observable outputs', async () => {
    const harness = setup()
    const result = await harness.run()
    expect({
      reflections: result.reflections,
      feedback: harness.requests.slice(1).map(request => request.messages.at(-1)?.content),
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
        "feedback": [
          "Your latest order: 1 = Delta, 2 = Beta, 3 = Alfa, 4 = Gamma.
      Rule 1 passes: Delta at position 1 is before Beta at position 2.
      Rule 2 passes: Alfa at position 3 is immediately after Beta at position 2.
      Rule 3 fails: Gamma at position 4 is first or last; it must be second or third.
      Revise the order using these results. Do not grade the rules yourself.
      Reply with ONE <self_reflection> block containing only the revised order, with no explanation.",
          "The harness verified that all three rules pass. Now write the <final_answer>: the order first, then one short confirmation.",
        ],
        "reflections": [
          "1 = Delta, 2 = Beta, 3 = Alfa, 4 = Gamma.",
          "1 = Delta, 2 = Gamma, 3 = Beta, 4 = Alfa.",
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

  it('does not trust a yes claim for an order whose Rule 2 fails', async () => {
    const invalid = 'Alfa, Beta, Gamma, Delta.\nRule 1: no. Rule 2: yes. Rule 3: true.'
    const harness = setup({
      policy: hints => hints.reflections?.length
        ? `<final_answer>\n${REFLECTION_TEST_ANSWER}\n</final_answer>`
        : draft(invalid),
    })
    const result = await harness.run()
    const feedback = harness.requests[1]?.messages.at(-1)?.content ?? ''

    expect(feedback).toContain('Rule 2 fails:')
    expect(feedback).toContain('Alfa at position 1 is not immediately after Beta at position 2')
    expect(feedback).not.toContain('Rule 2 passes:')
    expect(result.stopReason).toBe('invalid_output')
    expect(result.reflections).toEqual([invalid])
    expect(result.answer).not.toContain('Delta, Gamma, Beta, Alfa')
    expect(harness.bus.events().some(event => event.type === 'answer')).toBe(false)
  })

  it('uses actual rule failures to guide a corrected draft before the final answer', async () => {
    const drafts = [
      'Alfa, Beta, Gamma, Delta.',
      'Delta, Gamma, Beta, Alfa.',
    ]
    const outputs = [
      draft(drafts[0] ?? ''),
      draft(drafts[1] ?? ''),
      `<final_answer>\n${REFLECTION_TEST_ANSWER}\n</final_answer>`,
    ]
    const harness = setup({ policy: hints => outputs[hints.reflections?.length ?? 0] ?? '' })
    const result = await harness.run()
    const feedback = harness.requests[1]?.messages.at(-1)?.content ?? ''

    expect(feedback).toContain('Rule 1 fails: Delta at position 4 is not before Beta at position 2.')
    expect(feedback).toContain('Rule 2 fails: Alfa at position 1 is not immediately after Beta at position 2')
    expect(feedback).toContain('Rule 3 passes: Gamma at position 3 is neither first nor last.')
    expect(harness.requests[2]?.messages.filter(message => message.role === 'assistant').map(message => message.content))
      .toEqual(drafts.map(draft))
    expect(result.stopReason).toBe('final_answer')
    expect(result.reflections).toEqual(drafts)
    expect(result.answer).toBe(REFLECTION_TEST_ANSWER)
    expect(result.reflections?.every(text => text !== result.answer)).toBe(true)
  })

  it('publishes a distinct final answer only after the harness verifies the order', async () => {
    const harness = setup()
    const result = await harness.run()

    expect(result.stopReason).toBe('final_answer')
    expect(result.reflections).toContain(REFLECTION_TEST_DRAFTS[1])
    expect(result.answer).toBe(REFLECTION_TEST_ANSWER)
    expect(result.reflections?.every(text => text.trim() !== result.answer.trim())).toBe(true)
    expect(result.checks.find(check => check.id === 'ordine-vincoli')?.passed).toBe(true)
    expect(result.checks.find(check => check.id === 'risposta-separata')?.passed).toBe(true)
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

  it('repeats the machine-checked failures and required draft block during protocol repair', async () => {
    const candidate = 'My order: 1) Delta, 2) Alfa, 3) Gamma, 4) Beta'
    const invalid = '<self_reflection>Rule 1 fails because Delta must be immediately before Beta.'
    const outputs = [
      draft(candidate),
      invalid,
      draft(REFLECTION_TEST_DRAFTS[1] ?? ''),
      `<final_answer>${REFLECTION_TEST_ANSWER}</final_answer>`,
    ]
    let calls = 0
    const harness = setup({ policy: () => outputs[calls++] ?? '' })
    const result = await harness.run()
    const feedback = harness.requests[1]?.messages.at(-1)?.content ?? ''
    const repair = harness.requests[2]?.messages.at(-1)?.content ?? ''

    expect(feedback).toContain('Rule 1 passes: Delta at position 1 is before Beta at position 4.')
    expect(feedback).toContain('Rule 2 fails:')
    expect(repair).toContain(feedback)
    expect(repair).toContain('ONE <self_reflection> block containing only the revised order')
    expect(harness.requests[2]?.messages.at(-2)).toEqual({ role: 'assistant', content: invalid })
    expect(harness.requests[2]?.prefill).toBe(harness.requests[1]?.prefill)
    expect(harness.requests[2]?.stop).toEqual(['</self_reflection>', '</final_answer>'])
    expect(result.stopReason).toBe('final_answer')
    expect(result.answer).toBe(REFLECTION_TEST_ANSWER)
    expect(result.reflections).toEqual([candidate, REFLECTION_TEST_DRAFTS[1]])
    expect(harness.bus.events().filter(event => event.type === 'decision/invalid')).toHaveLength(1)
  })

  it('keeps final-answer repairs on the verified order without bypassing final validation', async () => {
    const outputs = [
      draft(REFLECTION_TEST_DRAFTS[1] ?? ''),
      '<final_answer>Delta, Beta, Alfa, Gamma. All rules pass.</final_answer>',
      `<final_answer>${REFLECTION_TEST_ANSWER}</final_answer>`,
    ]
    let calls = 0
    const harness = setup({ policy: () => outputs[calls++] ?? '' })
    const result = await harness.run()
    const repair = harness.requests[2]?.messages.at(-1)?.content ?? ''

    expect(repair.endsWith(REFLECTION_PASS)).toBe(true)
    expect(harness.requests[2]?.prefill).toBe('<final_answer>\n')
    expect(result.stopReason).toBe('final_answer')
    expect(result.answer).toBe(REFLECTION_TEST_ANSWER)
    expect(harness.bus.events().filter(event => event.type === 'decision/invalid')).toHaveLength(1)
    expect(harness.bus.events().filter(event => event.type === 'answer')).toHaveLength(1)
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

  it('rejects a final answer before any draft passes the deterministic check', async () => {
    const harness = setup({ policy: () => `<final_answer>\n${REFLECTION_TEST_ANSWER}\n</final_answer>` })
    const result = await harness.run()
    expect(result.stopReason).toBe('invalid_output')
    expect(harness.requests).toHaveLength(1 + harness.config.limits.maxRepairs)
    expect(result.answer).not.toContain('Delta, Gamma, Beta, Alfa')
    expect(harness.bus.events().some(event => event.type === 'answer')).toBe(false)
    expect(result.checks.find(check => check.id === 'ordine-vincoli')?.passed).toBe(false)
    expect(result.checks.find(check => check.id === 'riflessioni-iterate')?.passed).toBe(false)
  })

  it('rejects a final answer whose order fails the deterministic check', async () => {
    let calls = 0
    const harness = setup({
      policy: () => calls++ === 0
        ? draft(REFLECTION_TEST_DRAFTS[1] ?? '')
        : '<final_answer>Delta, Beta, Alfa, Gamma.\n\nThe rules hold.</final_answer>',
    })
    const result = await harness.run()

    expect(result.stopReason).toBe('invalid_output')
    expect(result.reflections).toEqual([REFLECTION_TEST_DRAFTS[1]])
    expect(result.answer).not.toContain('Delta, Beta, Alfa, Gamma')
    expect(harness.bus.events().some(event => event.type === 'answer')).toBe(false)
  })

  it('does not carry draft text into a new turn', async () => {
    const harness = setup()
    await harness.run()
    const nextRequest = harness.requests.length
    await harness.run()
    expect(harness.requests[nextRequest]?.hints.reflections).toEqual([])
    expect(harness.requests[nextRequest]?.messages.some(message => message.content.includes(REFLECTION_TEST_DRAFTS[0] ?? ''))).toBe(false)
  })

  it.each([
    ['a duplicated name', '1 = Delta, 2 = Beta, 3 = Beta, 4 = Alfa.'],
    ['a missing name', '1 = Delta, 2 = Beta, 3 = Gamma.'],
    ['an omitted position', '1 = Delta, 2 = Beta, 4 = Alfa.'],
  ])('keeps %s orders non-final even when the model then tries a final answer', async (_label, invalid) => {
    const harness = setup({
      policy: hints => hints.reflections?.length
        ? `<final_answer>\n${REFLECTION_TEST_ANSWER}\n</final_answer>`
        : draft(invalid),
    })
    const result = await harness.run()

    expect(result.stopReason).toBe('invalid_output')
    expect(result.reflections).toEqual([invalid])
    expect(result.answer).not.toContain('Delta, Gamma, Beta, Alfa')
    expect(harness.requests[1]?.messages.at(-1)?.content).toContain('does not contain one complete order')
    expect(harness.bus.events().some(event => event.type === 'answer')).toBe(false)
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

  it('stops a repeated invalid order before reaching the step limit', async () => {
    let calls = 0
    const harness = setup({
      policy: () => draft(`Alfa, Beta, Gamma, Delta.\nRule 2: ${calls++ === 0 ? 'yes' : 'true'}.`),
    })
    const result = await harness.run()
    expect(result.stopReason).toBe('loop_detected')
    expect(harness.requests).toHaveLength(3)
    expect(harness.requests[1]?.messages.at(-1)?.content).toContain('Rule 2 fails:')
    expect(result.steps).toBeLessThan(harness.config.limits.maxSteps)
    expect(result.toolCalls).toEqual([])
    expect(result.checks.find(check => check.id === 'ordine-vincoli')?.passed).toBe(false)
  })

  it('does not treat different incomplete candidates as the same repeated order', async () => {
    const candidates = [
      '1 = Delta, 2 = Alpha, 3 = Gamma, 4 = Beta.',
      '1 = Delta, 2 = Alfa, 3 = Gamma.',
      '1 = Delta, 2 = Beta, 3 = Beta, 4 = Alfa.',
      REFLECTION_TEST_DRAFTS[1],
    ]
    const harness = setup({
      policy: (hints) => {
        const candidate = candidates[hints.reflections?.length ?? 0]
        return candidate ? draft(candidate) : `<final_answer>${REFLECTION_TEST_ANSWER}</final_answer>`
      },
    })
    const result = await harness.run()

    expect(result.stopReason).toBe('final_answer')
    expect(result.reflections).toEqual(candidates)
    expect(result.answer).toBe(REFLECTION_TEST_ANSWER)
    expect(harness.bus.events().some(event => event.type === 'guard/triggered' && event.guard === 'repeat')).toBe(false)
  })

  it('still stops identical incomplete candidates at the repetition limit', async () => {
    const harness = setup({ policy: () => draft('1 = Delta, 2 = Alpha, 3 = Gamma, 4 = Beta.') })
    const result = await harness.run()

    expect(result.stopReason).toBe('loop_detected')
    expect(harness.requests).toHaveLength(harness.config.limits.repeatStopAt)
    expect(harness.bus.events().some(event => event.type === 'answer')).toBe(false)
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
      expect(result.reflections).toEqual([REFLECTION_TEST_DRAFTS[0]])
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
