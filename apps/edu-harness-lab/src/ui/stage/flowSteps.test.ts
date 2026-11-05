import { describe, expect, it } from 'vitest'
import { REAL_LOCAL } from '../../domain/types'
import type { TraceEvent, TraceEventBody } from '../../domain/types'
import { configForLevel } from '../../harness/levels'
import { deriveStage, settleStage } from './deriveStage'
import { flowProgress, flowStepsFor, outcomeOf, sendModeFor } from './flowSteps'

let seq = 0
const ev = (body: TraceEventBody, runId = 'run-1'): TraceEvent =>
  ({ ...body, id: `e${++seq}`, seq, at: seq, runId, source: 'orchestrator', provenance: REAL_LOCAL }) as TraceEvent

describe('learner steps of a request', () => {
  it('depend on the harness composition', () => {
    expect(flowStepsFor(configForLevel(0).components)).toEqual(['request', 'context', 'model', 'answer'])
    expect(flowStepsFor(configForLevel(5).components)).toEqual(['request', 'context', 'model', 'decision', 'action', 'answer'])
  })

  it('follow the trace and mark the steps a run passed through', () => {
    const events = [
      ev({ type: 'run/start', input: 'Domanda', configKey: 'k', configLabel: 'l', scenarioId: 's', model: {} as never }),
      ev({ type: 'model/request', tokensIn: 10, protocol: 'json', mustAnswer: false }),
      ev({ type: 'decision/parsed', decision: { type: 'answer', text: 'ok' } }),
    ]
    const progress = flowProgress(events, true)
    expect(progress.current).toBe('decision')
    expect([...progress.visited]).toEqual(['request', 'model', 'decision'])
    // Without an orchestrator the decision is part of the model step.
    expect(flowProgress(events, false).current).toBe('model')
  })

  it('starts the steps again on each new round of the loop', () => {
    const events = [
      ev({ type: 'run/start', input: 'Domanda', configKey: 'k', configLabel: 'l', scenarioId: 's', model: {} as never }),
      ev({ type: 'model/request', tokensIn: 10, protocol: 'json', mustAnswer: false }),
      ev({ type: 'tool/execute', callId: 'c', tool: 'calcolatrice' }),
      ev({ type: 'step/start', stepIndex: 2 }),
      ev({ type: 'model/request', tokensIn: 10, protocol: 'json', mustAnswer: false }),
    ]
    const progress = flowProgress(events, true)
    expect(progress.current).toBe('model')
    expect([...progress.visited]).toEqual(['request', 'model'])
    expect([...progress.seen]).toEqual(['request', 'model', 'action'])
  })

  it('starts from scratch after a reset', () => {
    expect(flowProgress([], true)).toEqual({ current: null, visited: new Set(), seen: new Set() })
  })

  it('settles a run that ended without its closing events once the store is idle', () => {
    const events = [ev({ type: 'run/start', input: 'Domanda', configKey: 'k', configLabel: 'l', scenarioId: 's', model: {} as never })]
    const stage = deriveStage(events, true)
    expect(stage.running).toBe(true)
    expect(settleStage(stage, true).running).toBe(true)
    expect(settleStage(stage, false)).toMatchObject({ running: false, phase: 'done' })
    expect(outcomeOf(settleStage(stage, false))).toBeNull()
  })
})

describe('send mode hint', () => {
  const request = 'Qual è il margine?'
  it('mirrors the store rule: the scenario request or a repeated question restarts, a new one follows up', () => {
    expect(sendModeFor(request, request, [])).toBe('first')
    expect(sendModeFor('  Qual è   il margine? ', request, ['Altro'])).toBe('restart')
    expect(sendModeFor('Altro', request, ['Altro'])).toBe('restart')
    expect(sendModeFor('E se i costi salgono?', request, [request])).toBe('followup')
  })
})
