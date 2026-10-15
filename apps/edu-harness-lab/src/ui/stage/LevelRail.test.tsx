import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LevelRail } from './LevelRail'

const mocks = vi.hoisted(() => ({
  lab: {
    view: 'guided',
    level: 0,
    scenarioId: 'notebook-nuovi-assunti',
    status: 'idle',
    setLevel: vi.fn(),
    updateConfig: vi.fn(),
  },
  progress: {
    highestReached: 0,
    completed: {},
  },
}))

const initialLab = { view: 'guided' as const, level: 0, scenarioId: 'notebook-nuovi-assunti', status: 'idle' as const }
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
    mocks.lab.scenarioId = 'notebook-nuovi-assunti'
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
    const steps = within(progression).getAllByRole<HTMLButtonElement>('button')
    expect(steps).toHaveLength(10)
    expect(steps[0]?.getAttribute('aria-current')).toBe('step')
    expect(steps[1]?.disabled).toBe(false)
    expect(steps[2]?.disabled).toBe(true)

    expect(screen.getByRole('heading', { name: 'Il modello, da solo' })).toBeTruthy()
    expect(screen.getByText('Fai la domanda al modello così com’è.')).toBeTruthy()
    expect(screen.getByText('Modello linguistico')).toBeTruthy()
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Livello precedente' }).disabled).toBe(true)

    const next = screen.getByRole<HTMLButtonElement>('button', { name: 'Livello successivo: Istruzioni di sistema' })
    expect(next.disabled).toBe(false)
    fireEvent.click(next)
    expect(mocks.lab.setLevel).toHaveBeenCalledWith(1)

    const details = screen.getByText('Tutti i livelli').closest('details')
    if (!details) throw new Error('Tutti i livelli details not found')
    expect(details.hasAttribute('open')).toBe(false)
    fireEvent.click(screen.getByText('Tutti i livelli'))
    expect(details.hasAttribute('open')).toBe(true)
    expect(
      within(details).getByRole<HTMLButtonElement>('button', { name: /Livello 10: Strumenti esterni via MCP — bloccato/ }).disabled,
    ).toBe(true)
    expect(screen.getByText('Livello 1/10')).toBeTruthy()
  })

  it('shows only the levels the selected scenario needs and ends the path at its last one', () => {
    mocks.lab.scenarioId = 'sala-senza-data'
    mocks.lab.level = 1
    mocks.progress.highestReached = 1
    render(<LevelRail />)

    const progression = screen.getByRole('navigation', { name: 'Avanzamento livelli' })
    expect(within(progression).getAllByRole('button').map(step => step.textContent)).toEqual(['1', '2'])
    expect(screen.getByText('Livello 2/2')).toBeTruthy()

    const done = screen.getByRole('button', { name: 'Percorso completato' })
    expect(done.textContent).toBe('Completato')
    expect((done as HTMLButtonElement).disabled).toBe(true)

    const details = screen.getByText('Tutti i livelli').closest('details')
    if (!details) throw new Error('Tutti i livelli details not found')
    expect(within(details).getAllByRole('button')).toHaveLength(2)
    expect(within(details).queryByRole('button', { name: /Livello 3:/ })).toBeNull()
  })

  it('offers the next level until the scenario’s last one', () => {
    mocks.lab.scenarioId = 'margine-commessa'
    mocks.lab.level = 4
    mocks.progress.highestReached = 4
    render(<LevelRail />)

    expect(within(screen.getByRole('navigation', { name: 'Avanzamento livelli' })).getAllByRole('button')).toHaveLength(6)
    expect(screen.getByText('Livello 5/6')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Livello successivo: Il primo strumento' }))
    expect(mocks.lab.setLevel).toHaveBeenCalledWith(5)
  })

  it('keeps guided navigation and lab presets disabled while a run is busy', () => {
    const { rerender } = render(<LevelRail />)

    mocks.lab.status = 'awaitingApproval'
    rerender(<LevelRail />)
    const progression = screen.getByRole('navigation', { name: 'Avanzamento livelli' })
    expect(within(progression).getAllByRole<HTMLButtonElement>('button').every(button => button.disabled)).toBe(true)
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Livello successivo: Istruzioni di sistema' }).disabled).toBe(true)

    mocks.lab.view = 'lab'
    rerender(<LevelRail />)
    expect(screen.queryByRole('navigation', { name: 'Avanzamento livelli' })).toBeNull()
    expect(screen.getByRole<HTMLButtonElement>('button', { name: /^Solo modello/ }).disabled).toBe(true)
  })

  it('keeps lab presets actionable when idle', () => {
    mocks.lab.view = 'lab'
    render(<LevelRail />)

    fireEvent.click(screen.getByRole('button', { name: /^Solo modello/ }))
    expect(mocks.lab.updateConfig).toHaveBeenCalledTimes(1)
  })
})
