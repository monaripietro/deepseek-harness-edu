import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'
import { SIMULATED_LOCAL } from './domain/types'
import { configForLevel } from './harness/levels'
import { bus, useLab } from './state/store'
import { useStageUi } from './ui/stage/stageUi'

const originalLab = useLab.getState()
const originalStage = useStageUi.getState()
const originalUrl = window.location.href
const originalAttributes = ['data-theme', 'data-presentation'].map(name => [name, document.documentElement.getAttribute(name)] as const)

beforeEach(() => {
  useLab.setState({
    ...originalLab,
    welcomeDone: true,
    view: 'guided',
    level: 0,
    config: configForLevel(0),
    events: [],
    chat: [],
    status: 'idle',
    needsModel: false,
    pendingApproval: null,
  }, true)
  useStageUi.setState({ ...originalStage, selected: null }, true)
})

afterEach(() => {
  cleanup()
  bus.clear()
  useLab.setState(originalLab, true)
  useStageUi.setState(originalStage, true)
  window.history.replaceState(null, '', originalUrl)
  for (const [name, value] of originalAttributes) {
    if (value === null) document.documentElement.removeAttribute(name)
    else document.documentElement.setAttribute(name, value)
  }
})

describe('laboratory workspace', () => {
  it('selects the tool-free reflection scenario from a lesson link', () => {
    window.history.replaceState(null, '', '?scenario=ragionamento-iterativo&livello=7')
    render(<App />)
    expect(useLab.getState().scenarioId).toBe('ragionamento-iterativo')
    expect(useLab.getState().level).toBe(7)
    expect(useLab.getState().config.enabledTools).toEqual([])
    expect(useLab.getState().config.components.tools).toBe(false)
    expect(useLab.getState().config.components.agentLoop).toBe(true)
    expect(useLab.getState().config.components.controls).toBe(true)
  })

  it('starts with the map on the whole width and opens the run panel on request', () => {
    render(<App />)
    expect(screen.getByRole('tab', { name: 'Mappa' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.queryByRole('textbox', { name: 'La tua richiesta' })).toBeNull()
    const toggle = screen.getByRole('button', { name: 'Prova e racconto' })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(toggle)
    expect(screen.getByRole('button', { name: 'Chiudi pannello' }).getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('textbox', { name: 'La tua richiesta' })).toBeTruthy()
  })

  it('keeps the request draft when switching between the run and explanation panels', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Prova e racconto' }))
    const input = screen.getByRole('textbox', { name: 'La tua richiesta' })
    fireEvent.change(input, { target: { value: 'Una domanda ancora da inviare' } })
    fireEvent.click(screen.getByRole('tab', { name: 'Cosa succede' }))
    expect(screen.queryByRole('textbox', { name: 'La tua richiesta' })).toBeNull()
    fireEvent.click(screen.getByRole('tab', { name: 'Prova' }))
    expect(screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'La tua richiesta' }).value).toBe('Una domanda ancora da inviare')
  })

  it('does not interpret arrow keys on inputs and buttons as lesson navigation', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Prova e racconto' }))
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'La tua richiesta' }), { key: 'ArrowRight' })
    fireEvent.click(screen.getByRole('tab', { name: 'Flusso' }))
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Flusso' }), { key: 'ArrowDown' })
    fireEvent.keyDown(screen.getByRole('button', { name: 'La richiesta. Apri i dettagli' }), { key: 'ArrowRight' })
    expect(useLab.getState().level).toBe(0)
  })

  it('retains page-level lesson shortcuts and blocks them while a run is active', () => {
    render(<App />)
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(useLab.getState().level).toBe(1)
    act(() =>{  useLab.setState({ status: 'running' }) })
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(useLab.getState().level).toBe(1)
  })

  it('opens pending approval without requiring the user to find a diagram node', async () => {
    const resolve = vi.fn()
    useLab.setState({
      status: 'awaitingApproval',
      config: configForLevel(8),
      pendingApproval: {
        id: 'approval-ui-test',
        callId: 'call-ui-test',
        toolId: 'crea_richiesta_acquisto',
        toolTitle: 'Crea richiesta di acquisto',
        args: { quantita: 4 },
        risk: 'write',
        effects: 'Crea una richiesta simulata; non invia ordini reali.',
        dataUsed: [],
        provenance: SIMULATED_LOCAL,
        resolve,
      },
    })
    render(<App />)
    const dialog = await screen.findByRole('dialog', { name: "L'agente chiede il tuo permesso" })
    expect(dialog.textContent).toContain('Crea una richiesta simulata; non invia ordini reali.')
    expect(resolve).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Rifiuta' }))
    expect(resolve).toHaveBeenCalledWith('rejected')
  })
})
