import { motion } from 'motion/react'
import { AlertCircle, Check, Clock, Loader2, X } from 'lucide-react'
import type { ComparisonRow } from '../../state/store'
import { biRecord, useT } from '../../i18n'
import styles from './ComparisonMatrix.module.css'

type ResultState = 'pending' | 'running' | 'error' | 'pass' | 'fail'

const STATUS_LABEL = biRecord<ComparisonRow['status']>({
  pending: ['In attesa', 'Waiting'],
  running: ['In corso', 'Running'],
  error: ['Errore', 'Error'],
  done: ['Completata', 'Completed'],
})

const RESULT_LABEL = biRecord<ResultState>({
  pending: ['in attesa', 'waiting'],
  running: ['in corso', 'running'],
  error: ['errore', 'error'],
  pass: ['superato', 'passed'],
  fail: ['non superato', 'not passed'],
})

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
  const t = useT()
  const first = rows.find(r => r.record?.checks.length)?.record
  const checks = first?.checks.map(c => ({ id: c.id, label: c.label })) ?? []
  const maxSteps = Math.max(1, ...rows.map(r => r.record?.steps ?? 0))
  const hasRecords = rows.some(r => r.record)
  const hasErrors = rows.some(r => r.status === 'error')
  const hasRunning = rows.some(r => r.status === 'running')
  const emptyMessage = hasRecords
    ? t(
      'Le esecuzioni sono disponibili, ma non ci sono indicatori comparativi da mostrare.',
      'The runs are available, but there are no comparison indicators to show.',
    )
    : hasRunning
      ? t(
        'La tabella si aggiornerà quando sarà disponibile il primo risultato. Lo stato delle configurazioni resta visibile nelle schede.',
        'The table will update when the first result is available. The status of each configuration stays visible in the cards.',
      )
      : hasErrors
        ? t(
          'Nessun risultato disponibile. Apri le schede delle configurazioni con errore per leggerne i dettagli.',
          'No result available. Open the cards of the configurations with errors to read the details.',
        )
        : t(
          'I risultati comparativi appariranno qui dopo la prima esecuzione. Le dieci configurazioni sono già disponibili nelle schede sotto.',
          'Comparison results will appear here after the first run. The ten configurations are already available in the cards below.',
        )
  const steps = (n: number) => t(`${n} passi`, `${n} steps`)
  const tools = (n: number) => t(`${n} strumenti`, `${n} tools`)
  const humanInterventions = (n: number) => t(`${n} interventi umani`, `${n} human interventions`)
  const noResult = t('nessun risultato', 'no result')

  return (
    <section className={styles.wrap} aria-labelledby="comparison-results-title">
      <h3 id="comparison-results-title" className={styles.title}>{t('Risultati per configurazione', 'Results by configuration')}</h3>
      <p className={styles.sub}>
        {t(
          'Ogni colonna è una configurazione. La tabella distingue lo stato dell’esecuzione dagli indicatori e dai dati raccolti.',
          'Each column is a configuration. The table separates the state of the run from the indicators and the data collected.',
        )}
      </p>
      {checks.length === 0 ? (
        <p className={styles.empty}>{emptyMessage}</p>
      ) : (
        <div className={styles.tableScroll} role="region" aria-label={t('Tabella dei risultati; scorri orizzontalmente per tutte le configurazioni', 'Results table; scroll horizontally to see all configurations')} tabIndex={0}>
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
              <span role="columnheader" className={styles.indicatorHead}>{t('Indicatore', 'Indicator')}</span>
              {rows.map((r, i) => (
                <span role="columnheader" key={r.key} className={styles.colHead}>
                  <strong>{i + 1}</strong>
                  <em>{r.short}</em>
                </span>
              ))}
            </div>
            <div role="row" className={styles.row}>
              <span role="rowheader" className={styles.rowHead}>{t('Stato dell’esecuzione', 'Run status')}</span>
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
              <span role="rowheader" className={styles.rowHead}>{t('Passi del ciclo', 'Loop steps')}</span>
              {rows.map(r => (
                <span role="cell" key={r.key} className={styles.cell} aria-label={`${r.label}: ${r.record ? steps(r.record.steps) : noResult}`}>
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
              <span role="rowheader" className={styles.rowHead}>{t('Strumenti usati', 'Tools used')}</span>
              {rows.map(r => (
                <span role="cell" key={r.key} className={styles.cell} aria-label={`${r.label}: ${r.record ? tools(r.record.toolCalls.length) : noResult}`}>
                  <small className={styles.num}>{r.record ? r.record.toolCalls.length : '–'}</small>
                </span>
              ))}
            </div>
            <div role="row" className={styles.row}>
              <span role="rowheader" className={styles.rowHead}>{t('Interventi umani', 'Human interventions')}</span>
              {rows.map(r => (
                <span role="cell" key={r.key} className={styles.cell} aria-label={`${r.label}: ${r.record ? humanInterventions(r.record.humanInterventions) : noResult}`}>
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
