import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react'
import { Cpu, Crosshair, GitBranch, ListOrdered, Maximize2, Repeat, ZoomIn, ZoomOut } from 'lucide-react'
import type { ComponentId, TraceEvent } from '../../domain/types'
import { EVENT_PACE_MS } from '../../harness/events'
import { useLab } from '../../state/store'
import { EVENT_LABEL } from '../common/labels'
import { Tabs, tabId } from '../common/Tabs'
import { AnswerCard, ContextCard, ControlsCard, HumanCard, InstructionsCard, McpCard, MemoryCard, QuestionCard, RagCard, ToolsCard, WindowCard } from './cards'
import type { Phase, StageState } from './deriveStage'
import { PHASE_LABEL, deriveStage } from './deriveStage'
import type { FlyerKind } from './flyers'
import { flyersFor } from './flyers'
import type { EdgeId, StageNodeId, StationId } from './geometry'
import { BROWSER_BOUNDARY, COLUMN_LABELS, COLUMN_LABEL_Y, CORE, EDGES, RECTS, RING, STATIONS, STATION_LABEL_R, WORLD_H, WORLD_W, edgePath, ringAt, samplePath } from './geometry'
import { NodeDetails } from './NodeDetails'
import { PlanBoard } from './PlanBoard'
import { FlowOverview } from './FlowOverview'
import { narrationLines } from './Narration'
import { isInteractive, useStageUi } from './stageUi'
import styles from './stage.module.css'
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
}

const MAX_FLYERS = 14
/** Zoom is relative to "the whole map fits": 100% is twice that, so the map is about two screens wide. */
const DEFAULT_ZOOM = 2
const ZOOM_MIN = 0.8
const ZOOM_MAX = 6
const FIT_MARGIN = 10
/** Home view centre: the agent loop including its label above and the loop-back label below. */
const HOME = { cx: RING.cx, cy: RING.cy - 34 }
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
 * Camera over the world: the world point at the centre of the viewport and a zoom relative to
 * "the whole map fits" (1). It opens at 100% (DEFAULT_ZOOM) centred on the agent loop.
 */
function useViewportTransform(viewportRef: React.RefObject<HTMLDivElement | null>) {
  const [size, setSize] = useState({ w: 1200, h: 600 })
  const [cam, setCam] = useState({ zoom: DEFAULT_ZOOM, cx: HOME.cx, cy: HOME.cy })
  useLayoutEffect(() => {
    const el = viewportRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([entry]) => {
      if (!entry) return
      setSize({ w: entry.contentRect.width, h: entry.contentRect.height })
    })
    ro.observe(el)
    return () =>{  ro.disconnect() }
  }, [viewportRef])

  const fit = Math.max(0.05, Math.min((size.w - FIT_MARGIN * 2) / WORLD_W, (size.h - FIT_MARGIN * 2) / WORLD_H))
  const s = fit * cam.zoom
  const tx = size.w / 2 - cam.cx * s
  const ty = size.h / 2 - cam.cy * s

  /** Zoom keeping the world point under (mx, my) fixed on screen. */
  const zoomAt = (nextZoom: number, mx = size.w / 2, my = size.h / 2) => {
    const z = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, nextZoom))
    const wx = (mx - tx) / s
    const wy = (my - ty) / s
    const s2 = fit * z
    setCam({ zoom: z, cx: wx - (mx - size.w / 2) / s2, cy: wy - (my - size.h / 2) / s2 })
  }
  const panBy = (dx: number, dy: number) =>{  setCam(c => ({ ...c, cx: c.cx - dx / (fit * c.zoom), cy: c.cy - dy / (fit * c.zoom) })) }
  const centerOn = (cx: number, cy: number) =>{  setCam(c => ({ ...c, cx, cy })) }
  /** 50%: the whole map on screen. */
  const showAll = () =>{  setCam({ zoom: 1, cx: WORLD_W / 2, cy: WORLD_H / 2 }) }
  /** 100% on the agent loop. */
  const home = () =>{  setCam({ zoom: DEFAULT_ZOOM, cx: HOME.cx, cy: HOME.cy }) }
  return { s, tx, ty, size, zoom: cam.zoom, pct: Math.round((cam.zoom / DEFAULT_ZOOM) * 100), zoomAt, panBy, centerOn, showAll, home }
}

/** Overview of the whole map with the visible area; click or drag to move there. */
function Minimap({ view }: { view: ReturnType<typeof useViewportTransform> }) {
  const W = 220
  const H = (W * WORLD_H) / WORLD_W
  const k = W / WORLD_W
  const drag = useRef(false)
  const jump = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    view.centerOn(Math.min(WORLD_W, Math.max(0, (e.clientX - r.left) / k)), Math.min(WORLD_H, Math.max(0, (e.clientY - r.top) / k)))
  }
  const vx = -view.tx / view.s
  const vy = -view.ty / view.s
  const vw = view.size.w / view.s
  const vh = view.size.h / view.s
  return (
    <div
      className={styles.minimap}
      data-zoom
      title="Panoramica: clicca o trascina per spostarti"
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
      <svg width={W} height={H} viewBox={`0 0 ${WORLD_W} ${WORLD_H}`} aria-hidden>
        <rect className={styles.miniBoundary} x={BROWSER_BOUNDARY.x} y={BROWSER_BOUNDARY.y} width={BROWSER_BOUNDARY.w} height={BROWSER_BOUNDARY.h} rx="30" />
        {Object.entries(RECTS).map(([id, r]) => (
          <rect key={id} className={styles.miniCard} x={r.x} y={r.y} width={r.w} height={r.h} rx="18" />
        ))}
        <circle className={styles.miniRing} cx={RING.cx} cy={RING.cy} r={RING.r} />
        <circle className={styles.miniCore} cx={CORE.cx} cy={CORE.cy} r={CORE.r} />
        <rect className={styles.miniView} x={vx} y={vy} width={vw} height={vh} rx="12" />
      </svg>
    </div>
  )
}

/** The latest plain-language narration line, shown as a caption over the map. */
function useLiveCaption() {
  const events = useLab(s => s.events)
  const components = useLab(s => s.config.components)
  return useMemo(() => {
    const lines = narrationLines(events, components)
    return lines[lines.length - 1] ?? null
  }, [events, components])
}

/** The engine map (default) or the simplified flow, switched from a floating control.
 * @param onApprovalDetails Opens the current action's approval dialog.
 * @returns The selected diagram view.
 */
export function EngineStage({ onApprovalDetails }: { onApprovalDetails: () => void }) {
  const [mode, setMode] = useState<'flow' | 'map'>('map')
  return (
    <section className={layout.stage} aria-label="Come funziona il sistema">
      <div id="engine-view-panel" role="tabpanel" aria-labelledby={tabId('engine-view', mode)} className={layout.content}>
        {mode === 'flow' ? <FlowOverview onApprovalDetails={onApprovalDetails} /> : <DetailedEngineStage onApprovalDetails={onApprovalDetails} />}
      </div>
      <div className={layout.viewSwitch} data-zoom>
        <Tabs
          tabs={[
            { id: 'map', label: 'Mappa', icon: <GitBranch size={15} aria-hidden /> },
            { id: 'flow', label: 'Flusso', icon: <ListOrdered size={15} aria-hidden /> },
          ]}
          value={mode}
          onChange={setMode}
          ariaLabel="Visualizzazione del sistema"
          idBase="engine-view"
        />
      </div>
    </section>
  )
}

function DetailedEngineStage({ onApprovalDetails }: { onApprovalDetails: () => void }) {
  const events = useLab(s => s.events)
  const config = useLab(s => s.config)
  const speed = useLab(s => s.speed)
  const fastForward = useLab(s => s.fastForward)
  const status = useLab(s => s.status)
  const reduced = useReducedMotion()
  const c = config.components
  const stage = useMemo(() => deriveStage(events, c.orchestrator), [events, c.orchestrator])
  const selected = useStageUi(s => s.selected)
  const caption = useLiveCaption()

  // ── zoom & pan ──
  const viewportRef = useRef<HTMLDivElement>(null)
  const view = useViewportTransform(viewportRef)
  const viewRef = useRef(view)
  viewRef.current = view

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
  const lastSeq = useRef(events.at(-1)?.seq ?? 0)
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
    for (const e of fresh) {
      const specs = flyersFor(e, c)
      const base = ((EVENT_PACE_MS[e.type] ?? 400) / speed) * 0.9
      for (const f of specs) {
        heat[f.edge] = Date.now() + base + 600
        if (reduced) continue
        const pts = samplePath(EDGES[f.edge], 30, f.reverse)
        spawned.push({
          id: ++flyerSeq,
          edge: f.edge,
          xs: pts.map(p => p.x),
          ys: pts.map(p => p.y),
          label: f.label,
          kind: f.kind,
          duration: Math.max(0.35, base / 1000),
          delay: ((f.delay ?? 0) * base) / 1000,
        })
      }
    }
    if (Object.keys(heat).length) setHot(h => ({ ...h, ...heat }))
    if (spawned.length) setFlyers(cur => [...cur, ...spawned].slice(-MAX_FLYERS))
  }, [events, c, speed, fastForward, reduced])

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
  const worldStyle = {
    width: WORLD_W,
    height: WORLD_H,
    transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.s})`,
    '--inv': Math.max(1, 1 / view.s),
  } as React.CSSProperties

  return (
    <div
      className={styles.viewport}
      ref={viewportRef}
      tabIndex={0}
      aria-label="Mappa del sistema: trascina per spostarti, rotella o + e − per lo zoom, frecce per muoverti, 0 per vederla tutta, 1 per tornare al ciclo"
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
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
        else view.home()
      }}
    >
      <div className={styles.world} style={worldStyle}>
        {/* ── wires, boundary and column labels ── */}
        <svg className={styles.wires} viewBox={`0 0 ${WORLD_W} ${WORLD_H}`} width={WORLD_W} height={WORLD_H} aria-hidden>
          <defs>
            <marker id="stage-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
              <path d="M 1 1 L 9 5 L 1 9" fill="none" stroke="context-stroke" strokeWidth="2" />
            </marker>
            <pattern id="dots" width="22" height="22" patternUnits="userSpaceOnUse">
              <circle cx="1.5" cy="1.5" r="1.3" fill="var(--canvas-grid)" />
            </pattern>
          </defs>
          <rect x="-4000" y="-4000" width={WORLD_W + 8000} height={WORLD_H + 8000} fill="url(#dots)" />
          <rect className={styles.boundary} x={BROWSER_BOUNDARY.x} y={BROWSER_BOUNDARY.y} width={BROWSER_BOUNDARY.w} height={BROWSER_BOUNDARY.h} rx="28" />
          <text className={styles.boundaryLabel} x={BROWSER_BOUNDARY.x + 26} y={BROWSER_BOUNDARY.y - 14}>
            IL TUO BROWSER · tutto ciò che sta qui dentro gira sul tuo computer
          </text>
          <text className={styles.boundaryLabel} x={RECTS.mcp.x} y={BROWSER_BOUNDARY.y - 14}>
            SERVIZI ESTERNI
          </text>
          {COLUMN_LABELS.map(l => (
            <text key={l.text} className={styles.colLabel} x={l.x} y={COLUMN_LABEL_Y}>
              {l.text}
            </text>
          ))}
          {wires.map(w => (
            <path
              key={w.id}
              d={edgePath(EDGES[w.id])}
              markerEnd={w.on ? 'url(#stage-arrow)' : undefined}
              className={[styles.wire, !w.on && styles.wireGhost, w.on && hot[w.id] && styles.wireHot].filter(Boolean).join(' ')}
              style={{ '--wire': `var(--c-${w.family})` } as React.CSSProperties}
            />
          ))}
          {wires
            .filter(w => w.on)
            .flatMap(w => [
              { key: `${w.id}-a`, p: EDGES[w.id].from, w },
              { key: `${w.id}-b`, p: EDGES[w.id].to, w },
            ])
            .map(({ key, p, w }) => (
              <circle
                key={key}
                cx={p.x}
                cy={p.y}
                r={6}
                className={`${styles.wireDot} ${hot[w.id] ? styles.wireDotHot : ''}`}
                style={{ '--wire': `var(--c-${w.family})` } as React.CSSProperties}
              />
            ))}
        </svg>

        {/* ── agent loop around the model ── */}
        <AgentLoop stage={stage} selected={selected === 'orchestrator'} />
        <PlanBoard stage={stage} />
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
                animate={{ x: f.xs, y: f.ys, opacity: [0, 1, 1, 1, 0], scale: [0.6, 1, 1, 1, 0.8] }}
                transition={{ duration: f.duration, delay: f.delay, ease: 'easeInOut' }}
                onAnimationComplete={() =>{  setFlyers(cur => cur.filter(x => x.id !== f.id)) }}
              >
                <span className={styles.flyerChip}>{f.label}</span>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>

      <div className={styles.zoomBar} data-zoom role="toolbar" aria-label="Zoom della vista">
        <button type="button" onClick={() =>{  view.zoomAt(view.zoom / 1.25) }} aria-label="Allontana" title="Allontana (−)">
          <ZoomOut size={16} />
        </button>
        <button type="button" className={styles.zoomPct} onClick={view.home} title="Torna al 100% sul ciclo agentico (1)">
          {view.pct}%
        </button>
        <button type="button" onClick={() =>{  view.zoomAt(view.zoom * 1.25) }} aria-label="Avvicina" title="Avvicina (+)">
          <ZoomIn size={16} />
        </button>
        <button type="button" onClick={view.showAll} aria-label="Mostra tutta la mappa" title="Mostra tutta la mappa (0)">
          <Maximize2 size={15} />
        </button>
        <button type="button" onClick={view.home} aria-label="Torna al ciclo agentico" title="Torna al ciclo agentico (1)">
          <Crosshair size={15} />
        </button>
      </div>
      <Minimap view={view} />

      <p className={`${styles.liveCaption} ${caption && running ? styles.liveCaptionOn : ''}`} aria-hidden>
        {caption && (running || stage.runId) ? (
          <>
            {running && <span className={styles.liveDot} />}
            <span className={styles.liveText}>{caption.text}</span>
            {caption.term && <em>{caption.term}</em>}
          </>
        ) : (
          'Passa sopra un elemento per ingrandirlo · clic per i dettagli · trascina per spostarti'
        )}
      </p>

      <AnimatePresence>
        {selected && <NodeDetails key={selected} node={selected} stage={stage} onApprovalDetails={onApprovalDetails} />}
      </AnimatePresence>
      <StageAnnouncer stage={stage} />
    </div>
  )
}

function ModelCore({ stage, lit, selected }: { stage: StageState; lit: boolean; selected: boolean }) {
  const info = useLab(s => s.modelInfo)
  const streaming = useLab(s => s.streamingText)
  const toggle = useStageUi(s => s.toggle)
  const busy = stage.modelBusy
  const activity = useLab(s => s.modelActivity)
  const tail = streaming.slice(-54)
  const coreNote = activity?.kind === 'thinking' ? `ragiona…${activity.tokens ? ` ${activity.tokens} token` : ''}` : tail || 'sta leggendo…'
  return (
    <>
      <motion.button
        type="button"
        data-node="model"
        className={[styles.core, busy && styles.coreBusy, lit && styles.coreLit, selected && styles.coreSelected].filter(Boolean).join(' ')}
        style={{ left: CORE.cx - CORE.r, top: CORE.cy - CORE.r, width: CORE.r * 2, height: CORE.r * 2 }}
        animate={busy ? { scale: [1, 1.035, 1] } : { scale: 1 }}
        transition={busy ? { duration: 1.6, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.3 }}
        aria-label={`Modello linguistico: ${info.label}. ${busy ? 'Sta lavorando.' : 'In attesa.'} Apri i dettagli.`}
        aria-pressed={selected}
        onClick={() =>{  toggle('model') }}
      >
        <Cpu size={34} aria-hidden className={styles.coreIcon} />
        <span className={styles.coreTitle}>MODELLO</span>
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
        pesi <span>{info.fingerprint}</span> invariati · {stage.modelCalls} {stage.modelCalls === 1 ? 'chiamata' : 'chiamate'}
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
  const c = useLab(s => s.config.components)
  const maxSteps = useLab(s => s.config.limits.maxSteps)
  const streaming = useLab(s => s.streamingText.length > 0)
  const speed = useLab(s => s.speed)
  const toggle = useStageUi(s => s.toggle)
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
              <Repeat size={13} aria-hidden /> ripete finché serve
            </>
          ) : (
            'un solo giro, poi risponde'
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
          aria-label="Orchestratore e ciclo agentico: apri i dettagli"
          onClick={() =>{  toggle('orchestrator') }}
        >
          <span className={styles.ringPillHead}>
            <Repeat size={14} aria-hidden />
            <strong>{loop ? 'CICLO AGENTICO' : 'ORCHESTRATORE'}</strong>
            {stage.step > 0 && (
              <em>
                giro {stage.step}
                {loop ? `/${c.controls ? maxSteps : '∞'}` : ''}
              </em>
            )}
          </span>
          <span className={styles.ringPhase}>{stage.running ? PHASE_LABEL[stage.phase] : loop ? 'pronto a ripetere' : 'esegue un solo giro'}</span>
        </motion.button>
      ) : (
        <div className={styles.ringGhostLabel} style={{ left: RING.cx, top: RING.cy - RING.r }}>
          ciclo agentico · da costruire
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
