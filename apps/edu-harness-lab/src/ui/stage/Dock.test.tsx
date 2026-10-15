import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Dock } from './Dock'

const dockRequestListeners = vi.hoisted(() => new Set<(tab: 'context' | 'trace' | 'conversation') => void>())

vi.mock('./cards', () => ({
  onDockRequest: (listener: (tab: 'context' | 'trace' | 'conversation') => void) => {
    dockRequestListeners.add(listener)
    return () => {
      dockRequestListeners.delete(listener)
    }
  },
}))

vi.mock('../chat/ChatPanel', () => ({
  ChatPanel: () => <div>Dettaglio della conversazione</div>,
}))

vi.mock('../inspector/ContextInspector', () => ({
  ContextInspector: () => <div>Dettaglio del contesto</div>,
}))

vi.mock('../trace/AgentTrace', () => ({
  AgentTrace: () => <div>Dettaglio del registro</div>,
}))

afterEach(() => {
  cleanup()
  expect(dockRequestListeners.size).toBe(0)
  dockRequestListeners.clear()
  vi.unstubAllGlobals()
})

describe('Dock', () => {
  it('resta chiuso finché non viene richiesto, poi apre una finestra con le tre schede', () => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0)
      return 0
    })

    render(<Dock />)
    expect(screen.queryByRole('dialog')).toBeNull()

    act(() => {
      for (const request of dockRequestListeners) request('context')
    })

    const dialog = screen.getByRole('dialog', { name: 'Approfondimenti' })
    const panel = dialog.querySelector<HTMLElement>('#dock-panel')
    if (!panel) throw new Error('Il pannello Dock non è presente')
    expect(panel.getAttribute('aria-labelledby')).toBe('dock-tab-context')
    expect(screen.getByText('Dettaglio del contesto')).toBeTruthy()

    const traceTab = screen.getByRole('tab', { name: 'Registro degli eventi' })
    const conversationTab = screen.getByRole('tab', { name: 'Conversazione e verifiche' })
    fireEvent.click(traceTab)
    expect(traceTab.getAttribute('aria-selected')).toBe('true')
    expect(panel.getAttribute('aria-labelledby')).toBe('dock-tab-trace')
    expect(screen.getByText('Dettaglio del registro')).toBeTruthy()

    traceTab.focus()
    fireEvent.keyDown(traceTab, { key: 'ArrowRight' })
    expect(conversationTab.getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(conversationTab)
    expect(screen.getByText('Dettaglio della conversazione')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Chiudi' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('apre la scheda richiesta dalla fase', () => {
    vi.stubGlobal('requestAnimationFrame', () => 0)
    render(<Dock />)

    act(() => {
      for (const request of dockRequestListeners) request('trace')
    })

    const panel = screen.getByRole('dialog', { name: 'Approfondimenti' }).querySelector<HTMLElement>('#dock-panel')
    expect(panel?.getAttribute('aria-labelledby')).toBe('dock-tab-trace')
    expect(screen.getByRole('tab', { name: 'Registro degli eventi' }).getAttribute('aria-selected')).toBe('true')
  })
})
