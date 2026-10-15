import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { REAL_LOCAL } from '../../domain/types'
import type { ComponentId, TraceEventBase, TraceEventBody } from '../../domain/types'
import { LEVELS } from '../../harness/levels'
import { useLab } from '../../state/store'
import type { LabState } from '../../state/store'
import { Narration } from './Narration'

let originalState: Pick<LabState, 'events' | 'level' | 'status' | 'scenarioId'> = {
  events: useLab.getState().events,
  level: useLab.getState().level,
  status: useLab.getState().status,
  scenarioId: useLab.getState().scenarioId,
}
let originalBodyNodes = Array.from(document.body.childNodes)

function traceEvent<B extends TraceEventBody>(seq: number, body: B, runId = 'harness'): TraceEventBase & B {
  return {
    ...body,
    id: `event-${seq}`,
    seq,
    at: seq,
    runId,
    source: 'ui',
    provenance: REAL_LOCAL,
  }
}

function mountedEvents(components: ComponentId[]) {
  return components.map((component, index) =>
    traceEvent(index + 1, { type: 'harness/plugin-mounted', component }),
  )
}

beforeEach(() => {
  const { events, level, status, scenarioId } = useLab.getState()
  originalState = { events, level, status, scenarioId }
  originalBodyNodes = Array.from(document.body.childNodes)
})

afterEach(() => {
  cleanup()
  useLab.setState(originalState)
  expect(useLab.getState().events).toBe(originalState.events)
  expect(useLab.getState().level).toBe(originalState.level)
  expect(useLab.getState().status).toBe(originalState.status)
  const bodyNodes = Array.from(document.body.childNodes)
  expect(bodyNodes).toHaveLength(originalBodyNodes.length)
  expect(bodyNodes.every((node, index) => node === originalBodyNodes[index])).toBe(true)
})

describe('Narration', () => {
  it('keeps the latest event visible and opens counted history on request', () => {
    useLab.setState({
      events: [
        traceEvent(1, { type: 'harness/plugin-mounted', component: 'instructions' }),
        traceEvent(2, { type: 'harness/plugin-unmounted', component: 'instructions' }),
        traceEvent(3, { type: 'harness/plugin-mounted', component: 'context' }),
      ],
      status: 'running',
    })

    render(<Narration />)

    expect(screen.getByRole('status', { name: 'in diretta' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Evento corrente' }).textContent).toContain(
      '+ Contesto del compito: aggiunto all’harness.',
    )

    const toggle = screen.getByRole('button', { name: 'Storico 2 eventi precedenti' })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('list', { name: 'Eventi precedenti' })).toBeNull()

    fireEvent.click(toggle)

    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('list', { name: 'Eventi precedenti' }).tabIndex).toBe(0)
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByRole('region', { name: 'Evento corrente' })).toBeTruthy()
  })

  it('follows new history only while the reader stays at the bottom', () => {
    const events = [
      traceEvent(1, { type: 'harness/plugin-mounted', component: 'instructions' }),
      traceEvent(2, { type: 'harness/plugin-unmounted', component: 'instructions' }),
      traceEvent(3, { type: 'harness/plugin-mounted', component: 'context' }),
    ]
    useLab.setState({ events })
    render(<Narration />)
    fireEvent.click(screen.getByRole('button', { name: 'Storico 2 eventi precedenti' }))
    const list = screen.getByRole('list', { name: 'Eventi precedenti' })
    Object.defineProperties(list, { scrollHeight: { value: 600 }, clientHeight: { value: 120 } })

    list.scrollTop = 480
    fireEvent.scroll(list)
    act(() =>{  useLab.setState({ events: [...events, traceEvent(4, { type: 'harness/plugin-unmounted', component: 'context' })] }) })
    expect(list.scrollTop).toBe(600)

    list.scrollTop = 40
    fireEvent.scroll(list)
    act(() =>{  useLab.setState({ events: [...useLab.getState().events, traceEvent(5, { type: 'harness/plugin-mounted', component: 'memory' })] }) })
    expect(list.scrollTop).toBe(40)
  })

  it('labels narration as harness events and gives reflection-specific guidance', () => {
    useLab.setState({ scenarioId: 'ragionamento-iterativo', level: 7 })
    render(<Narration />)
    expect(screen.getByText(/Eventi dell’harness, non pensieri del modello/)).toBeTruthy()
    expect(screen.getByText('Focus dello scenario · Riflessione iterativa')).toBeTruthy()
    expect(screen.queryByText(/Più strumenti/)).toBeNull()
  })

  it('combines consecutive harness additions into one current event', () => {
    useLab.setState({
      events: mountedEvents(['instructions', 'context', 'memory', 'rag', 'tools', 'orchestrator']),
    })

    render(<Narration />)

    const current = screen.getByRole('region', { name: 'Evento corrente' })
    expect(current.textContent).toContain(
      'Istruzioni di sistema, Contesto del compito, Memoria, Conoscenza (RAG), Strumenti e Orchestratore',
    )
    expect(current.textContent.match(/Il modello resta invariato\./g)).toHaveLength(1)
    expect(screen.queryByRole('list')).toBeNull()
  })

  it('reveals the selected level guidance on request and keeps event terms beside their explanation', () => {
    const level = LEVELS[4]
    if (!level) throw new Error('Level 5 definition not found')
    useLab.setState({
      level: level.id,
      events: [traceEvent(1, { type: 'rag/query', query: 'policy', mode: 'deterministic' })],
    })

    render(<Narration />)

    const currentText = screen.getByRole('region', { name: 'Evento corrente' }).textContent
    expect(currentText.indexOf('Il retriever cerca')).toBeLessThan(currentText.indexOf('retrieval'))

    const summary = screen.getByText(`Focus del livello · ${level.title}`)
    const details = summary.closest('details')
    expect(details?.open).toBe(false)
    fireEvent.click(summary)

    const guidance = details?.textContent ?? ''
    expect(details?.open).toBe(true)
    expect(guidance).toContain(level.phenomenon)
    expect(guidance.indexOf(level.phenomenon)).toBeLessThan(guidance.indexOf(level.term))
    expect(guidance.indexOf(level.term)).toBeLessThan(guidance.indexOf(level.message))
  })

  it('keeps the collapsed toggle and live indicator', () => {
    let toggleCalls = 0
    useLab.setState({ events: mountedEvents(['memory']), status: 'running' })

    render(<Narration collapsed onToggle={() => toggleCalls++} />)

    fireEvent.click(screen.getByRole('button', { name: 'Apri il racconto' }))

    expect(toggleCalls).toBe(1)
    expect(screen.getByLabelText('in diretta')).toBeTruthy()
  })

  it('gives brief empty-state orientation without exposing model reasoning', () => {
    render(<Narration />)

    expect(screen.getByText(/Avvia una prova per seguire gli eventi osservabili dell’harness/)).toBeTruthy()
    expect(screen.getByText(/Il ragionamento interno del modello non viene mostrato/)).toBeTruthy()
  })
})
