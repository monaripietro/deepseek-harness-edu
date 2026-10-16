import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useLab } from '../../state/store'
import type { LabId } from '../../state/store'
import { LabsDrawer } from './LabsDrawer'

let previousLab: LabId | null
beforeEach(() => {
  previousLab = useLab.getState().lab
  useLab.getState().openLab('tools')
})
afterEach(() => {
  try {
    cleanup()
  } finally {
    useLab.getState().openLab(previousLab)
  }
})

describe('LabsDrawer', () => {
  it('navigates one lab at a time and resets its internal scroll', () => {
    render(<LabsDrawer />)

    const toolsTab = screen.getByRole('tab', { name: 'Strumenti' })
    const panel = screen.getByRole('tabpanel')
    expect(toolsTab.getAttribute('aria-selected')).toBe('true')
    expect(panel.getAttribute('aria-labelledby')).toBe('labtab-tools')
    expect(screen.getByRole('heading', { name: 'Strumenti', level: 2 })).toBeTruthy()
    panel.scrollTop = 320

    let reachedWindow = false
    const onWindowKeyDown = () => { reachedWindow = true }
    window.addEventListener('keydown', onWindowKeyDown)
    try {
      fireEvent.keyDown(toolsTab, { key: 'ArrowRight' })
    } finally {
      window.removeEventListener('keydown', onWindowKeyDown)
    }

    const ragTab = screen.getByRole('tab', { name: 'Documenti RAG' })
    expect(reachedWindow).toBe(false)
    expect(ragTab.getAttribute('aria-selected')).toBe('true')
    expect(screen.queryByRole('heading', { name: 'Strumenti', level: 2 })).toBeNull()
    expect(screen.getByRole('heading', { name: 'Documenti aziendali (RAG)', level: 2 })).toBeTruthy()
    expect(panel.scrollTop).toBe(0)

    fireEvent.keyDown(ragTab, { key: 'ArrowRight' })
    const mcpTab = screen.getByRole('tab', { name: 'Server MCP' })
    expect(mcpTab.getAttribute('aria-selected')).toBe('true')
    expect(screen.queryByRole('heading', { name: 'Documenti aziendali (RAG)', level: 2 })).toBeNull()
    expect(screen.getByRole('heading', { name: 'Server MCP', level: 2 })).toBeTruthy()

    fireEvent.keyDown(mcpTab, { key: 'End' })
    const memoryTab = screen.getByRole('tab', { name: 'Memoria' })
    expect(memoryTab.getAttribute('aria-selected')).toBe('true')
    expect(screen.queryByRole('heading', { name: 'Server MCP', level: 2 })).toBeNull()
    expect(screen.getByRole('heading', { name: 'Memoria', level: 2 })).toBeTruthy()

    fireEvent.keyDown(memoryTab, { key: 'Home' })
    expect(screen.getByRole('tab', { name: 'Strumenti' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.queryByRole('heading', { name: 'Memoria', level: 2 })).toBeNull()
  })

  it('traps focus and restores it after the close button is used', () => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    const previous = document.createElement('button')

    try {
      document.body.append(previous)
      previous.focus()
      render(<LabsDrawer />)

      const first = screen.getByRole('button', { name: 'Chiudi Harness Lab' })
      const panel = screen.getByRole('tabpanel')
      const closedDetails = document.createElement('details')
      const summary = document.createElement('summary')
      summary.textContent = 'Dettagli chiusi'
      summary.tabIndex = 0
      closedDetails.append(summary, document.createElement('button'))
      panel.append(closedDetails)

      summary.focus()
      fireEvent.keyDown(summary, { key: 'Tab' })
      expect(document.activeElement).toBe(first)

      fireEvent.keyDown(first, { key: 'Tab', shiftKey: true })
      expect(document.activeElement).toBe(summary)

      fireEvent.click(screen.getByRole('button', { name: 'Chiudi Harness Lab' }))
      expect(useLab.getState().lab).toBeNull()
      expect(document.activeElement).toBe(previous)
    } finally {
      previous.remove()
      previouslyFocused?.focus()
    }
  })

  it('closes the drawer with Escape', () => {
    render(<LabsDrawer />)
    fireEvent.keyDown(screen.getByRole('button', { name: 'Chiudi Harness Lab' }), { key: 'Escape' })
    expect(useLab.getState().lab).toBeNull()
  })
})
