import type { ComponentFamily, ComponentId, TraceEvent } from '../../domain/types'
import { STOP_LABEL } from '../common/labels'
import type { Phase, StageState } from './deriveStage'
import { currentRunEvents } from './deriveStage'

/**
 * The learner's view of a request: a handful of steps, the same in the map, the flow and the
 * "Adesso" strip. Each harness event belongs to one step; the step list depends on the composition
 * (no decision step without an orchestrator, no action step without tools or MCP).
 */
export type FlowStepId = 'request' | 'context' | 'model' | 'decision' | 'action' | 'answer'

export interface FlowStepDef {
  id: FlowStepId
  label: string
  /** One plain sentence: what happens in this step. */
  hint: string
  family: ComponentFamily | 'user'
}

export const FLOW_STEPS: Record<FlowStepId, FlowStepDef> = {
  request: { id: 'request', label: 'Richiesta', hint: 'La tua domanda entra nel sistema.', family: 'user' },
  context: { id: 'context', label: 'Contesto', hint: 'L’harness raccoglie ciò che il modello potrà leggere.', family: 'information' },
  model: { id: 'model', label: 'Modello', hint: 'Il modello legge il contesto e scrive.', family: 'model' },
  decision: { id: 'decision', label: 'Decisione', hint: 'L’orchestratore capisce se il modello risponde o chiede uno strumento.', family: 'orchestration' },
  action: { id: 'action', label: 'Azione', hint: 'L’harness controlla ed esegue lo strumento, poi riporta il risultato.', family: 'action' },
  answer: { id: 'answer', label: 'Risposta', hint: 'Il risultato arriva a te.', family: 'model' },
}

/** The steps a request goes through with this harness composition, in order. */
export function flowStepsFor(c: Record<ComponentId, boolean>): FlowStepId[] {
  const steps: FlowStepId[] = ['request', 'context', 'model']
  if (c.orchestrator) steps.push('decision')
  if (c.orchestrator && (c.tools || c.mcp)) steps.push('action')
  steps.push('answer')
  return steps
}

/** Which step an event belongs to, or null when it does not move the request forward. */
export function stepOfEvent(e: TraceEvent, hasOrchestrator: boolean): FlowStepId | null {
  switch (e.type) {
    case 'run/start':
      return 'request'
    case 'memory/read':
    case 'memory/select':
    case 'memory/ignore':
    case 'memory/inject':
    case 'rag/query':
    case 'rag/results':
    case 'context/assembled':
      return 'context'
    case 'model/request':
    case 'model/response':
      return 'model'
    case 'decision/parsed':
    case 'decision/invalid':
    case 'decision/repair':
      return hasOrchestrator ? 'decision' : 'model'
    case 'tool/call':
    case 'tool/validation':
    case 'tool/execute':
    case 'tool/result':
    case 'tool/error':
    case 'approval/asked':
    case 'approval/decided':
    case 'mcp/call':
    case 'mcp/result':
      return hasOrchestrator ? 'action' : null
    case 'answer':
      return 'answer'
    case 'stop':
      // A stop without an answer leaves the request where it was.
      return e.reason === 'final_answer' || e.reason === 'needs_user_input' ? 'answer' : null
    default:
      return null
  }
}

export interface FlowProgress {
  /** The step the request is in now (null before the first run). */
  current: FlowStepId | null
  /** Steps reached in the current round of the loop (the request stays reached). */
  visited: Set<FlowStepId>
  /** Steps reached at least once in the whole run. */
  seen: Set<FlowStepId>
}

/** Where the latest run is, step by step. A new round of the agent loop starts the steps again. */
export function flowProgress(events: readonly TraceEvent[], hasOrchestrator: boolean): FlowProgress {
  const { list } = currentRunEvents(events)
  let visited = new Set<FlowStepId>()
  const seen = new Set<FlowStepId>()
  let current: FlowStepId | null = null
  for (const e of list) {
    if (e.type === 'step/start' && e.stepIndex > 1) visited = new Set<FlowStepId>(['request'])
    const step = stepOfEvent(e, hasOrchestrator)
    if (!step) continue
    current = step
    visited.add(step)
    seen.add(step)
  }
  return { current, visited, seen }
}

/** What is happening now, in one short sentence (the title of the "Adesso" strip). */
export function nowText(phase: Phase, opts: { streaming: boolean; hasOrchestrator: boolean }): string {
  switch (phase) {
    case 'idle':
      return 'Pronto a partire'
    case 'collecting':
      return opts.hasOrchestrator ? 'L’harness prepara il contesto' : 'La richiesta viene preparata per il modello'
    case 'reading':
      return opts.streaming ? 'Il modello sta scrivendo' : 'Il modello legge il contesto'
    case 'deciding':
      return 'L’orchestratore interpreta ciò che il modello ha scritto'
    case 'validating':
      return 'L’harness verifica la richiesta di strumento'
    case 'executing':
      return 'L’harness esegue lo strumento'
    case 'waitingHuman':
      return 'Serve il tuo permesso'
    case 'observing':
      return 'Il risultato torna nel contesto'
    case 'reflecting':
      return 'La bozza torna al modello per un riesame'
    case 'answering':
      return 'Arriva la risposta'
    case 'done':
      return 'Concluso'
  }
}

export type OutcomeTone = 'good' | 'warn' | 'bad'

/** How a finished run ended, for the result banner. */
export function outcomeOf(stage: StageState): { tone: OutcomeTone; label: string } | null {
  if (stage.running || !stage.stopReason) return null
  const reason = stage.stopReason
  const tone: OutcomeTone = reason === 'final_answer' ? 'good' : reason === 'needs_user_input' || reason === 'user_stop' ? 'warn' : 'bad'
  return { tone, label: STOP_LABEL[reason] }
}

/** The restart rule lives with the store, which applies it; re-exported for the stage UI. */
export { sameRequest, sendModeFor, type SendMode } from '../../state/conversation'
