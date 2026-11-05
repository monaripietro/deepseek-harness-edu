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

function openMenu() {
  fireEvent.click(screen.getByRole('button', { name: 'Menu' }))
}

describe('TopBar', () => {
  it('shows creator and E38 credits with the original logo', () => {
    render(<TopBar onOpenModel={vi.fn()} onOpenSettings={vi.fn()} />)

    expect(screen.getByRole('link', { name: 'Pietro Monari' }).getAttribute('href')).toBe('https://www.monaripietro.it/')
    const e38Link = screen.getByRole('link', { name: 'E38 S.r.l.' })
    expect(e38Link.getAttribute('href')).toBe('https://e38.it/')
    expect(e38Link.querySelector('img')?.getAttribute('src')).toBe('/Logo%20e38_Tavola%20disegno%201%20copia.png')
  })

  it('keeps the side menu collapsed, exposes aria state, and closes on Esc, scrim and the close button', () => {
    render(<TopBar onOpenModel={vi.fn()} onOpenSettings={vi.fn()} />)
    const trigger = screen.getByRole('button', { name: 'Menu' })
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('dialog')).toBeNull()

    openMenu()
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    for (const mode of ['Percorso', 'Laboratorio', 'Confronto']) {
      expect(screen.getByRole('radio', { name: mode })).not.toBeNull()
    }

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(trigger.getAttribute('aria-expanded')).toBe('false')

    openMenu()
    fireEvent.click(screen.getByRole('button', { name: 'Chiudi il menu' }))
    expect(screen.queryByRole('dialog')).toBeNull()

    openMenu()
    const scrim = document.querySelector('[aria-hidden="true"][class*="scrim"]')
    expect(scrim).not.toBeNull()
    fireEvent.pointerDown(scrim as Element)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('preserves scenario, model and secondary actions (moved into the side menu)', () => {
    const onOpenModel = vi.fn()
    const onOpenSettings = vi.fn()
    useLab.setState({
      status: 'running',
      loadProgress: { phase: 'downloading', loadedBytes: 30, totalBytes: 100 },
    })
    render(<TopBar onOpenModel={onOpenModel} onOpenSettings={onOpenSettings} />)

    expect(screen.getByLabelText<HTMLSelectElement>('Scenario').disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: /30%/ }))
    expect(onOpenModel).toHaveBeenCalledOnce()

    openMenu()
    fireEvent.click(screen.getByRole('button', { name: 'Laboratori: strumenti, documenti, MCP, memoria' }))
    expect(useLab.getState().lab).toBe('tools')

    openMenu()
    fireEvent.click(screen.getByRole('button', { name: 'Regia docente' }))
    expect(useLab.getState().teacherOpen).toBe(true)

    openMenu()
    fireEvent.click(screen.getByRole('radio', { name: 'Tema scuro' }))
    expect(useLab.getState().theme).toBe('dark')

    fireEvent.click(screen.getByRole('button', { name: 'Modalità presentazione' }))
    expect(useLab.getState().presentation).toBe(true)

    openMenu()
    fireEvent.click(screen.getByRole('button', { name: 'Impostazioni e dati locali' }))
    expect(onOpenSettings).toHaveBeenCalledOnce()
  })
})
