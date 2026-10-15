import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { RunRecord } from '../../domain/types'
import { REAL_LOCAL } from '../../domain/types'
import { createEventBus } from '../../harness/events'
import { NOT_LOADED_INFO } from '../../runtime/model/profiles'
import { useLab } from '../../state/store'
import { ReflectionTrace } from './ReflectionTrace'

const originalState = useLab.getState()

beforeEach(() =>{  useLab.setState({ events: [], runs: [], currentRunId: null }) })
afterEach(() => {
  cleanup()
  useLab.setState(originalState, true)
})

function record(): RunRecord {
  return {
    id: 'recorded-reflections',
    scenarioId: 'ragionamento-iterativo',
    configKey: 'test',
    configLabel: 'Test',
    input: 'Ordina le dimostrazioni.',
    answer: 'Delta, Gamma, Beta, Alfa.',
    startedAt: '2026-10-15T08:00:00.000Z',
    durationMs: 100,
    steps: 3,
    toolCalls: [],
    reflections: ['Prima proposta da verificare.', 'Proposta corretta, vincoli verificati.'],
    sourcesUsed: [],
    memoryUsed: [],
    errors: [],
    humanInterventions: 0,
    actions: [],
    stopReason: 'final_answer',
    checks: [],
    modelInfo: NOT_LOADED_INFO,
    modelProvenance: REAL_LOCAL,
  }
}

describe('ReflectionTrace', () => {
  it('shows reflection decisions of the active run without treating them as tool results', () => {
    const bus = createEventBus()
    bus.emit('previous-run', { type: 'decision/parsed', decision: { type: 'reflect', text: 'Bozza di un altro turno.' } })
    bus.emit('active-run', { type: 'decision/parsed', decision: { type: 'reflect', text: 'Controllare il vincolo su Gamma.' } })
    bus.emit('active-run', {
      type: 'tool/result', callId: 'unrelated', tool: 'calcolatrice', durationMs: 0,
      outcome: { ok: true, data: { risultato: 4 }, summary: 'Risultato di uno strumento.' },
    })
    useLab.setState({ currentRunId: 'active-run', events: [...bus.events()] })

    render(<ReflectionTrace live />)

    expect(screen.getByLabelText('Riflessioni del ciclo: testo separato dalla risposta')).not.toBeNull()
    expect(screen.getByText('Controllare il vincolo su Gamma.')).not.toBeNull()
    expect(screen.getByText('1 passaggio · in corso')).not.toBeNull()
    expect(screen.getByText(/non è il thinking nativo/)).not.toBeNull()
    expect(screen.queryByText('Bozza di un altro turno.')).toBeNull()
    expect(screen.queryByText('Risultato di uno strumento.')).toBeNull()
  })

  it('retains the draft/review passes after live events are cleared and supports comparison results', () => {
    const saved = record()
    useLab.setState({ runs: [saved], currentRunId: 'another-run' })
    const view = render(<ReflectionTrace runId={saved.id} />)

    expect(screen.getByRole('list', { name: 'Passaggi di riflessione' }).textContent).toMatchInlineSnapshot('"Riflessione 1Prima proposta da verificare.Riflessione 2Proposta corretta, vincoli verificati."')
    expect(screen.queryByText(saved.answer)).toBeNull()

    act(() =>{  useLab.setState({ runs: [] }) })
    view.rerender(<ReflectionTrace record={saved} />)
    expect(screen.getByText('2 passaggi')).not.toBeNull()
  })

  it('renders nothing before the first reflection and never borrows another run', () => {
    useLab.setState({ runs: [record()], currentRunId: 'recorded-reflections' })
    const view = render(<ReflectionTrace />)
    expect(view.container.innerHTML).toBe('')
    view.rerender(<ReflectionTrace runId="missing-run" />)
    expect(view.container.innerHTML).toBe('')
  })

  it('reports calls and formatting failures without claiming that a reflection was produced', () => {
    const bus = createEventBus()
    bus.emit('other-run', { type: 'model/request', tokensIn: 10, protocol: 'json', mustAnswer: false, reflection: true })
    bus.emit('active-run', { type: 'model/request', tokensIn: 10, protocol: 'json', mustAnswer: false, reflection: true })
    bus.emit('active-run', { type: 'decision/invalid', raw: 'Refletteri', error: 'No JSON', attempt: 1 })
    bus.emit('active-run', { type: 'model/request', tokensIn: 20, protocol: 'json', mustAnswer: false, reflection: true })
    useLab.setState({ currentRunId: 'active-run', events: [...bus.events()] })

    render(<ReflectionTrace live />)

    expect(screen.getByText('2 chiamate al modello · 0 bozze accettate · 1 output non valido')).not.toBeNull()
    expect(screen.getByText(/Nessuna bozza accettata/)).not.toBeNull()
    expect(screen.queryByText('Riflessione 1')).toBeNull()
  })
})
