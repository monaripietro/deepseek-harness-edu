import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { REAL_LOCAL } from '../../domain/types'
import type { TraceEvent, TraceEventBase, TraceEventBody } from '../../domain/types'
import { useLab } from '../../state/store'
import type { LabState } from '../../state/store'
import { StageHud } from './StageHud'
import { deriveStage } from './deriveStage'

let original: Pick<LabState, 'events' | 'status' | 'stepMode' | 'paused' | 'heldEvent'>

function ev<B extends TraceEventBody>(seq: number, body: B, runId = 'run-1'): TraceEventBase & B {
  return { ...body, id: `event-${seq}`, seq, at: seq, runId, source: 'ui', provenance: REAL_LOCAL }
}

const runStart = ev(1, { type: 'run/start', input: 'Ciao', configKey: 'k', configLabel: 'Base', scenarioId: 's' } as unknown as TraceEventBody) as unknown as TraceEvent

beforeEach(() => {
  const { events, status, stepMode, paused, heldEvent } = useLab.getState()
  original = { events, status, stepMode, paused, heldEvent }
})

afterEach(() => {
  cleanup()
  useLab.setState(original)
})

describe('StageHud', () => {
  it('titles the strip with the held event when step mode holds the run', () => {
    const events = [runStart]
    useLab.setState({ events, status: 'running', stepMode: true, paused: false, heldEvent: runStart })
    const stage = deriveStage(events, useLab.getState().config.components.orchestrator)

    render(<StageHud stage={stage} onApprovalDetails={() => {}} />)

    const title = screen.getByRole('status').textContent ?? ''
    expect(title).toContain('La tua richiesta è entrata nel sistema')
    expect(title).toContain('Passo 1 di')
    expect(screen.getByText('Tappa 1')).toBeTruthy()
  })

  it('keeps the latest-event title when nothing is held', () => {
    const events = [runStart]
    useLab.setState({ events, status: 'running', stepMode: true, paused: false, heldEvent: null })
    const stage = deriveStage(events, useLab.getState().config.components.orchestrator)

    render(<StageHud stage={stage} onApprovalDetails={() => {}} />)

    expect(screen.getByRole('status').textContent).not.toContain('La tua richiesta è entrata nel sistema')
    expect(screen.queryByText('Tappa 1')).toBeNull()
  })
})
