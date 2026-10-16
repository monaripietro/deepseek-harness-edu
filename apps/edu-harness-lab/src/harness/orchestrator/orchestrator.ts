import type {
  ApprovalOutcome,
  ApprovalRequest,
  ChatMessage,
  MemoryRecord,
  ModelDecision,
  ModelResponse,
  RetrievalHit,
  RunCheck,
  RunRecord,
  StopReason,
  ToolDefinition,
  ToolErrorCode,
  ToolOutcome,
  TraceEvent,
  TraceEventBody,
  TraceEventBase,
  TurnDeps,
} from '../../domain/types'
import { REAL_LOCAL, SAFETY_NET } from '../../domain/types'
import { newId } from '../events'
import { executeTool } from '../tools/executor'
import { validateArgs } from '../tools/validate'
import { buildContext, type ObservationInput, type ReflectionInput } from './contextBuilder'
import { FAULT_LABEL, corruptArgs, createRepeatDetector, effectsFor, shortenText, simulatedActionId } from './guards'
import {
  NATIVE_REPAIR,
  REFLECTION_FAIL,
  REFLECTION_ONE_BLOCK,
  REFLECTION_PASS,
  REFLECTION_REPAIR,
  REFLECTION_UNCLEAR,
  REPAIR_INSTRUCTION,
  parseDecision,
  parseNative,
  parseReflectionTurn,
} from './protocol'
import { unverifiedNumbers } from './numbers'
import { PLAN_TOOL, recordPlan } from '../tools/planning'
import { createRetriever } from '../rag/retriever'

/** Forced first move: the model writes its plan (guided call to the planning tool). */
const PLAN_CALL = { name: PLAN_TOOL.id, arg: 'piano' }
const PLAN_GUIDE = 'Prima di agire l’orchestratore fa scrivere al modello un piano: passi numerati, ciascuno con lo strumento da usare.'
/** Guided reflection loop: what the orchestrator opens at each micro-step (shown in the app). */
const GUIDE_STEP = {
  draft: 'L’orchestratore apre una bozza (<self_reflection>): il modello la completa con una proposta concreta.',
  check: 'L’orchestratore apre il controllo: il modello risponde sì o no a ogni regola, con i numeri della sua bozza.',
  final: 'Il modello ha risposto sì a tutte le regole: l’orchestratore apre la risposta finale (<final_answer>).',
} as const
const planFirst = (toolIds: string[], loop: boolean) =>
  `Before acting, call ${PLAN_TOOL.id} with your plan: 1 to 5 numbered steps. Each step names a relevant tool ` +
  `(${toolIds.join(', ')}), "answer", or "ask" for missing user-owned details. Plan only what the request needs and the available tools allow. ` +
  'Retrieve company data through tools; ask only for missing details that the user alone knows.' +
  (toolIds.includes('calcolatrice') ? ' Every calculation is a calcolatrice step.' : '') +
  (loop ? '' : ' You can call only ONE tool before the answer: pick the most useful one.')

/** Guided call to the calculator: the runtime writes the opening, the model writes the expression. */
const CALC_CALL = { name: 'calcolatrice', arg: 'espressione' }
const calcRepair = (odd: string[]) =>
  `Your answer contains numbers you calculated yourself (${odd.slice(0, 3).join(', ')}). Do not calculate in your head: ` +
  'call calcolatrice with ONE full expression that gives exactly the number asked for (for a percentage, divide and multiply by 100), ' +
  'using the numbers from the request or from the tool results.'

const noop = () => {}
/** No cap on what the model writes: it stops by itself (a local model at most fills its context window). */
const MAX_NEW_TOKENS = Number.POSITIVE_INFINITY
const NO_CONTROLS_STEP_TIMEOUT_MS = 300_000
const NO_CONTROLS_TOOL_TIMEOUT_MS = 8_000

/** Internal control-flow signal: the turn ends here. Never escapes runTurn. */
class Halt extends Error {
  constructor(
    readonly reason: StopReason,
    message: string,
    readonly answer?: string,
    readonly sources?: string[],
  ) {
    super(message)
  }
}

type Meta = { stepIndex?: number; source?: TraceEventBase['source']; provenance?: TraceEvent['provenance'] }

const STOP_MESSAGES: Record<StopReason, string> = {
  final_answer: 'Risposta finale consegnata.',
  needs_user_input: 'Il modello ha bisogno di un chiarimento: attende la tua risposta.',
  max_steps: 'Raggiunto il numero massimo di passi senza una risposta finale.',
  user_stop: 'Esecuzione interrotta dall’utente.',
  timeout: 'Tempo massimo del turno esaurito.',
  loop_detected: 'Stessa richiesta ripetuta troppe volte di seguito: ciclo interrotto dai controlli.',
  approval_denied: 'La persona ha rifiutato l’azione: nulla è stato eseguito.',
  unauthorized_tool: 'Il modello ha insistito su uno strumento non autorizzato: esecuzione fermata dai controlli.',
  tool_failures: 'Troppi errori consecutivi degli strumenti: esecuzione fermata dai controlli.',
  invalid_output: 'Il modello non ha prodotto una decisione valida nel formato richiesto.',
  model_error: 'Il modello non ha potuto rispondere.',
}

export async function runTurn(input: string, deps: TurnDeps, signal: AbortSignal): Promise<RunRecord> {
  const { config, bus, pacer, scenario } = deps
  const c = config.components
  const data = scenario.context ? { ...deps.data, taskData: scenario.context.taskData } : deps.data
  const language = deps.language ?? 'it'
  // Company documents and seeded memories in the prompt language (same ids/keys); user-added ones stay as written.
  const localizedDocs = new Map(deps.data.documents.map(doc => [doc.id, doc]))
  const localizedSeeds = new Map(deps.data.memorySeeds.map(seed => [seed.key, seed.text]))
  const taskStateKey = scenario.context ? `stato_attivita:${scenario.id}` : 'stato_attivita'
  const allowedMemoryKeys = new Set(scenario.context?.memoryKeys)
  const allowedDocumentIds = new Set(scenario.context?.documentIds)
  const pinnedDocumentIds = new Set(scenario.context
    ? deps.retriever.chunks()
      .filter(chunk => config.rag.pinnedChunkIds.includes(chunk.id))
      .map(chunk => chunk.docId)
    : [])
  const retriever = scenario.context
    ? createRetriever(deps.retriever.documents()
      .filter(doc =>
        allowedDocumentIds.has(doc.id) || doc.userAdded || pinnedDocumentIds.has(doc.id) ||
        (config.rag.includeDistractors && doc.status === 'distractor'),
      )
      .map(doc => (doc.userAdded ? doc : (localizedDocs.get(doc.id) ?? doc))))
    : deps.retriever
  const reflectionMode = !!scenario.reflectionPrompt && c.agentLoop && c.orchestrator
  const controls = c.controls
  const limits = config.limits
  const runId = newId('run')
  const startedMs = Date.now()
  const startedAt = new Date(startedMs).toISOString()

  const toolCalls: RunRecord['toolCalls'] = []
  const errors: string[] = []
  const actions: RunRecord['actions'] = []
  const observations: ObservationInput[] = []
  const reflections: ReflectionInput[] = []
  /** Guided reflection loop: the micro-step due next. */
  let guidePhase: 'draft' | 'check' | 'final' = 'draft'
  let humanInterventions = 0
  let stepIndex = 0
  let lastProvenance = deps.runtime.info.provenance
  let injectedMemory: MemoryRecord[] = []
  let hits: RetrievalHit[] = []
  let lastDocIds: string[] = []

  // ── event emission: every event is awaited on the pacer, then the abort flag is checked ──
  const emit = async (body: TraceEventBody, meta: Meta = {}, check = true): Promise<void> => {
    const ev = bus.emit(runId, body, { stepIndex: meta.stepIndex ?? (stepIndex || undefined), source: meta.source ?? 'orchestrator', provenance: meta.provenance ?? REAL_LOCAL })
    try {
      await pacer.wait(ev)
    } catch {
      /* a failing pacer must never break the run */
    }
    if (check && signal.aborted) throw new Halt('user_stop', STOP_MESSAGES.user_stop)
  }

  let halt: Halt
  try {
    halt = await execute()
  } catch (err) {
    halt = err instanceof Halt ? err : new Halt('model_error', `Errore interno dell’orchestratore: ${err instanceof Error ? err.message : String(err)}`)
    if (!(err instanceof Halt)) errors.push(halt.message)
  }
  if (signal.aborted && halt.reason === 'model_error') halt = new Halt('user_stop', STOP_MESSAGES.user_stop)

  // ── after the turn: memory write, record, stop, run/end (no abort checks from here) ──
  const answer = halt.answer ?? defaultAnswer(halt)
  try {
    if (c.memory) {
      for (const old of deps.memory.list().filter(m => m.scope === 'session' && m.kind === 'taskState' && m.key === taskStateKey)) {
        deps.memory.delete(old.id)
        await emit({ type: 'memory/delete', id: old.id }, { source: 'memory' }, false)
      }
      const rec = deps.memory.write({
        scope: 'session',
        kind: 'taskState',
        key: taskStateKey,
        text: `Richiesta: «${shortenText(input, 140)}». Esito: ${halt.reason === 'final_answer' ? 'risposta fornita' : STOP_MESSAGES[halt.reason].replace(/\.$/, '').toLowerCase()}.`,
        source: 'model',
      })
      await emit({ type: 'memory/write', record: rec }, { source: 'memory' }, false)
    }
  } catch {
    /* memory problems never break the run */
  }

  const sourcesUsed = halt.sources?.length ? halt.sources : lastDocIds
  const record: RunRecord = {
    id: runId,
    scenarioId: scenario.id,
    ...(language !== 'it' ? { language } : {}),
    configKey: deps.configKey,
    configLabel: deps.configLabel,
    input,
    answer,
    startedAt,
    durationMs: Date.now() - startedMs,
    steps: stepIndex,
    toolCalls,
    ...(reflectionMode ? { reflections: reflections.map(reflection => reflection.text) } : {}),
    sourcesUsed,
    memoryUsed: injectedMemory.map(m => m.key),
    errors,
    humanInterventions,
    actions,
    stopReason: halt.reason,
    checks: [],
    modelInfo: deps.runtime.info,
    modelProvenance: lastProvenance,
  }
  record.checks = scenario.checkers.map((ch): RunCheck => {
    let passed = false
    try {
      passed = ch.check(record)
    } catch {
      passed = false
    }
    return { id: ch.id, label: ch.label, passed }
  })
  await emit({ type: 'stop', reason: halt.reason, message: halt.message }, {}, false)
  await emit({ type: 'run/end', record }, { source: 'ui' }, false)
  return record

  function defaultAnswer(h: Halt): string {
    switch (h.reason) {
      case 'user_stop':
        return 'Esecuzione interrotta prima di una risposta.'
      case 'model_error':
        return `${h.message} Riprova, oppure cambia modello dal pannello Modello.`
      default:
        return h.message
    }
  }

  // ═════════════════════════ the turn itself ═════════════════════════
  async function execute(): Promise<Halt> {
    await emit({ type: 'run/start', input, configKey: deps.configKey, configLabel: deps.configLabel, scenarioId: scenario.id, model: deps.runtime.info }, { source: 'user', provenance: deps.runtime.info.provenance })

    // Memory
    if (c.memory) {
      const all = deps.memory.list()
      await emit({ type: 'memory/read', count: all.length }, { source: 'memory' })
      const selected = all.filter((m) => {
        if (m.scope !== 'persistent' && m.kind !== 'taskState') return false
        if (!scenario.context) return true
        if (m.source === 'seed') return allowedMemoryKeys.has(m.key)
        if (m.source === 'model' && m.kind === 'taskState') return m.key === taskStateKey
        return true
      })
      const ignored = all.filter(m => !selected.includes(m))
      if (selected.length) {
        await emit({ type: 'memory/select', ids: selected.map(m => m.id) }, { source: 'memory' })
        await emit({ type: 'memory/inject', ids: selected.map(m => m.id) }, { source: 'memory' })
      }
      if (ignored.length) await emit({ type: 'memory/ignore', ids: ignored.map(m => m.id), reason: 'Ricordi non selezionati per questo scenario o appunti di sessione non legati al compito' }, { source: 'memory' })
      injectedMemory = selected.map(m => (m.source === 'seed' && localizedSeeds.has(m.key) ? { ...m, text: localizedSeeds.get(m.key) ?? m.text } : m))
    }

    // RAG
    if (c.rag) {
      await emit({ type: 'rag/query', query: input, mode: config.rag.mode }, { source: 'rag' })
      hits = retriever.search(input, config.rag)
      await emit(
        {
          type: 'rag/results',
          hits: hits.map(h => ({ chunkId: h.chunk.id, docId: h.doc.id, title: `${h.doc.id} — ${h.chunk.heading}`, score: h.score, normalized: h.normalized, status: h.status, reason: h.reason })),
        },
        { source: 'rag' },
      )
    }

    // MCP
    if (c.mcp) {
      for (const id of config.mcpServers) {
        const st = deps.mcp.servers().find(s => s.server.id === id)
        if (st?.state === 'connected') continue
        try {
          await deps.mcp.connect(id)
        } catch (err) {
          errors.push(`Server MCP «${id}» non raggiungibile: ${err instanceof Error ? err.message : String(err)}. Procedo senza i suoi strumenti.`)
        }
        if (signal.aborted) throw new Halt('user_stop', STOP_MESSAGES.user_stop)
      }
    }

    // Tools
    let tools: ToolDefinition[] = []
    // The reflection loop has its own protocol (tagged blocks): no tools, so the two formats never mix.
    if (c.tools && c.orchestrator && !reflectionMode) {
      tools = deps.registry.list().filter(t => config.enabledTools.includes(t.id))
      if (c.mcp) {
        const mcpTools = deps.mcp.toolDefinitions().filter(t => t.mcpServer !== undefined && config.mcpServers.includes(t.mcpServer))
        tools = [...tools, ...mcpTools]
      }
    }
    const availableIds = new Set(tools.map(t => t.id))
    const protocol: 'json' | 'text' = tools.length || reflectionMode ? 'json' : 'text'
    /** Models trained for tool calling get tools through their own chat template. */
    const native = !!deps.runtime.info.nativeTools && !reflectionMode
    const history = c.memory ? deps.history : []

    const maxSteps = controls ? limits.maxSteps : SAFETY_NET.maxSteps
    // On the CPU (WASM) a single call can take minutes: the limits scale with the hardware, the controls stay on.
    const cpu = deps.runtime.info.backend === 'wasm'
    const turnTimeoutMs = (controls ? limits.turnTimeoutMs : SAFETY_NET.turnTimeoutMs) * (cpu ? 5 : 1)
    const stepTimeoutMs = (controls ? limits.stepTimeoutMs : NO_CONTROLS_STEP_TIMEOUT_MS) * (cpu ? 4 : 1)
    const toolTimeoutMs = controls ? limits.toolTimeoutMs : NO_CONTROLS_TOOL_TIMEOUT_MS

    const detector = createRepeatDetector()
    let mustAnswer = false
    let guardNotice: string | undefined
    let forcedFinal = false
    const finalization: { reason: StopReason | null; note: string } = { reason: null, note: '' }
    let consecutiveFailures = 0
    let unauthorizedCount = 0
    const loopState = { planned: false, faultSpent: false }
    let executedCount = 0
    let mustAnswerViolations = 0
    const calculator = native ? tools.find(t => t.id === 'calcolatrice') : undefined
    /** Planning step: forced first call for models with native tool calling, whenever there are tools. */
    const planning = native && tools.length > 0
    /** One arithmetic intervention per turn (guided first call or rejected answer), never a loop. */
    let calcNudged = false
    /** Everything the model may legitimately quote numbers from. */
    const numberSources = () =>
      [
        input,
        // The plan is generated text, not a verified numeric source.
        ...observations.filter(o => o.tool !== PLAN_TOOL.id).map(o => (o.outcome.ok ? o.outcome.summary : o.outcome.message)),
        ...hits.filter(h => h.status === 'selected').map(h => h.chunk.text),
        ...(c.context ? data.taskData.map(t => t.text) : []),
        ...injectedMemory.map(m => m.text),
        'IVA 22% 1,22',
      ].join('\n')

    for (;;) {
      stepIndex += 1
      if (!finalization.reason) {
        if (Date.now() - startedMs > turnTimeoutMs) {
          await emit({ type: 'guard/triggered', guard: controls ? 'timeout' : 'safety_net', message: `Tempo massimo del turno (${Math.round(turnTimeoutMs / 1000)} s) esaurito.` }, { source: controls ? 'controls' : 'orchestrator' }, false)
          stepIndex -= 1
          throw new Halt('timeout', STOP_MESSAGES.timeout, 'Il tempo massimo per questa richiesta è esaurito: non ho una risposta completa.')
        }
        if (stepIndex > maxSteps) {
          if (reflectionMode) {
            stepIndex -= 1
            await emit({ type: 'guard/triggered', guard: 'max_steps', message: `Raggiunti ${maxSteps} passi di riflessione senza una risposta finale verificata dal modello.` }, { source: 'controls' }, false)
            throw new Halt('max_steps', STOP_MESSAGES.max_steps, 'Il ciclo di riflessione ha raggiunto il limite di passi: non ho una risposta finale verificata.')
          }
          if (!forcedFinal && protocol === 'json') {
            forcedFinal = true
            mustAnswer = true
            await emit(
              controls
                ? { type: 'guard/triggered', guard: 'max_steps', message: `Raggiunti ${maxSteps} passi: l’ultimo passo serve solo a rispondere con ciò che c’è.` }
                : { type: 'guard/triggered', guard: 'safety_net', message: `Rete di sicurezza tecnica: ${maxSteps} passi raggiunti.` },
              { source: controls ? 'controls' : 'orchestrator' },
            )
          } else {
            stepIndex -= 1
            throw new Halt('max_steps', STOP_MESSAGES.max_steps, 'Non sono riuscito a completare il compito entro il numero massimo di passi.')
          }
        }
      }
      const sIdx = stepIndex
      const stepState = { ended: false }
      const endStep = async (): Promise<void> => {
        stepState.ended = true
        await emit({ type: 'step/end', stepIndex: sIdx }, { stepIndex: sIdx })
      }
      try {
        await (async () => {
          await emit({ type: 'step/start', stepIndex: sIdx }, { stepIndex: sIdx })
          const stepNotice = guardNotice
          guardNotice = undefined

          // ── model call (with repair attempts) ──
          const repairMessages: ChatMessage[] = []
          let repairAttempt = 0
          // First move: a guided call to the planning tool (the model writes the steps, the harness opens the call).
          let forceTool: { name: string; arg: string } | undefined
          if (planning && !loopState.planned && sIdx === 1 && observations.length === 0 && !mustAnswer) {
            forceTool = PLAN_CALL
            await emit({ type: 'decision/repair', attempt: 0, instruction: PLAN_GUIDE }, { stepIndex: sIdx, source: 'orchestrator' })
            repairMessages.push({ role: 'user', content: planFirst(tools.map(t => t.id), c.agentLoop) })
          }
          const modelTools = planning && !loopState.planned ? [PLAN_TOOL, ...tools] : tools
          // Guided reflection loop: the orchestrator opens the block of the current micro-step and the model completes it
          // (local models; remote ones only read the routing messages).
          const guide = reflectionMode && !mustAnswer ? scenario.reflectionGuide : undefined
          const prefill = guide
            ? guidePhase === 'final'
              ? '<final_answer>\n'
              : `<self_reflection>\n${guidePhase === 'draft' ? guide.draftStart : guide.checkStart}`
            : undefined
          if (prefill && deps.runtime.info.backend !== 'remote') {
            await emit({ type: 'decision/repair', attempt: 0, instruction: GUIDE_STEP[guidePhase] }, { stepIndex: sIdx, source: 'orchestrator' })
          }
          let decision: ModelDecision
          for (;;) {
            const built = buildContext({
              stepIndex: sIdx,
              scenarioId: scenario.id,
              config,
              data,
              scenarioInstructions: scenario.context?.instructions,
              replacesGeneralInstructions: !!scenario.context?.replacesGeneralInstructions,
              language,
              userInput: input,
              history,
              memory: injectedMemory,
              hits,
              tools: modelTools,
              protocol,
              mustAnswer,
              repairAttempt,
              guardNotice: stepNotice,
              observations,
              ...(reflectionMode ? { reflectionPrompt: scenario.reflectionPrompt, reflections } : {}),
              repairMessages,
              nativeTools: native,
            })
            lastDocIds = built.hints.docIds
            await emit({ type: 'context/assembled', snapshot: built.snapshot }, { stepIndex: sIdx, source: 'context' })
            await emit({ type: 'model/request', tokensIn: built.snapshot.budget.usedTokens, protocol, mustAnswer, ...(reflectionMode ? { reflection: true } : {}) }, { stepIndex: sIdx, source: 'model' })
            const response = await callModel(
              {
                messages: built.snapshot.messages,
                maxNewTokens: MAX_NEW_TOKENS,
                hints: built.hints,
                ...(built.tools ? { tools: built.tools } : {}),
                ...(forceTool ? { forceTool } : {}),
                ...(prefill ? { prefill } : {}),
                // One block per call: local models stop right after a closing tag.
                ...(reflectionMode ? { stop: ['</self_reflection>', '</final_answer>'] } : {}),
              },
              stepTimeoutMs,
            )
            forceTool = undefined
            lastProvenance = response.provenance
            await emit(
              { type: 'model/response', text: response.text, durationMs: response.durationMs, finishReason: response.finishReason, tokensOut: response.tokensOut },
              { stepIndex: sIdx, source: 'model', provenance: response.provenance },
            )
            if (response.finishReason === 'aborted' && signal.aborted) throw new Halt('user_stop', STOP_MESSAGES.user_stop)
            if (response.finishReason === 'error') throw modelFail('il runtime ha segnalato un errore durante la generazione.')

            if (protocol === 'text') {
              decision = { type: 'answer', text: response.text.trim() || '(Il modello non ha prodotto testo.)' }
              break
            }
            let parsed = reflectionMode
              ? parseReflectionTurn(response.text)
              : native
                ? parseNative(response.text)
                : parseDecision(response.text)
            if (parsed.ok && parsed.decision.type === 'reflect' && (!reflectionMode || mustAnswer)) {
              parsed = { ok: false, error: 'La riflessione non è disponibile: scegli una risposta finale o una delle azioni ammesse.' }
            }
            // Arithmetic check: an answer with numbers that come from no source was computed "in the head".
            // Not accepted (once per turn): the model redoes it through a guided calculator call.
            if (parsed.ok && parsed.decision.type === 'answer' && calculator && !calcNudged && !mustAnswer) {
              const odd = unverifiedNumbers(parsed.decision.text, numberSources())
              if (odd.length) {
                calcNudged = true
                await emit(
                  { type: 'decision/invalid', raw: response.text, error: `Numeri calcolati a mente (${odd.slice(0, 3).join(', ')}): non vengono da una fonte né da uno strumento.`, attempt: repairAttempt + 1 },
                  { stepIndex: sIdx },
                )
                const instruction = calcRepair(odd)
                await emit({ type: 'decision/repair', attempt: repairAttempt + 1, instruction }, { stepIndex: sIdx })
                repairAttempt += 1
                repairMessages.push({ role: 'assistant', content: response.text }, { role: 'user', content: instruction })
                forceTool = CALC_CALL
                continue
              }
            }
            if (parsed.ok) {
              decision = parsed.decision
              break
            }
            await emit({ type: 'decision/invalid', raw: response.text, error: parsed.error, attempt: repairAttempt + 1 }, { stepIndex: sIdx })
            if (repairAttempt < limits.maxRepairs) {
              repairAttempt += 1
              const instruction = reflectionMode
                ? `${parsed.repair ?? ''} ${REFLECTION_REPAIR}`.trim()
                : `${parsed.error} ${native ? NATIVE_REPAIR : REPAIR_INSTRUCTION}`
              await emit({ type: 'decision/repair', attempt: repairAttempt, instruction }, { stepIndex: sIdx })
              repairMessages.push({ role: 'assistant', content: response.text }, { role: 'user', content: instruction })
              continue
            }
            errors.push(`Decisione del modello non valida: ${parsed.error}`)
            // Prose fallback for the JSON protocol only: in the reflection loop an invalid output (or a draft)
            // never becomes the final answer.
            if (!reflectionMode && !/[{[]/.test(response.text) && response.text.trim()) {
              const prose = response.text.trim()
              await emit({ type: 'answer', text: prose, sources: lastDocIds }, { stepIndex: sIdx })
              throw new Halt('invalid_output', 'Il modello ha risposto in prosa invece che nel formato JSON richiesto: accetto il testo, ma non è una risposta verificata dal protocollo.', prose, lastDocIds)
            }
            throw new Halt('invalid_output', STOP_MESSAGES.invalid_output, 'Il modello non è riuscito a produrre una decisione valida nel formato richiesto, quindi non ho una risposta affidabile.')
          }

          // ── act on the decision ──
          if (decision.type === 'reflect') {
            // Guided loop: read the draft back with its own numbers, or route on the model's own yes/no answers.
            let next: string | undefined
            const stepGuide = reflectionMode ? scenario.reflectionGuide : undefined
            if (stepGuide && guidePhase === 'check') {
              const verdict = stepGuide.verdict(decision.text)
              guidePhase = verdict === 'pass' ? 'final' : verdict === 'fail' ? 'draft' : 'check'
              next = verdict === 'pass' ? REFLECTION_PASS : verdict === 'fail' ? REFLECTION_FAIL : REFLECTION_UNCLEAR
            } else if (stepGuide) {
              const readback = stepGuide.readback(decision.text)
              guidePhase = readback.complete ? 'check' : 'draft'
              next = `${readback.text}\n${REFLECTION_ONE_BLOCK}`
            }
            reflections.push({ text: decision.text, observationsBefore: observations.length, ...(next ? { next } : {}) })
          }
          if (protocol === 'json') await emit({ type: 'decision/parsed', decision }, { stepIndex: sIdx, source: 'model', provenance: lastProvenance })
          if (decision.type === 'reflect') {
            const repeats = detector.record('reflection', { text: decision.text.replace(/\s+/g, ' ').trim().toLowerCase() })
            if (controls && repeats >= limits.repeatStopAt) {
              await emit({ type: 'guard/triggered', guard: 'repeat', message: 'La stessa riflessione viene ripetuta senza modifiche: il ciclo si ferma, senza dichiarare convergenza.' }, { stepIndex: sIdx, source: 'controls' })
              throw new Halt('loop_detected', STOP_MESSAGES.loop_detected, 'Il modello ha ripetuto la stessa proposta senza completare la verifica. Il ciclo è stato interrotto.')
            }
            if (controls && repeats >= limits.repeatWarnAt) {
              guardNotice = 'Your last <self_reflection> repeats the previous one without progress. Check one constraint concretely and correct ' +
                'the candidate, or give the <final_answer> if every check passes.'
              await emit({ type: 'guard/triggered', guard: 'repeat', message: 'Riflessione invariata: il prossimo passo chiede di riesaminare la proposta.' }, { stepIndex: sIdx, source: 'controls' })
            }
            await endStep(); return
          }
          if (decision.type === 'answer') {
            const sources = decision.sources?.length ? decision.sources : lastDocIds
            await emit({ type: 'answer', text: decision.text, sources }, { stepIndex: sIdx })
            const reason = finalization.reason ?? 'final_answer'
            throw new Halt(reason, reason === 'final_answer' ? STOP_MESSAGES.final_answer : STOP_MESSAGES[reason], decision.text, decision.sources?.length ? decision.sources : undefined)
          }

          if (decision.type === 'ask') {
            await emit({ type: 'answer', text: decision.question, sources: [] }, { stepIndex: sIdx })
            const reason = finalization.reason ?? 'needs_user_input'
            throw new Halt(reason, STOP_MESSAGES[reason], decision.question)
          }

          // ── tool decision ──
          const callId = newId('call')
          const { tool: toolName, rationale } = decision
          const originalArgs = decision.args
          await emit({ type: 'tool/call', callId, tool: toolName, args: originalArgs, rationale }, { stepIndex: sIdx, source: 'model', provenance: lastProvenance })

          const observe = (args: Record<string, unknown>, outcome: ToolOutcome) => {
            observations.push({ callId, tool: toolName, args, outcome, rationale })
          }
          const fail = (args: Record<string, unknown>, code: ToolErrorCode, message: string, record = true) => {
            if (record) toolCalls.push({ tool: toolName, args, ok: false, code })
            observe(args, { ok: false, code, message })
            errors.push(`${toolName}: ${message}`)
            return Promise.resolve()
          }

          // (a) tools no longer allowed
          if (mustAnswer) {
            mustAnswerViolations += 1
            const msg = 'Non puoi usare altri strumenti: rispondi ora.'
            await fail(originalArgs, 'DENIED', msg)
            await emit({ type: 'tool/error', callId, tool: toolName, code: 'DENIED', message: msg }, { stepIndex: sIdx, source: 'orchestrator' })
            if (finalization.reason) throw new Halt(finalization.reason, STOP_MESSAGES[finalization.reason], finalization.note)
            if (mustAnswerViolations >= 2) throw new Halt('invalid_output', 'Il modello ha continuato a chiedere strumenti quando doveva solo rispondere.', 'Il modello non ha fornito una risposta finale quando gli è stato chiesto.')
            await endStep(); return
          }

          // (a2) planning: the orchestrator records the plan. Not an action: it does not use up the round of tools.
          if (planning && toolName === PLAN_TOOL.id) {
            await emit({ type: 'tool/execute', callId, tool: toolName }, { stepIndex: sIdx, source: 'orchestrator' })
            const outcome = recordPlan(originalArgs)
            await emit({ type: 'tool/result', callId, tool: toolName, outcome, durationMs: 0 }, { stepIndex: sIdx, source: 'orchestrator' })
            observe(originalArgs, outcome)
            if (outcome.ok) loopState.planned = true
            await endStep(); return
          }

          // (b) unknown tool
          const tool = deps.registry.get(toolName) ?? deps.mcp.toolDefinitions().find(t => t.id === toolName)
          if (!tool) {
            const msg = `Lo strumento «${toolName}» non esiste. Strumenti disponibili: ${tools.map(t => t.id).join(', ') || 'nessuno'}.`
            await emit({ type: 'tool/validation', callId, tool: toolName, ok: false, errors: [msg] }, { stepIndex: sIdx, source: 'tools' })
            await fail(originalArgs, 'UNKNOWN_TOOL', msg)
            await endStep(); return
          }

          // (c) permissions
          const notAvailable = !availableIds.has(tool.id)
          if (notAvailable || (controls && tool.forbiddenForRole)) {
            const msg = tool.forbiddenForRole && !notAvailable
              ? `Lo strumento «${tool.id}» non è autorizzato per il ruolo di questa persona.`
              : `Lo strumento «${tool.id}» non è tra quelli messi a disposizione in questa configurazione.`
            await emit({ type: 'tool/error', callId, tool: tool.id, code: 'NOT_AUTHORIZED', message: msg }, { stepIndex: sIdx, source: 'tools', provenance: tool.provenance })
            await fail(originalArgs, 'NOT_AUTHORIZED', msg)
            if (controls) {
              unauthorizedCount += 1
              await emit({ type: 'guard/triggered', guard: 'unauthorized', message: msg }, { stepIndex: sIdx, source: 'controls' })
              if (unauthorizedCount >= 2) throw new Halt('unauthorized_tool', STOP_MESSAGES.unauthorized_tool, `Mi sono fermato: ho provato a usare «${tool.id}», ma non è consentito al tuo ruolo. Serve una persona autorizzata.`)
            }
            await endStep(); return
          }

          // (d) injected fault + (e) validation
          let args = originalArgs
          let faultLabel = ''
          if (deps.faults.invalidArgsOnce && !loopState.faultSpent) {
            loopState.faultSpent = true
            const corrupted = corruptArgs(tool.inputSchema, originalArgs)
            if (corrupted.changed) {
              args = corrupted.args
              faultLabel = ` ${FAULT_LABEL}`
            }
          }
          const validation = validateArgs(tool.inputSchema, args)
          if (!validation.ok) {
            const errs = validation.errors.map(e => `${e}${faultLabel}`)
            await emit({ type: 'tool/validation', callId, tool: tool.id, ok: false, errors: errs }, { stepIndex: sIdx, source: 'tools', provenance: tool.provenance })
            const msg = `Argomenti non validi per «${tool.id}»: ${errs.join('; ')}. Correggi gli argomenti e riprova.`
            await emit({ type: 'tool/error', callId, tool: tool.id, code: 'INVALID_ARGS', message: msg }, { stepIndex: sIdx, source: 'tools', provenance: tool.provenance })
            await fail(args, 'INVALID_ARGS', msg)
            await endStep(); return
          }
          await emit({ type: 'tool/validation', callId, tool: tool.id, ok: true }, { stepIndex: sIdx, source: 'tools', provenance: tool.provenance })

          // (f) repeat guard
          if (controls) {
            const count = detector.record(tool.id, originalArgs)
            if (count >= limits.repeatStopAt) {
              await emit({ type: 'guard/triggered', guard: 'repeat', message: `Stessa chiamata a «${tool.id}» ripetuta ${count} volte di seguito: interrompo il ciclo.` }, { stepIndex: sIdx, source: 'controls' })
              throw new Halt('loop_detected', STOP_MESSAGES.loop_detected, `Mi sono fermato: continuavo a ripetere la stessa richiesta a «${tool.id}» senza fare progressi.`)
            }
            if (count >= limits.repeatWarnAt) {
              // The model reads a short English reminder; the app shows the Italian explanation.
              guardNotice = `You already called ${tool.id} with the same arguments ${count} times. The result will not change. Use it, try a different tool, or write the final answer.`
              await emit(
                {
                  type: 'guard/triggered',
                  guard: 'repeat',
                  message: `Hai già chiamato «${tool.id}» con gli stessi argomenti ${count} volte di seguito. Il risultato non cambia: usa ciò che hai già ottenuto, prova un approccio diverso oppure rispondi.`,
                },
                { stepIndex: sIdx, source: 'controls' },
              )
            }
          }

          // (g) approval
          let approved: boolean | null = null
          if (tool.approval === 'always') {
            if (c.approval) {
              const req: ApprovalRequest = {
                id: newId('apr'),
                callId,
                toolId: tool.id,
                toolTitle: tool.title,
                args,
                rationale,
                risk: tool.risk,
                effects: effectsFor(tool),
                dataUsed: dataUsedSummary(),
                provenance: tool.provenance,
              }
              await emit({ type: 'approval/asked', request: req }, { stepIndex: sIdx, source: 'approval' })
              const outcome: ApprovalOutcome = await deps.approvals.request(req, signal)
              const by = config.autoApprove ? 'teacher-auto' : 'human'
              await emit({ type: 'approval/decided', requestId: req.id, outcome, by }, { stepIndex: sIdx, source: 'approval' }, outcome !== 'cancelled')
              humanInterventions += 1
              if (outcome === 'cancelled') throw new Halt('user_stop', STOP_MESSAGES.user_stop)
              if (outcome === 'rejected') {
                const msg = 'La persona ha rifiutato l’azione: non è stata eseguita.'
                toolCalls.push({ tool: tool.id, args, ok: false, code: 'DENIED' })
                observe(args, { ok: false, code: 'DENIED', message: msg })
                finalization.reason = 'approval_denied'
                finalization.note = `L’azione «${tool.title}» non è stata eseguita perché la persona l’ha rifiutata.`
                mustAnswer = true
                await endStep(); return
              }
              approved = true
            } else if (controls) {
              const msg = 'Azione con effetti: richiede supervisione umana, non ancora attiva. Prepara una bozza e rispondi.'
              await emit({ type: 'tool/error', callId, tool: tool.id, code: 'DENIED', message: msg }, { stepIndex: sIdx, source: 'controls', provenance: tool.provenance })
              await emit({ type: 'guard/triggered', guard: 'unsupervised_write', message: `«${tool.id}» ha effetti reali e non c’è ancora supervisione umana: azione bloccata.` }, { stepIndex: sIdx, source: 'controls' })
              await fail(args, 'DENIED', msg)
              await endStep(); return
            }
          }

          // (h) execute
          const viaMcp = tool.source === 'mcp' ? tool.mcpServer : undefined
          await emit({ type: 'tool/execute', callId, tool: tool.id, viaMcp }, { stepIndex: sIdx, source: viaMcp ? 'mcp' : 'tools', provenance: tool.provenance })
          const t0 = Date.now()
          const execCtx = { signal, data, faults: deps.faults, mcp: deps.mcp, retriever, lang: language }
          const outcome = await executeTool(tool, args, execCtx, toolTimeoutMs)
          executedCount += 1
          await emit({ type: 'tool/result', callId, tool: tool.id, outcome, durationMs: Date.now() - t0 }, { stepIndex: sIdx, source: viaMcp ? 'mcp' : 'tools', provenance: tool.provenance })
          observe(args, outcome)
          if (outcome.ok) {
            toolCalls.push({ tool: tool.id, args, ok: true })
            consecutiveFailures = 0
            const simId = simulatedActionId(outcome.data)
            if (simId) actions.push({ tool: tool.id, id: simId, approved })
          } else {
            toolCalls.push({ tool: tool.id, args, ok: false, code: outcome.code })
            errors.push(`${tool.id}: ${outcome.message}`)
            consecutiveFailures += 1
            await emit({ type: 'tool/error', callId, tool: tool.id, code: outcome.code, message: outcome.message }, { stepIndex: sIdx, source: viaMcp ? 'mcp' : 'tools', provenance: tool.provenance })
            if (controls && consecutiveFailures >= limits.maxToolFailures) {
              await emit({ type: 'guard/triggered', guard: 'tool_failures', message: `${consecutiveFailures} errori consecutivi degli strumenti: mi fermo.` }, { stepIndex: sIdx, source: 'controls' })
              throw new Halt('tool_failures', STOP_MESSAGES.tool_failures, `Mi sono fermato: lo strumento «${tool.id}» continua a dare errore (${outcome.message}). Non posso completare il compito in modo affidabile; riprova più tardi o chiedi aiuto a un referente.`)
            }
          }
          if (!c.agentLoop && executedCount >= 1) mustAnswer = true
          await endStep()
        })()
      } catch (err) {
        if (err instanceof Halt && !stepState.ended) {
          await emit({ type: 'step/end', stepIndex: sIdx }, { stepIndex: sIdx }, false)
        }
        throw err
      }
    }
  }

  function dataUsedSummary(): string[] {
    const out: string[] = []
    for (const o of observations) if (o.outcome.ok) out.push(`${o.tool}: ${shortenText(o.outcome.summary, 120)}`)
    if (lastDocIds.length) out.push(`Documenti citati: ${lastDocIds.join(', ')}`)
    return out
  }

  function modelFail(detail: string): Halt {
    const msg = `Il modello non ha potuto rispondere: ${detail}`
    errors.push(msg)
    return new Halt('model_error', msg, `${msg} Riprova, oppure cambia modello dal pannello Modello.`)
  }

  async function callModel(req: Parameters<TurnDeps['runtime']['generate']>[0], timeoutMs: number): Promise<ModelResponse> {
    const ctl = new AbortController()
    const onAbort = () =>{  ctl.abort() }
    signal.addEventListener('abort', onAbort)
    const timer = setTimeout(() => {
      ctl.abort()
    }, timeoutMs)
    try {
      const aborted = new Promise<never>((_, reject) =>{  ctl.signal.addEventListener('abort', () =>{  reject(new Error('aborted')) }) })
      aborted.catch(() => {})
      deps.onModelCall?.(true)
      return await Promise.race([deps.runtime.generate(req, deps.onToken ?? noop, ctl.signal, deps.onThinking), aborted])
    } catch (err) {
      if (signal.aborted) throw new Halt('user_stop', STOP_MESSAGES.user_stop)
      if (ctl.signal.aborted) throw modelFail(`tempo massimo del passo (${Math.round(timeoutMs / 1000)} s) superato.`)
      throw modelFail(err instanceof Error ? err.message : String(err))
    } finally {
      clearTimeout(timer)
      signal.removeEventListener('abort', onAbort)
      deps.onModelCall?.(false)
    }
  }
}
