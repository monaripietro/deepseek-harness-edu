import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { REAL_LOCAL } from '../../domain/types'
import { configForLevel } from '../../harness/levels'
import { DEFAULT_SCENARIO_ID } from '../../scenarios'
import { useLab } from '../../state/store'
import type { ChatEntry } from '../../state/store'
import { RunPanel } from './RunPanel'

const initialModelInfo = useLab.getState().modelInfo
const initialLoadProgress = useLab.getState().loadProgress

function resetStore() {
  useLab.setState({
    scenarioId: DEFAULT_SCENARIO_ID,
    status: 'idle',
    chat: [],
    runs: [],
    currentRunId: null,
    events: [],
    modelActivity: null,
    reasoningText: '',
    runReasoning: [],
    streamingText: '',
    needsModel: false,
    pendingApproval: null,
    level: 0,
    config: configForLevel(0),
    profile: null,
    modelInfo: initialModelInfo,
    loadProgress: initialLoadProgress,
  })
}

function readyModelInfo() {
  return { ...initialModelInfo, label: 'Modello reale di prova', provenance: REAL_LOCAL }
}

describe('RunPanel', () => {
  beforeEach(resetStore)
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    resetStore()
  })

  it('sends the edited draft through the store and asks for a model without downloading one', () => {
    const send = vi.spyOn(useLab.getState(), 'send')
    const loadModel = vi.spyOn(useLab.getState(), 'loadModel')
    render(<RunPanel />)

    const input = screen.getByRole('textbox', { name: 'La tua richiesta' }) as HTMLTextAreaElement
    fireEvent.change(input, { target: { value: 'Spiega la richiesta del cliente.' } })
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: false })

    expect(send).toHaveBeenCalledWith('Spiega la richiesta del cliente.')
    expect(useLab.getState().needsModel).toBe(true)
    expect(useLab.getState().chat).toHaveLength(0)
    expect(loadModel).not.toHaveBeenCalled()
  })

  it('shows the streaming store response and stops an active run', () => {
    const assistant: ChatEntry = {
      id: 'assistant-stream',
      role: 'assistant',
      text: '',
      streaming: true,
      provenance: REAL_LOCAL,
    }
    useLab.setState({
      status: 'running',
      modelInfo: readyModelInfo(),
      chat: [{ id: 'user-1', role: 'user', text: 'Una domanda.' }, assistant],
      streamingText: 'Risposta in arrivo dal modello reale.',
    })
    const stop = vi.spyOn(useLab.getState(), 'stop')
    render(<RunPanel />)

    expect(screen.getByText('Risposta in arrivo dal modello reale.')).not.toBeNull()
    expect(screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'La tua richiesta' }).disabled).toBe(true)
    expect(screen.getByRole('status').textContent).toBe('In esecuzione')
    act(() =>{  useLab.setState({ status: 'awaitingApproval', streamingText: '' }) })
    expect(screen.getByRole('status').textContent).toBe('In attesa di approvazione')
    expect(screen.getByText('In attesa della tua approvazione…')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Ferma' })).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Ferma' }))
    expect(stop).toHaveBeenCalledTimes(1)
  })

  it('renders the assistant answer and provenance from the store after a run completes', () => {
    const assistant: ChatEntry = {
      id: 'assistant-final',
      role: 'assistant',
      text: 'Risposta salvata dallo store.\n\n**Dettaglio leggibile.**',
      configLabel: 'Harness completo',
      provenance: REAL_LOCAL,
      stopReason: 'final_answer',
    }
    useLab.setState({
      status: 'done',
      modelInfo: readyModelInfo(),
      chat: [{ id: 'user-1', role: 'user', text: 'Una domanda.' }, assistant],
      streamingText: '',
    })
    render(<RunPanel />)

    expect(screen.getByText('Risposta salvata dallo store.')).not.toBeNull()
    expect(screen.getByText('Dettaglio leggibile.').tagName).toBe('STRONG')
    expect(screen.getByLabelText(/REALE, LOCALE/i)).not.toBeNull()
    expect(screen.getByText('Risposta finale')).not.toBeNull()
  })

  it('offers a reflection loop without loading another model or activating tools', () => {
    useLab.getState().setScenario('ragionamento-iterativo')
    const loadModel = vi.spyOn(useLab.getState(), 'loadModel')
    render(<RunPanel />)

    expect(screen.getByLabelText('Come provare il ragionamento iterativo')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Attiva ciclo di riflessione e controlli' }))

    expect(useLab.getState().level).toBe(7)
    expect(useLab.getState().config.enabledTools).toEqual([])
    expect(useLab.getState().config.components.tools).toBe(false)
    expect(useLab.getState().config.components.agentLoop).toBe(true)
    expect(useLab.getState().config.components.controls).toBe(true)
    expect(screen.getByText(/Limite configurato: 10 passi/)).not.toBeNull()
    expect(loadModel).not.toHaveBeenCalled()
  })

  it.each([
    '<self_reflection>\nBozza non finale',
    '<self_reflection>Bozza non finale</self_reflection>',
    '<final_answer>\nBozza non finale',
    'Refletteri',
  ])('does not render reflection-loop output as answer prose before it is accepted: %s', (streamingText) => {
    useLab.getState().setScenario('ragionamento-iterativo')
    useLab.getState().setLevel(7)
    useLab.setState({
      status: 'running',
      chat: [{ id: 'reflection-stream', role: 'assistant', text: '', streaming: true }],
      streamingText,
    })
    render(<RunPanel />)

    expect(screen.queryByText(/Bozza non finale/)).toBeNull()
    expect(screen.queryByText('Refletteri')).toBeNull()
    expect(screen.getByText('Esecuzione del modello')).not.toBeNull()
    expect(screen.queryByText('Risposta finale')).toBeNull()
    expect(screen.getByText('Il modello scrive il prossimo passo del ciclo…')).not.toBeNull()
  })

  it('does not label an invalid model output as a final answer', () => {
    useLab.setState({
      status: 'done',
      chat: [{ id: 'invalid-answer', role: 'assistant', text: 'Formato non valido.', stopReason: 'invalid_output' }],
    })
    render(<RunPanel />)
    expect(screen.getByText('Esito senza risposta finale')).not.toBeNull()
    expect(screen.queryByText('Risposta finale')).toBeNull()
  })
})
