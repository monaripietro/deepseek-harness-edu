import type { ComponentId, TraceEvent } from '../../domain/types'
import { tr, uiLang } from '../../i18n'
import { argsInline } from './deriveStage'
import type { EdgeId } from './geometry'

export type FlyerKind = 'message' | 'document' | 'memory' | 'context' | 'call' | 'result' | 'error' | 'approval' | 'guard' | 'mcp' | 'answer' | 'ok'

export interface FlyerSpec {
  edge: EdgeId
  reverse?: boolean
  label: string
  kind: FlyerKind
  /** Delay as a fraction of the event duration. */
  delay?: number
}

/** Arguments of in-flight tool calls, so the execute packet can show them. */
const callArgs = new Map<string, Record<string, unknown>>()

const pct = (n: number) => `${Math.round(n * 100)}%`
const trim = (s: string, n = 30) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

function decisionLabel(raw: string): string {
  const tool = /"(?:strumento|tool|name)"\s*:\s*"([^"]+)"/.exec(raw)?.[1]
  if (tool) return `${tr('chiede', 'asks')}: ${tool.replace(/^mcp__\w+?__/, 'MCP·')}`
  if (/"azione"\s*:\s*"chiedi"/.test(raw)) return tr('domanda per te', 'question for you')
  if (/"azione"\s*:\s*"rispondi"/.test(raw)) return tr('decide: rispondere', 'decides: to answer')
  return tr('testo', 'text')
}

/**
 * Translate an observable event into the labelled packets that travel along the stage wires.
 * The animation is a faithful projection of the trace: no packet without an event.
 */
export function flyersFor(e: TraceEvent, components: Record<ComponentId, boolean>): FlyerSpec[] {
  const orch = components.orchestrator
  switch (e.type) {
    case 'run/start':
      return [{ edge: 'question-window', label: tr('la tua richiesta', 'your request'), kind: 'message' }]
    case 'rag/query':
      return [{ edge: 'question-rag', label: `${tr('cerca', 'search')}: “${trim(e.query, 22)}”`, kind: 'document' }]
    case 'rag/results': {
      const sel = e.hits.filter(h => h.status === 'selected').slice(0, 3)
      if (!sel.length) return []
      return [{ edge: 'rag-window' as const, label: sel.map(h => `${h.docId} ${pct(h.normalized)}`).join(' · '), kind: 'document' as const }]
    }
    case 'memory/inject':
      return e.ids.length ? [{ edge: 'memory-window', label: `${e.ids.length} ${tr('ricordi', 'memories')}`, kind: 'memory' }] : []
    case 'context/assembled': {
      const items = e.snapshot.items.filter(i => i.status === 'included')
      const out: FlyerSpec[] = []
      // Step 1 of each round — the harness assembles the context. Instructions and task data enter it
      // once, with the first input; later rounds only add the new tool result (`ring-window`).
      // Step 2 — the model reads it — is a separate event (`model/request`, below).
      const first = e.snapshot.stepIndex <= 1
      if (first && items.some(i => i.kind === 'instruction')) out.push({ edge: 'instructions-window', label: tr('istruzioni', 'instructions'), kind: 'context' })
      if (first && items.some(i => i.kind === 'taskData')) out.push({ edge: 'context-window', label: tr('dati del compito', 'task data'), kind: 'context', delay: 0.08 })
      if (!first && items.some(i => i.kind === 'toolResult')) out.push({ edge: 'ring-window', label: tr('osservazione', 'observation'), kind: 'result', delay: 0.04 })
      return out
    }
    case 'model/request':
      return [{ edge: 'window-model', label: `≈ ${e.tokensIn.toLocaleString(uiLang() === 'en' ? 'en-US' : 'it-IT')} token`, kind: 'context' }]
    case 'model/response':
      return orch ? [{ edge: 'model-ring', label: decisionLabel(e.text), kind: 'call' }] : []
    case 'decision/invalid':
      return [{ edge: 'model-ring', reverse: true, label: tr('formato non valido', 'invalid format'), kind: 'error' }]
    case 'tool/call':
      callArgs.set(e.callId, e.args)
      if (callArgs.size > 50) {
        const oldest = callArgs.keys().next().value
        if (oldest !== undefined) callArgs.delete(oldest)
      }
      return []
    case 'tool/validation':
      return [{ edge: 'ring-controls', label: `${tr('argomenti', 'arguments')} ${e.ok ? '✓' : '✗'}`, kind: e.ok ? 'ok' : 'error' }]
    case 'tool/execute': {
      const label = `${e.tool.replace(/^mcp__\w+?__/, '')}(${argsInline(callArgs.get(e.callId) ?? {})})`
      if (e.viaMcp) return [{ edge: 'ring-tools', label, kind: 'call' }, { edge: 'ring-mcp', label: 'JSON-RPC tools/call', kind: 'mcp', delay: 0.45 }]
      return [{ edge: 'ring-tools', label: trim(label, 34), kind: 'call' }]
    }
    case 'tool/result': {
      const text = e.outcome.ok ? trim(e.outcome.summary, 30) : trim(e.outcome.message, 30)
      const kind: FlyerKind = e.outcome.ok ? 'result' : 'error'
      if (e.tool.startsWith('mcp__')) return [{ edge: 'ring-mcp', reverse: true, label: tr('risposta MCP', 'MCP reply'), kind: 'mcp' },{ edge: 'ring-tools', reverse: true, label: text, kind, delay: 0.4 }]
      return [{ edge: 'ring-tools', reverse: true, label: text, kind }]
    }
    case 'approval/asked':
      return [{ edge: 'ring-human', label: tr('serve il tuo permesso', 'your permission is needed'), kind: 'approval' }]
    case 'approval/decided': {
      const approved = e.outcome === 'allowed-once'
      return [{ edge: 'ring-human', reverse: true, label: approved ? tr('approvato ✓', 'approved ✓') : tr('rifiutato ✗', 'rejected ✗'), kind: approved ? 'ok' : 'error' }]
    }
    case 'guard/triggered':
      return [{ edge: 'ring-controls', reverse: true, label: trim(e.message, 30), kind: 'guard' }]
    case 'mcp/list-tools':
      return components.mcp ? [{ edge: 'ring-mcp', reverse: true, label: `${e.tools.length} ${tr('strumenti scoperti', 'tools found')}`, kind: 'mcp' }] : []
    case 'answer':
      return [{ edge: orch ? 'ring-answer' : 'model-answer', label: tr('risposta', 'answer'), kind: 'answer' }]
    default:
      return []
  }
}
