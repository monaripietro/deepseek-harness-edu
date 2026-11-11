import type { ReactNode } from 'react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react'
import { Cpu, GitBranch, ListOrdered, Maximize2, Repeat, ZoomIn, ZoomOut } from 'lucide-react'
import type { ComponentId, TraceEvent } from '../../domain/types'
import { EVENT_PACE_MS } from '../../harness/events'
import { useT } from '../../i18n'
import { useLab } from '../../state/store'
import { EVENT_LABEL } from '../common/labels'
import { Tabs, tabId } from '../common/Tabs'
import { AnswerCard, ContextCard, ControlsCard, HumanCard, InstructionsCard, McpCard, MemoryCard, QuestionCard, RagCard, ToolsCard, WindowCard } from './cards'
import type { Phase, StageState } from './deriveStage'
import { PHASE_LABEL, deriveStage } from './deriveStage'
import type { FlyerKind } from './flyers'
import { flyersFor } from './flyers'
import type { EdgeId, StageNodeId, StationId } from './geometry'
import type { Rect } from './geometry'
import { CORE, RING, STATIONS, STATION_LABEL_R, edgePath, layoutFor, ringAt, samplePath } from './geometry'
import { levelsFor } from '../../harness/levels'
import { SCENARIOS } from '../../scenarios'
import { NodeDetails } from './NodeDetails'
import { PlanWindow } from './PlanWindow'
import { FlowOverview } from './FlowOverview'
import { isInteractive, useStage, useStageUi } from './stageUi'
import styles from './stage.module.css'
import chrome from './StageChrome.module.css'
import { StageHud } from './StageHud'
import { StageTransport } from './StageTransport'
import layout from './EngineStage.module.css'

interface ActiveFlyer {
  id: number
  edge: EdgeId
  xs: number[]
  ys: number[]
  label: string
  kind: FlyerKind
  duration: number
  delay: number
  /** Step-by-step: the packet rests at the end of its wire while its event is held. */
  hold: boolean
  eventId: string
  rest?: boolean
}

const MAX_FLYERS = 14
/** Extra samples held on the destination of a packet (about a fifth of its trip). */
const FLYER_PAUSE = 9
/** Zoom is relative to "the whole map fits": 100% frames every card, from the request to the answer. */
const DEFAULT_ZOOM = 1
const ZOOM_MIN = 0.8
const ZOOM_MAX = 6
const FIT_MARGIN = 36
/** Height reserved at the top of the stage for the caption and zoom row, so they never cover the map. */
const TOP_INSET = 32
const PAN_STEP = 80
let flyerSeq = 0

/** Wires that exist for the current harness composition. */
function wiresFor(c: Record<ComponentId, boolean>): { id: EdgeId; on: boolean; family: string }[] {
  const orch = c.orchestrator
  return [
    { id: 'question-window', on: true, family: 'model' },
    { id: 'window-model', on: true, family: 'model' },
    { id: 'instructions-window', on: c.instructions, family: 'information' },
    { id: 'context-window', on: c.context, family: 'information' },
    { id: 'memory-window', on: c.memory, family: 'information' },
    { id: 'rag-window', on: c.rag, family: 'information' },
    { id: 'question-rag', on: c.rag, family: 'information' },
    { id: orch ? 'ring-answer' : 'model-answer', on: true, family: 'model' },
    { id: 'model-ring', on: orch, family: 'orchestration' },
    { id: 'ring-window', on: orch && c.tools, family: 'action' },
    { id: 'ring-tools', on: orch && c.tools, family: 'action' },
    { id: 'ring-controls', on: orch && c.controls, family: 'governance' },
    { id: 'ring-human', on: orch && c.approval, family: 'governance' },
    { id: 'ring-mcp', on: orch && c.mcp, family: 'action' },
  ]
}

/** Which loop station a phase belongs to. While the model reads its prompt (no tokens yet) it is "reading". */
function stationFor(phase: Phase, streaming: boolean): StationId | null {
  switch (phase) {
    case 'collecting':
      return 'read'
    case 'reading':
      return streaming ? 'decide' : 'read'
    case 'deciding':
      return 'decide'
    case 'validating':
    case 'executing':
    case 'waitingHuman':
      return 'act'
    case 'observing':
      return 'observe'
    default:
      return null
  }
}

/** True when an element between target and the viewport can still scroll in the wheel direction. */
function canScroll(target: Element | null, stop: HTMLElement, dy: number): boolean {
  for (let n = target; n && n !== stop; n = n.parentElement) {
    const oy = getComputedStyle(n).overflowY
    if ((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight + 1) {
      if (dy < 0 ? n.scrollTop > 0 : n.scrollTop + n.clientHeight < n.scrollHeight - 1) return true
    }
  }
  return false
}

/** A classic mouse wheel scrolls in coarse integer notches; trackpads send small, fractional or horizontal deltas. */
function isMouseWheel(e: WheelEvent): boolean {
  return e.deltaMode !== 0 || (e.deltaX === 0 && Math.abs(e.deltaY) >= 40 && Number.isInteger(e.deltaY))
}

/**
 * Camera over the map: the pan offset from the centre of the drawn content and a zoom relative to
 * "the content fits" (1). The fit uses the bounding box of what is drawn (not a fixed world), centred
 * in the area under the top row, and follows the stage size (ResizeObserver) and the composition.
 */
function useViewportTransform(viewportRef: React.RefObject<HTMLDivElement | null>, bbox: Rect) {
  const [size, setSize] = useState({ w: 1200, h: 600 })
  const [cam, setCam] = useState({ zoom: DEFAULT_ZOOM, dx: 0, dy: 0 })
  useLayoutEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const measure = () => {
      const r = el.getBoundingClientRect()
      setSize(cur => (cur.w === r.width && cur.h === r.height ? cur : { w: r.width, h: r.height }))
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () =>{  ro.disconnect() }
  }, [viewportRef])

  const availH = Math.max(40, size.h - TOP_INSET)
  const fit = Math.max(0.05, Math.min((size.w - FIT_MARGIN * 2) / bbox.w, (availH - FIT_MARGIN * 2) / bbox.h))
  const s = fit * cam.zoom
  const mx0 = size.w / 2
  const my0 = TOP_INSET + availH / 2
  const bcx = bbox.x + bbox.w / 2
  const bcy = bbox.y + bbox.h / 2
  const cx = bcx + cam.dx
  const cy = bcy + cam.dy
  const tx = mx0 - cx * s
  const ty = my0 - cy * s

  /** Zoom keeping the world point under (mx, my) fixed on screen. */
  const zoomAt = (nextZoom: number, mx = mx0, my = my0) => {
    const z = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, nextZoom))
    const wx = (mx - tx) / s
    const wy = (my - ty) / s
    const s2 = fit * z
    setCam({ zoom: z, dx: wx - (mx - mx0) / s2 - bcx, dy: wy - (my - my0) / s2 - bcy })
  }
  const panBy = (dx: number, dy: number) =>{  setCam(c => ({ ...c, dx: c.dx - dx / (fit * c.zoom), dy: c.dy - dy / (fit * c.zoom) })) }
  const centerOn = (wx: number, wy: number) =>{  setCam(c => ({ ...c, dx: wx - bcx, dy: wy - bcy })) }
  /** 100%: all the content on screen, centred. */
  const showAll = () =>{  setCam({ zoom: DEFAULT_ZOOM, dx: 0, dy: 0 }) }
  const pct = Math.round((cam.zoom / DEFAULT_ZOOM) * 100)
  return { s, tx, ty, size, zoom: cam.zoom, pct, zoomAt, panBy, centerOn, showAll, home: showAll }
}

/** Overview of the whole map with the visible area; click or drag to move there. */
interface MinimapProps {
  view: ReturnType<typeof useViewportTransform>
  bbox: Rect
  layout: ReturnType<typeof layoutFor>
}

function Minimap({ view, bbox, layout }: MinimapProps) {
  const t = useT()
  const W = 200
  const H = (W * bbox.h) / bbox.w
  const k = W / bbox.w
  const drag = useRef(false)
  const jump = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const x = bbox.x + Math.min(bbox.w, Math.max(0, (e.clientX - r.left) / k))
    const y = bbox.y + Math.min(bbox.h, Math.max(0, (e.clientY - r.top) / k))
    view.centerOn(x, y)
  }
  const vx = -view.tx / view.s
  const vy = -view.ty / view.s
  const vw = view.size.w / view.s
  const vh = view.size.h / view.s
  const B = layout.boundary
  return (
    <div
      className={styles.minimap}
      data-zoom
      title={t('Panoramica: clicca o trascina per spostarti', 'Overview: click or drag to move around')}
      onPointerDown={(e) => {
        drag.current = true
        e.currentTarget.setPointerCapture(e.pointerId)
        jump(e)
      }}
      onPointerMove={(e) => {
        if (drag.current) jump(e)
      }}
      onPointerUp={() => {
        drag.current = false
      }}
      onPointerCancel={() => {
        drag.current = false
      }}
    >
      <svg width={W} height={H} viewBox={`${bbox.x} ${bbox.y} ${bbox.w} ${bbox.h}`} aria-hidden>
        <rect className={styles.miniBoundary} x={B.x} y={B.y} width={B.w} height={B.h} rx="30" />
        {Object.entries(layout.rects).map(([id, r]) => (
          <rect key={id} className={styles.miniCard} x={r.x} y={r.y} width={r.w} height={r.h} rx="18" />
        ))}
        <circle className={styles.miniRing} cx={RING.cx} cy={RING.cy} r={RING.r} />
        <circle className={styles.miniCore} cx={CORE.cx} cy={CORE.cy} r={CORE.r} />
        <rect className={styles.miniView} x={vx} y={vy} width={vw} height={vh} rx="12" />
      </svg>
    </div>
  )
}

/**
 * The system map with its chrome: the "Adesso" strip on top (what is happening, which step), the
 * map or the simplified flow in the middle, and a docked control bar at the bottom (view switch,
 * playback incl. step-by-step, and the page-level actions passed by the app).
 */
export function EngineStage({ onApprovalDetails, actions }: { onApprovalDetails: () => void; actions?: ReactNode }) {
  const t = useT()
  const [mode, setMode] = useState<'flow' | 'map'>('map')
  const stage = useStage()
  return (
    <section className={layout.stage} aria-label={t('Come funziona il sistema', 'How the system works')}>
      <StageHud stage={stage} onApprovalDetails={onApprovalDetails} />
      <div id="engine-view-panel" role="tabpanel" aria-labelledby={tabId('engine-view', mode)} className={layout.content}>
        {mode === 'flow' ? <FlowOverview onApprovalDetails={onApprovalDetails} /> : <DetailedEngineStage onApprovalDetails={onApprovalDetails} />}
      </div>
      <div className={chrome.bar}>
        <div className={chrome.barStart}>
          <Tabs
            tabs={[
              { id: 'map', label: t('Mappa', 'Map'), icon: <GitBranch size={15} aria-hidden /> },
              { id: 'flow', label: t('Flusso', 'Flow'), icon: <ListOrdered size={15} aria-hidden /> },
            ]}
            value={mode}
            onChange={setMode}
            ariaLabel={t('Visualizzazione del sistema', 'System view')}
            idBase="engine-view"
          />
        </div>
        <StageTransport />
        {actions && <div className={chrome.barEnd}>{actions}</div>}
      </div>
    </section>
  )
}

function DetailedEngineStage({ onApprovalDetails }: { onApprovalDetails: () => void }) {
  const t = useT()
  const events = useLab(s => s.events)
  const config = useLab(s => s.config)
  const speed = useLab(s => s.speed)
  const fastForward = useLab(s => s.fastForward)
  const status = useLab(s => s.status)
  const reduced = useReducedMotion()
  const c = config.components
  const stage = useMemo(() => deriveStage(events, c.orchestrator), [events, c.orchestrator])
  const selected = useStageUi(s => s.selected)

  // ── zoom & pan ──
  const viewportRef = useRef<HTMLDivElement>(null)
  const layout = useMemo(() => layoutFor(c), [c])
  const view = useViewportTransform(viewportRef, layout.bbox)
  const viewRef = useRef(view)
  viewRef.current = view

  // Re-frame the whole map when the level or scenario changes and when the run is reset.
  const level = useLab(s => s.level)
  const scenarioId = useLab(s => s.scenarioId)
  const isReset = events.length === 0
  useEffect(() => {
    viewRef.current.showAll()
  }, [level, scenarioId, isReset])

  // The hint at the top fades after a few seconds or on the first interaction.
  const [hint, setHint] = useState(true)
  useEffect(() => {
    const t = setTimeout(() => {  setHint(false) }, 7000)
    return () =>{  clearTimeout(t) }
  }, [])

  // Wheel: mouse wheel and pinch zoom around the cursor; two-finger trackpad scroll pans.
  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      const target = e.target instanceof Element ? e.target : null
      if (target?.closest('[data-panel], textarea')) return
      if (!e.ctrlKey && !e.metaKey && canScroll(target, el, e.deltaY)) return
      e.preventDefault()
      const v = viewRef.current
      if (e.ctrlKey || e.metaKey || isMouseWheel(e)) {
        const rect = el.getBoundingClientRect()
        const k = e.ctrlKey ? 0.01 : 0.0015
        v.zoomAt(v.zoom * Math.exp(-e.deltaY * k), e.clientX - rect.left, e.clientY - rect.top)
      } else {
        v.panBy(-e.deltaX, -e.deltaY)
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () =>{  el.removeEventListener('wheel', onWheel) }
  }, [])

  // Drag to pan from anywhere (background or cards); a drag never opens a card.
  const drag = useRef<{ x: number; y: number; moved: boolean; id: number } | null>(null)
  const suppressClick = useRef(false)
  const onPointerDown = (e: React.PointerEvent) => {
    const t = e.target as HTMLElement
    const onMapButton = !!t.closest('button[data-node]')
    if (e.button !== 0 || (!onMapButton && isInteractive(t)) || t.closest('[data-panel], [data-zoom]')) return
    drag.current = { x: e.clientX, y: e.clientY, moved: false, id: e.pointerId }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    if (!d.moved) {
      if (Math.hypot(dx, dy) < 4) return
      d.moved = true
      const el = viewportRef.current
      el?.setPointerCapture(e.pointerId)
      if (styles.dragging) el?.classList.add(styles.dragging)
    }
    view.panBy(dx, dy)
    d.x = e.clientX
    d.y = e.clientY
  }
  const endDrag = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    if (d.moved) suppressClick.current = true
    if (styles.dragging) viewportRef.current?.classList.remove(styles.dragging)
    if (viewportRef.current?.hasPointerCapture(e.pointerId)) viewportRef.current.releasePointerCapture(e.pointerId)
    drag.current = null
  }
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.target !== e.currentTarget) return
    const v = viewRef.current
    const keys: Record<string, () => void> = {
      ArrowLeft: () =>{  v.panBy(PAN_STEP, 0) },
      ArrowRight: () =>{  v.panBy(-PAN_STEP, 0) },
      ArrowUp: () =>{  v.panBy(0, PAN_STEP) },
      ArrowDown: () =>{  v.panBy(0, -PAN_STEP) },
      '+': () =>{  v.zoomAt(v.zoom * 1.2) },
      '=': () =>{  v.zoomAt(v.zoom * 1.2) },
      '-': () =>{  v.zoomAt(v.zoom / 1.2) },
      '0': () =>{  v.showAll() },
      '1': () =>{  v.home() },
    }
    const act = keys[e.key]
    if (!act) return
    e.preventDefault()
    e.stopPropagation()
    act()
  }

  // ── flyers: one projection per new trace event ──
  const [flyers, setFlyers] = useState<ActiveFlyer[]>([])
  const [hot, setHot] = useState<Partial<Record<EdgeId, number>>>({})
  const heldId = useLab(s => s.heldEvent?.id ?? null)
  const heldRef = useRef<string | null>(heldId)
  heldRef.current = heldId
  const lastSeq = useRef(events.at(-1)?.seq ?? 0)
  // Packets resting for a held event are released as soon as another event is held (or none).
  useEffect(() => {
    setFlyers(cur => (cur.some(f => f.rest && f.eventId !== heldId) ? cur.filter(f => !f.rest || f.eventId === heldId) : cur))
  }, [heldId])
  useEffect(() => {
    const fresh: TraceEvent[] = []
    for (let i = events.length - 1; i >= 0; i--) {
      const e = events[i]
      if (!e || e.seq <= lastSeq.current) break
      fresh.unshift(e)
    }
    if (events.length === 0) lastSeq.current = 0
    const newest = fresh.at(-1)
    if (!newest) return
    lastSeq.current = newest.seq
    if (fastForward || speed <= 0) return
    const spawned: ActiveFlyer[] = []
    const heat: Partial<Record<EdgeId, number>> = {}
    // Several events can arrive at once (fast speed, resume after a pause): every wire they used
    // lights up, but packets fly only for the newest event that has any, so they never pile up
    // and the animation always shows the current step.
    let newestWithFlyers: TraceEvent | undefined
    for (const e of fresh) if (flyersFor(e, c).length) newestWithFlyers = e
    for (const e of fresh) {
      const specs = flyersFor(e, c)
      const base = ((EVENT_PACE_MS[e.type] ?? 400) / speed) * 0.9
      for (const f of specs) {
        heat[f.edge] = Date.now() + base + 600
        if (reduced || e !== newestWithFlyers) continue
        const pts = samplePath(layout.edges[f.edge], 30, f.reverse)
        // A short pause on the last point so the message can be read before it disappears.
        const last = pts[pts.length - 1]
        if (last) for (let k = 0; k < FLYER_PAUSE; k++) pts.push(last)
        spawned.push({
          id: ++flyerSeq,
          edge: f.edge,
          xs: pts.map(p => p.x),
          ys: pts.map(p => p.y),
          label: f.label,
          kind: f.kind,
          duration: Math.max(1.1, (base / 1000) * 1.3),
          delay: ((f.delay ?? 0) * base) / 1000,
          hold: useLab.getState().stepMode,
          eventId: e.id,
        })
      }
    }
    if (Object.keys(heat).length) setHot(h => ({ ...h, ...heat }))
    if (spawned.length) {
      // One packet per wire at a time: a new one replaces whatever is still travelling there.
      const uniq = spawned.filter(f => !spawned.some(g => g.edge === f.edge && g.id > f.id))
      const edges = new Set(uniq.map(f => f.edge))
      setFlyers(cur => [...cur.filter(x => !edges.has(x.edge)), ...uniq].slice(-MAX_FLYERS))
    }
  }, [events, c, layout, speed, fastForward, reduced])

  // cool down hot wires
  useEffect(() => {
    const t = setInterval(() => {
      const now = Date.now()
      setHot((h) => {
        const next: Partial<Record<EdgeId, number>> = {}
        let changed = false
        for (const [k, v] of Object.entries(h)) {
          if (v > now) next[k as EdgeId] = v
          else changed = true
        }
        return changed ? next : h
      })
    }, 300)
    return () =>{  clearInterval(t) }
  }, [])

  const lit = (id: StageNodeId) => stage.lit.includes(id)
  const wires = wiresFor(c)
  const running = status === 'running' || status === 'awaitingApproval'
  const worldW = layout.bbox.x + layout.bbox.w + 60
  const worldH = layout.bbox.y + layout.bbox.h + 60
  const worldStyle = {
    width: worldW,
    height: worldH,
    transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.s})`,
    '--inv': Math.max(1, 1 / view.s),
  } as React.CSSProperties

  return (
    <div
      className={styles.viewport}
      ref={viewportRef}
      tabIndex={0}
      aria-label={t('Mappa del sistema: trascina per spostarti, rotella o + e − per lo zoom, frecce per muoverti, 0 o 1 per vederla tutta', 'System map: drag to move, mouse wheel or + and − to zoom, arrow keys to move, 0 or 1 to see it all')}
      onKeyDown={(e) => {
        setHint(false)
        onKeyDown(e)
      }}
      onWheel={() => {  setHint(false) }}
      onPointerDown={(e) => {
        setHint(false)
        onPointerDown(e)
      }}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onClickCapture={(e) => {
        if (suppressClick.current) {
          suppressClick.current = false
          e.stopPropagation()
          e.preventDefault()
        }
      }}
      onDoubleClick={(e) => {
        if ((e.target as HTMLElement).closest('[data-node], [data-slot], [data-panel], [data-zoom]')) return
        if (view.zoom > 1.2) view.showAll()
        else view.zoomAt(2)
      }}
    >
      <div className={styles.world} style={worldStyle}>
        {/* ── wires, boundary and column labels ── */}
        <svg className={styles.wires} viewBox={`0 0 ${worldW} ${worldH}`} width={worldW} height={worldH} aria-hidden>
          <defs>
            <marker id="stage-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerUnits="userSpaceOnUse" markerWidth="24" markerHeight="24" orient="auto-start-reverse">
              <path d="M 0 0.5 L 10 5 L 0 9.5 z" fill="context-stroke" stroke="context-stroke" strokeWidth="0.6" strokeLinejoin="round" />
            </marker>
            <pattern id="dots" width="22" height="22" patternUnits="userSpaceOnUse">
              <circle cx="1.5" cy="1.5" r="1.3" fill="var(--canvas-grid)" />
            </pattern>
          </defs>
          <rect x="-4000" y="-4000" width={worldW + 8000} height={worldH + 8000} fill="url(#dots)" />
          <rect className={styles.boundary} x={layout.boundary.x} y={layout.boundary.y} width={layout.boundary.w} height={layout.boundary.h} rx="28" />
          <text className={styles.boundaryLabel} x={layout.boundary.x + 26} y={layout.boundary.y - 14}>
            {t('IL TUO BROWSER · tutto ciò che sta qui dentro gira sul tuo computer', 'YOUR BROWSER · everything inside here runs on your computer')}
          </text>
          <text className={styles.colLabel} style={{ fontSize: 15 }} x={layout.rects.mcp.x + 4} y={layout.rects.mcp.y - 16}>
            {t('SERVIZI ESTERNI', 'EXTERNAL SERVICES')}
          </text>
          {layout.labels.map(l => (
            <text key={l.text} className={styles.colLabel} x={l.x} y={l.y}>
              {l.text}
            </text>
          ))}
          {wires.filter(w => w.on).map(w => (
            <path
              key={w.id}
              d={edgePath(layout.edges[w.id])}
              markerEnd={w.on ? 'url(#stage-arrow)' : undefined}
              className={[styles.wire, !w.on && styles.wireGhost, w.on && hot[w.id] && styles.wireHot].filter(Boolean).join(' ')}
              style={{ '--wire': `var(--c-${w.family})` } as React.CSSProperties}
            />
          ))}
          {wires
            .filter(w => w.on)
            .flatMap(w => [
              { key: `${w.id}-a`, p: layout.edges[w.id].from, w },
              { key: `${w.id}-b`, p: layout.edges[w.id].to, w },
            ])
            .map(({ key, p, w }) => (
              <circle
                key={key}
                cx={p.x}
                cy={p.y}
                r={7}
                className={`${styles.wireDot} ${hot[w.id] ? styles.wireDotHot : ''}`}
                style={{ '--wire': `var(--c-${w.family})` } as React.CSSProperties}
              />
            ))}
        </svg>

        {/* ── permanent captions of the main wires (they step aside while a packet travels there) ── */}
        {wires
          .filter(w => w.on && layout.edgeLabels[w.id])
          .map((w) => {
            const l = layout.edgeLabels[w.id]
            if (!l) return null
            const busy = flyers.some(f => f.edge === w.id)
            return (
              <div
                key={w.id}
                className={`${styles.edgeLabel} ${busy ? styles.edgeLabelBusy : ''}`}
                style={{ left: l.x, top: l.y, '--wire': `var(--c-${w.family})` } as React.CSSProperties}
              >
                {l.text}
              </div>
            )
          })}

        {/* ── agent loop around the model ── */}
        <AgentLoop stage={stage} selected={selected === 'orchestrator'} />
        <ModelCore stage={stage} lit={lit('model')} selected={selected === 'model'} />

        {/* ── cards (collapsed tiles; hover for a larger preview, click for the details) ── */}
        <QuestionCard lit={lit('question')} />
        <InstructionsCard active={c.instructions} lit={lit('instructions')} />
        <ContextCard active={c.context} lit={lit('context')} />
        <MemoryCard stage={stage} active={c.memory} lit={lit('memory')} />
        <RagCard stage={stage} active={c.rag} lit={lit('rag')} />
        <WindowCard stage={stage} lit={lit('window')} />
        <AnswerCard stage={stage} lit={lit('answer')} />
        <ToolsCard stage={stage} active={c.tools} lit={lit('tools')} />
        <ControlsCard stage={stage} active={c.controls} lit={lit('controls')} />
        <HumanCard stage={stage} active={c.approval} lit={lit('human')} />
        <McpCard stage={stage} active={c.mcp} lit={lit('mcp')} />

        {/* ── travelling packets ── */}
        <div className={styles.flyerLayer} aria-hidden>
          <AnimatePresence>
            {flyers.map(f => (
              <motion.div
                key={f.id}
                className={`${styles.flyer} ${styles[`fly_${f.kind}`]}`}
                initial={{ x: f.xs[0], y: f.ys[0], opacity: 0, scale: 0.6 }}
                animate={{ x: f.xs, y: f.ys, opacity: [0, 1, 1, f.hold ? 1 : 0], scale: [0.6, 1, 1, f.hold ? 1 : 0.8] }}
                transition={{
                  duration: f.duration,
                  delay: f.delay,
                  ease: 'easeInOut',
                  opacity: { duration: f.duration, delay: f.delay, times: [0, 0.07, 0.93, 1], ease: 'linear' },
                  scale: { duration: f.duration, delay: f.delay, times: [0, 0.07, 0.93, 1], ease: 'linear' },
                }}
                onAnimationComplete={() => {
                  if (f.hold && heldRef.current === f.eventId) setFlyers(cur => cur.map(x => (x.id === f.id ? { ...x, rest: true } : x)))
                  else setFlyers(cur => cur.filter(x => x.id !== f.id))
                }}
              >
                <span className={styles.flyerChip}>{f.label}</span>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>

      <PlanWindow stage={stage} />

      <div className={styles.topRow}>
        {/* What is happening is told once, by the "Adesso" strip above: here only the first-use hint. */}
        <p className={styles.liveCaption} aria-hidden>
          {hint && !running && !stage.runId && (
            <span className={styles.hintText}>{t('Passa sopra un elemento per ingrandirlo · clic per i dettagli', 'Hover over an element to enlarge it · click for details')}</span>
          )}
        </p>
        <div className={styles.zoomBar} data-zoom role="toolbar" aria-label={t('Zoom della vista', 'Zoom the view')}>
          <button type="button" onClick={() =>{  view.zoomAt(view.zoom / 1.25) }} aria-label={t('Allontana', 'Zoom out')} title={t('Allontana (−)', 'Zoom out (−)')}>
            <ZoomOut size={15} />
          </button>
          <button type="button" className={styles.zoomPct} onClick={view.home} title={t('Inquadra tutta la mappa (1)', 'Fit the whole map (1)')}>
            {view.pct}%
          </button>
          <button type="button" onClick={() =>{  view.zoomAt(view.zoom * 1.25) }} aria-label={t('Avvicina', 'Zoom in')} title={t('Avvicina (+)', 'Zoom in (+)')}>
            <ZoomIn size={15} />
          </button>
          <button type="button" onClick={view.showAll} aria-label={t('Mostra tutta la mappa', 'Show the whole map')} title={t('Mostra tutta la mappa (0)', 'Show the whole map (0)')}>
            <Maximize2 size={14} />
          </button>
        </div>
      </div>
      {/* Only useful once zoomed in: at 100% the whole map is already on screen. */}
      {view.zoom > DEFAULT_ZOOM * 1.05 && <Minimap view={view} bbox={layout.bbox} layout={layout} />}

      <AnimatePresence>
        {selected && <NodeDetails key={selected} node={selected} stage={stage} onApprovalDetails={onApprovalDetails} />}
      </AnimatePresence>
      <StageAnnouncer stage={stage} />
    </div>
  )
}

function ModelCore({ stage, lit, selected }: { stage: StageState; lit: boolean; selected: boolean }) {
  const t = useT()
  const info = useLab(s => s.modelInfo)
  const streaming = useLab(s => s.streamingText)
  const toggle = useStageUi(s => s.toggle)
  const busy = stage.modelBusy
  const activity = useLab(s => s.modelActivity)
  const tail = streaming.slice(-54)
  const coreNote = activity?.kind === 'thinking'
    ? `${t('ragiona…', 'thinking…')}${activity.tokens ? ` ${activity.tokens} token` : ''}`
    : tail || t('sta leggendo…', 'reading…')
  return (
    <>
      <motion.button
        type="button"
        data-node="model"
        className={[styles.core, busy && styles.coreBusy, lit && styles.coreLit, selected && styles.coreSelected].filter(Boolean).join(' ')}
        style={{ left: CORE.cx - CORE.r, top: CORE.cy - CORE.r, width: CORE.r * 2, height: CORE.r * 2 }}
        animate={busy ? { scale: [1, 1.035, 1] } : { scale: 1 }}
        transition={busy ? { duration: 1.6, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.3 }}
        aria-label={`${t('Modello linguistico', 'Language model')}: ${info.label}. ${busy ? t('Sta lavorando.', 'Working.') : t('In attesa.', 'Waiting.')} ${t('Apri i dettagli.', 'Open details.')}`}
        aria-pressed={selected}
        onClick={() =>{  toggle('model') }}
      >
        <Cpu size={34} aria-hidden className={styles.coreIcon} />
        <span className={styles.coreTitle}>{t('MODELLO', 'MODEL')}</span>
        <span className={styles.coreName}>{info.label.replace(/\s*\(.*\)$/, '')}</span>
        <AnimatePresence>
          {busy && (
            <motion.span className={styles.coreStream} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {coreNote}
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>
      <div className={styles.fingerprint} style={{ left: CORE.cx, top: CORE.cy + CORE.r + 34 }}>
        {t('pesi', 'weights')} <span>{info.fingerprint}</span> {t('invariati', 'unchanged')} · {stage.modelCalls} {stage.modelCalls === 1 ? t('chiamata', 'call') : t('chiamate', 'calls')}
      </div>
    </>
  )
}

const STATION_DEG = Object.fromEntries(STATIONS.map(s => [s.id, s.deg])) as Record<StationId, number>
const SIZE = RING.r * 2 + 420
const OFF = SIZE / 2
/** Ring geometry in the local coordinates of the loop svg. */
const local = (deg: number, r = RING.r) => {
  const p = ringAt(deg, r)
  return { x: p.x - RING.cx + OFF, y: p.y - RING.cy + OFF }
}
/** Clockwise arc between two stations, shortened at both ends to leave room for the station dots. */
const localArc = (from: number, to: number, gap = 11) => {
  let end = to
  while (end <= from) end += 360
  const a = from + gap
  const b = end - gap
  const p = local(a)
  const q = local(b)
  return `M ${p.x} ${p.y} A ${RING.r} ${RING.r} 0 ${b - a > 180 ? 1 : 0} 1 ${q.x} ${q.y}`
}

/**
 * The agent loop drawn as a track around the model: four stations (read → decide → act → observe),
 * clockwise arrows, a token that travels to the current station and a lap counter.
 * The arc from "observe" back to "read" is the agent loop itself: dashed when there is only one round.
 */
function AgentLoop({ stage, selected }: { stage: StageState; selected: boolean }) {
  const t = useT()
  const c = useLab(s => s.config.components)
  const maxSteps = useLab(s => s.config.limits.maxSteps)
  const streaming = useLab(s => s.streamingText.length > 0)
  const speed = useLab(s => s.speed)
  const toggle = useStageUi(s => s.toggle)
  const scenario = useLab(s => SCENARIOS.find(item => item.id === s.scenarioId))
  const orchLevel = (levelsFor(scenario).find(l => l.adds.includes('orchestrator'))?.id ?? -1) + 1
  const on = c.orchestrator
  const loop = on && c.agentLoop
  const station = on && stage.running ? stationFor(stage.phase, streaming) : null

  // The token only moves forward (clockwise): each new lap adds 360°.
  const deg = useMotionValue(STATION_DEG.read)
  useEffect(() => {
    if (!station) return
    const cur = deg.get()
    let target = STATION_DEG[station]
    while (target < cur - 0.5) target += 360
    if (target === cur) return
    const ctl = animate(deg, target, {
      duration: Math.min(1.6, ((target - cur) / 90) * 0.55) / Math.max(0.5, speed),
      ease: [0.45, 0, 0.25, 1],
    })
    return () =>{  ctl.stop() }
  }, [station, stage.step, deg, speed])
  const tokenX = useTransform(deg, d => local(d).x)
  const tokenY = useTransform(deg, d => local(d).y)
  const trail = useTransform(deg, (d) => {
    const a = local(d - 42)
    const b = local(d)
    return `M ${a.x} ${a.y} A ${RING.r} ${RING.r} 0 0 1 ${b.x} ${b.y}`
  })

  const order: StationId[] = ['read', 'decide', 'act', 'observe']
  const arcs = order.map((id, i) => {
    // The modulo keeps the index in range; 'read' is where the lap wraps around.
    const next = order[(i + 1) % order.length] ?? 'read'
    return { from: id, to: next, d: localArc(STATION_DEG[id], STATION_DEG[next]), back: next === 'read' }
  })

  return (
    <>
      <svg className={styles.loopSvg} style={{ left: RING.cx - OFF, top: RING.cy - OFF }} width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden>
        <defs>
          <marker id="loopArrow" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" className={styles.loopArrowHead} />
          </marker>
          <marker id="loopArrowHot" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" className={styles.loopArrowHeadHot} />
          </marker>
        </defs>

        {!on && <circle cx={OFF} cy={OFF} r={RING.r} className={styles.ringGhost} />}

        {on &&
          arcs.map((a) => {
            const hot = station === a.to
            const dashed = a.back && !loop
            return (
              <path
                key={a.from}
                d={a.d}
                className={[styles.loopArc, hot && styles.loopArcHot, dashed && styles.loopArcOff].filter(Boolean).join(' ')}
                markerEnd={dashed ? undefined : hot ? 'url(#loopArrowHot)' : 'url(#loopArrow)'}
              />
            )
          })}

        {on && stage.running && (
          <>
            <motion.path d={trail} className={styles.loopTrail} />
            <motion.circle cx={tokenX} cy={tokenY} r={14} className={styles.loopToken} />
          </>
        )}

        {STATIONS.map((s, i) => {
          const p = local(s.deg)
          const lp = local(s.deg, STATION_LABEL_R)
          const active = station === s.id
          const anchor = Math.cos((s.deg * Math.PI) / 180) < 0 ? 'end' : 'start'
          return (
            <g key={s.id} className={[styles.station, !on && styles.stationGhost, active && styles.stationActive].filter(Boolean).join(' ')}>
              {active && <circle cx={p.x} cy={p.y} r={30} className={styles.stationPulse} />}
              <circle cx={p.x} cy={p.y} r={22} className={styles.stationDot} />
              <text x={p.x} y={p.y + 7} textAnchor="middle" className={styles.stationNum}>
                {i + 1}
              </text>
              <text x={lp.x} y={lp.y + 8} textAnchor={anchor} className={styles.stationLabel}>
                {s.short}
              </text>
            </g>
          )
        })}

      </svg>

      {/* loop-back label on the bottom arc */}
      {on && (
        <div className={`${styles.loopBack} ${loop ? styles.loopBackOn : ''}`} style={{ left: RING.cx, top: RING.cy + RING.r }}>
          {loop ? (
            <>
              <Repeat size={13} aria-hidden /> {t('ripete finché serve', 'repeats while needed')}
            </>
          ) : (
            t('un solo giro, poi risponde', 'one round, then it answers')
          )}
        </div>
      )}

      {/* orchestrator pill with lap counter */}
      {on ? (
        <motion.button
          type="button"
          key="orch"
          data-node="orchestrator"
          className={`${styles.ringPill} ${selected ? styles.ringPillSelected : ''}`}
          style={{ left: RING.cx, top: RING.cy - RING.r - 50, x: '-50%', y: '-50%' }}
          initial={{ scale: 0.9 }}
          animate={{ scale: 1 }}
          aria-pressed={selected}
          aria-label={t('Orchestratore e ciclo agentico: apri i dettagli', 'Orchestrator and agent loop: open details')}
          onClick={() =>{  toggle('orchestrator') }}
        >
          <span className={styles.ringPillHead}>
            <Repeat size={14} aria-hidden />
            <strong>{loop ? t('CICLO AGENTICO', 'AGENT LOOP') : t('ORCHESTRATORE', 'ORCHESTRATOR')}</strong>
            {stage.step > 0 && (
              <em>
                {t('giro', 'round')} {stage.step}
                {loop ? `/${c.controls ? maxSteps : '∞'}` : ''}
              </em>
            )}
          </span>
          <span className={styles.ringPhase}>{stage.running ? PHASE_LABEL[stage.phase] : loop ? t('pronto a ripetere', 'ready to repeat') : t('esegue un solo giro', 'runs one round')}</span>
        </motion.button>
      ) : (
        <div className={styles.ringGhostLabel} style={{ left: RING.cx, top: RING.cy - RING.r }}>
          {t('Ciclo agentico', 'Agent loop')} · {orchLevel ? `${t('arriva al livello', 'arrives at level')} ${orchLevel}` : t('da costruire', 'to be built')}
        </div>
      )}
    </>
  )
}

/** Screen-reader announcements of the trace, throttled. */
function StageAnnouncer({ stage }: { stage: StageState }) {
  const [msg, setMsg] = useState('')
  const last = useRef(0)
  useEffect(() => {
    const e = stage.lastEvent
    if (!e) return
    const now = Date.now()
    if (now - last.current < 1000 && e.type !== 'stop') return
    last.current = now
    setMsg(EVENT_LABEL[e.type])
  }, [stage.lastEvent])
  return (
    <p className="visually-hidden" aria-live="polite">
      {msg}
    </p>
  )
}
