import { motion } from 'motion/react'
import { AlertCircle, Check, Clock, Loader2, X } from 'lucide-react'
import type { ComparisonRow } from '../../state/store'
import styles from './ComparisonMatrix.module.css'

type ResultState = 'pending' | 'running' | 'error' | 'pass' | 'fail'

const STATUS_LABEL = {
  pending: 'In attesa',
  running: 'In corso',
  error: 'Errore',
  done: 'Completata',
} as const

const RESULT_LABEL: Record<ResultState, string> = {
  pending: 'in attesa',
  running: 'in corso',
  error: 'errore',
  pass: 'superato',
  fail: 'non superato',
}

function resultState(row: ComparisonRow, checkId: string): ResultState {
  if (row.status === 'error') return 'error'
  if (row.status === 'running') return 'running'
  if (!row.record) return 'pending'
  return row.record.checks.find(check => check.id === checkId)?.passed ? 'pass' : 'fail'
}

function StatusIcon({ status }: { status: ComparisonRow['status'] }) {
  if (status === 'pending') return <Clock size={13} aria-hidden />
  if (status === 'running') return <Loader2 size={13} className={styles.spin} aria-hidden />
  if (status === 'error') return <AlertCircle size={13} aria-hidden />
  return <Check size={13} aria-hidden />
}

function ResultIcon({ state }: { state: ResultState }) {
  if (state === 'pending') return <Clock size={13} aria-hidden />
  if (state === 'running') return <Loader2 size={13} className={styles.spin} aria-hidden />
  if (state === 'error') return <AlertCircle size={13} aria-hidden />
  if (state === 'pass') return <Check size={15} strokeWidth={3} aria-hidden />
  return <X size={13} strokeWidth={3} aria-hidden />
}

/**
 * Renders execution status and recorded metrics for each harness configuration.
 * @param rows Comparison rows supplied by the lab store.
 * @returns The comparison table or its pre-result message.
 */
export function ComparisonMatrix({ rows }: { rows: ComparisonRow[] }) {
  const first = rows.find(r => r.record?.checks.length)?.record
  const checks = first?.checks.map(c => ({ id: c.id, label: c.label })) ?? []
  const maxSteps = Math.max(1, ...rows.map(r => r.record?.steps ?? 0))
  const hasRecords = rows.some(r => r.record)
  const hasErrors = rows.some(r => r.status === 'error')
  const hasRunning = rows.some(r => r.status === 'running')
  const emptyMessage = hasRecords
    ? 'Le esecuzioni sono disponibili, ma non ci sono indicatori comparativi da mostrare.'
    : hasRunning
      ? 'La tabella si aggiornerà quando sarà disponibile il primo risultato. Lo stato delle configurazioni resta visibile nelle schede.'
      : hasErrors
        ? 'Nessun risultato disponibile. Apri le schede delle configurazioni con errore per leggerne i dettagli.'
        : 'I risultati comparativi appariranno qui dopo la prima esecuzione. Le dieci configurazioni sono già disponibili nelle schede sotto.'

  return (
    <section className={styles.wrap} aria-labelledby="comparison-results-title">
      <h3 id="comparison-results-title" className={styles.title}>Risultati per configurazione</h3>
      <p className={styles.sub}>
        Ogni colonna è una configurazione. La tabella distingue lo stato dell’esecuzione dagli indicatori e dai dati raccolti.
      </p>
      {checks.length === 0 ? (
        <p className={styles.empty}>{emptyMessage}</p>
      ) : (
        <div className={styles.tableScroll} role="region" aria-label="Tabella dei risultati; scorri orizzontalmente per tutte le configurazioni" tabIndex={0}>
          <div
            className={styles.grid}
            style={{
              gridTemplateColumns: `minmax(220px, 1.4fr) repeat(${rows.length}, minmax(64px, 1fr))`,
              minWidth: `${220 + rows.length * 64}px`,
            }}
            role="table"
            aria-labelledby="comparison-results-title"
            aria-colcount={rows.length + 1}
          >
            <div role="row" className={styles.headRow}>
              <span role="columnheader" className={styles.indicatorHead}>Indicatore</span>
              {rows.map((r, i) => (
                <span role="columnheader" key={r.key} className={styles.colHead}>
                  <strong>{i + 1}</strong>
                  <em>{r.short}</em>
                </span>
              ))}
            </div>
            <div role="row" className={styles.row}>
              <span role="rowheader" className={styles.rowHead}>Stato dell’esecuzione</span>
              {rows.map(r => (
                <span role="cell" key={r.key} className={styles.cell} aria-label={`${r.label}: ${STATUS_LABEL[r.status].toLowerCase()}`}>
                  <span className={`${styles.dot} ${styles[r.status === 'done' ? 'pass' : r.status]}`}>
                    <StatusIcon status={r.status} />
                  </span>
                  <small className={styles.stateText}>{STATUS_LABEL[r.status]}</small>
                </span>
              ))}
            </div>
            {checks.map((c, ci) => (
              <div role="row" key={c.id} className={styles.row}>
                <span role="rowheader" className={styles.rowHead}>{c.label}</span>
                {rows.map((r, i) => {
                  const state = resultState(r, c.id)
                  return (
                    <span role="cell" key={r.key} className={styles.cell} aria-label={`${r.label}: ${RESULT_LABEL[state]}`}>
                      <motion.span
                        className={`${styles.dot} ${styles[state]}`}
                        initial={false}
                        animate={{ scale: state === 'pass' ? [0.6, 1.15, 1] : 1 }}
                        transition={{ delay: i * 0.05 + ci * 0.03, duration: 0.45 }}
                      >
                        <ResultIcon state={state} />
                      </motion.span>
                    </span>
                  )
                })}
              </div>
            ))}
            <div role="row" className={styles.row}>
              <span role="rowheader" className={styles.rowHead}>Passi del ciclo</span>
              {rows.map(r => (
                <span role="cell" key={r.key} className={styles.cell} aria-label={`${r.label}: ${r.record ? `${r.record.steps} passi` : 'nessun risultato'}`}>
                  {r.record && (
                    <span className={styles.barTrack} aria-hidden>
                      <motion.span className={styles.bar} initial={false} animate={{ scaleY: r.record.steps / maxSteps }} />
                    </span>
                  )}
                  <small>{r.record?.steps ?? '–'}</small>
                </span>
              ))}
            </div>
            <div role="row" className={styles.row}>
              <span role="rowheader" className={styles.rowHead}>Strumenti usati</span>
              {rows.map(r => (
                <span role="cell" key={r.key} className={styles.cell} aria-label={`${r.label}: ${r.record ? `${r.record.toolCalls.length} strumenti` : 'nessun risultato'}`}>
                  <small className={styles.num}>{r.record ? r.record.toolCalls.length : '–'}</small>
                </span>
              ))}
            </div>
            <div role="row" className={styles.row}>
              <span role="rowheader" className={styles.rowHead}>Interventi umani</span>
              {rows.map(r => (
                <span role="cell" key={r.key} className={styles.cell} aria-label={`${r.label}: ${r.record ? `${r.record.humanInterventions} interventi umani` : 'nessun risultato'}`}>
                  <small className={styles.num}>{r.record ? r.record.humanInterventions : '–'}</small>
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
