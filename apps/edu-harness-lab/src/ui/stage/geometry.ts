/**
 * Logical geometry of the engine stage. One reading order, left to right: the inputs column, the
 * context window ("Cosa vede il modello"), the agent loop with the model at its centre, then the
 * right column (answer at the end of the flow, tools, controls, human supervision) and the
 * external services (MCP) outside the browser. Components that are not built yet are compact slots
 * and each column re-flows around them (see layoutFor). Paths and flyers use these exact coordinates.
 */

export type StageNodeId =
  | 'question'
  | 'answer'
  | 'instructions'
  | 'context'
  | 'memory'
  | 'rag'
  | 'window'
  | 'model'
  | 'orchestrator'
  | 'tools'
  | 'controls'
  | 'human'
  | 'mcp'

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface Point {
  x: number
  y: number
}

type CardNode = Exclude<StageNodeId, 'model' | 'orchestrator'>

/** A built component is a full card, one that is not built yet is a compact slot. */
export const CARD_W = 380
export const CARD_H = 120
export const SLOT_H = 52
const GAP = 36
/** Space between two groups of the same column (room for the group's label). */
const GROUP_GAP = 96
const LABEL_DY = 30
const TOP = 130
const LEFT_X = 96
const WINDOW_X = 610
const RIGHT_X = 1880
/** The MCP card straddles the right edge of the browser boundary: part of it is outside the harness. */
const MCP_W = 290
const MCP_X = RIGHT_X + CARD_W + 110

/** The model core and the orchestrator ring (the agent loop track) around it. */
export const CORE = { cx: 1350, cy: 545, r: 98 }
export const RING = { cx: 1350, cy: 545, r: 232 }
/** Distance of the station labels from the ring centre. */
export const STATION_LABEL_R = RING.r + 52

/** x of the vertical run of the "no orchestrator" answer wire: clear of the ring and its labels. */
const BYPASS_X = 1700
/** y of the horizontal run of the tool-result wire (observe → window), below the ring and its loop-back label. */
const RESULT_Y = RING.cy + RING.r + 72

export const ringAt = (deg: number, r = RING.r): Point => ({
  x: RING.cx + r * Math.cos((deg * Math.PI) / 180),
  y: RING.cy + r * Math.sin((deg * Math.PI) / 180),
})

/** The four stations of the agent loop, clockwise from bottom-left. */
export const STATIONS = [
  { id: 'read', deg: 135, label: 'Legge il contesto', short: 'Legge' },
  { id: 'decide', deg: 225, label: 'Decide cosa fare', short: 'Decide' },
  { id: 'act', deg: 315, label: 'Agisce con uno strumento', short: 'Agisce' },
  { id: 'observe', deg: 45, label: 'Osserva il risultato', short: 'Osserva' },
] as const

export type StationId = (typeof STATIONS)[number]['id']

const right = (r: Rect, dy = 0.5): Point => ({ x: r.x + r.w, y: r.y + r.h * dy })
const left = (r: Rect, dy = 0.5): Point => ({ x: r.x, y: r.y + r.h * dy })
const bottom = (r: Rect, dx = 0.5): Point => ({ x: r.x + r.w * dx, y: r.y + r.h })

export type EdgeId =
  | 'question-window'
  | 'question-rag'
  | 'instructions-window'
  | 'context-window'
  | 'memory-window'
  | 'rag-window'
  | 'window-model'
  | 'model-answer'
  | 'model-ring'
  | 'ring-answer'
  | 'ring-window'
  | 'ring-tools'
  | 'ring-controls'
  | 'ring-human'
  | 'ring-mcp'

export interface EdgeDef {
  id: EdgeId
  from: Point
  to: Point
  /**
   * 'h' horizontal tangents (left→right), 'v' vertical tangents,
   * 'l' a bracket that bulges to the left, 'u' a U-turn that passes below both ends,
   * 'p' a polyline through `via` with rounded corners.
   */
  orient: 'h' | 'v' | 'l' | 'u' | 'p'
  via?: Point[]
}

type Flags = Partial<Record<'instructions' | 'context' | 'memory' | 'rag' | 'tools' | 'controls' | 'approval' | 'mcp' | 'orchestrator', boolean>>

export interface Layout {
  rects: Record<CardNode, Rect>
  boundary: Rect
  /** Bounding box of everything that is drawn: the camera frames this, not a fixed world. */
  bbox: Rect
  labels: { x: number; y: number; text: string }[]
  /** Permanent captions of the main wires: a pill centred on `x,y`, which sits in free space on the wire. */
  edgeLabels: Partial<Record<EdgeId, { x: number; y: number; text: string }>>
  edges: Record<EdgeId, EdgeDef>
}

const st = (id: StationId) => ringAt(STATIONS.find(s => s.id === id)?.deg ?? 0)

function buildLayout(c: Flags): Layout {
  const heightOf = (on?: boolean) => (on ? CARD_H : SLOT_H)
  let y = TOP
  const question: Rect = { x: LEFT_X, y, w: CARD_W, h: 196 }
  y += question.h + GAP
  const stackLeft = (on?: boolean): Rect => {
    const r: Rect = { x: LEFT_X, y, w: CARD_W, h: heightOf(on) }
    y += r.h + GAP
    return r
  }
  const instructions = stackLeft(c.instructions)
  const context = stackLeft(c.context)
  const memory = stackLeft(c.memory)
  const rag = stackLeft(c.rag)
  const leftBottom = y - GAP

  const answer: Rect = { x: RIGHT_X, y: TOP, w: CARD_W, h: 160 }
  y = answer.y + answer.h + GROUP_GAP
  const toolsY = y
  const stackRight = (on?: boolean): Rect => {
    const r: Rect = { x: RIGHT_X, y, w: CARD_W, h: heightOf(on) }
    y += r.h + GAP
    return r
  }
  const tools = stackRight(c.tools)
  const controls = stackRight(c.controls)
  const human = stackRight(c.approval)
  const resultShown = !!c.orchestrator && !!c.tools
  const rightBottom = y - GAP

  const mcpH = heightOf(c.mcp)
  const mcp: Rect = { x: MCP_X, y: tools.y + (tools.h - mcpH) / 2, w: MCP_W, h: mcpH }
  const win: Rect = { x: WINDOW_X, y: CORE.cy - 92, w: CARD_W, h: 184 }

  // The ring (with its loop-back label, and the observe→window wire when tools are on) sets the minimum height.
  const ringBottom = RING.cy + RING.r + (resultShown ? 112 : 40)
  const boundaryBottom = Math.max(leftBottom, rightBottom, ringBottom) + 36
  const boundary: Rect = { x: 50, y: 58, w: MCP_X + MCP_W / 2 - 50, h: boundaryBottom - 58 }
  const bbox: Rect = { x: 50, y: 30, w: MCP_X + MCP_W + 10 - 50, h: boundaryBottom - 30 }

  const rects: Record<CardNode, Rect> = { question, instructions, context, memory, rag, window: win, answer, tools, controls, human, mcp }
  const labels = [
    { x: LEFT_X + 4, y: TOP - LABEL_DY, text: 'COSA ENTRA NEL CONTESTO' },
    { x: WINDOW_X + 4, y: win.y - LABEL_DY, text: 'COSA VEDE IL MODELLO' },
    { x: RIGHT_X + 4, y: TOP - LABEL_DY, text: 'LA RISPOSTA' },
    { x: RIGHT_X + 4, y: toolsY - LABEL_DY, text: 'COSA PUÒ FARE · CHI GOVERNA' },
  ]

  const R = rects
  const answerIn = left(R.answer, 0.26)
  const edges: Record<EdgeId, EdgeDef> = {
    'question-window': { id: 'question-window', from: right(R.question, 0.5), to: left(R.window, 0.14), orient: 'h' },
    'question-rag': { id: 'question-rag', from: left(R.question, 0.82), to: left(R.rag, 0.5), orient: 'l' },
    'instructions-window': { id: 'instructions-window', from: right(R.instructions), to: left(R.window, 0.32), orient: 'h' },
    'context-window': { id: 'context-window', from: right(R.context), to: left(R.window, 0.5), orient: 'h' },
    'memory-window': { id: 'memory-window', from: right(R.memory), to: left(R.window, 0.68), orient: 'h' },
    'rag-window': { id: 'rag-window', from: right(R.rag), to: left(R.window, 0.86), orient: 'h' },
    'window-model': { id: 'window-model', from: right(R.window, 0.5), to: { x: CORE.cx - CORE.r, y: CORE.cy }, orient: 'h' },
    // Out of the model's right side, past the ring and its labels, then up to the answer.
    'model-answer': {
      id: 'model-answer',
      from: { x: CORE.cx + CORE.r, y: CORE.cy },
      to: answerIn,
      orient: 'p',
      via: [
        { x: BYPASS_X, y: CORE.cy },
        { x: BYPASS_X, y: answerIn.y },
      ],
    },
    'model-ring': { id: 'model-ring', from: { x: CORE.cx - CORE.r * 0.72, y: CORE.cy - CORE.r * 0.72 }, to: st('decide'), orient: 'h' },
    'ring-answer': { id: 'ring-answer', from: st('decide'), to: answerIn, orient: 'p', via: [{ x: st('decide').x, y: answerIn.y }] },
    // Down out of "Osserva", along the free strip under the ring, then up into the bottom of the window.
    'ring-window': {
      id: 'ring-window',
      from: st('observe'),
      to: bottom(R.window, 0.8),
      orient: 'p',
      via: [
        { x: st('observe').x, y: RESULT_Y },
        { x: bottom(R.window, 0.8).x, y: RESULT_Y },
      ],
    },
    'ring-tools': { id: 'ring-tools', from: st('act'), to: left(R.tools, 0.5), orient: 'h' },
    'ring-controls': { id: 'ring-controls', from: ringAt(-8), to: left(R.controls, 0.5), orient: 'h' },
    'ring-human': { id: 'ring-human', from: ringAt(12), to: left(R.human, 0.5), orient: 'h' },
    'ring-mcp': { id: 'ring-mcp', from: right(R.tools, 0.5), to: left(R.mcp, 0.5), orient: 'h' },
  }
  const edgeLabels: Layout['edgeLabels'] = {
    'ring-window': { x: (bottom(R.window, 0.8).x + st('observe').x) / 2 + 40, y: RESULT_Y, text: 'il risultato torna nel contesto' },
    'ring-tools': { x: (st('act').x + R.tools.x) / 2 + 10, y: (st('act').y + left(R.tools, 0.5).y) / 2, text: 'chiamata ⇄ risultato' },
    'ring-answer': { x: (st('decide').x + answerIn.x) / 2 + 80, y: answerIn.y, text: 'risposta finale' },
    'model-answer': { x: (BYPASS_X + answerIn.x) / 2 + 20, y: answerIn.y, text: 'risposta finale' },
  }
  return { rects, boundary, bbox, labels, edgeLabels, edges }
}

const cache = new Map<string, Layout>()
/**
 * The map layout for a harness composition: built components are full cards, the ones still to come
 * are compact slots and every column re-flows around them.
 */
export function layoutFor(c: Flags): Layout {
  const key = [c.instructions, c.context, c.memory, c.rag, c.tools, c.controls, c.approval, c.mcp, c.orchestrator].map(Boolean).join()
  let l = cache.get(key)
  if (!l) {
    l = buildLayout(c)
    cache.set(key, l)
  }
  return l
}

const FULL = layoutFor({
  instructions: true, context: true, memory: true, rag: true, tools: true, controls: true, approval: true, mcp: true, orchestrator: true,
})
/** Rects with every component built (the largest layout). */
export const RECTS = FULL.rects

const CORNER = 44

/** Dense points of a polyline with rounded (quadratic) corners. */
function polyPoints(e: EdgeDef): Point[] {
  const pts = [e.from, ...(e.via ?? []), e.to]
  const out: Point[] = [e.from]
  for (let i = 1; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] as Point
    const p1 = pts[i] as Point
    const p2 = pts[i + 1] as Point
    const l1 = Math.hypot(p1.x - p0.x, p1.y - p0.y)
    const l2 = Math.hypot(p2.x - p1.x, p2.y - p1.y)
    const r = Math.min(CORNER, l1 / 2, l2 / 2)
    const a = { x: p1.x + ((p0.x - p1.x) / l1) * r, y: p1.y + ((p0.y - p1.y) / l1) * r }
    const b = { x: p1.x + ((p2.x - p1.x) / l2) * r, y: p1.y + ((p2.y - p1.y) / l2) * r }
    out.push(a)
    for (let k = 1; k < 8; k++) {
      const t = k / 8
      const u = 1 - t
      out.push({ x: u * u * a.x + 2 * u * t * p1.x + t * t * b.x, y: u * u * a.y + 2 * u * t * p1.y + t * t * b.y })
    }
    out.push(b)
  }
  out.push(e.to)
  return out
}

/** Control points of the cubic bezier for an edge. */
function controls(e: EdgeDef): [Point, Point, Point, Point] {
  const { from: a, to: b } = e
  if (e.orient === 'l') {
    const x = Math.min(a.x, b.x) - 28
    return [a, { x, y: a.y }, { x, y: b.y }, b]
  }
  if (e.orient === 'u') {
    const y = Math.max(a.y, b.y) + 140
    return [a, { x: a.x, y }, { x: b.x, y }, b]
  }
  if (e.orient === 'v') {
    const dy = Math.max(30, Math.abs(b.y - a.y) * 0.5)
    const dirA = b.y < a.y ? -1 : 1
    return [a, { x: a.x, y: a.y + dirA * dy }, { x: b.x, y: b.y - dirA * dy }, b]
  }
  const dx = Math.max(30, Math.abs(b.x - a.x) * 0.5)
  const dir = b.x < a.x ? -1 : 1
  return [a, { x: a.x + dir * dx, y: a.y }, { x: b.x - dir * dx, y: b.y }, b]
}

export function edgePath(e: EdgeDef): string {
  if (e.orient === 'p') {
    return polyPoints(e)
      .map((p, i) => `${i ? 'L' : 'M'} ${p.x} ${p.y}`)
      .join(' ')
  }
  const [a, c1, c2, b] = controls(e)
  return `M ${a.x} ${a.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${b.x} ${b.y}`
}

/** Resample a dense polyline into n+1 points evenly spaced by length. */
function resample(pts: Point[], n: number): Point[] {
  const lens = [0]
  for (let i = 1; i < pts.length; i++) {
    const p0 = pts[i - 1] as Point
    const p1 = pts[i] as Point
    lens.push((lens[i - 1] as number) + Math.hypot(p1.x - p0.x, p1.y - p0.y))
  }
  const total = lens[lens.length - 1] as number
  const out: Point[] = []
  let j = 1
  for (let i = 0; i <= n; i++) {
    const d = (total * i) / n
    while (j < pts.length - 1 && (lens[j] as number) < d) j++
    const l0 = lens[j - 1] as number
    const span = (lens[j] as number) - l0
    const f = span > 0 ? (d - l0) / span : 0
    const p0 = pts[j - 1] as Point
    const p1 = pts[j] as Point
    out.push({ x: p0.x + (p1.x - p0.x) * f, y: p0.y + (p1.y - p0.y) * f })
  }
  return out
}

/**
 * Sample n+1 points along an edge (optionally reversed) for keyframe animation. Packets travel
 * only along the middle of the wire (`trim` is cut at each end) so their labels stay off the cards.
 */
export function samplePath(e: EdgeDef, n = 28, reverse = false, trim = 0.16): Point[] {
  let dense: Point[]
  if (e.orient === 'p') {
    dense = polyPoints(e)
  } else {
    const [p0, p1, p2, p3] = controls(e)
    dense = []
    for (let i = 0; i <= 120; i++) {
      const t = i / 120
      const u = 1 - t
      dense.push({
        x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
        y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
      })
    }
  }
  const all = resample(dense, 200)
  const len = dense.reduce((acc, p, i) => (i ? acc + Math.hypot(p.x - (dense[i - 1] as Point).x, p.y - (dense[i - 1] as Point).y) : 0), 0)
  const cut = Math.min(0.4, Math.max(trim, 80 / Math.max(1, len)))
  const lo = Math.round(200 * cut)
  const hi = Math.round(200 * (1 - cut))
  const mid = resample(all.slice(lo, hi + 1), n)
  return reverse ? mid.reverse() : mid
}

/** SVG arc along the ring between two angles (clockwise), slightly shortened to leave room for station dots. */
export function ringArc(fromDeg: number, toDeg: number, gapDeg = 12, r = RING.r): string {
  let end = toDeg
  while (end <= fromDeg) end += 360
  const a = fromDeg + gapDeg
  const b = end - gapDeg
  const p = ringAt(a, r)
  const q = ringAt(b, r)
  const large = b - a > 180 ? 1 : 0
  return `M ${p.x} ${p.y} A ${r} ${r} 0 ${large} 1 ${q.x} ${q.y}`
}

/** Which corner a card's hover preview grows from, so it stays inside the map. */
export function previewAnchor(r: Rect): { h: 'left' | 'right'; v: 'top' | 'bottom' } {
  return {
    h: r.x + r.w / 2 > CORE.cx + 100 ? 'right' : 'left',
    v: r.y + r.h / 2 > 560 ? 'bottom' : 'top',
  }
}
