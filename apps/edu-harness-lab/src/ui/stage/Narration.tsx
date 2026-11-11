import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { ChevronDown, PanelRightClose, PanelRightOpen } from 'lucide-react'
import type { ComponentId, TraceEvent } from '../../domain/types'
import { LEVELS, levelsFor } from '../../harness/levels'
import { SCENARIOS } from '../../scenarios'
import { useLab } from '../../state/store'
import { tr, useT, useUiLang } from '../../i18n'
import { componentText, levelText } from '../../i18nContent'
import type { NarrationLine } from './narrate'
import { joinList, narrate } from './narrate'
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
        const labels = additions.map(addition => componentText(addition.component).label)
        const joinedLabels = joinList(labels)
        out.push({
          id: event.id,
          seq: (additions.at(-1) ?? event).seq,
          step,
          family: 'user',
          tone: 'good',
          text: tr(
            `L’harness integra ${labels.length} componenti: ${joinedLabels}. Il modello resta invariato.`,
            `The harness adds ${labels.length} components: ${joinedLabels}. The model stays the same.`,
          ),
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
  const t = useT()
  // The narration text follows the interface language: the memoized lines are rebuilt on a switch.
  const lang = useUiLang(s => s.lang)
  const events = useLab(s => s.events)
  const components = useLab(s => s.config.components)
  const level = useLab(s => s.level)
  const scenario = useLab(s => SCENARIOS.find(scenario => scenario.id === s.scenarioId))
  const reflection = !!scenario?.reflectionPrompt
  const status = useLab(s => s.status)
  const levelDef = reflection ? undefined : (levelsFor(scenario).find(item => item.id === level) ?? LEVELS[level])
  const focus = reflection
    ? {
      title: t('Riflessione iterativa', 'Iterative reasoning'),
      phenomenon: t(
        'Ogni bozza accettata torna in input alla chiamata successiva, che può verificarla o correggerla.',
        'Each accepted draft goes back as input to the next call, which can check or correct it.',
      ),
      term: t('ciclo di riflessione', 'reflection loop'),
      message: t(
        'Le bozze sono testo generato osservabile, non thinking nativo. Ripetere una proposta non dimostra che sia corretta.',
        'Drafts are observable generated text, not native thinking. Repeating a proposal does not prove that it is correct.',
      ),
    }
    : levelDef
      ? levelText(levelDef, scenario?.id)
      : undefined
  const titleId = useId()
  const currentId = `${titleId}-current`
  const historyId = `${titleId}-history`
  const [historyOpen, setHistoryOpen] = useState(false)
  const followHistory = useRef(true)
  const listRef = useRef<HTMLOListElement>(null)
  const currentRef = useRef<HTMLElement>(null)
  const heldId = useLab(s => s.heldEvent?.id ?? null)

  const lines = useMemo(() => narrationLines(events, components), [events, components, lang])
  const current = lines[lines.length - 1]
  const history = lines.slice(0, -1)
  const heldInHistory = history.some(line => line.id === heldId)

  useEffect(() => {
    const list = listRef.current
    if (historyOpen && followHistory.current && list) list.scrollTop = list.scrollHeight
  }, [historyOpen, history.length])

  // The run is held on an event: bring its entry into view, unless the reader is looking at older entries.
  useEffect(() => {
    if (!heldId) return
    if (heldInHistory) {
      if (historyOpen && followHistory.current) listRef.current?.querySelector<HTMLElement>('[data-held]')?.scrollIntoView?.({ block: 'nearest' })
      return
    }
    currentRef.current?.scrollIntoView?.({ block: 'nearest' })
  }, [heldId, heldInHistory, historyOpen])

  const running = status === 'running' || status === 'awaitingApproval'

  if (collapsed)
    return (
      <aside className={`${styles.panel} ${styles.collapsed}`} aria-label={t('Racconto chiuso', 'Story closed')}>
        <button
          type="button"
          className={styles.toggle}
          onClick={onToggle}
          aria-label={t('Apri il racconto', 'Open the story')}
          title={t('Apri il racconto', 'Open the story')}
        >
          <PanelRightOpen size={17} />
        </button>
        {running && <span className={styles.liveDot} aria-label={t('in diretta', 'live')} />}
        <span className={styles.vertical}>
          {t('Che cosa sta succedendo', 'What is happening')}
          {lines.length > 0 ? ` · ${lines.length}` : ''}
        </span>
      </aside>
    )

  return (
    <aside className={styles.panel} aria-labelledby={titleId}>
      <h2 id={titleId} className={styles.title}>
        {t('Che cosa sta succedendo', 'What is happening')}
        {running && <span className={styles.live} role="status" aria-label={t('in diretta', 'live')} title={t('in diretta', 'live')} />}
        {onToggle && (
          <button
            type="button"
            className={styles.toggle}
            onClick={onToggle}
            aria-label={t('Chiudi il racconto', 'Close the story')}
            title={t('Chiudi il racconto', 'Close the story')}
          >
            <PanelRightClose size={17} />
          </button>
        )}
      </h2>
      <p className={styles.orientation}>
        {t(
          'Eventi dell’harness, non pensieri del modello. Il testo delle bozze è in «Riflessioni del ciclo».',
          'Harness events, not the model’s thoughts. The text of the drafts is in “Loop reflections”.',
        )}
      </p>
      {current ? (
        <section
          ref={currentRef}
          className={[styles.current, styles[`tone_${current.tone}`], current.id === heldId ? styles.held : ''].join(' ')}
          style={{ '--fam': current.family === 'user' ? 'var(--c-user)' : `var(--c-${current.family})` } as React.CSSProperties}
          aria-labelledby={currentId}
          data-held={current.id === heldId || undefined}
        >
          <h3 id={currentId} className={styles.currentLabel}>
            {t('Evento corrente', 'Current event')}
            {current.step > 0 && <span className={styles.round}>{t('giro', 'round')} {current.step}</span>}
            {current.id === heldId && (
              <span className={styles.heldTag} aria-hidden>
                {t('Fermo qui', 'Stopped here')}
              </span>
            )}
          </h3>
          <p className={styles.currentText} aria-live="polite" aria-atomic="true">
            {current.text}
            {current.term && <span className={styles.term}> {current.term}</span>}
          </p>
        </section>
      ) : (
        <div className={styles.empty}>
          <p>
            {running
              ? t('La prova è in corso.', 'The run is in progress.')
              : t('Avvia una prova per seguire gli eventi osservabili dell’harness.', 'Start a run to follow the harness’s observable events.')}{' '}
            {t('Il ragionamento interno del modello non viene mostrato.', 'The model’s internal reasoning is not shown.')}
          </p>
        </div>
      )}
      <details className={styles.levelFocus}>
        <summary className={styles.levelSummary}>
          {reflection ? t('Focus dello scenario', 'Scenario focus') : t('Focus del livello', 'Level focus')} · {focus?.title}
        </summary>
        <div className={styles.levelBody}>
          <p>
            <span className={styles.levelLabel}>{t('Da osservare', 'To observe')}</span>{' '}
            {focus?.phenomenon}
          </p>
          <p>
            <span className={styles.levelLabel}>{t('Termine', 'Term')}</span>{' '}
            <span className={styles.levelTerm}>{focus?.term}</span>
          </p>
          <p>
            <span className={styles.levelLabel}>{t('Idea chiave', 'Key idea')}</span>{' '}
            {focus?.message}
          </p>
        </div>
      </details>
      {current && history.length > 0 && (
        <section className={styles.history} data-open={historyOpen}>
          <h3 className={styles.historyHeading}>
            <button
              type="button"
              className={styles.historySummary}
              aria-expanded={historyOpen}
              aria-controls={historyId}
              onClick={() => {
                followHistory.current = true
                setHistoryOpen(open => !open)
              }}
            >
              <ChevronDown size={14} aria-hidden />
              {t('Storico', 'History')}{' '}
              <span className={styles.historyCount}>
                {history.length} {history.length === 1 ? t('evento precedente', 'previous event') : t('eventi precedenti', 'previous events')}
              </span>
            </button>
          </h3>
          {historyOpen && <ol
            id={historyId}
            className={styles.list}
            ref={listRef}
            aria-label={t('Eventi precedenti', 'Previous events')}
            tabIndex={0}
            onScroll={(event) => {
              const list = event.currentTarget
              followHistory.current = list.scrollHeight - list.clientHeight - list.scrollTop <= 4
            }}
          >
            {history.map((line, index) => (
              <li
                key={line.id}
                className={[styles.item, styles[`tone_${line.tone}`], line.id === heldId ? styles.held : ''].join(' ')}
                style={{ '--fam': line.family === 'user' ? 'var(--c-user)' : `var(--c-${line.family})` } as React.CSSProperties}
                data-held={line.id === heldId || undefined}
              >
                {/* Each new round of the agent loop starts with a small heading. */}
                {line.step > 0 && line.step !== history[index - 1]?.step && (
                  <span className={styles.roundHead}>
                    {t('Giro', 'Round')} {line.step}
                  </span>
                )}
                <span className={styles.row}>
                  <span className={styles.n}>{index + 1}</span>
                  <span className={styles.text}>
                    {line.text}
                    {line.term && <span className={styles.term}> {line.term}</span>}
                    {line.id === heldId && <span className={styles.heldTag}>{t('Fermo qui', 'Stopped here')}</span>}
                  </span>
                </span>
              </li>
            ))}
          </ol>}
        </section>
      )}
    </aside>
  )
}
