import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { ModelInfo, RunRecord } from '../../domain/types'
import { EXPERIMENT } from '../../harness/levels'
import { DEFAULT_SCENARIO_ID } from '../../scenarios'
import { useLab } from '../../state/store'
import type { ComparisonRow } from '../../state/store'
import { NOT_LOADED_INFO } from '../../runtime/model/profiles'
import { ComparisonMatrix } from './ComparisonMatrix'
import { ComparisonView } from './ComparisonView'

const REAL_MODEL: ModelInfo = {
  ...NOT_LOADED_INFO,
  profile: 'lfm-350m',
  id: 'test/real-model',
  label: 'Modello reale di test',
  backend: 'wasm',
  fingerprint: 'TEST',
  provenance: { ...NOT_LOADED_INFO.provenance, provenance: 'real', locality: 'local' },
}

const runExperiment = vi.fn(() => Promise.resolve())

const at = <T,>(items: readonly T[], index: number): T => {
  const item = items[index]
  if (item === undefined) throw new Error(`missing item ${index}`)
  return item
}
const initialState = useLab.getState()

function makeRecord(key: string, label: string, passed = true): RunRecord {
  return {
    id: `run-${key}`,
    scenarioId: DEFAULT_SCENARIO_ID,
    configKey: key,
    configLabel: label,
    input: 'Richiesta di test',
    answer: 'Risposta di test',
    startedAt: '2026-10-14T08:00:00.000Z',
    durationMs: 1000,
    steps: 2,
    toolCalls: [],
    sourcesUsed: [],
    memoryUsed: [],
    errors: [],
    humanInterventions: 0,
    actions: [],
    stopReason: 'final_answer',
    checks: [{ id: 'check-request', label: 'La richiesta è soddisfatta', passed }],
    modelInfo: REAL_MODEL,
    modelProvenance: REAL_MODEL.provenance,
  }
}

function pendingRows(): ComparisonRow[] {
  return EXPERIMENT.map(({ key, label, short }) => ({ key, label, short, status: 'pending' }))
}

describe('ComparisonView', () => {
  beforeEach(() => {
    runExperiment.mockReset()
    useLab.setState({
      comparison: [],
      comparing: false,
      scenarioId: DEFAULT_SCENARIO_ID,
      modelInfo: NOT_LOADED_INFO,
      loadProgress: { phase: 'idle', loadedBytes: 0, totalBytes: 0 },
      runExperiment,
    })
  })

  afterEach(() => {
    cleanup()
    runExperiment.mockReset()
    useLab.setState(initialState, true)
    expect(useLab.getState()).toBe(initialState)
    expect(document.body.innerHTML).toBe('')
  })

  it('separates model readiness from the experiment and keeps the real run action available', () => {
    render(<ComparisonView />)

    expect(screen.getByRole('status', { name: 'Stato del modello' }).textContent).toContain('Nessun modello reale caricato')
    expect(screen.getByRole('status', { name: 'Stato dell’esperimento' }).textContent).toBe('Non ancora avviato.')
    expect(screen.getByText('Le risposte usano il modello reale caricato. Le azioni sui sistemi aziendali sono simulate e non modificano sistemi reali.')).toBeTruthy()

    const run = screen.getByRole('button', { name: 'Avvia il confronto' }) as HTMLButtonElement
    expect(run.disabled).toBe(false)
    fireEvent.click(run)
    expect(runExperiment).toHaveBeenCalledTimes(1)
  })

  it('disables the primary action while the comparison is running', () => {
    const rows = pendingRows()
    rows[0] = { ...at(rows, 0), status: 'running' }
    useLab.setState({ comparison: rows, comparing: true, modelInfo: REAL_MODEL })

    render(<ComparisonView />)

    const run = screen.getByRole('button', { name: 'Confronto in corso…' }) as HTMLButtonElement
    expect(run.disabled).toBe(true)
    expect(run.getAttribute('aria-busy')).toBe('true')
    expect(screen.getByRole('status', { name: 'Stato dell’esperimento' }).textContent).toContain(`${at(rows, 0).label}: in corso`)
  })

  it('filters only the configuration cards and leaves all result columns available', () => {
    const rows = pendingRows()
    const first = at(rows, 0)
    rows[0] = { ...first, status: 'done', record: makeRecord(first.key, first.label) }
    useLab.setState({ comparison: rows, modelInfo: REAL_MODEL, loadProgress: { phase: 'ready', loadedBytes: 1, totalBytes: 1 } })

    render(<ComparisonView />)

    fireEvent.click(screen.getByText('Opzioni di visualizzazione'))
    const filter = screen.getByRole('switch', { name: 'Mostra solo le cinque configurazioni chiave nelle schede' })
    fireEvent.click(filter)
    expect(filter.getAttribute('aria-checked')).toBe('true')

    const excluded = EXPERIMENT.find(({ key }) => !new Set(['c01', 'c02', 'c05', 'c07', 'c10']).has(key))
    if (!excluded) throw new Error('missing excluded configuration')
    expect(screen.queryByRole('region', { name: excluded.label })).toBeNull()

    const table = screen.getByRole('table', { name: 'Risultati per configurazione' })
    const headers = within(table).getAllByRole('columnheader')
    expect(headers).toHaveLength(EXPERIMENT.length + 1)
    expect(headers[0]?.textContent).toBe('Indicatore')
  })

  it('keeps the result area and all configuration cards available before the first run', () => {
    render(<ComparisonView />)

    expect(screen.getByRole('region', { name: 'Risultati per configurazione' })).toBeTruthy()
    expect(screen.getByText(/I risultati comparativi appariranno qui dopo la prima esecuzione/)).toBeTruthy()
    expect(screen.getByRole('region', { name: at(EXPERIMENT, 0).label })).toBeTruthy()
    expect(screen.getAllByRole('region', { name: /Schede delle configurazioni/ })).toHaveLength(1)
  })
})

describe('ComparisonMatrix', () => {
  it('distinguishes waiting, running, errors, and recorded check results', () => {
    const configs = EXPERIMENT.slice(0, 5)
    const rows: ComparisonRow[] = [
      { ...at(configs, 0), status: 'pending' },
      { ...at(configs, 1), status: 'running' },
      { ...at(configs, 2), status: 'error', error: 'Errore di test' },
      { ...at(configs, 3), status: 'done', record: makeRecord(at(configs, 3).key, at(configs, 3).label, true) },
      { ...at(configs, 4), status: 'done', record: makeRecord(at(configs, 4).key, at(configs, 4).label, false) },
    ]

    render(<ComparisonMatrix rows={rows} />)

    const table = screen.getByRole('table', { name: 'Risultati per configurazione' })
    const statusRow = within(table).getByRole('row', { name: /Stato dell’esecuzione/ })
    expect(within(statusRow).getByRole('cell', { name: `${at(rows, 0).label}: in attesa` })).toBeTruthy()
    expect(within(statusRow).getByRole('cell', { name: `${at(rows, 1).label}: in corso` })).toBeTruthy()
    expect(within(statusRow).getByRole('cell', { name: `${at(rows, 2).label}: errore` })).toBeTruthy()
    expect(within(statusRow).getByRole('cell', { name: `${at(rows, 3).label}: completata` })).toBeTruthy()

    const checkRow = within(table).getByRole('row', { name: /La richiesta è soddisfatta/ })
    expect(within(checkRow).getByRole('cell', { name: `${at(rows, 3).label}: superato` })).toBeTruthy()
    expect(within(checkRow).getByRole('cell', { name: `${at(rows, 4).label}: non superato` })).toBeTruthy()

    const scrollRegion = screen.getByRole('region', { name: /Tabella dei risultati/ })
    expect(scrollRegion.tabIndex).toBe(0)
  })

  it('reports failed executions instead of presenting their results as pending', () => {
    const config = at(EXPERIMENT, 0)
    render(<ComparisonMatrix rows={[{ ...config, status: 'error', error: 'Errore di test' }]} />)

    expect(screen.getByText(/Nessun risultato disponibile/)).toBeTruthy()
    expect(screen.queryByText(/appariranno qui dopo la prima esecuzione/)).toBeNull()
  })
})
