/**
 * Logical geometry of the engine stage: a large, spacious world (3300×1150), about twice the
 * screen. The map opens at 100% on the agent loop and is explored by panning; at 50% it fits the
 * screen. Paths and flyers use these exact coordinates.
 * Cards are collapsed tiles: hovering shows a larger preview, clicking opens the details.
 */

export const WORLD_W = 3300
export const WORLD_H = 1150

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

/** Left column: what enters the context. Second column: the answer and the context window. Right: actions and governance. */
export const RECTS: Record<Exclude<StageNodeId, 'model' | 'orchestrator'>, Rect> = {
  question: { x: 150, y: 200, w: 360, h: 210 },
  instructions: { x: 150, y: 460, w: 360, h: 120 },
  context: { x: 150, y: 620, w: 360, h: 120 },
  memory: { x: 150, y: 780, w: 360, h: 120 },
  rag: { x: 150, y: 940, w: 360, h: 120 },
  answer: { x: 720, y: 200, w: 350, h: 210 },
  window: { x: 720, y: 620, w: 350, h: 160 },
  tools: { x: 2240, y: 470, w: 360, h: 120 },
  controls: { x: 2240, y: 630, w: 360, h: 130 },
  human: { x: 2240, y: 800, w: 360, h: 120 },
  mcp: { x: 2860, y: 630, w: 340, h: 130 },
}

/** The model core and the orchestrator ring (the agent loop track) around it. */
export const CORE = { cx: 1650, cy: 690, r: 112 }
export const RING = { cx: 1650, cy: 690, r: 250 }
/** Distance of the station labels from the ring centre. */
export const STATION_LABEL_R = RING.r + 58

export const BROWSER_BOUNDARY: Rect = { x: 50, y: 90, w: 2650, h: 1010 }

/** The model's plan, above the agent loop (height grows with the steps, up to 5 shown). */
export const PLAN_RECT: Rect = { x: 1310, y: 130, w: 680, h: 210 }

/** Column labels drawn above the cards. */
export const COLUMN_LABELS: { x: number; text: string }[] = [
  { x: 154, text: 'COSA ENTRA NEL CONTESTO' },
  { x: 724, text: 'RISPOSTA E CONTESTO' },
  { x: 2244, text: 'COSA PUÒ FARE · CHI GOVERNA' },
]
export const COLUMN_LABEL_Y = 166

export interface Point {
  x: number
  y: number
}

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
   * 'l' a bracket that bulges to the left, 'u' a U-turn that passes below both ends.
   */
  orient: 'h' | 'v' | 'l' | 'u'
}

const R = RECTS
const st = (id: StationId) => ringAt(STATIONS.find(s => s.id === id)?.deg ?? 0)

export const EDGES: Record<EdgeId, EdgeDef> = {
  'question-window': { id: 'question-window', from: right(R.question, 0.78), to: left(R.window, 0.2), orient: 'h' },
  'question-rag': { id: 'question-rag', from: left(R.question, 0.82), to: left(R.rag, 0.5), orient: 'l' },
  'instructions-window': { id: 'instructions-window', from: right(R.instructions), to: left(R.window, 0.36), orient: 'h' },
  'context-window': { id: 'context-window', from: right(R.context), to: left(R.window, 0.52), orient: 'h' },
  'memory-window': { id: 'memory-window', from: right(R.memory), to: left(R.window, 0.68), orient: 'h' },
  'rag-window': { id: 'rag-window', from: right(R.rag), to: left(R.window, 0.84), orient: 'h' },
  'window-model': { id: 'window-model', from: right(R.window, 0.5), to: { x: CORE.cx - CORE.r, y: CORE.cy }, orient: 'h' },
  'model-answer': { id: 'model-answer', from: { x: CORE.cx - CORE.r * 0.72, y: CORE.cy - CORE.r * 0.72 }, to: right(R.answer, 0.6), orient: 'h' },
  'model-ring': { id: 'model-ring', from: { x: CORE.cx - CORE.r * 0.72, y: CORE.cy - CORE.r * 0.72 }, to: st('decide'), orient: 'h' },
  'ring-answer': { id: 'ring-answer', from: st('decide'), to: right(R.answer, 0.6), orient: 'h' },
  'ring-window': { id: 'ring-window', from: st('observe'), to: bottom(R.window, 0.75), orient: 'u' },
  'ring-tools': { id: 'ring-tools', from: st('act'), to: left(R.tools, 0.5), orient: 'h' },
  'ring-controls': { id: 'ring-controls', from: ringAt(0), to: left(R.controls, 0.5), orient: 'h' },
  'ring-human': { id: 'ring-human', from: ringAt(25), to: left(R.human, 0.5), orient: 'h' },
  'ring-mcp': { id: 'ring-mcp', from: right(R.tools, 0.7), to: left(R.mcp, 0.4), orient: 'h' },
}

/** Control points of the cubic bezier for an edge. */
function controls(e: EdgeDef): [Point, Point, Point, Point] {
  const { from: a, to: b } = e
  if (e.orient === 'l') {
    const x = Math.min(a.x, b.x) - 60
    return [a, { x, y: a.y }, { x, y: b.y }, b]
  }
  if (e.orient === 'u') {
    const y = Math.max(a.y, b.y) + 220
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
  const [a, c1, c2, b] = controls(e)
  return `M ${a.x} ${a.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${b.x} ${b.y}`
}

/** Sample n+1 points along an edge (optionally reversed) for keyframe animation. */
export function samplePath(e: EdgeDef, n = 28, reverse = false): Point[] {
  const [p0, p1, p2, p3] = controls(e)
  const pts: Point[] = []
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const u = 1 - t
    pts.push({
      x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
      y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
    })
  }
  return reverse ? pts.reverse() : pts
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

/** Which corner a card's hover preview grows from, so it stays inside the world. */
export function previewAnchor(r: Rect): { h: 'left' | 'right'; v: 'top' | 'bottom' } {
  return {
    h: r.x + r.w / 2 > WORLD_W * 0.55 ? 'right' : 'left',
    v: r.y + r.h / 2 > WORLD_H * 0.6 ? 'bottom' : 'top',
  }
}
