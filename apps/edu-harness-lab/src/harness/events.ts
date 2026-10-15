import type { Disposer, EventBus, Pacer, ProvenanceTag, TraceEvent, TraceEventBody, TraceEventType } from '../domain/types'
import { REAL_LOCAL } from '../domain/types'

let idCounter = 0
export function newId(prefix = 'id'): string {
  idCounter += 1
  return `${prefix}-${Date.now().toString(36)}-${idCounter.toString(36)}`
}

/**
 * Append-only trace store + typed publish/subscribe.
 * The trace is the single source of truth for the Agent Trace, the Context Inspector,
 * the canvas animations and the comparisons ("model-visible means logged").
 */
export function createEventBus(): EventBus {
  let log: TraceEvent[] = []
  const subs = new Set<(e: TraceEvent) => void>()
  let seq = 0
  return {
    emit(runId: string, body: TraceEventBody, meta = {}) {
      seq += 1
      const provenance: ProvenanceTag = meta.provenance ?? REAL_LOCAL
      const event = {
        ...body,
        id: newId('ev'),
        seq,
        at: Date.now(),
        runId,
        stepIndex: meta.stepIndex,
        source: meta.source ?? 'orchestrator',
        provenance,
      } as TraceEvent
      log = [...log, event]
      for (const cb of subs) cb(event)
      return event
    },
    subscribe(cb): Disposer {
      subs.add(cb)
      return () => subs.delete(cb)
    },
    events: () => log,
    clear() {
      log = []
      seq = 0
    },
  }
}

/** Base pause (ms at speed 1×) after each event type, so the animations can explain it. */
export const EVENT_PACE_MS: Partial<Record<TraceEventType, number>> = {
  'run/start': 500,
  'rag/query': 700,
  'rag/results': 1100,
  'memory/read': 500,
  'memory/inject': 700,
  'context/assembled': 900,
  'model/request': 900,
  'model/response': 700,
  'decision/parsed': 700,
  'decision/invalid': 1000,
  'decision/repair': 700,
  'tool/call': 900,
  'tool/validation': 600,
  'tool/execute': 900,
  'tool/result': 1000,
  'tool/error': 1000,
  'approval/asked': 300,
  'approval/decided': 700,
  'mcp/call': 900,
  'mcp/result': 900,
  'guard/triggered': 1100,
  'answer': 600,
  'stop': 400,
}

export interface PacerSettings {
  speed: number
  paused: boolean
  stepMode: boolean
}

export interface ControllablePacer extends Pacer {
  /** Release one waiting event in step mode. */
  step(): void
  /** Re-check settings (call after pause/speed changes). */
  poke(): void
  /** Release everything immediately and keep releasing until `reset()` (used on stop). */
  flush(): void
  /** Arm the pacer for a new run. */
  reset(): void
}

/**
 * Pacer: the orchestrator awaits it after every event, so execution and animation stay in sync.
 * Speed scales the pauses, pause freezes the run, step mode waits for the teacher's click.
 */
export function createPacer(getSettings: () => PacerSettings): ControllablePacer {
  let waiters: (() => void)[] = []
  let stepTokens = 0
  let flushed = false
  const isFlushed = () => flushed

  const release = () => {
    const w = waiters
    waiters = []
    for (const fn of w) fn()
  }

  return {
    async wait(event: TraceEvent) {
      if (isFlushed()) return
      const s = getSettings()
      const base = EVENT_PACE_MS[event.type] ?? 250
      if (s.speed > 0 && !s.stepMode) {
        await new Promise(r => setTimeout(r, base / s.speed))
      }
      // Pause or step mode: block until released.
      for (;;) {
        if (isFlushed()) return
        const cur = getSettings()
        if (cur.stepMode) {
          if (stepTokens > 0) {
            stepTokens -= 1
            return
          }
        } else if (!cur.paused) {
          return
        }
        await new Promise<void>(r => waiters.push(r))
      }
    },
    step() {
      stepTokens += 1
      release()
    },
    poke() {
      release()
    },
    flush() {
      flushed = true
      release()
    },
    reset() {
      flushed = false
      stepTokens = 0
    },
  }
}
