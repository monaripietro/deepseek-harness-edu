import { describe, expect, it } from 'vitest'
import type { ComponentId, TraceEvent } from '../../domain/types'
import { flyersFor } from './flyers'

const comps = {
  orchestrator: true, tools: true, rag: true, memory: true, instructions: true, context: true,
} as unknown as Record<ComponentId, boolean>

const assembled = (stepIndex: number) =>
  ({
    type: 'context/assembled',
    seq: stepIndex,
    id: `e${stepIndex}`,
    snapshot: {
      stepIndex,
      budget: { usedTokens: 1200 },
      items: [
        { kind: 'instruction', status: 'included' },
        { kind: 'taskData', status: 'included' },
        { kind: 'toolResult', status: 'included' },
      ],
    },
  }) as unknown as TraceEvent

describe('context/assembled flyers', () => {
  it('round 1: only the inputs enter the window (the model reads it in a separate step)', () => {
    const edges = flyersFor(assembled(1), comps).map(f => f.edge)
    expect(edges).toEqual(['instructions-window', 'context-window'])
  })
  it('later rounds replay no inputs: only the tool result enters the window', () => {
    const edges = flyersFor(assembled(2), comps).map(f => f.edge)
    expect(edges).toEqual(['ring-window'])
  })
  it('the context goes to the model on model/request, a step of its own', () => {
    const req = { type: 'model/request', tokensIn: 1420, protocol: 'json', mustAnswer: false } as unknown as TraceEvent
    expect(flyersFor(req, comps)).toEqual([{ edge: 'window-model', label: `≈ ${(1420).toLocaleString('it-IT')} token`, kind: 'context' }])
  })
})
