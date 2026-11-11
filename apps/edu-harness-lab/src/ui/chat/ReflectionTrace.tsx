/** Displays draft/review iterations separately from the final answer and native model reasoning. */
import { RefreshCw } from 'lucide-react'
import type { RunRecord } from '../../domain/types'
import { useLab } from '../../state/store'
import { useT } from '../../i18n'
import styles from './ReflectionTrace.module.css'

/**
 * Keeps generated draft/check passes visible during a run and with its recorded result.
 * @param props Run identity, live status, or an explicit comparison result.
 * @returns The generated passes and observed call counts, or no content for unrelated runs.
 */
export function ReflectionTrace({ runId, live = false, record: providedRecord }: { runId?: string; live?: boolean; record?: RunRecord }) {
  const t = useT()
  const currentRunId = useLab(s => s.currentRunId)
  const events = useLab(s => s.events)
  const runs = useLab(s => s.runs)
  const id = providedRecord?.id ?? runId ?? (live ? currentRunId : null)
  const record = providedRecord ?? runs.find(run => run.id === id)
  const runEvents = id ? events.filter(event => event.runId === id) : []
  const reflections = record?.reflections ?? runEvents.flatMap(event =>
    event.type === 'decision/parsed' && event.decision.type === 'reflect' ? [event.decision.text] : [],
  )
  const calls = runEvents.filter(event => event.type === 'model/request').length
  const invalid = runEvents.filter(event => event.type === 'decision/invalid').length
  const reflectionRequested = runEvents.some(event => event.type === 'model/request' && event.reflection)

  if (!reflections.length && !reflectionRequested && !record?.reflections) return null

  const passes = reflections.length === 1 ? t('1 passaggio', '1 pass') : t(`${reflections.length} passaggi`, `${reflections.length} passes`)
  const callsWord = calls === 1 ? t('chiamata al modello', 'model call') : t('chiamate al modello', 'model calls')
  const acceptedWord = reflections.length === 1 ? t('bozza accettata', 'draft accepted') : t('bozze accettate', 'drafts accepted')
  const invalidWord = invalid === 1 ? t('output non valido', 'invalid output') : t('output non validi', 'invalid outputs')

  return (
    <details className={styles.trace} open aria-label={t('Riflessioni del ciclo: testo separato dalla risposta', 'Loop reflections: text kept separate from the answer')}>
      <summary className={styles.summary}>
        <RefreshCw size={16} aria-hidden />
        <span>{t('Riflessioni del ciclo', 'Loop reflections')}</span>
        <span className={styles.count}>
          {passes}{live ? t(' · in corso', ' · in progress') : ''}
        </span>
      </summary>
      <p className={styles.warning}>
        {t(
          'Bozze e verifiche rilette nelle chiamate successive, non la risposta finale. È ragionamento simulato: non è il thinking nativo e può contenere errori.',
          'Drafts and checks re-read in later calls, not the final answer. This is simulated reasoning: it is not the native thinking and it may contain errors.',
        )}
      </p>
      {calls > 0 && <p className={styles.activity} aria-live="polite">
        {calls} {callsWord} · {reflections.length} {acceptedWord} · {invalid} {invalidWord}
      </p>}
      {!reflections.length && <p className={styles.warning}>
        {t(
          'Nessuna bozza accettata: una chiamata avviata non dimostra che il modello abbia verificato la proposta.',
          'No draft accepted: a call that started does not show that the model checked the proposal.',
        )}
      </p>}
      <ol className={styles.list} aria-label={t('Passaggi di riflessione', 'Reflection steps')}>
        {reflections.map((text, index) => (
          <li key={index} className={styles.entry}>
            <span className={styles.label}>{t('Riflessione', 'Reflection')} {index + 1}</span>
            <p className={styles.text}>{text}</p>
          </li>
        ))}
      </ol>
    </details>
  )
}
