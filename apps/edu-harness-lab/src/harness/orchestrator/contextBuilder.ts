import type {
  ChatMessage,
  ContextHints,
  ContextItem,
  ContextKind,
  ContextSnapshot,
  ExclusionReason,
  HarnessConfig,
  MemoryRecord,
  ModelToolSpec,
  ProvenanceTag,
  RetrievalHit,
  ScenarioData,
  ToolDefinition,
  ToolObservation,
} from '../../domain/types'
import { REAL_LOCAL } from '../../domain/types'
import { newId } from '../events'
import { renderInstructions } from './instructions'
import { NATIVE_MUST_ANSWER, nativeGuidance, renderToolProtocol, serializeDecision, toModelTools } from './protocol'

export const CONTEXT_BUDGET_TOKENS = 6000

export type ObservationInput = ToolObservation & { rationale?: string }

export interface ContextParts {
  stepIndex: number
  scenarioId: string
  config: HarnessConfig
  data: ScenarioData
  userInput: string
  /** Previous turns; ignored unless memory is on. */
  history: ChatMessage[]
  /** Memory records already selected for injection. */
  memory: MemoryRecord[]
  /** Retrieval hits (selected and excluded); empty when RAG is off. */
  hits: RetrievalHit[]
  tools: ToolDefinition[]
  protocol: 'json' | 'text'
  mustAnswer: boolean
  repairAttempt: number
  guardNotice?: string
  observations: ObservationInput[]
  /** Raw invalid assistant outputs and correction requests of this step. */
  repairMessages: ChatMessage[]
  maxTokens?: number
  /** The model supports native tool calling: tools go to its chat template, results use the 'tool' role. */
  nativeTools?: boolean
}

export interface BuiltContext {
  snapshot: ContextSnapshot
  hints: ContextHints
  /** Tool specs for the chat template (native mode only, omitted when the model must answer). */
  tools?: ModelToolSpec[]
}

export const estimateTokens = (text: string): number => Math.ceil(text.length / 3.6)

const LOCAL: ProvenanceTag = REAL_LOCAL

/** What to do after an error, by error code (model-facing, English: tiny models follow it better). */
const ERROR_HINT: Record<string, string> = {
  INVALID_ARGS: 'Fix the arguments (check the tool description) and call the tool again.',
  EMPTY: 'Nothing found. Try once more with simpler arguments (one keyword, or only the category) or use another tool.',
  NOT_AUTHORIZED: 'Not allowed. Do not retry: explain this limit in your answer.',
  DENIED: 'The action was NOT executed. Do not call it again: continue, or write the final answer and say it was not done.',
  TIMEOUT: 'The system did not answer. Retry once at most; if it fails again, tell the user the data is not available.',
  TOOL_ERROR: 'The tool failed. Retry once at most; if it fails again, tell the user.',
  UNKNOWN_TOOL: 'That tool does not exist. Use only the tools you were given.',
}

const hasTool = (ids: Set<string>, id: string) => ids.has(id) || [...ids].some(t => t.endsWith(`__${id}`))

/** The natural next step after a successful result, mentioning only tools that are available. */
function successHint(o: ToolObservation, ids: Set<string>): string {
  const name = o.tool.replace(/^mcp__\w+?__/, '')
  const data = o.outcome.ok ? (o.outcome.data as Record<string, unknown> | undefined) : undefined
  switch (name) {
    case 'pianifica':
      return 'Now follow your plan: do step 1 by calling its tool. Do not answer before the steps that use tools are done.'
    case 'calcolatrice':
      return 'Use this exact number in your answer.'
    case 'converti_valuta':
      return 'Use this converted amount (fixed teaching rate, not a market rate).'
    case 'cerca_policy':
      return 'Apply these rules and cite the document ID in brackets, e.g. (POL-IT-04).'
    case 'cerca_catalogo':
      return `Prices are per unit, VAT excluded. Use only these codes and prices.${hasTool(ids, 'verifica_disponibilita') ? ' Next: check stock of the allowed product with verifica_disponibilita.' : ''}`
    case 'verifica_disponibilita':
      return data?.sufficiente === false
        ? 'NOT enough stock: do not choose this product. Check the next allowed product from the catalog.'
        : 'Enough stock: you can choose this product.'
    case 'leggi_budget':
      return 'Check that the total VAT excluded fits this budget.'
    case 'leggi_ordine_cliente':
      return 'Use this exact status and these dates in your answer.'
    case 'verifica_consegna':
      return 'Use this exact delivery date in your answer.'
    case 'crea_richiesta_acquisto':
    case 'crea_attivita':
    case 'richiedi_approvazione':
    case 'invia_messaggio':
    case 'registra_evento':
      return 'Done (simulated). Give the user the ID and the details.'
    default:
      return 'Use this result.'
  }
}

/**
 * Tool result as the model reads it: the data (in Italian, as the systems return it) plus one short
 * English hint about the next step.
 */
export function observationText(o: ToolObservation, availableTools: string[] = []): string {
  const ids = new Set(availableTools)
  if (o.outcome.ok) return `[RESULT of ${o.tool}] ${o.outcome.summary}\n-> ${successHint(o, ids)}`
  return `[ERROR from ${o.tool}] ${o.outcome.code}: ${o.outcome.message}\n-> ${ERROR_HINT[o.outcome.code] ?? 'Change approach or write the final answer.'}`
}

function documentHeader(item: ContextItem): string {
  return `[${item.title}]`
}

export function buildContext(parts: ContextParts): BuiltContext {
  const { config } = parts
  const c = config.components
  const items: ContextItem[] = []
  const droppable = new Set<string>()
  let n = 0
  const add = (it: Omit<ContextItem, 'id' | 'tokens' | 'provenance' | 'status'> & { provenance?: ProvenanceTag; status?: ContextItem['status']; tokenText?: string }): ContextItem => {
    const { tokenText, ...rest } = it
    const full: ContextItem = {
      ...rest,
      id: `ci-${parts.stepIndex}-${(n += 1)}`,
      tokens: estimateTokens(tokenText ?? it.text),
      status: it.status ?? 'included',
      provenance: it.provenance ?? LOCAL,
    }
    items.push(full)
    return full
  }

  // ── System-side material ──
  if (c.instructions) {
    add({ kind: 'instruction', role: 'system', source: 'instructions', title: 'Istruzioni di sistema', text: renderInstructions(), priority: 90, pinned: true })
  }
  const native = !!parts.nativeTools && parts.protocol === 'json'
  // Always the same tools and guidance: the prompt prefix stays identical across steps, so the KV cache is reused.
  const modelTools = native ? toModelTools(parts.tools) : undefined
  const toolIds = parts.tools.map(t => t.id)
  const guidance = nativeGuidance(toolIds)
  if (native) {
    const listing = modelTools ? modelTools.map(t => `- ${t.function.name}: ${t.function.description}`).join('\n') : ''
    add({
      kind: 'toolSchema',
      role: 'system',
      source: 'tools',
      title: 'Strumenti (descritti al modello dal suo template di chat)',
      text: `${guidance}\n${listing}`,
      tokenText: `${guidance}\n${JSON.stringify(modelTools)}`,
      priority: 85,
      pinned: true,
      refs: parts.tools.map(t => t.id),
    })
  } else if (parts.protocol === 'json') {
    add({
      kind: 'toolSchema',
      role: 'system',
      source: 'tools',
      title: parts.mustAnswer ? 'Protocollo di risposta (strumenti non più ammessi)' : 'Protocollo di decisione e strumenti',
      text: renderToolProtocol(parts.tools, parts.mustAnswer),
      priority: 85,
      pinned: true,
      refs: parts.tools.map(t => t.id),
    })
  }
  if (c.context) {
    for (const td of parts.data.taskData) {
      const it = add({ kind: 'taskData', role: 'system', source: 'context', title: td.title, text: td.text, priority: 70, refs: [td.id] })
      droppable.add(it.id)
    }
  }
  if (c.memory) {
    for (const rec of parts.memory) {
      const it = add({ kind: 'memory', role: 'system', source: 'memory', title: rec.key, text: rec.text, priority: 60, refs: [rec.id] })
      droppable.add(it.id)
    }
  }
  if (c.rag) {
    parts.hits.forEach((h, i) => {
      const title = `${h.doc.id} — ${h.chunk.heading}`
      const base = { kind: 'document' as const, role: 'system' as const, source: 'rag' as const, title, text: h.chunk.text, refs: [h.doc.id, h.chunk.id] }
      if (h.status === 'selected') {
        const it = add({ ...base, priority: Math.max(10, 50 - i) })
        droppable.add(it.id)
      } else {
        add({ ...base, priority: 0, status: 'excluded', exclusionReason: h.reason ?? 'notRelevant' })
      }
    })
  }

  // ── Conversation ──
  if (c.memory) {
    parts.history.forEach((m, i) => {
      const it = add({ kind: 'message', role: m.role, source: 'memory', title: m.role === 'user' ? 'Messaggio precedente' : 'Risposta precedente', text: m.content, priority: 40 + i * 0.01 })
      droppable.add(it.id)
    })
  }
  add({ kind: 'message', role: 'user', source: 'model', title: 'Richiesta della persona', text: parts.userInput, priority: 100, pinned: true })

  // ── Tool loop: decision + observation pairs ──
  const toolCallsOf = new Map<string, NonNullable<ChatMessage['tool_calls']>>()
  for (const o of parts.observations) {
    if (native) {
      const it = add({ kind: 'message', role: 'assistant', source: 'orchestrator', title: `Richiesta strumento: ${o.tool}`, text: o.rationale ?? '', tokenText: `${o.rationale ?? ''} ${o.tool} ${JSON.stringify(o.args)}`, priority: 76, refs: [o.callId] })
      toolCallsOf.set(it.id, [{ name: o.tool, arguments: o.args }])
      add({ kind: 'toolResult', role: 'tool', source: 'orchestrator', title: `Osservazione: ${o.tool}`, text: observationText(o, toolIds), priority: 75, refs: [o.callId, o.tool], provenance: LOCAL })
      continue
    }
    const dec = serializeDecision({ type: 'tool', tool: o.tool, args: o.args, rationale: o.rationale })
    add({ kind: 'message', role: 'assistant', source: 'orchestrator', title: `Richiesta strumento: ${o.tool}`, text: dec, priority: 76, refs: [o.callId] })
    add({ kind: 'toolResult', role: 'user', source: 'orchestrator', title: `Osservazione: ${o.tool}`, text: observationText(o, toolIds), priority: 75, refs: [o.callId], provenance: LOCAL })
  }
  if (native && parts.mustAnswer) {
    add({ kind: 'state', role: 'user', source: 'orchestrator', title: 'Richiesta di risposta finale', text: NATIVE_MUST_ANSWER, priority: 79 })
  }
  for (const m of parts.repairMessages) {
    add({ kind: 'message', role: m.role, source: 'orchestrator', title: m.role === 'assistant' ? 'Output non valido del modello' : 'Richiesta di correzione', text: m.content, priority: 77 })
  }
  if (parts.guardNotice) {
    add({ kind: 'state', role: 'user', source: 'controls', title: 'Promemoria dei controlli', text: `[REMINDER] ${parts.guardNotice}`, priority: 78 })
  }

  // ── Budget ──
  const maxTokens = parts.maxTokens ?? CONTEXT_BUDGET_TOKENS
  const used = () => items.filter(i => i.status === 'included').reduce((s, i) => s + i.tokens, 0)
  if (used() > maxTokens) {
    const candidates = items.filter(i => i.status === 'included' && droppable.has(i.id)).sort((a, b) => a.priority - b.priority)
    for (const cand of candidates) {
      if (used() <= maxTokens) break
      cand.status = 'excluded'
      cand.exclusionReason = 'budget' satisfies ExclusionReason
    }
  }
  const included = items.filter(i => i.status === 'included')

  // ── Messages ──
  const messages: ChatMessage[] = []
  const sys: string[] = []
  const section = (heading: string, kind: ContextKind, fmt: (i: ContextItem) => string) => {
    const group = included.filter(i => i.kind === kind)
    if (group.length) sys.push(`${heading}\n${group.map(fmt).join('\n')}`)
  }
  for (const i of included.filter(x => x.kind === 'instruction')) sys.push(i.text)
  for (const i of included.filter(x => x.kind === 'toolSchema')) sys.push(native ? guidance : i.text)
  section('## TASK DATA (facts about this request)', 'taskData', i => `- ${i.title}: ${i.text}`)
  section('## MEMORY (saved facts about the user)', 'memory', i => `- ${i.title}: ${i.text}`)
  section('## COMPANY DOCUMENTS (retrieved excerpts, in Italian: cite their ID)', 'document', i => `${documentHeader(i)} ${i.text}`)
  if (sys.length) messages.push({ role: 'system', content: sys.join('\n\n') })
  for (const i of included) {
    if (i.kind !== 'message' && i.kind !== 'toolResult' && i.kind !== 'state') continue
    const calls = toolCallsOf.get(i.id)
    if (calls) messages.push({ role: 'assistant', content: i.text, tool_calls: calls })
    else if (i.role === 'tool') messages.push({ role: 'tool', ...(i.refs?.[1] ? { name: i.refs[1] } : {}), content: i.text })
    else messages.push({ role: i.role === 'system' ? 'user' : i.role, content: i.text })
  }

  const kinds = [...new Set(included.map(i => i.kind))]
  const docIds = [...new Set(included.filter(i => i.kind === 'document').map(i => i.refs?.[0]).filter((d): d is string => !!d))]
  const memoryKeys = included.filter(i => i.kind === 'memory').map(i => i.title)
  const hints: ContextHints = {
    scenarioId: parts.scenarioId,
    presentKinds: kinds,
    availableTools: parts.tools.map(t => t.id),
    toolResults: parts.observations.map(({ callId, tool, args, outcome }) => ({ callId, tool, args, outcome })),
    docIds,
    memoryKeys,
    protocol: parts.protocol,
    mustAnswer: parts.mustAnswer,
    repairAttempt: parts.repairAttempt,
    guardNotice: parts.guardNotice,
    stepIndex: parts.stepIndex,
  }
  return {
    snapshot: { id: newId('ctx'), stepIndex: parts.stepIndex, items, budget: { maxTokens, usedTokens: used() }, messages },
    hints,
    ...(modelTools ? { tools: modelTools } : {}),
  }
}
