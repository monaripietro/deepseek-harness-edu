import type { ReactNode } from 'react'
import { Maximize2, Plus } from 'lucide-react'
import type { ComponentFamily, ComponentId } from '../../domain/types'
import { COMPONENTS, LEVELS } from '../../harness/levels'
import { useLab } from '../../state/store'
import type { Rect, StageNodeId } from './geometry'
import { previewAnchor } from './geometry'
import { isInteractive, useStageUi } from './stageUi'
import styles from './stage.module.css'

export type CardTone = ComponentFamily | 'user'

const levelOf = (c: ComponentId) => LEVELS.find(l => l.adds.includes(c))?.id ?? 0

/**
 * A harness element on the stage, in three sizes:
 * a collapsed tile (title + one live status line), a larger preview on hover or focus
 * (readable at any zoom), and the full details in a modal on click.
 */
export function StageCard({
  node,
  rect,
  tone,
  title,
  kicker,
  icon,
  component,
  active,
  lit,
  status,
  summary,
  children,
  className,
  alarm = false,
  tall = false,
  previewWidth = 420,
}: {
  node: StageNodeId
  rect: Rect
  tone: CardTone
  title: string
  kicker?: string
  icon: ReactNode
  component?: ComponentId
  active: boolean
  lit: boolean
  /** Short meta shown next to the title (e.g. "9 disponibili"). */
  status?: ReactNode
  /** The live status line of the collapsed tile. */
  summary?: ReactNode
  /** Content of the hover preview. */
  children?: ReactNode
  className?: string
  /** Needs attention now (e.g. a pending approval). */
  alarm?: boolean
  /** The summary may use several lines (question, answer). */
  tall?: boolean
  previewWidth?: number
}) {
  const view = useLab(s => s.view)
  const level = useLab(s => s.level)
  const toggleComponent = useLab(s => s.toggleComponent)
  const selected = useStageUi(s => s.selected === node)
  const toggleDetails = useStageUi(s => s.toggle)
  const ghost = !active
  const lvl = component ? levelOf(component) : 0
  const isNext = ghost && component != null && view === 'guided' && lvl === level + 1
  const anchor = previewAnchor(rect)
  const slotStyle = {
    left: rect.x,
    top: rect.y,
    width: rect.w,
    height: ghost ? Math.min(rect.h, 78) : rect.h,
    '--tone': tone === 'user' ? 'var(--c-user)' : `var(--c-${tone})`,
    '--tone-soft': tone === 'user' ? 'var(--c-action-soft)' : `var(--c-${tone}-soft)`,
    '--pv-w': `${previewWidth}px`,
  } as React.CSSProperties

  const label = component ? `${title}. ${COMPONENTS[component].short} ${active ? 'Attivo.' : 'Non ancora costruito.'}` : title
  const ghostKicker = isNext ? 'Prossimo strato' : `Livello ${lvl + 1}`
  const open = (target: EventTarget | null) => {
    if (!isInteractive(target)) toggleDetails(node)
  }

  const labToggle = component && view === 'lab' && (
    <button
      type="button"
      className={`${styles.cardToggle} ${active ? styles.on : ''}`}
      aria-pressed={active}
      aria-label={active ? `Rimuovi ${title}` : `Aggiungi ${title}`}
      onClick={() => toggleComponent(component)}
    >
      <span className={styles.cardToggleKnob} />
    </button>
  )

  return (
    <div
      data-slot={node}
      className={[styles.slot, styles[`pv_${anchor.h}`], styles[`pv_${anchor.v}`], alarm && styles.slotAlarm].filter(Boolean).join(' ')}
      style={slotStyle}
    >
      <section
        data-node={node}
        className={[
          styles.card,
          ghost && styles.ghost,
          lit && !ghost && styles.lit,
          isNext && styles.next,
          selected && styles.selected,
          alarm && styles.alarm,
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        aria-label={label}
        tabIndex={0}
        aria-haspopup="dialog"
        aria-expanded={selected}
        onClick={e => open(e.target)}
        onKeyDown={(e) => {
          if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault()
            toggleDetails(node)
          }
        }}
      >
        <header className={styles.cardHead}>
          <span className={styles.cardIcon} aria-hidden>
            {icon}
          </span>
          <div className={styles.cardTitles}>
            {ghost && <span className={styles.kicker}>{ghostKicker}</span>}
            <h3 className={styles.cardTitle}>{title}</h3>
          </div>
          {!ghost && status}
          {labToggle}
        </header>
        {!ghost && summary != null && <div className={`${styles.cardSummary} ${tall ? styles.cardSummaryTall : ''}`}>{summary}</div>}
      </section>

      {/* Larger preview on hover / focus: counter-scaled so it stays readable when the map is zoomed out. */}
      <div className={styles.preview} onClick={e => open(e.target)}>
        <header className={styles.previewHead}>
          <span className={styles.cardIcon} aria-hidden>
            {icon}
          </span>
          <div className={styles.cardTitles}>
            <span className={styles.kicker}>{ghost ? ghostKicker : kicker}</span>
            <h3 className={styles.previewTitle}>{title}</h3>
          </div>
          {!ghost && status}
        </header>
        <div className={styles.previewBody}>
          {ghost ? (
            <>
              {component && <p className={styles.previewLead}>{COMPONENTS[component].short}</p>}
              <p className={styles.hint}>{isNext ? 'È il prossimo strato da aggiungere.' : `Si aggiunge al livello ${lvl + 1}.`}</p>
              {component && view === 'lab' && (
                <button type="button" className={styles.addBtn} onClick={() => toggleComponent(component)}>
                  <Plus size={15} aria-hidden /> Aggiungi
                </button>
              )}
            </>
          ) : (
            children
          )}
        </div>
        <footer className={styles.previewFoot} aria-hidden>
          <Maximize2 size={13} /> Clic per tutti i dettagli
        </footer>
      </div>
    </div>
  )
}

export function Led({ state, label }: { state: 'idle' | 'ok' | 'warn' | 'fail'; label: string }) {
  const text = { idle: 'in attesa', ok: 'ok', warn: 'attenzione', fail: 'intervenuto' }[state]
  return (
    <span className={`${styles.led} ${styles[`led_${state}`]}`} role="img" aria-label={`${label}: ${text}`}>
      <span className={styles.ledDot} />
    </span>
  )
}
