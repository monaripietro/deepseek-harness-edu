import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SCENARIOS } from '../../scenarios'
import { useLab } from '../../state/store'
import { TopBar } from './TopBar'

const originalLabState = useLab.getState()

function at<T>(items: readonly T[], index: number): T {
  const item = items[index]
  if (item === undefined) throw new Error(`Missing item at index ${index}`)
  return item
}

afterEach(() => {
  cleanup()
  useLab.setState(originalLabState, true)
})

beforeEach(() => {
  useLab.setState({
    view: 'guided',
    scenarioId: at(SCENARIOS, 0).id,
    status: 'idle',
    paused: false,
    stepMode: false,
    speed: 1,
    teacherOpen: false,
    theme: 'light',
    presentation: false,
    loadProgress: { phase: 'idle', loadedBytes: 0, totalBytes: 0 },
  })
})

function openControls() {
  fireEvent.click(screen.getByText('Controlli'))
}

describe('TopBar', () => {
  it('keeps the three modes available and dismisses controls on an outside click', () => {
    render(<TopBar onOpenModel={vi.fn()} onOpenSettings={vi.fn()} />)

    for (const mode of ['Percorso', 'Laboratorio', 'Confronto']) {
      expect(screen.getByRole('radio', { name: mode })).not.toBeNull()
    }

    openControls()
    const trigger = screen.getByText('Controlli').closest('summary')
    expect(trigger?.getAttribute('aria-expanded')).toBe('true')

    fireEvent.pointerDown(document.body)

    expect(trigger?.getAttribute('aria-expanded')).toBe('false')
  })

  it('closes the controls on Escape and returns focus to the trigger', () => {
    render(<TopBar onOpenModel={vi.fn()} onOpenSettings={vi.fn()} />)
    openControls()

    const trigger = screen.getByText('Controlli').closest('summary')
    fireEvent.keyDown(document, { key: 'Escape' })

    expect(trigger?.getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(trigger)
  })

  it('preserves scenario, model, animation, and secondary actions', () => {
    const onOpenModel = vi.fn()
    const onOpenSettings = vi.fn()
    useLab.setState({
      status: 'running',
      stepMode: true,
      loadProgress: { phase: 'downloading', loadedBytes: 30, totalBytes: 100 },
    })
    render(<TopBar onOpenModel={onOpenModel} onOpenSettings={onOpenSettings} />)

    expect(screen.getByLabelText<HTMLSelectElement>('Scenario').disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: /30%/ }))
    expect(onOpenModel).toHaveBeenCalledOnce()

    openControls()
    expect(screen.getByRole('button', { name: 'Avanti di un evento (S)' })).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Pausa (Spazio)' }))
    expect(useLab.getState().paused).toBe(true)
    fireEvent.click(screen.getByRole('radio', { name: '2×' }))
    expect(useLab.getState().speed).toBe(2)
    fireEvent.click(screen.getByRole('button', { name: 'Passo-passo' }))
    expect(useLab.getState().stepMode).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: 'Laboratori: strumenti, documenti, MCP, memoria' }))
    expect(useLab.getState().lab).toBe('tools')

    openControls()
    fireEvent.click(screen.getByRole('button', { name: 'Regia docente' }))
    expect(useLab.getState().teacherOpen).toBe(true)

    openControls()
    fireEvent.click(screen.getByRole('button', { name: 'Cambia tema: Tema scuro' }))
    expect(useLab.getState().theme).toBe('dark')

    openControls()
    fireEvent.click(screen.getByRole('button', { name: 'Modalità presentazione' }))
    expect(useLab.getState().presentation).toBe(true)

    openControls()
    fireEvent.click(screen.getByRole('button', { name: 'Impostazioni e dati locali' }))
    expect(onOpenSettings).toHaveBeenCalledOnce()
  })
})
