import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Welcome } from './Welcome'

afterEach(cleanup)

describe('Welcome', () => {
  it('opens the laboratory without requesting model setup', () => {
    const onStart = vi.fn()
    const onConfigureModel = vi.fn()
    render(<Welcome onStart={onStart} onConfigureModel={onConfigureModel} />)

    fireEvent.click(screen.getByRole('button', { name: 'Apri il laboratorio' }))

    expect(onStart).toHaveBeenCalledTimes(1)
    expect(onConfigureModel).not.toHaveBeenCalled()
  })

  it('opens model setup only when requested', () => {
    const onStart = vi.fn()
    const onConfigureModel = vi.fn()
    render(<Welcome onStart={onStart} onConfigureModel={onConfigureModel} />)

    fireEvent.click(screen.getByRole('button', { name: 'Carica modello' }))

    expect(onConfigureModel).toHaveBeenCalledTimes(1)
    expect(onStart).not.toHaveBeenCalled()
  })

  it('shows provenance labels only after opening the disclosure', () => {
    render(<Welcome onStart={vi.fn()} onConfigureModel={vi.fn()} />)

    const summary = screen.getByText('Come leggere le etichette')
    const disclosure = summary.closest('details') as HTMLDetailsElement
    expect(disclosure.open).toBe(false)

    fireEvent.click(summary)

    expect(disclosure.open).toBe(true)
    expect(within(disclosure).getByText('Calcolato davvero, dentro il tuo browser.')).toBeTruthy()
    expect(within(disclosure).getByText('Simulazione didattica: nessun effetto reale.')).toBeTruthy()
    expect(within(disclosure).getByText('Eseguito davvero da un servizio esterno, via rete.')).toBeTruthy()
    expect(within(disclosure).getByText('Non eseguibile in questo browser.')).toBeTruthy()
  })
})
