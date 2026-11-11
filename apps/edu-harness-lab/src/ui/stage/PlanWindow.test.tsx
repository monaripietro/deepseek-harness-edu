import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { TraceEvent } from '../../domain/types'
import { useUiLang } from '../../i18n'
import { deriveStage } from './deriveStage'
import { PlanWindow, usePlanWindowUi } from './PlanWindow'

const P = { provenance: 'real', locality: 'local' }
let seq = 0
const ev = (body: Record<string, unknown>) => ({ ...body, id: `e${++seq}`, seq, at: 0, runId: 'r1', source: 'orchestrator', provenance: P }) as unknown as TraceEvent

const start = () => ev({ type: 'run/start', input: 'Q', configKey: 'k', configLabel: 'x', scenarioId: 's', model: {} })
const plan = (callId: string, piano: string, motivo?: string, summary = 'Piano registrato') => [
  ev({ type: 'tool/call', callId, tool: 'pianifica', args: { piano, ...(motivo ? { motivo } : {}) } }),
  ev({ type: 'tool/result', callId, tool: 'pianifica', outcome: { ok: true, data: { piano }, summary }, durationMs: 1 }),
]
const call = (callId: string, tool: string, ok = true) => [
  ev({ type: 'tool/call', callId, tool, args: { x: callId } }),
  ev({ type: 'tool/result', callId, tool, outcome: ok ? { ok: true, data: 1, summary: 'ok' } : { ok: false, message: 'ko' }, durationMs: 1 }),
]

const PLAN1 = '1) cerca_catalogo: trova il prodotto 2) calcolatrice: calcola il margine 3) answer: rispondi'
const PLAN2 = '1) cerca_catalogo: trova il prodotto 2) calcolatrice: calcola il margine 3) leggi_documento: verifica 4) answer: rispondi'

describe('deriveStage plan', () => {
  it('first call creates version 1', () => {
    const s = deriveStage([start(), ...plan('p1', PLAN1)], true)
    expect(s.plan?.version).toBe(1)
    expect(s.plan?.steps).toHaveLength(3)
    expect(s.plan?.previous).toBeNull()
  })

  it('an update replaces the steps, keeps the previous ones and recomputes statuses after it', () => {
    const s = deriveStage([start(), ...plan('p1', PLAN1), ...call('c1', 'cerca_catalogo'), ...plan('p2', PLAN2, 'serve un controllo'), ...call('c2', 'calcolatrice')], true)
    expect(s.plan?.version).toBe(2)
    expect(s.plan?.steps).toHaveLength(4)
    expect(s.plan?.previous).toHaveLength(3)
    expect(s.plan?.reason).toBe('serve un controllo')
    expect(s.plan?.steps.map(st => st.status)).toEqual(['pending', 'done', 'pending', 'pending'])
    expect(s.plan?.offPlan).toEqual([])
  })

  it('lists calls outside the plan', () => {
    const s = deriveStage([start(), ...plan('p1', PLAN1), ...call('c1', 'altro_strumento')], true)
    expect(s.plan?.offPlan).toEqual(['altro_strumento'])
  })
})

describe('PlanWindow', () => {
  beforeEach(() => {
    usePlanWindowUi.setState({ pos: null, w: 360, h: null, collapsed: false, closed: false })
  })
  afterEach(cleanup)

  it('renders nothing without a plan', () => {
    const { container } = render(<PlanWindow stage={deriveStage([start()], true)} />)
    expect(container.innerHTML).toBe('')
  })

  it('shows steps, collapses to the current step and can be closed and reopened', () => {
    const stage = deriveStage([start(), ...plan('p1', PLAN1), ...call('c1', 'cerca_catalogo')], true)
    render(<PlanWindow stage={stage} />)
    expect(screen.getByText('Piano del modello')).toBeTruthy()
    expect(screen.getAllByRole('listitem')).toHaveLength(3)

    const toggle = screen.getByRole('button', { name: 'Comprimi il piano' })
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(toggle)
    expect(screen.getByRole('button', { name: 'Espandi il piano' }).getAttribute('aria-expanded')).toBe('false')
    expect(screen.getByText('Passo 2/3 · calcolatrice: calcola il margine')).toBeTruthy()
    expect(screen.queryAllByRole('listitem')).toHaveLength(0)

    fireEvent.click(screen.getByRole('button', { name: 'Chiudi il piano' }))
    expect(screen.queryByText('Piano del modello')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Riapri il piano del modello' }))
    expect(screen.getByText('Piano del modello')).toBeTruthy()
  })

  it('says "Piano completato" when every step is done', () => {
    const stage = deriveStage([start(), ...plan('p1', '1) calcolatrice: calcola'), ...call('c1', 'calcolatrice')], true)
    usePlanWindowUi.setState({ collapsed: true })
    render(<PlanWindow stage={stage} />)
    expect(screen.getByText('Piano completato')).toBeTruthy()
  })

  it('flags an updated plan with its version and what changed', () => {
    const stage = deriveStage([start(), ...plan('p1', PLAN1), ...plan('p2', PLAN2, undefined, 'Piano aggiornato (versione 2)')], true)
    render(<PlanWindow stage={stage} />)
    expect(screen.getByText('v2 · aggiornato')).toBeTruthy()
    expect(screen.getByText(/1 passo aggiunto/)).toBeTruthy()
  })

  it('shows the model reason when given', () => {
    const stage = deriveStage([start(), ...plan('p1', PLAN1), ...plan('p2', PLAN2, 'serve un controllo')], true)
    render(<PlanWindow stage={stage} />)
    expect(screen.getByText('Motivo: serve un controllo')).toBeTruthy()
  })
})

describe('PlanWindow in English', () => {
  beforeEach(() => {
    useUiLang.setState({ lang: 'en' })
    usePlanWindowUi.setState({ pos: null, w: 360, h: null, collapsed: false, closed: false })
  })
  afterEach(() => {
    cleanup()
    useUiLang.setState({ lang: 'it' })
  })

  it('translates the window texts and keeps the plan itself', () => {
    const stage = deriveStage([start(), ...plan('p1', PLAN1), ...plan('p2', PLAN2, 'serve un controllo'), ...call('c1', 'cerca_catalogo')], true)
    render(<PlanWindow stage={stage} />)
    expect(screen.getByText('Model plan')).toBeTruthy()
    expect(screen.getByText('v2 · updated')).toBeTruthy()
    expect(screen.getByText('Reason: serve un controllo')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Collapse the plan' })).toBeTruthy()
    expect(screen.getAllByRole('listitem')).toHaveLength(4)
  })
})
