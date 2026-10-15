import { useEffect, useId, useMemo, useRef } from 'react'
import { PanelRightClose, PanelRightOpen } from 'lucide-react'
import type { ComponentId, TraceEvent } from '../../domain/types'
import { COMPONENTS, LEVELS } from '../../harness/levels'
import { useLab } from '../../state/store'
import type { NarrationLine } from './narrate'
import { narrate } from './narrate'
import styles from './Narration.module.css'

/** Events worth narrating now: the latest run plus the harness changes made just before it. */
function relevantEvents(events: readonly TraceEvent[]): TraceEvent[] {
  const start = events.findLastIndex(e => e.type === 'run/start')
  const startEvent = events[start]
  if (!startEvent) return events.filter(e => e.runId === 'harness').slice(-6)
  let from = start
  while (from > 0 && events[from - 1]?.runId === 'harness') from--
  const runId = startEvent.runId
  const out = events.slice(from, start).filter(e => e.runId === 'harness')
  for (const e of events.slice(start)) {
    if (e.runId === runId || e.runId === 'mcp' || e.runId === 'harness') out.push(e)
  }
  return out
}

export function narrationLines(events: readonly TraceEvent[], components: Record<ComponentId, boolean>): NarrationLine[] {
  const relevant = relevantEvents(events)
  const out: NarrationLine[] = []
  let step = 0
  for (let i = 0; i < relevant.length; ) {
    const event = relevant[i]
    if (!event) break
    if (event.type === 'step/start') step = event.stepIndex
    if (event.type === 'harness/plugin-mounted') {
      const additions = [event]
      let next = i + 1
      while (next < relevant.length) {
        const candidate = relevant[next]
        if (candidate?.type !== 'harness/plugin-mounted') break
        additions.push(candidate)
        next++
      }
      if (additions.length > 1) {
        const labels = additions.map(addition => COMPONENTS[addition.component].label)
        const joinedLabels = `${labels.slice(0, -1).join(', ')} e ${labels.at(-1) ?? ''}`
        out.push({
          id: event.id,
          seq: (additions.at(-1) ?? event).seq,
          step,
          family: 'user',
          tone: 'good',
          text: `L’harness integra ${labels.length} componenti: ${joinedLabels}. Il modello resta invariato.`,
        })
        i = next
        continue
      }
    }
    const line = narrate(event, components)
    if (line) out.push({ ...line, id: event.id, seq: event.seq, step })
    i++
  }
  return out
}

export function Narration({ collapsed = false, onToggle }: { collapsed?: boolean; onToggle?: () => void }) {
  const events = useLab(s => s.events)
  const components = useLab(s => s.config.components)
  const level = useLab(s => s.level)
  const status = useLab(s => s.status)
  const levelDefinition = LEVELS[level]
  const titleId = useId()
  const currentId = `${titleId}-current`
  const historyRef = useRef<HTMLDetailsElement>(null)
  const listRef = useRef<HTMLOListElement>(null)

  const lines = useMemo(() => narrationLines(events, components), [events, components])
  const current = lines[lines.length - 1]
  const history = lines.slice(0, -1)

  useEffect(() => {
    const details = historyRef.current
    const list = listRef.current
    if (details?.open && list) list.scrollTop = list.scrollHeight
  }, [lines.length])

  const running = status === 'running' || status === 'awaitingApproval'

  if (collapsed)
    return (
      <aside className={`${styles.panel} ${styles.collapsed}`} aria-label="Racconto chiuso">
        <button type="button" className={styles.toggle} onClick={onToggle} aria-label="Apri il racconto" title="Apri il racconto">
          <PanelRightOpen size={17} />
        </button>
        {running && <span className={styles.liveDot} aria-label="in diretta" />}
        <span className={styles.vertical}>Che cosa sta succedendo{lines.length > 0 ? ` · ${lines.length}` : ''}</span>
      </aside>
    )

  return (
    <aside className={styles.panel} aria-labelledby={titleId}>
      <h2 id={titleId} className={styles.title}>
        Che cosa sta succedendo
        {running && <span className={styles.live} role="status" aria-label="in diretta" title="in diretta" />}
        {onToggle && (
          <button type="button" className={styles.toggle} onClick={onToggle} aria-label="Chiudi il racconto" title="Chiudi il racconto">
            <PanelRightClose size={17} />
          </button>
        )}
      </h2>
      {current ? (
        <section
          className={[styles.current, styles[`tone_${current.tone}`]].join(' ')}
          style={{ '--fam': current.family === 'user' ? 'var(--c-user)' : `var(--c-${current.family})` } as React.CSSProperties}
          aria-labelledby={currentId}
        >
          <h3 id={currentId} className={styles.currentLabel}>Evento corrente</h3>
          <p className={styles.currentText} aria-live="polite" aria-atomic="true">
            {current.text}
            {current.term && <span className={styles.term}> {current.term}</span>}
          </p>
        </section>
      ) : (
        <div className={styles.empty}>
          <p>
            {running ? 'La prova è in corso.' : 'Avvia una prova per seguire gli eventi osservabili dell’harness.'}{' '}
            Il ragionamento interno del modello non viene mostrato.
          </p>
        </div>
      )}
      <details className={styles.levelFocus}>
        <summary className={styles.levelSummary}>Focus del livello · {levelDefinition?.title}</summary>
        <div className={styles.levelBody}>
          <p>
            <span className={styles.levelLabel}>Da osservare</span>{' '}
            {levelDefinition?.phenomenon}
          </p>
          <p>
            <span className={styles.levelLabel}>Termine</span>{' '}
            <span className={styles.levelTerm}>{levelDefinition?.term}</span>
          </p>
          <p>
            <span className={styles.levelLabel}>Idea chiave</span>{' '}
            {levelDefinition?.message}
          </p>
        </div>
      </details>
      {current && history.length > 0 && (
        <details
          ref={historyRef}
          className={styles.history}
          onToggle={(event) => {
            if (event.currentTarget.open && listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
          }}
        >
          <summary className={styles.historySummary}>
            Storico{' '}
            <span className={styles.historyCount}>
              {history.length} {history.length === 1 ? 'evento precedente' : 'eventi precedenti'}
            </span>
          </summary>
          <ol className={styles.list} ref={listRef} aria-label="Eventi precedenti">
            {history.map((line, index) => (
              <li
                key={line.id}
                className={[styles.item, styles[`tone_${line.tone}`]].join(' ')}
                style={{ '--fam': line.family === 'user' ? 'var(--c-user)' : `var(--c-${line.family})` } as React.CSSProperties}
              >
                <span className={styles.row}>
                  <span className={styles.n}>{index + 1}</span>
                  <span className={styles.text}>
                    {line.text}
                    {line.term && <span className={styles.term}> {line.term}</span>}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </details>
      )}
    </aside>
  )
}
