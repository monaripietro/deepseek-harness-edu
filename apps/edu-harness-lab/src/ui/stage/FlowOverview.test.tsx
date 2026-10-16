import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { configForLevel } from '../../harness/levels'
import { bus, useLab } from '../../state/store'
import { FlowOverview } from './FlowOverview'
import { useStageUi } from './stageUi'

vi.mock('./NodeDetails', () => ({ NodeDetails: () => null }))

const originalLab = useLab.getState()
const originalStageUi = useStageUi.getState()

beforeEach(() => {
  useLab.setState({ ...originalLab, config: configForLevel(0), events: [], status: 'idle', view: 'guided' }, true)
  useStageUi.setState({ ...originalStageUi, selected: null }, true)
})

afterEach(() => {
  cleanup()
  bus.clear()
  useLab.setState(originalLab, true)
  useStageUi.setState(originalStageUi, true)
})

describe('readable request flow', () => {
  it('starts with four request steps and no inactive harness components', () => {
    render(<FlowOverview onApprovalDetails={vi.fn()} />)
    expect(screen.getByRole('list', { name: 'Flusso principale della richiesta' }).children).toHaveLength(4)
    expect(screen.getByText('Da caricare per iniziare')).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Informazioni aggiunte al contesto' })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Esecuzione delle azioni' })).toBeNull()
    expect(screen.queryByText('Personalizza gli strati dell\'harness')).toBeNull()
  })

  it('shows only the information sources enabled for the current level', () => {
    useLab.setState({ config: configForLevel(3) })
    render(<FlowOverview onApprovalDetails={vi.fn()} />)
    for (const title of ['Istruzioni', 'Dati del compito', 'Memoria']) {
      expect(screen.getByRole('button', { name: `${title}. Apri i dettagli` })).toBeTruthy()
    }
    expect(screen.queryByRole('button', { name: 'Documenti · RAG. Apri i dettagli' })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Esecuzione delle azioni' })).toBeNull()
  })

  it('distinguishes model output from harness actions, supervision and the return path', () => {
    useLab.setState({ config: configForLevel(9) })
    render(<FlowOverview onApprovalDetails={vi.fn()} />)
    for (const title of ['Orchestratore', 'Strumenti']) {
      expect(screen.getByRole('button', { name: `${title}. Apri i dettagli` })).toBeTruthy()
    }
    const summary = screen.getByText('Controlli e collegamenti (3)')
    expect(summary.closest('details')?.open).toBe(false)
    fireEvent.click(summary)
    expect(summary.closest('details')?.open).toBe(true)
    for (const title of ['Controlli', 'Supervisione umana', 'Server MCP']) {
      expect(screen.getByRole('button', { name: `${title}. Apri i dettagli` })).toBeTruthy()
    }
    expect(screen.getByText('Il risultato rientra nel contesto. Il ciclo si ripete se serve.')).toBeTruthy()
    expect(screen.getByText('Calcoli reali; dati e azioni aziendali simulati.')).toBeTruthy()
  })

  it('records the active request path without inactive future layers', () => {
    useLab.setState({ config: configForLevel(9) })
    const { container } = render(<FlowOverview onApprovalDetails={vi.fn()} />)
    expect(Array.from(container.querySelectorAll('[data-node]')).map(node => ({
      node: node.getAttribute('data-node'),
      label: node.getAttribute('aria-label'),
    }))).toMatchInlineSnapshot(`
      [
        {
          "label": "La richiesta. Apri i dettagli",
          "node": "question",
        },
        {
          "label": "Il contesto. Apri i dettagli",
          "node": "window",
        },
        {
          "label": "Il modello. Apri i dettagli",
          "node": "model",
        },
        {
          "label": "La risposta. Apri i dettagli",
          "node": "answer",
        },
        {
          "label": "Istruzioni. Apri i dettagli",
          "node": "instructions",
        },
        {
          "label": "Dati del compito. Apri i dettagli",
          "node": "context",
        },
        {
          "label": "Memoria. Apri i dettagli",
          "node": "memory",
        },
        {
          "label": "Documenti · RAG. Apri i dettagli",
          "node": "rag",
        },
        {
          "label": "Orchestratore. Apri i dettagli",
          "node": "orchestrator",
        },
        {
          "label": "Strumenti. Apri i dettagli",
          "node": "tools",
        },
        {
          "label": "Controlli. Apri i dettagli",
          "node": "controls",
        },
        {
          "label": "Supervisione umana. Apri i dettagli",
          "node": "human",
        },
        {
          "label": "Server MCP. Apri i dettagli",
          "node": "mcp",
        },
      ]
    `)
  })

  it('selects and deselects the same detail node without changing the harness', () => {
    render(<FlowOverview onApprovalDetails={vi.fn()} />)
    const model = screen.getByRole('button', { name: 'Il modello. Apri i dettagli' })
    fireEvent.click(model)
    expect(model.getAttribute('aria-pressed')).toBe('true')
    expect(useStageUi.getState().selected).toBe('model')
    expect(useLab.getState().config).toEqual(configForLevel(0))
    fireEvent.click(model)
    expect(model.getAttribute('aria-pressed')).toBe('false')
    expect(useStageUi.getState().selected).toBeNull()
  })

  it('keeps composition controls optional and applies changes through the existing store', () => {
    useLab.setState({ view: 'lab' })
    render(<FlowOverview onApprovalDetails={vi.fn()} />)
    const summary = screen.getByText('Personalizza gli strati dell\'harness')
    const disclosure = summary.closest('details')
    expect(disclosure?.open).toBe(false)
    fireEvent.click(summary)
    const instructions = screen.getByRole('switch', { name: 'Istruzioni di sistema' })
    expect(instructions.getAttribute('aria-checked')).toBe('false')
    fireEvent.click(instructions)
    expect(instructions.getAttribute('aria-checked')).toBe('true')
    expect(useLab.getState().config.components.instructions).toBe(true)
  })

  it('prevents composition changes during a run or a pending approval', () => {
    useLab.setState({ view: 'lab', status: 'awaitingApproval', config: configForLevel(9) })
    render(<FlowOverview onApprovalDetails={vi.fn()} />)
    fireEvent.click(screen.getByText('Personalizza gli strati dell\'harness'))
    const switches = screen.getAllByRole('switch')
    expect(switches).toHaveLength(10)
    expect(switches.every(control => control.hasAttribute('disabled'))).toBe(true)
  })
})
