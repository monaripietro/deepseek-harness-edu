import { useEffect, useMemo, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { AlertCircle, Check, ChevronDown, ChevronUp, Clock, FlaskConical, Loader2, Play, Plus, X } from 'lucide-react'
import type { ComponentId } from '../../domain/types'
import { useLab } from '../../state/store'
import type { ComparisonRow } from '../../state/store'
import { COMPONENTS, COMPONENT_ORDER, EXPERIMENT } from '../../harness/levels'
import { requestFor } from '../../scenarios'
import { businessLog } from '../../harness/tools/businessLog'
import { componentText } from '../../i18nContent'
import { useT } from '../../i18n'
import { Button } from '../common/Button'
import { ProvenanceBadge } from '../common/ProvenanceBadge'
import { Switch } from '../common/Switch'
import { STOP_LABEL, numLocale } from '../common/labels'
import { ComparisonMatrix } from './ComparisonMatrix'
import { ReflectionTrace } from '../chat/ReflectionTrace'
import styles from './ComparisonView.module.css'

const ESSENTIAL = new Set(['c01', 'c02', 'c05', 'c07', 'c10'])
const MODEL_LOADING = new Set(['checking', 'downloading', 'initializing'])

type LogEntry = Record<string, unknown>
const str = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v) : '')

function experimentSummary(rows: ComparisonRow[], comparing: boolean, hasRun: boolean, t: (it: string, en: string) => string) {
  if (!hasRun && !comparing) return t('Non ancora avviato.', 'Not started yet.')

  const completed = rows.filter(row => row.status === 'done').length
  const errors = rows.filter(row => row.status === 'error').length
  const pending = rows.filter(row => row.status === 'pending').length
  const current = rows.find(row => row.status === 'running')

  if (comparing || current) {
    const finished = completed + errors
    const head = current ? t(`${current.label}: in corso`, `${current.label}: running`) : t('Confronto in corso', 'Comparison running')
    return `${head} · ${t(
      `${finished} di ${rows.length} esecuzioni terminate.`,
      `${finished} of ${rows.length} runs finished.`,
    )}`
  }

  if (completed > 0) {
    const details = [
      t(`${completed} configurazioni completate`, `${completed} configurations completed`),
      errors > 0 ? t(`${errors} con errore`, `${errors} with errors`) : undefined,
      pending > 0 ? t(`${pending} in attesa`, `${pending} waiting`) : undefined,
    ].filter(Boolean)
    return t(`Risultati disponibili: ${details.join(', ')}.`, `Results available: ${details.join(', ')}.`)
  }

  const word = errors === 1 ? t('configurazione', 'configuration') : t('configurazioni', 'configurations')
  return t(`Nessun risultato disponibile: ${errors} ${word} con errore.`, `No result available: ${errors} ${word} with an error.`)
}

function useBusinessLog(): LogEntry[] {
  const read = () => [...((businessLog as unknown as { list(): LogEntry[] }).list())]
  const [entries, setEntries] = useState<LogEntry[]>(read)
  useEffect(() => {
    setEntries(read())
    return (businessLog as unknown as { subscribe(cb: () => void): () => void }).subscribe(() =>{  setEntries(read()) })
  }, [])
  return entries
}

function Column({ row, prev, index }: { row: ComparisonRow; prev?: ComparisonRow; index: number }) {
  const t = useT()
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
  const tools = rec ? [...new Set(rec.toolCalls.map(call => call.tool))] : []
  const locale = numLocale()

  return (
    <motion.section className={`${styles.col} ${completed ? styles.colOk : ''}`} aria-label={row.label}
      initial={reduce ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: reduce ? 0 : index * 0.04 }}>
      <header className={styles.colHead}>
        <h3 className={styles.colTitle}>{row.label}</h3>
        <span className={styles.statusLine} role="status">
          {row.status === 'running' && <><Loader2 size={14} className={styles.spin} aria-hidden /> {t('In esecuzione', 'Running')}</>}
          {row.status === 'pending' && <><Clock size={14} aria-hidden /> {t('In attesa di esecuzione', 'Waiting to run')}</>}
          {row.status === 'error' && <><AlertCircle size={14} aria-hidden /> {t('Errore nell’esecuzione', 'Error during the run')}</>}
          {row.status === 'done' && <><Check size={14} aria-hidden /> {t('Esecuzione terminata', 'Run finished')}</>}
        </span>
      </header>

      <div className={styles.change} aria-label={t('Cosa cambia', 'What changes')}>
        <div className={styles.kicker}>{t('Cosa cambia', 'What changes')}</div>
        {added.length === 0 && !prev && <span className={styles.muted}>{t('Punto di partenza: solo il modello.', 'Starting point: the model only.')}</span>}
        {added.length === 0 && prev && <span className={styles.muted}>{t('Nessun componente nuovo.', 'No new component.')}</span>}
        <div className={styles.chips}>
          {added.map(c => <span key={c} className={styles.addChip} style={{ ['--fam' as string]: `var(--c-${COMPONENTS[c].family})` }}><Plus size={12} aria-hidden />{componentText(c).label}</span>)}
        </div>
        {flips.map(f => (
          <div key={f.id} className={f.passed ? styles.flipUp : styles.flipDown}>
            {f.passed ? <Check size={13} aria-hidden /> : <X size={13} aria-hidden />} {f.passed ? t('Ora riesce', 'Now passes') : t('Non riesce più', 'No longer passes')}: {f.label}
          </div>
        ))}
      </div>

      {row.status === 'error' && <p className={styles.errText}>{row.error}</p>}
      {rec && (
        <>
          <ReflectionTrace record={rec} />
          <h4 className={styles.resultTitle}>{rec.stopReason === 'final_answer' ? t('Risposta finale', 'Final answer') : t('Esito senza risposta finale', 'Outcome without a final answer')}</h4>
          <div className={`${styles.answer} ${open ? '' : styles.clamp}`}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{rec.answer || t('_Nessuna risposta._', '_No answer._')}</ReactMarkdown>
          </div>
          <button className={styles.expand} onClick={() =>{  setOpen(!open) }} aria-expanded={open}>
            {open
              ? <><ChevronUp size={14} aria-hidden /> {t('Riduci', 'Collapse')}</>
              : <><ChevronDown size={14} aria-hidden /> {t('Espandi', 'Expand')}</>}
          </button>

          <ul className={styles.checks} aria-label={t('Indicatori osservabili', 'Observable indicators')}>
            {rec.checks.map(c => (
              <li key={c.id} className={c.passed ? styles.pass : styles.fail}>
                {c.passed ? <Check size={15} aria-label={t('Riuscito', 'Passed')} /> : <X size={15} aria-label={t('Non riuscito', 'Not passed')} />}
                <span>{c.label}</span>
              </li>
            ))}
          </ul>

          <dl className={styles.facts}>
            <dt>{t('Passi', 'Steps')}</dt><dd>{rec.steps}</dd>
            <dt>{t('Strumenti', 'Tools')}</dt>
            <dd>{tools.length ? <span className={styles.chips}>{tools.map(tool => <code key={tool} className={styles.toolChip}>{tool}</code>)}</span> : '—'}</dd>
            <dt>{t('Fonti', 'Sources')}</dt><dd>{rec.sourcesUsed.length ? rec.sourcesUsed.join(', ') : '—'}</dd>
            <dt>{t('Interventi umani', 'Human interventions')}</dt><dd>{rec.humanInterventions}</dd>
            <dt>{t('Errori', 'Errors')}</dt><dd>{rec.errors.length ? rec.errors.length : '0'}</dd>
            <dt>{t('Azioni aziendali simulate', 'Simulated business actions')}</dt><dd>{rec.actions.length ? rec.actions.map(a => a.id).join(', ') : '—'}</dd>
            <dt>{t('Arresto', 'Stop')}</dt><dd>{STOP_LABEL[rec.stopReason]}</dd>
            <dt>{t('Durata', 'Duration')}</dt><dd>{(rec.durationMs / 1000).toLocaleString(locale, { maximumFractionDigits: 1 })} s</dd>
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
  const t = useT()
  const comparison = useLab(s => s.comparison)
  const comparing = useLab(s => s.comparing)
  const runExperiment = useLab(s => s.runExperiment)
  const scenarioId = useLab(s => s.scenarioId)
  const modelInfo = useLab(s => s.modelInfo)
  const loadProgress = useLab(s => s.loadProgress)
  const [essential, setEssential] = useState(false)
  const promptLanguage = useLab(s => s.promptLanguage)
  const request = requestFor(scenarioId, promptLanguage)
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
    ? t(`Caricato: ${modelInfo.label}`, `Loaded: ${modelInfo.label}`)
    : modelLoading
      ? t(`Caricamento del modello in corso${modelPercent > 0 ? ` (${modelPercent}%)` : '…'}.`, `Loading the model${modelPercent > 0 ? ` (${modelPercent}%)` : '…'}.`)
      : loadProgress.phase === 'error'
        ? t('Caricamento non riuscito. Riprova dalla barra superiore.', 'Loading failed. Try again from the top bar.')
        : t('Nessun modello reale caricato. Scegline uno dalla barra superiore.', 'No real model loaded. Choose one from the top bar.')
  const hasResults = rows.some(row => row.record)
  const hasErrors = rows.some(row => row.status === 'error')
  const comparisonStatus = experimentSummary(rows, comparing, comparison.some(row => row.status !== 'pending' || row.record), t)
  const timeLocale = numLocale()

  return (
    <div className={styles.root}>
      <header className={styles.hero}>
        <div className={styles.intro}>
          <h2 className={styles.h1}>{t('Confronta le configurazioni dell’harness', 'Compare the harness configurations')}</h2>
          <p className={styles.introText}>
            {t(
              'La stessa richiesta usa lo stesso modello reale in dieci configurazioni. Cambia l’harness: confronta risposte, indicatori e interventi.',
              'The same request uses the same real model in ten configurations. Change the harness: compare answers, indicators and interventions.',
            )}
          </p>
        </div>

        <div className={styles.requestCard}>
          <p className={styles.eyebrow}>{t('Richiesta usata in tutte le configurazioni', 'Request used in all configurations')}</p>
          <blockquote className={styles.request}>{request || t('Nessuna richiesta selezionata.', 'No request selected.')}</blockquote>
        </div>

        <div className={styles.states} role="group" aria-label={t('Stato del modello e dell’esperimento', 'Model and experiment status')}>
          <div className={styles.stateCard}>
            <p className={styles.stateLabel}>{t('Modello corrente', 'Current model')}</p>
            <div id="model-current-status" className={styles.stateValue} role="status" aria-label={t('Stato del modello', 'Model status')}>
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
            <p className={styles.stateLabel}>{t('Stato dell’esperimento', 'Experiment status')}</p>
            <div className={styles.stateValue} role="status" aria-label={t('Stato dell’esperimento', 'Experiment status')}>
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
            {comparing ? t('Confronto in corso…', 'Comparison running…') : t('Avvia il confronto', 'Start the comparison')}
          </Button>
          <details className={styles.options}>
            <summary className={styles.optionSummary}><ChevronDown size={15} aria-hidden /> {t('Opzioni di visualizzazione', 'Display options')}</summary>
            <div className={styles.optionBody}>
              <div>
                <p className={styles.optionTitle}>{t('Vista essenziale', 'Essential view')}</p>
                <p className={styles.optionHint}>{t('Mostra cinque configurazioni nelle schede; la tabella mantiene tutte e dieci.', 'Shows five configurations in the cards; the table keeps all ten.')}</p>
              </div>
              <Switch checked={essential} onChange={setEssential} label={t('Mostra solo le cinque configurazioni chiave nelle schede', 'Show only the five key configurations in the cards')} />
            </div>
          </details>
        </div>

        <p className={styles.note}>
          <FlaskConical size={16} aria-hidden /> <span>
            {t(
              'Le risposte usano il modello reale caricato. Le azioni sui sistemi aziendali sono simulate e non modificano sistemi reali.',
              'The answers use the real model loaded. Actions on company systems are simulated and do not change real systems.',
            )}
          </span>
        </p>
      </header>

      <ComparisonMatrix rows={rows} />

      <div className={styles.scroller} tabIndex={0} role="region" aria-label={t('Schede delle configurazioni; scorri orizzontalmente per esplorarle', 'Configuration cards; scroll horizontally to explore them')}>
        {shown.map((r) => {
          const idx = rows.findIndex(x => x.key === r.key)
          return <Column key={r.key} row={r} prev={essential ? undefined : rows[idx - 1]} index={idx} />
        })}
      </div>

      <section className={styles.log} aria-labelledby="biz-log">
        <h3 id="biz-log" className={styles.h3}>{t('Cosa è successo nei sistemi aziendali simulati', 'What happened in the simulated company systems')}</h3>
        {log.length === 0 ? (
          <p className={styles.muted}>
            {t(
              'Nessuna azione registrata. Le azioni compaiono qui solo se qualcuno le approva (o se l’approvazione automatica è attiva).',
              'No action recorded. Actions appear here only if someone approves them (or if automatic approval is on).',
            )}
          </p>
        ) : (
          <ul className={styles.logList}>
            {log.map((e, i) => (
              <li key={str(e.id) || i}>
                <code>{str(e.id) || str(e.actionId)}</code>
                <span>{str(e.summary) || str(e.label) || str(e.description) || str(e.tool)}</span>
                {e.at !== undefined && (
                  <time className={styles.muted}>{new Date(e.at as number | string).toLocaleTimeString(timeLocale)}</time>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className={styles.muted}>
          {t(
            'Tutti gli identificativi contengono “SIM”: sono azioni simulate, nessun sistema reale è stato toccato.',
            'All identifiers contain “SIM”: they are simulated actions, and no real system has been touched.',
          )}
        </p>
      </section>
    </div>
  )
}
