/** Displays draft/review iterations separately from the final answer and native model reasoning. */
import { RefreshCw } from 'lucide-react'
import type { RunRecord } from '../../domain/types'
import { useLab } from '../../state/store'
import styles from './ReflectionTrace.module.css'

/**
 * Keeps generated draft/check passes visible during a run and with its recorded result.
 * @param props Run identity, live status, or an explicit comparison result.
 * @returns The generated passes and observed call counts, or no content for unrelated runs.
 */
export function ReflectionTrace({ runId, live = false, record: providedRecord }: { runId?: string; live?: boolean; record?: RunRecord }) {
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

  return (
    <details className={styles.trace} open aria-label="Riflessioni del ciclo: testo separato dalla risposta">
      <summary className={styles.summary}>
        <RefreshCw size={16} aria-hidden />
        <span>Riflessioni del ciclo</span>
        <span className={styles.count}>
          {reflections.length === 1 ? '1 passaggio' : `${reflections.length} passaggi`}{live ? ' · in corso' : ''}
        </span>
      </summary>
      <p className={styles.warning}>
        Bozze e verifiche rilette nelle chiamate successive, non la risposta finale.
        È ragionamento simulato: non è il thinking nativo e può contenere errori.
      </p>
      {calls > 0 && <p className={styles.activity} aria-live="polite">
        {calls} {calls === 1 ? 'chiamata al modello' : 'chiamate al modello'} · {reflections.length} {reflections.length === 1 ? 'bozza accettata' : 'bozze accettate'} · {invalid} {invalid === 1 ? 'output non valido' : 'output non validi'}
      </p>}
      {!reflections.length && <p className={styles.warning}>
        Nessuna bozza accettata: una chiamata avviata non dimostra che il modello abbia verificato la proposta.
      </p>}
      <ol className={styles.list} aria-label="Passaggi di riflessione">
        {reflections.map((text, index) => (
          <li key={index} className={styles.entry}>
            <span className={styles.label}>Riflessione {index + 1}</span>
            <p className={styles.text}>{text}</p>
          </li>
        ))}
      </ol>
    </details>
  )
}
