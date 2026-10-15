import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LevelRail } from './LevelRail'

const mocks = vi.hoisted(() => ({
  lab: {
    view: 'guided' as 'guided' | 'lab',
    level: 0 as number,
    status: 'idle' as 'idle' | 'running' | 'awaitingApproval' | 'done',
    setLevel: vi.fn(),
    updateConfig: vi.fn(),
  },
  progress: {
    highestReached: 0,
    completed: {} as Record<number, boolean>,
  },
}))

const initialLab = { view: 'guided' as const, level: 0, status: 'idle' as const }
const initialProgress = { highestReached: 0, completed: {} as Record<number, boolean> }

vi.mock('../../state/store', () => ({
  useLab: (selector: (state: typeof mocks.lab) => unknown) => selector(mocks.lab),
}))

vi.mock('../shell/progress', () => ({
  isUnlocked: (level: number, highest: number) => level <= highest + 1,
  useProgress: (selector: (state: typeof mocks.progress) => unknown) => selector(mocks.progress),
}))

describe('LevelRail', () => {
  beforeEach(() => {
    mocks.lab.view = 'guided'
    mocks.lab.level = 0
    mocks.lab.status = 'idle'
    mocks.lab.setLevel.mockReset()
    mocks.lab.updateConfig.mockReset()
    mocks.progress.highestReached = 0
    mocks.progress.completed = {}
  })

  afterEach(() => {
    cleanup()
    Object.assign(mocks.lab, initialLab)
    Object.assign(mocks.progress, initialProgress)
    vi.clearAllMocks()
  })

  it('shows compact numbered progress and opens the complete, unlock-aware level list on request', () => {
    render(<LevelRail />)

    const progression = screen.getByRole('navigation', { name: 'Avanzamento livelli' })
    const steps = within(progression).getAllByRole('button')
    expect(steps).toHaveLength(10)
    expect(steps[0]?.getAttribute('aria-current')).toBe('step')
    expect((steps[1] as HTMLButtonElement).disabled).toBe(false)
    expect((steps[2] as HTMLButtonElement).disabled).toBe(true)

    expect(screen.getByRole('heading', { name: 'Il modello, da solo' })).toBeTruthy()
    expect(screen.getByText('Fai la domanda al modello così com’è.')).toBeTruthy()
    expect(screen.getByText('Modello linguistico')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Livello precedente' }) as HTMLButtonElement).disabled).toBe(true)

    const next = screen.getByRole('button', { name: 'Livello successivo: Istruzioni di sistema' })
    expect((next as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(next)
    expect(mocks.lab.setLevel).toHaveBeenCalledWith(1)

    const details = screen.getByText('Tutti i livelli').closest('details')
    if (!details) throw new Error('Tutti i livelli details not found')
    expect(details.hasAttribute('open')).toBe(false)
    fireEvent.click(screen.getByText('Tutti i livelli'))
    expect(details.hasAttribute('open')).toBe(true)
    expect(
      (within(details).getByRole('button', { name: /Livello 10: Strumenti esterni via MCP — bloccato/ }) as HTMLButtonElement).disabled,
    ).toBe(true)
  })

  it('keeps guided navigation and lab presets disabled while a run is busy', () => {
    const { rerender } = render(<LevelRail />)

    mocks.lab.status = 'awaitingApproval'
    rerender(<LevelRail />)
    const progression = screen.getByRole('navigation', { name: 'Avanzamento livelli' })
    expect(within(progression).getAllByRole('button').every(button => (button as HTMLButtonElement).disabled)).toBe(true)
    expect((screen.getByRole('button', { name: 'Livello successivo: Istruzioni di sistema' }) as HTMLButtonElement).disabled).toBe(true)

    mocks.lab.view = 'lab'
    rerender(<LevelRail />)
    expect(screen.queryByRole('navigation', { name: 'Avanzamento livelli' })).toBeNull()
    expect((screen.getByRole('button', { name: /^Solo modello/ }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('keeps lab presets actionable when idle', () => {
    mocks.lab.view = 'lab'
    render(<LevelRail />)

    fireEvent.click(screen.getByRole('button', { name: /^Solo modello/ }))
    expect(mocks.lab.updateConfig).toHaveBeenCalledTimes(1)
  })
})
