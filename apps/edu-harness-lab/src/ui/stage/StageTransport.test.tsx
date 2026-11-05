import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { REAL_LOCAL } from '../../domain/types'
import type { TraceEvent, TraceEventBase, TraceEventBody } from '../../domain/types'
import { useLab } from '../../state/store'
import type { LabState } from '../../state/store'
import { StageTransport } from './StageTransport'

let original: Pick<LabState, 'events' | 'status' | 'stepMode' | 'paused' | 'heldEvent'>

function ev<B extends TraceEventBody>(seq: number, body: B, runId = 'run-1'): TraceEventBase & B {
  return { ...body, id: `event-${seq}`, seq, at: seq, runId, source: 'ui', provenance: REAL_LOCAL }
}

/** A run that has started and then stopped on its final answer: the stop is a step stop. */
const runStart = ev(1, { type: 'run/start', input: 'Ciao', configKey: 'k', configLabel: 'Base', scenarioId: 's' } as unknown as TraceEventBody) as unknown as TraceEvent
const stop = ev(2, { type: 'stop', reason: 'final_answer', message: 'ok' } as unknown as TraceEventBody) as unknown as TraceEvent

beforeEach(() => {
  const { events, status, stepMode, paused, heldEvent } = useLab.getState()
  original = { events, status, stepMode, paused, heldEvent }
})

afterEach(() => {
  cleanup()
  useLab.setState(original)
})

describe('StageTransport', () => {
  it('shows the held stop and enables Avanti only while held', () => {
    useLab.setState({ events: [runStart, stop], status: 'running', stepMode: true, paused: false, heldEvent: stop })
    render(<StageTransport />)

    const guide = screen.getByRole('status')
    expect(guide.textContent).toContain('Tappa 2')
    expect(guide.textContent).toContain('Fine: risposta finale')
    expect(guide.textContent).toContain('Avanti: la prova si conclude')
    expect((screen.getByRole('button', { name: 'Avanti' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('says the model is working and disables Avanti while the run flows', () => {
    useLab.setState({ events: [runStart], status: 'running', stepMode: true, paused: false, heldEvent: null })
    render(<StageTransport />)

    expect(screen.getByRole('status').textContent).toContain('Il modello sta lavorando… Avanti si riattiva alla prossima tappa')
    expect((screen.getByRole('button', { name: 'Avanti' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('explains step mode before a run starts', () => {
    useLab.setState({ events: [], status: 'idle', stepMode: true, paused: false, heldEvent: null })
    render(<StageTransport />)

    expect(screen.getByRole('status').textContent).toContain('Passo-passo attivo: premi Avvia, poi Avanti a ogni tappa')
    expect((screen.getByRole('button', { name: 'Avanti' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('reports a pause on a held event outside step mode', () => {
    useLab.setState({ events: [runStart, stop], status: 'running', stepMode: false, paused: true, heldEvent: stop })
    render(<StageTransport />)

    expect(screen.getByRole('status').textContent).toContain('In pausa')
    expect((screen.getByRole('button', { name: 'Avanti' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('toggles step mode from the bar', () => {
    useLab.setState({ events: [], status: 'idle', stepMode: false, paused: false, heldEvent: null })
    render(<StageTransport />)

    fireEvent.click(screen.getByRole('button', { name: 'Passo-passo' }))
    expect(useLab.getState().stepMode).toBe(true)
  })
})
