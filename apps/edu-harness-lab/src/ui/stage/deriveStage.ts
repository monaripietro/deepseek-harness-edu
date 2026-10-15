import type {
  ApprovalOutcome,
  ContextSnapshot,
  ModelDecision,
  RunCheck,
  RunRecord,
  StopReason,
  TraceEvent,
} from '../../domain/types'
import type { StageNodeId } from './geometry'

export type GateState = 'idle' | 'ok' | 'fail' | 'warn'
export type Phase =
  | 'idle'
  | 'collecting'
  | 'reading'
  | 'deciding'
  | 'validating'
  | 'executing'
  | 'waitingHuman'
  | 'observing'
  | 'answering'
  | 'done'

export const PHASE_LABEL: Record<Phase, string> = {
  idle: 'In attesa',
  collecting: 'Prepara il contesto',
  reading: 'Il modello sta scrivendo',
  deciding: 'Interpreta la decisione',
  validating: 'Controlla gli argomenti',
  executing: 'Esegue lo strumento',
  waitingHuman: 'Attende una persona',
  observing: 'Riporta l’osservazione',
  answering: 'Consegna la risposta',
  done: 'Concluso',
}

export interface ToolActivity {
  callId: string
  tool: string
  args: Record<string, unknown>
  state: 'requested' | 'validated' | 'invalid' | 'blocked' | 'executing' | 'done' | 'error'
  summary?: string
  viaMcp?: string
}

/** One step of the plan the model wrote, and how it is being carried out. */
export interface PlanStep {
  n: number
  text: string
  /** Tool named in the step ('answer' for the final answer), if any. */
  tool: string | null
  status: 'pending' | 'active' | 'done' | 'failed'
  callId?: string
}

export interface PlanState {
  text: string
  steps: PlanStep[]
  /** Tool calls that matched no step of the plan. */
  offPlan: string[]
}

export const PLAN_TOOL_ID = 'pianifica'

const shortTool = (t: string) => t.replace(/^mcp__\w+?__/, '')

/** Split the model's plan into steps ("1) … 2) …", one per line or inline) and spot the tool each one names. */
export function parsePlan(text: string): PlanStep[] {
  const parts = text
    .replace(/\r/g, '')
    .split(/\n+|\s+(?=\d+\s*[).:]\s)/)
    .map(p => p.replace(/^\s*[-*•]?\s*\d+\s*[).:-]?\s*/, '').trim())
    .filter(Boolean)
  return parts.slice(0, 8).map((t, i) => {
    const named = /\b([a-z]+(?:_[a-z]+)+|calcolatrice)\b/.exec(t)?.[1] ?? null
    const tool = named && named !== PLAN_TOOL_ID ? named : /\b(answer|rispond\w*|risposta)\b/i.test(t) ? 'answer' : null
    return { n: i + 1, text: t, tool, status: 'pending' as const }
  })
}

const stepUses = (st: PlanStep, tool: string) => {
  const t = shortTool(tool)
  return st.tool === t || st.text.includes(t)
}

export interface StageState {
  /** The plan written by the model (planning step) and its execution so far. */
  plan: PlanState | null
  runId: string | null
  running: boolean
  phase: Phase
  step: number
  question: string | null
  memoryRead: number
  memory: { id: string; key: string; text: string; state: 'injected' | 'ignored' }[]
  memoryWritten: string | null
  ragQuery: string | null
  ragHits: { chunkId: string; docId: string; title: string; normalized: number; status: 'selected' | 'excluded'; reason?: string }[]
  snapshot: ContextSnapshot | null
  modelCalls: number
  modelBusy: boolean
  lastResponseMs: number | null
  decision: ModelDecision | null
  invalidOutputs: number
  tool: ToolActivity | null
  toolHistory: { tool: string; ok: boolean; summary: string }[]
  gates: Record<'validation' | 'permissions' | 'steps' | 'repeat' | 'time' | 'supervision', GateState>
  guardMessage: string | null
  human: { state: 'idle' | 'waiting' | ApprovalOutcome; title?: string }
  mcpCalls: number
  mcpLast: string | null
  answer: string | null
  sources: string[]
  stopReason: StopReason | null
  stopMessage: string | null
  checks: RunCheck[]
  record: RunRecord | null
  lastEvent: TraceEvent | null
  lit: StageNodeId[]
}

export const EMPTY_STAGE: StageState = {
  plan: null,
  runId: null,
  running: false,
  phase: 'idle',
  step: 0,
  question: null,
  memoryRead: 0,
  memory: [],
  memoryWritten: null,
  ragQuery: null,
  ragHits: [],
  snapshot: null,
  modelCalls: 0,
  modelBusy: false,
  lastResponseMs: null,
  decision: null,
  invalidOutputs: 0,
  tool: null,
  toolHistory: [],
  gates: { validation: 'idle', permissions: 'idle', steps: 'idle', repeat: 'idle', time: 'idle', supervision: 'idle' },
  guardMessage: null,
  human: { state: 'idle' },
  mcpCalls: 0,
  mcpLast: null,
  answer: null,
  sources: [],
  stopReason: null,
  stopMessage: null,
  checks: [],
  record: null,
  lastEvent: null,
  lit: [],
}

/** Which stage nodes an event "lights up". */
export function litFor(e: TraceEvent, hasOrchestrator: boolean): StageNodeId[] {
  const hub: StageNodeId = hasOrchestrator ? 'orchestrator' : 'model'
  switch (e.type) {
    case 'run/start':
      return ['question', 'window']
    case 'memory/read':
    case 'memory/select':
    case 'memory/ignore':
    case 'memory/write':
    case 'memory/delete':
      return ['memory']
    case 'memory/inject':
      return ['memory', 'window']
    case 'rag/query':
      return ['question', 'rag']
    case 'rag/results':
      return ['rag', 'window']
    case 'context/assembled':
      return ['window']
    case 'model/request':
      return ['window', 'model']
    case 'model/response':
      return hasOrchestrator ? ['model', 'orchestrator'] : ['model']
    case 'decision/parsed':
    case 'decision/invalid':
    case 'decision/repair':
      return ['orchestrator']
    case 'tool/call':
      return ['orchestrator', 'tools']
    case 'tool/validation':
      return ['orchestrator', 'controls']
    case 'tool/execute':
      return e.viaMcp ? ['orchestrator', 'mcp'] : ['orchestrator', 'tools']
    case 'tool/result':
    case 'tool/error':
      return ['tools', 'orchestrator']
    case 'approval/asked':
    case 'approval/decided':
      return ['orchestrator', 'human']
    case 'guard/triggered':
      return ['controls']
    case 'mcp/discover':
    case 'mcp/connect':
    case 'mcp/list-tools':
    case 'mcp/call':
    case 'mcp/result':
    case 'mcp/error':
    case 'mcp/disconnect':
      return ['mcp']
    case 'step/start':
      return [hub]
    case 'answer':
      return [hub, 'answer']
    case 'stop':
    case 'run/end':
      return ['answer']
    case 'harness/plugin-mounted':
    case 'harness/plugin-unmounted':
      return []
    default:
      return []
  }
}

function shortValue(v: unknown): string {
  if (typeof v === 'string') return v.length > 22 ? `${v.slice(0, 21)}…` : v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return '…'
}

export function argsInline(args: Record<string, unknown>, max = 3): string {
  const entries = Object.entries(args)
  const parts = entries.slice(0, max).map(([, v]) => shortValue(v))
  return parts.join(', ') + (entries.length > max ? ', …' : '')
}

/** Events of the latest run, plus MCP hub events emitted during it. */
export function currentRunEvents(events: readonly TraceEvent[]): { runId: string | null; list: TraceEvent[] } {
  const startIdx = events.findLastIndex(ev => ev.type === 'run/start')
  const start = events[startIdx]
  if (!start) return { runId: null, list: [] }
  const runId = start.runId
  const list = events.slice(startIdx).filter(ev => ev.runId === runId || ev.runId === 'mcp')
  return { runId, list }
}

/** Pure reduction of the trace into what each stage card shows. */
export function deriveStage(events: readonly TraceEvent[], hasOrchestrator: boolean): StageState {
  const { runId, list } = currentRunEvents(events)
  if (!runId) return EMPTY_STAGE
  const s: StageState = {
    ...EMPTY_STAGE,
    gates: { ...EMPTY_STAGE.gates },
    runId,
    running: true,
    phase: 'collecting',
  }
  const repeatSeen = new Map<string, number>()

  for (const e of list) {
    s.lastEvent = e
    switch (e.type) {
      case 'run/start':
        s.question = e.input
        break
      case 'memory/read':
        s.memoryRead = e.count
        break
      case 'memory/write':
        s.memoryWritten = e.record.text
        break
      case 'rag/query':
        s.ragQuery = e.query
        break
      case 'rag/results':
        s.ragHits = e.hits.map(h => ({
          chunkId: h.chunkId,
          docId: h.docId,
          title: h.title,
          normalized: h.normalized,
          status: h.status,
          reason: h.reason,
        }))
        break
      case 'context/assembled': {
        s.snapshot = e.snapshot
        s.phase = 'collecting'
        const mem = e.snapshot.items.filter(i => i.kind === 'memory')
        s.memory = mem.map(i => ({ id: i.id, key: i.title, text: i.text, state: i.status === 'included' ? 'injected' : 'ignored' }))
        break
      }
      case 'model/request':
        s.modelBusy = true
        s.modelCalls += 1
        s.phase = 'reading'
        break
      case 'model/response':
        s.modelBusy = false
        s.lastResponseMs = e.durationMs
        s.phase = hasOrchestrator ? 'deciding' : 'answering'
        break
      case 'decision/parsed':
        s.decision = e.decision
        s.phase = e.decision.type === 'tool' ? 'validating' : 'answering'
        break
      case 'decision/invalid':
        s.invalidOutputs += 1
        s.gates.validation = 'warn'
        break
      case 'step/start':
        s.step = e.stepIndex
        break
      case 'tool/call':
        s.tool = { callId: e.callId, tool: e.tool, args: e.args, state: 'requested' }
        {
          const key = `${e.tool}:${JSON.stringify(e.args)}`
          repeatSeen.set(key, (repeatSeen.get(key) ?? 0) + 1)
        }
        // Plan usage: which step of the plan does this call carry out?
        if (s.plan && e.tool !== PLAN_TOOL_ID) {
          const i = s.plan.steps.findIndex(st => (st.status === 'pending' || st.status === 'failed') && stepUses(st, e.tool))
          if (i >= 0) {
            s.plan = { ...s.plan, steps: s.plan.steps.map((st, j) => (j === i ? { ...st, status: 'active', callId: e.callId } : st)) }
          } else {
            s.plan = { ...s.plan, offPlan: [...s.plan.offPlan, shortTool(e.tool)] }
          }
        }
        break
      case 'tool/validation':
        s.gates.validation = e.ok ? 'ok' : 'fail'
        if (s.tool && s.tool.callId === e.callId) s.tool = { ...s.tool, state: e.ok ? 'validated' : 'invalid', summary: e.errors?.join(' · ') }
        break
      case 'tool/execute':
        s.phase = 'executing'
        s.gates.permissions = s.gates.permissions === 'fail' ? 'fail' : 'ok'
        if (s.tool && s.tool.callId === e.callId) s.tool = { ...s.tool, state: 'executing', viaMcp: e.viaMcp }
        break
      case 'tool/result':
        s.phase = 'observing'
        if (s.tool && s.tool.callId === e.callId) {
          s.tool = { ...s.tool, state: e.outcome.ok ? 'done' : s.tool.state === 'blocked' ? 'blocked' : 'error', summary: e.outcome.ok ? e.outcome.summary : e.outcome.message }
        }
        s.toolHistory = [
          ...s.toolHistory,
          { tool: e.tool, ok: e.outcome.ok, summary: e.outcome.ok ? e.outcome.summary : e.outcome.message },
        ]
        if (e.tool === PLAN_TOOL_ID && e.outcome.ok) {
          const text = String((e.outcome.data as { piano?: unknown } | undefined)?.piano ?? '')
          s.plan = { text, steps: parsePlan(text), offPlan: [] }
        } else if (s.plan) {
          const ok = e.outcome.ok
          s.plan = { ...s.plan, steps: s.plan.steps.map(st => (st.callId === e.callId ? { ...st, status: ok ? 'done' : 'failed' } : st)) }
        }
        break
      case 'tool/error':
        if (e.code === 'DENIED' || e.code === 'NOT_AUTHORIZED') {
          s.gates.permissions = 'fail'
          if (s.tool && s.tool.callId === e.callId) s.tool = { ...s.tool, state: 'blocked', summary: e.message }
        }
        if (e.code === 'TIMEOUT') s.gates.time = 'fail'
        break
      case 'approval/asked':
        s.phase = 'waitingHuman'
        s.human = { state: 'waiting', title: e.request.toolTitle }
        s.gates.supervision = 'warn'
        break
      case 'approval/decided':
        s.human = { ...s.human, state: e.outcome }
        s.gates.supervision = e.outcome === 'allowed-once' ? 'ok' : 'fail'
        break
      case 'guard/triggered':
        s.guardMessage = e.message
        if (e.guard === 'repeat') s.gates.repeat = 'warn'
        if (e.guard === 'max_steps' || e.guard === 'safety_net') s.gates.steps = 'fail'
        if (e.guard === 'timeout') s.gates.time = 'fail'
        if (e.guard === 'tool_failures') s.gates.time = s.gates.time === 'fail' ? 'fail' : 'warn'
        if (e.guard === 'unauthorized' || e.guard === 'unsupervised_write') s.gates.permissions = 'fail'
        break
      case 'mcp/call':
        s.mcpCalls += 1
        s.mcpLast = `${e.tool}(${argsInline(e.args)})`
        break
      case 'mcp/result':
        s.mcpLast = e.text.slice(0, 120)
        break
      case 'answer':
        s.answer = e.text
        s.sources = e.sources
        s.phase = 'answering'
        if (s.plan) {
          const i = s.plan.steps.findIndex(st => st.status === 'pending' && st.tool === 'answer')
          if (i >= 0) s.plan = { ...s.plan, steps: s.plan.steps.map((st, j) => (j === i ? { ...st, status: 'done' } : st)) }
        }
        break
      case 'stop':
        s.stopReason = e.reason
        s.stopMessage = e.message
        if (e.reason === 'loop_detected') s.gates.repeat = 'fail'
        if (e.reason === 'max_steps') s.gates.steps = 'fail'
        if (e.reason === 'timeout') s.gates.time = 'fail'
        break
      case 'run/end':
        s.record = e.record
        s.checks = e.record.checks
        s.answer = s.answer ?? e.record.answer
        s.running = false
        s.modelBusy = false
        s.phase = 'done'
        break
      default:
        break
    }
  }
  if (s.step > 0 && s.gates.steps === 'idle') s.gates.steps = 'ok'
  if ([...repeatSeen.values()].some(n => n > 1) && s.gates.repeat === 'idle') s.gates.repeat = 'warn'
  s.lit = s.lastEvent ? litFor(s.lastEvent, hasOrchestrator) : []
  return s
}
