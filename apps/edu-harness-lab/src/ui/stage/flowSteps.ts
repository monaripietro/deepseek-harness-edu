import type { ComponentFamily, ComponentId, TraceEvent } from '../../domain/types'
import { pick, tr } from '../../i18n'
import type { Bi } from '../../i18n'
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

/** A step whose label and hint follow the interface language at read time. */
const step = (id: FlowStepId, family: FlowStepDef['family'], label: Bi, hint: Bi): FlowStepDef => ({
  id,
  family,
  get label() {
    return pick(label)
  },
  get hint() {
    return pick(hint)
  },
})

export const FLOW_STEPS: Record<FlowStepId, FlowStepDef> = {
  request: step('request', 'user', ['Richiesta', 'Request'], ['La tua domanda entra nel sistema.', 'Your question enters the system.']),
  context: step('context', 'information', ['Contesto', 'Context'], ['L’harness raccoglie ciò che il modello potrà leggere.', 'The harness collects what the model will be able to read.']),
  model: step('model', 'model', ['Modello', 'Model'], ['Il modello legge il contesto e scrive.', 'The model reads the context and writes.']),
  decision: step(
    'decision',
    'orchestration',
    ['Decisione', 'Decision'],
    ['L’orchestratore capisce se il modello risponde o chiede uno strumento.', 'The orchestrator works out whether the model answers or asks for a tool.'],
  ),
  action: step(
    'action',
    'action',
    ['Azione', 'Action'],
    ['L’harness controlla ed esegue lo strumento, poi riporta il risultato.', 'The harness checks and runs the tool, then reports the result.'],
  ),
  answer: step('answer', 'model', ['Risposta', 'Answer'], ['Il risultato arriva a te.', 'The result reaches you.']),
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
      return tr('Pronto a partire', 'Ready to start')
    case 'collecting':
      return opts.hasOrchestrator
        ? tr('L’harness prepara il contesto', 'The harness prepares the context')
        : tr('La richiesta viene preparata per il modello', 'The request is being prepared for the model')
    case 'reading':
      return opts.streaming ? tr('Il modello sta scrivendo', 'The model is writing') : tr('Il modello legge il contesto', 'The model reads the context')
    case 'deciding':
      return tr('L’orchestratore interpreta ciò che il modello ha scritto', 'The orchestrator interprets what the model wrote')
    case 'validating':
      return tr('L’harness verifica la richiesta di strumento', 'The harness checks the tool request')
    case 'executing':
      return tr('L’harness esegue lo strumento', 'The harness runs the tool')
    case 'waitingHuman':
      return tr('Serve il tuo permesso', 'Your permission is needed')
    case 'observing':
      return tr('Il risultato torna nel contesto', 'The result goes back into the context')
    case 'reflecting':
      return tr('La bozza torna al modello per un riesame', 'The draft goes back to the model for a review')
    case 'answering':
      return tr('Arriva la risposta', 'The answer is arriving')
    case 'done':
      return tr('Concluso', 'Finished')
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
