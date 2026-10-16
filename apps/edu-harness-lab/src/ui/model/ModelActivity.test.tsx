import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { createEventBus } from '../../harness/events'
import { configForLevel } from '../../harness/levels'
import { useLab } from '../../state/store'
import { ReasoningDisclosure, useStreamedProse } from './ModelActivity'

const originalState = useLab.getState()
afterEach(() => {
  cleanup()
  useLab.setState(originalState, true)
})

function Stream() {
  return <p data-testid="prose">{useStreamedProse()}</p>
}

describe('native thinking and structured output presentation', () => {
  it('labels native thinking separately from the agent-loop drafts', () => {
    render(<ReasoningDisclosure parts={['Testo del canale nativo.']} />)
    expect(screen.getByText('Thinking nativo')).not.toBeNull()
    expect(screen.getByText(/Non sono le bozze del ciclo agentico/)).not.toBeNull()
    expect(screen.getByText('Testo del canale nativo.')).not.toBeNull()
  })

  it.each(['{"azione":"rifletti","testo":"bozza"}', 'Formato non valido, non una risposta finale.'])('hides structured model output even before JSON has been parsed: %s', (streamingText) => {
    const bus = createEventBus()
    bus.emit('active-run', { type: 'model/request', tokensIn: 10, protocol: 'json', mustAnswer: false })
    useLab.setState({ currentRunId: 'active-run', scenarioId: 'margine-commessa', config: configForLevel(7), events: [...bus.events()], streamingText })
    render(<Stream />)
    expect(screen.getByTestId('prose').textContent).toBe('')
  })

  it('keeps ordinary unstructured answer streaming visible', () => {
    useLab.setState({ currentRunId: null, events: [], scenarioId: 'margine-commessa', config: configForLevel(0), streamingText: 'Risposta in arrivo.' })
    render(<Stream />)
    expect(screen.getByText('Risposta in arrivo.')).not.toBeNull()
  })
})
