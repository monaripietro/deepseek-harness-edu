import { Check, ChevronDown, ChevronUp, CornerDownRight, ListChecks, X } from 'lucide-react'
import { useRef } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import { create } from 'zustand'
import type { PlanState, PlanStep, StageState } from './deriveStage'
import { planChange } from './deriveStage'
import styles from './PlanWindow.module.css'

const MIN_W = 260
const MAX_W = 640
const MIN_H = 120
const DEFAULT_W = 360

/** Where the window sits and how it looks, kept for the session (not persisted). */
interface PlanWindowUi {
  /** null = default spot (bottom-right of the map, clear of the answer card). */
  pos: { x: number; y: number } | null
  w: number
  /** null = as tall as the steps need. */
  h: number | null
  collapsed: boolean
  closed: boolean
  set: (patch: Partial<Omit<PlanWindowUi, 'set'>>) => void
}

export const usePlanWindowUi = create<PlanWindowUi>()(set => ({
  pos: null,
  w: DEFAULT_W,
  h: null,
  collapsed: false,
  closed: false,
  set: (patch) => {
    set(patch)
  },
}))

const STATUS_LABEL: Record<PlanStep['status'], string> = { pending: 'da fare', active: 'in corso', done: 'fatto', failed: 'non riuscito' }

/** Step text without its leading tool name (shown apart as a tag). */
const describe = (st: PlanStep) => (st.tool && st.tool !== 'answer' ? st.text.replace(st.tool, '').replace(/^[\s:—–-]+/, '') : st.text) || st.text
const toolName = (st: PlanStep) => (st.tool === 'answer' ? 'risposta' : st.tool)

/** The step being carried out (or next up); null when none is left. */
export function currentStep(plan: PlanState): PlanStep | null {
  return plan.steps.find(st => st.status === 'active') ?? plan.steps.find(st => st.status === 'pending') ?? null
}

/** The collapsed one-liner: "Passo 2/4 · calcolatrice: calcola il margine" or "Piano completato". */
export function summaryLine(plan: PlanState): string {
  const cur = currentStep(plan)
  if (!cur) return plan.steps.every(st => st.status === 'done') ? 'Piano completato' : 'Piano concluso'
  const tool = toolName(cur)
  return `Passo ${cur.n}/${plan.steps.length} · ${tool ? `${tool}: ` : ''}${describe(cur)}`
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** One line on what an update changed: the model's own reason, else steps added/removed. */
export function changeNote(plan: PlanState): string | null {
  if (plan.version < 2) return null
  if (plan.reason) return `Motivo: ${plan.reason}`
  const ch = planChange(plan)
  if (!ch) return null
  const parts = [
    ch.added.length > 0 ? plural(ch.added.length, 'passo aggiunto', 'passi aggiunti') : '',
    ch.removed.length > 0 ? plural(ch.removed.length, 'passo tolto', 'passi tolti') : '',
  ].filter(Boolean)
  return parts.length > 0 ? `Cosa è cambiato: ${parts.join(', ')}` : 'Cosa è cambiato: stessi passi, riscritti'
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, Math.max(lo, hi)))

/** Track a pointer gesture on window level until release. */
function track(move: (ev: PointerEvent) => void) {
  const stop = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', stop)
    window.removeEventListener('pointercancel', stop)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', stop)
  window.addEventListener('pointercancel', stop)
}

/**
 * The model's plan as a small floating window over the map: draggable by its header, resizable from
 * its corner, collapsible to a single line (the current step). Mount inside the map viewport.
 */
export function PlanWindow({ stage }: { stage: StageState }) {
  const ui = usePlanWindowUi()
  const ref = useRef<HTMLElement>(null)
  const plan = stage.plan
  if (!plan) return null

  if (ui.closed) {
    return (
      <button
        type="button"
        className={styles.chip}
        data-panel
        onClick={() => { ui.set({ closed: false }) }}
        aria-label="Riapri il piano del modello"
      >
        <ListChecks size={16} aria-hidden /> Piano
      </button>
    )
  }

  const done = plan.steps.filter(st => st.status === 'done').length
  const current = currentStep(plan)
  const note = changeNote(plan)

  const startDrag = (e: ReactPointerEvent<HTMLElement>) => {
    const el = ref.current
    const parent = el?.offsetParent
    if (!el || !parent || e.button !== 0 || (e.target as Element).closest('button')) return
    e.preventDefault()
    e.stopPropagation()
    const dx = e.clientX - el.offsetLeft
    const dy = e.clientY - el.offsetTop
    track((ev) => {
      ui.set({
        pos: {
          x: clamp(ev.clientX - dx, 0, parent.clientWidth - el.offsetWidth),
          y: clamp(ev.clientY - dy, 0, parent.clientHeight - el.offsetHeight),
        },
      })
    })
  }

  const startResize = (e: ReactPointerEvent<HTMLElement>) => {
    const el = ref.current
    const parent = el?.offsetParent
    if (!el || !parent || e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    const x0 = e.clientX
    const y0 = e.clientY
    const w0 = el.offsetWidth
    const h0 = el.offsetHeight
    // Pin the position so growing the window does not slide it (default spot is anchored bottom-right).
    if (!ui.pos) ui.set({ pos: { x: el.offsetLeft, y: el.offsetTop } })
    track((ev) => {
      ui.set({
        w: clamp(w0 + ev.clientX - x0, MIN_W, Math.min(MAX_W, parent.clientWidth - el.offsetLeft)),
        h: clamp(h0 + ev.clientY - y0, MIN_H, parent.clientHeight - el.offsetTop),
      })
    })
  }

  const style: CSSProperties = {
    width: ui.w,
    ...(ui.pos ? { left: ui.pos.x, top: ui.pos.y } : { right: 16, bottom: 16 }),
    ...(!ui.collapsed && ui.h !== null ? { height: ui.h } : {}),
  }

  return (
    // data-panel: the map ignores gestures that start here (no pan on drag, no zoom on wheel).
    <section ref={ref} className={styles.window} style={style} aria-label="Piano del modello" data-panel>
      <header className={styles.head} onPointerDown={startDrag}>
        <span className={styles.title}>Piano del modello</span>
        {plan.version > 1 && <span className={styles.version}>v{plan.version} · aggiornato</span>}
        <span className={styles.count}>
          {done}/{plan.steps.length}
        </span>
        <button
          type="button"
          className={styles.iconBtn}
          aria-expanded={!ui.collapsed}
          aria-label={ui.collapsed ? 'Espandi il piano' : 'Comprimi il piano'}
          onClick={() => { ui.set({ collapsed: !ui.collapsed }) }}
        >
          {ui.collapsed ? <ChevronDown size={16} aria-hidden /> : <ChevronUp size={16} aria-hidden />}
        </button>
        <button type="button" className={styles.iconBtn} aria-label="Chiudi il piano" onClick={() => { ui.set({ closed: true }) }}>
          <X size={16} aria-hidden />
        </button>
      </header>
      {ui.collapsed ? (
        <p className={styles.summary} title={summaryLine(plan)}>
          {summaryLine(plan)}
        </p>
      ) : (
        <div className={styles.body}>
          {note && <p className={styles.note}>{note}</p>}
          <ol className={styles.steps}>
            {plan.steps.map(st => (
              <li key={st.n} className={`${styles.step} ${styles[st.status]} ${st === current ? styles.current : ''}`} aria-current={st === current ? 'step' : undefined}>
                <span className={styles.mark} role="img" aria-label={STATUS_LABEL[st.status]}>
                  {st.status === 'done' ? <Check size={13} aria-hidden /> : st.status === 'failed' ? <X size={13} aria-hidden /> : st.n}
                </span>
                <span className={styles.stepBody}>
                  <span className={styles.stepText}>
                    {st.tool && <code className={styles.tool}>{toolName(st)}</code>}
                    {describe(st)}
                  </span>
                  <span className={styles.status}>{STATUS_LABEL[st.status]}</span>
                </span>
              </li>
            ))}
          </ol>
          {plan.offPlan.length > 0 && (
            <p className={styles.off}>
              <CornerDownRight size={14} aria-hidden /> Fuori dal piano: {plan.offPlan.join(', ')}
            </p>
          )}
        </div>
      )}
      {!ui.collapsed && <span className={styles.grip} onPointerDown={startResize} aria-hidden />}
    </section>
  )
}
