import { useEffect, useMemo, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { AlertCircle, Check, ChevronDown, ChevronUp, Clock, FlaskConical, Loader2, Play, Plus, X } from 'lucide-react'
import type { ComponentId } from '../../domain/types'
import { useLab } from '../../state/store'
import type { ComparisonRow } from '../../state/store'
import { COMPONENTS, COMPONENT_ORDER, EXPERIMENT } from '../../harness/levels'
import { SCENARIOS } from '../../scenarios'
import { businessLog } from '../../harness/tools/businessLog'
import { Button } from '../common/Button'
import { ProvenanceBadge } from '../common/ProvenanceBadge'
import { Switch } from '../common/Switch'
import { STOP_LABEL } from '../common/labels'
import { ComparisonMatrix } from './ComparisonMatrix'
import styles from './ComparisonView.module.css'

const ESSENTIAL = new Set(['c01', 'c02', 'c05', 'c07', 'c10'])
const MODEL_LOADING = new Set(['checking', 'downloading', 'initializing'])

type LogEntry = Record<string, unknown>
const str = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v) : '')

function experimentSummary(rows: ComparisonRow[], comparing: boolean, hasRun: boolean) {
  if (!hasRun && !comparing) return 'Non ancora avviato.'

  const completed = rows.filter(row => row.status === 'done').length
  const errors = rows.filter(row => row.status === 'error').length
  const pending = rows.filter(row => row.status === 'pending').length
  const current = rows.find(row => row.status === 'running')

  if (comparing || current) {
    const finished = completed + errors
    return `${current ? `${current.label}: in corso` : 'Confronto in corso'} · ${finished} di ${rows.length} esecuzioni terminate.`
  }

  if (completed > 0) {
    const details = [
      `${completed} configurazioni completate`,
      errors > 0 ? `${errors} con errore` : undefined,
      pending > 0 ? `${pending} in attesa` : undefined,
    ].filter(Boolean)
    return `Risultati disponibili: ${details.join(', ')}.`
  }

  return `Nessun risultato disponibile: ${errors} ${errors === 1 ? 'configurazione' : 'configurazioni'} con errore.`
}

function useBusinessLog(): LogEntry[] {
  const read = () => [...((businessLog as unknown as { list(): LogEntry[] }).list())]
  const [entries, setEntries] = useState<LogEntry[]>(read)
  useEffect(() => {
    setEntries(read())
    return (businessLog as unknown as { subscribe(cb: () => void): () => void }).subscribe(() => setEntries(read()))
  }, [])
  return entries
}

function Column({ row, prev, index }: { row: ComparisonRow; prev?: ComparisonRow; index: number }) {
  const [open, setOpen] = useState(false)
  const reduce = useReducedMotion()
  const rec = row.record
  const exp = EXPERIMENT.find(e => e.key === row.key)
  const prevExp = prev ? EXPERIMENT.find(e => e.key === prev.key) : undefined
  const added: ComponentId[] = COMPONENT_ORDER.filter(c =>
    (exp?.config.components[c] ?? false) && !(prevExp?.config.components[c] ?? false) && c !== 'model')
  const flips = useMemo(() => {
    const prevRecord = prev?.record
    if (!rec || !prevRecord) return []
    return rec.checks.flatMap((c) => {
      const before = prevRecord.checks.find(x => x.id === c.id)
      return before && before.passed !== c.passed ? [{ ...c }] : []
    })
  }, [rec, prev])
  const completed = !!rec && rec.checks.length > 0 && rec.checks.every(c => c.passed)
  const tools = rec ? [...new Set(rec.toolCalls.map(t => t.tool))] : []

  return (
    <motion.section className={`${styles.col} ${completed ? styles.colOk : ''}`} aria-label={row.label}
      initial={reduce ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: reduce ? 0 : index * 0.04 }}>
      <header className={styles.colHead}>
        <h3 className={styles.colTitle}>{row.label}</h3>
        <span className={styles.statusLine} role="status">
          {row.status === 'running' && <><Loader2 size={14} className={styles.spin} aria-hidden /> In esecuzione</>}
          {row.status === 'pending' && <><Clock size={14} aria-hidden /> In attesa di esecuzione</>}
          {row.status === 'error' && <><AlertCircle size={14} aria-hidden /> Errore nell’esecuzione</>}
          {row.status === 'done' && <><Check size={14} aria-hidden /> Esecuzione terminata</>}
        </span>
      </header>

      <div className={styles.change} aria-label="Cosa cambia">
        <div className={styles.kicker}>Cosa cambia</div>
        {added.length === 0 && !prev && <span className={styles.muted}>Punto di partenza: solo il modello.</span>}
        {added.length === 0 && prev && <span className={styles.muted}>Nessun componente nuovo.</span>}
        <div className={styles.chips}>
          {added.map(c => <span key={c} className={styles.addChip} style={{ ['--fam' as string]: `var(--c-${COMPONENTS[c].family})` }}><Plus size={12} aria-hidden />{COMPONENTS[c].label}</span>)}
        </div>
        {flips.map(f => (
          <div key={f.id} className={f.passed ? styles.flipUp : styles.flipDown}>
            {f.passed ? <Check size={13} aria-hidden /> : <X size={13} aria-hidden />} {f.passed ? 'Ora riesce' : 'Non riesce più'}: {f.label}
          </div>
        ))}
      </div>

      {row.status === 'error' && <p className={styles.errText}>{row.error}</p>}
      {rec && (
        <>
          <h4 className={styles.resultTitle}>Risultato dell’esecuzione</h4>
          <div className={`${styles.answer} ${open ? '' : styles.clamp}`}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{rec.answer || '_Nessuna risposta._'}</ReactMarkdown>
          </div>
          <button className={styles.expand} onClick={() => setOpen(!open)} aria-expanded={open}>
            {open ? <><ChevronUp size={14} aria-hidden /> Riduci</> : <><ChevronDown size={14} aria-hidden /> Espandi</>}
          </button>

          <ul className={styles.checks} aria-label="Indicatori osservabili">
            {rec.checks.map(c => (
              <li key={c.id} className={c.passed ? styles.pass : styles.fail}>
                {c.passed ? <Check size={15} aria-label="Riuscito" /> : <X size={15} aria-label="Non riuscito" />}
                <span>{c.label}</span>
              </li>
            ))}
          </ul>

          <dl className={styles.facts}>
            <dt>Passi</dt><dd>{rec.steps}</dd>
            <dt>Strumenti</dt>
            <dd>{tools.length ? <span className={styles.chips}>{tools.map(t => <code key={t} className={styles.toolChip}>{t}</code>)}</span> : '—'}</dd>
            <dt>Fonti</dt><dd>{rec.sourcesUsed.length ? rec.sourcesUsed.join(', ') : '—'}</dd>
            <dt>Interventi umani</dt><dd>{rec.humanInterventions}</dd>
            <dt>Errori</dt><dd>{rec.errors.length ? rec.errors.length : '0'}</dd>
            <dt>Azioni aziendali simulate</dt><dd>{rec.actions.length ? rec.actions.map(a => a.id).join(', ') : '—'}</dd>
            <dt>Arresto</dt><dd>{STOP_LABEL[rec.stopReason]}</dd>
            <dt>Durata</dt><dd>{(rec.durationMs / 1000).toLocaleString('it-IT', { maximumFractionDigits: 1 })} s</dd>
          </dl>
          {rec.errors.length > 0 && <ul className={styles.errList}>{rec.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>}
          <ProvenanceBadge tag={rec.modelProvenance} compact />
        </>
      )}
    </motion.section>
  )
}

/**
 * Renders the selected request, model and experiment status, and recorded comparison results.
 * @returns The harness comparison view.
 */
export function ComparisonView() {
  const comparison = useLab(s => s.comparison)
  const comparing = useLab(s => s.comparing)
  const runExperiment = useLab(s => s.runExperiment)
  const scenarioId = useLab(s => s.scenarioId)
  const modelInfo = useLab(s => s.modelInfo)
  const loadProgress = useLab(s => s.loadProgress)
  const [essential, setEssential] = useState(false)
  const request = SCENARIOS.find(s => s.id === scenarioId)?.request ?? ''
  const log = useBusinessLog()

  const rows = useMemo(() => {
    const base: ComparisonRow[] = comparison.length ? comparison : EXPERIMENT.map(e => ({ key: e.key, label: e.label, short: e.short, status: 'pending' as const }))
    return base
  }, [comparison])
  const shown = essential ? rows.filter(r => ESSENTIAL.has(r.key)) : rows
  const modelReady = modelInfo.provenance.provenance === 'real'
  const modelLoading = !modelReady && MODEL_LOADING.has(loadProgress.phase)
  const modelPercent = loadProgress.totalBytes > 0 ? Math.round((loadProgress.loadedBytes / loadProgress.totalBytes) * 100) : 0
  const modelStatus = modelReady
    ? `Caricato: ${modelInfo.label}`
    : modelLoading
      ? `Caricamento del modello in corso${modelPercent > 0 ? ` (${modelPercent}%)` : '…'}.`
      : loadProgress.phase === 'error'
        ? 'Caricamento non riuscito. Riprova dalla barra superiore.'
        : 'Nessun modello reale caricato. Scegline uno dalla barra superiore.'
  const hasResults = rows.some(row => row.record)
  const hasErrors = rows.some(row => row.status === 'error')
  const comparisonStatus = experimentSummary(rows, comparing, comparison.some(row => row.status !== 'pending' || row.record))

  return (
    <div className={styles.root}>
      <header className={styles.hero}>
        <div className={styles.intro}>
          <h2 className={styles.h1}>Confronta le configurazioni dell’harness</h2>
          <p className={styles.introText}>
            La stessa richiesta usa lo stesso modello reale in dieci configurazioni.
            Cambia l’harness: confronta risposte, indicatori e interventi.
          </p>
        </div>

        <div className={styles.requestCard}>
          <p className={styles.eyebrow}>Richiesta usata in tutte le configurazioni</p>
          <blockquote className={styles.request}>{request || 'Nessuna richiesta selezionata.'}</blockquote>
        </div>

        <div className={styles.states} role="group" aria-label="Stato del modello e dell’esperimento">
          <div className={styles.stateCard}>
            <p className={styles.stateLabel}>Modello corrente</p>
            <div id="model-current-status" className={styles.stateValue} role="status" aria-label="Stato del modello">
              {modelReady
                ? <Check size={16} aria-hidden />
                : modelLoading
                  ? <Loader2 size={16} className={styles.spin} aria-hidden />
                  : <AlertCircle size={16} aria-hidden />}
              <span>{modelStatus}</span>
              {modelReady && <ProvenanceBadge tag={modelInfo.provenance} compact />}
            </div>
          </div>
          <div className={styles.stateCard}>
            <p className={styles.stateLabel}>Stato dell’esperimento</p>
            <div className={styles.stateValue} role="status" aria-label="Stato dell’esperimento">
              {comparing
                ? <Loader2 size={16} className={styles.spin} aria-hidden />
                : hasErrors
                  ? <AlertCircle size={16} aria-hidden />
                  : hasResults
                    ? <Check size={16} aria-hidden />
                    : <Clock size={16} aria-hidden />}
              <span>{comparisonStatus}</span>
            </div>
          </div>
        </div>

        <div className={styles.actions}>
          <Button
            className={styles.run}
            variant="primary"
            size="lg"
            icon={comparing ? <Loader2 size={18} className={styles.spin} aria-hidden /> : <Play size={18} aria-hidden />}
            onClick={() => void runExperiment()}
            disabled={comparing}
            aria-busy={comparing}
            aria-describedby="model-current-status"
          >
            {comparing ? 'Confronto in corso…' : 'Avvia il confronto'}
          </Button>
          <details className={styles.options}>
            <summary className={styles.optionSummary}><ChevronDown size={15} aria-hidden /> Opzioni di visualizzazione</summary>
            <div className={styles.optionBody}>
              <div>
                <p className={styles.optionTitle}>Vista essenziale</p>
                <p className={styles.optionHint}>Mostra cinque configurazioni nelle schede; la tabella mantiene tutte e dieci.</p>
              </div>
              <Switch checked={essential} onChange={setEssential} label="Mostra solo le cinque configurazioni chiave nelle schede" />
            </div>
          </details>
        </div>

        <p className={styles.note}>
          <FlaskConical size={16} aria-hidden /> <span>
            Le risposte usano il modello reale caricato.
            Le azioni sui sistemi aziendali sono simulate e non modificano sistemi reali.
          </span>
        </p>
      </header>

      <ComparisonMatrix rows={rows} />

      <div className={styles.scroller} tabIndex={0} role="region" aria-label="Schede delle configurazioni; scorri orizzontalmente per esplorarle">
        {shown.map((r) => {
          const idx = rows.findIndex(x => x.key === r.key)
          return <Column key={r.key} row={r} prev={essential ? undefined : rows[idx - 1]} index={idx} />
        })}
      </div>

      <section className={styles.log} aria-labelledby="biz-log">
        <h3 id="biz-log" className={styles.h3}>Cosa è successo nei sistemi aziendali simulati</h3>
        {log.length === 0 ? (
          <p className={styles.muted}>
            Nessuna azione registrata. Le azioni compaiono qui solo se qualcuno le approva
            (o se l’approvazione automatica è attiva).
          </p>
        ) : (
          <ul className={styles.logList}>
            {log.map((e, i) => (
              <li key={str(e.id) || i}>
                <code>{str(e.id) || str(e.actionId)}</code>
                <span>{str(e.summary) || str(e.label) || str(e.description) || str(e.tool)}</span>
                {e.at !== undefined && <time className={styles.muted}>{new Date(e.at as number | string).toLocaleTimeString('it-IT')}</time>}
              </li>
            ))}
          </ul>
        )}
        <p className={styles.muted}>
          Tutti gli identificativi contengono “SIM”: sono azioni simulate, nessun sistema reale è stato toccato.
        </p>
      </section>
    </div>
  )
}
