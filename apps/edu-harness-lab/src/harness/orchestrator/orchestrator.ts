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
import { buildContext, type ObservationInput } from './contextBuilder'
import { FAULT_LABEL, corruptArgs, createRepeatDetector, effectsFor, shortenText, simulatedActionId } from './guards'
import { NATIVE_REPAIR, REPAIR_INSTRUCTION, parseDecision, parseNative } from './protocol'
import { unverifiedNumbers } from './numbers'
import { PLAN_TOOL, recordPlan } from '../tools/planning'

/** Forced first move: the model writes its plan (guided call to the planning tool). */
const PLAN_CALL = { name: PLAN_TOOL.id, arg: 'piano' }
const PLAN_GUIDE = 'Prima di agire l’orchestratore fa scrivere al modello un piano: passi numerati, ciascuno con lo strumento da usare.'
const planFirst = (toolIds: string[], loop: boolean) =>
  `Before acting, call ${PLAN_TOOL.id} with your plan: 2 to 5 numbered steps. Each step names the tool it uses ` +
  `(${toolIds.join(', ')}) or "answer" for the final answer. Plan only what these tools and the information above allow; ` +
  'never plan to ask the user for data.' +
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
class Halt {
  constructor(
    readonly reason: StopReason,
    readonly message: string,
    readonly answer?: string,
    readonly sources?: string[],
  ) {}
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
  const controls = c.controls
  const limits = config.limits
  const runId = newId('run')
  const startedMs = Date.now()
  const startedAt = new Date(startedMs).toISOString()

  const toolCalls: RunRecord['toolCalls'] = []
  const errors: string[] = []
  const actions: RunRecord['actions'] = []
  const observations: ObservationInput[] = []
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
      for (const old of deps.memory.list().filter(m => m.scope === 'session' && m.kind === 'taskState' && m.key === 'stato_attivita')) {
        deps.memory.delete(old.id)
        await emit({ type: 'memory/delete', id: old.id }, { source: 'memory' }, false)
      }
      const rec = deps.memory.write({
        scope: 'session',
        kind: 'taskState',
        key: 'stato_attivita',
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
    configKey: deps.configKey,
    configLabel: deps.configLabel,
    input,
    answer,
    startedAt,
    durationMs: Date.now() - startedMs,
    steps: stepIndex,
    toolCalls,
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
      const selected = all.filter(m => m.scope === 'persistent' || (m.scope === 'session' && m.kind === 'taskState'))
      const ignored = all.filter(m => !selected.includes(m))
      if (selected.length) {
        await emit({ type: 'memory/select', ids: selected.map(m => m.id) }, { source: 'memory' })
        await emit({ type: 'memory/inject', ids: selected.map(m => m.id) }, { source: 'memory' })
      }
      if (ignored.length) await emit({ type: 'memory/ignore', ids: ignored.map(m => m.id), reason: 'Appunti di sessione non legati al compito: non rimessi nel contesto.' }, { source: 'memory' })
      injectedMemory = selected
    }

    // RAG
    if (c.rag) {
      await emit({ type: 'rag/query', query: input, mode: config.rag.mode }, { source: 'rag' })
      hits = deps.retriever.search(input, config.rag)
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
    if (c.tools && c.orchestrator) {
      tools = deps.registry.list().filter(t => config.enabledTools.includes(t.id))
      if (c.mcp) {
        const mcpTools = deps.mcp.toolDefinitions().filter(t => t.mcpServer !== undefined && config.mcpServers.includes(t.mcpServer))
        tools = [...tools, ...mcpTools]
      }
    }
    const availableIds = new Set(tools.map(t => t.id))
    const protocol: 'json' | 'text' = tools.length ? 'json' : 'text'
    /** Models trained for tool calling get tools through their own chat template. */
    const native = !!deps.runtime.info.nativeTools
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
    let finalizeAs: StopReason | null = null
    let finalizeNote = ''
    let consecutiveFailures = 0
    let unauthorizedCount = 0
    let faultSpent = false
    let executedCount = 0
    let mustAnswerViolations = 0
    const calculator = native ? tools.find(t => t.id === 'calcolatrice') : undefined
    /** Planning step: forced first call for models with native tool calling, whenever there are tools. */
    const planning = native && tools.length > 0
    let planned = false
    /** One arithmetic intervention per turn (guided first call or rejected answer), never a loop. */
    let calcNudged = false
    /** Everything the model may legitimately quote numbers from. */
    const numberSources = () =>
      [
        input,
        // the plan is the model's own text, not a source of numbers
        ...observations.filter(o => o.tool !== PLAN_TOOL.id).map(o => (o.outcome.ok ? o.outcome.summary : o.outcome.message)),
        ...hits.filter(h => h.status === 'selected').map(h => h.chunk.text),
        ...(c.context ? deps.data.taskData.map(t => t.text) : []),
        ...injectedMemory.map(m => m.text),
        'IVA 22% 1,22',
      ].join('\n')

    for (;;) {
      stepIndex += 1
      if (!finalizeAs) {
        if (Date.now() - startedMs > turnTimeoutMs) {
          await emit({ type: 'guard/triggered', guard: controls ? 'timeout' : 'safety_net', message: `Tempo massimo del turno (${Math.round(turnTimeoutMs / 1000)} s) esaurito.` }, { source: controls ? 'controls' : 'orchestrator' }, false)
          stepIndex -= 1
          throw new Halt('timeout', STOP_MESSAGES.timeout, 'Il tempo massimo per questa richiesta è esaurito: non ho una risposta completa.')
        }
        if (stepIndex > maxSteps) {
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
      let stepEnded = false
      const endStep = async (): Promise<void> => {
        stepEnded = true
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
          if (planning && !planned && sIdx === 1 && observations.length === 0 && !mustAnswer) {
            forceTool = PLAN_CALL
            await emit({ type: 'decision/repair', attempt: 0, instruction: PLAN_GUIDE }, { stepIndex: sIdx, source: 'orchestrator' })
            repairMessages.push({ role: 'user', content: planFirst(tools.map(t => t.id), c.agentLoop) })
          }
          const modelTools = planning && !planned ? [PLAN_TOOL, ...tools] : tools
          let decision: ModelDecision
          for (;;) {
            const built = buildContext({
              stepIndex: sIdx,
              scenarioId: scenario.id,
              config,
              data: deps.data,
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
              repairMessages,
              nativeTools: native,
            })
            lastDocIds = built.hints.docIds
            await emit({ type: 'context/assembled', snapshot: built.snapshot }, { stepIndex: sIdx, source: 'context' })
            await emit({ type: 'model/request', tokensIn: built.snapshot.budget.usedTokens, protocol, mustAnswer }, { stepIndex: sIdx, source: 'model' })
            const response = await callModel(
              {
                messages: built.snapshot.messages,
                maxNewTokens: MAX_NEW_TOKENS,
                hints: built.hints,
                ...(built.tools ? { tools: built.tools } : {}),
                ...(forceTool ? { forceTool } : {}),
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
            const parsed = native ? parseNative(response.text) : parseDecision(response.text)
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
              const instruction = `${parsed.error} ${native ? NATIVE_REPAIR : REPAIR_INSTRUCTION}`
              await emit({ type: 'decision/repair', attempt: repairAttempt, instruction }, { stepIndex: sIdx })
              repairMessages.push({ role: 'assistant', content: response.text }, { role: 'user', content: instruction })
              continue
            }
            errors.push(`Decisione del modello non valida: ${parsed.error}`)
            if (!/[{[]/.test(response.text) && response.text.trim()) {
              const prose = response.text.trim()
              await emit({ type: 'answer', text: prose, sources: lastDocIds }, { stepIndex: sIdx })
              throw new Halt('invalid_output', 'Il modello ha risposto in prosa invece che nel formato JSON richiesto: accetto il testo, ma non è una risposta verificata dal protocollo.', prose, lastDocIds)
            }
            throw new Halt('invalid_output', STOP_MESSAGES.invalid_output, 'Il modello non è riuscito a produrre una decisione valida nel formato richiesto, quindi non ho una risposta affidabile.')
          }

          // ── act on the decision ──
          if (decision.type === 'answer') {
            if (protocol === 'json') await emit({ type: 'decision/parsed', decision }, { stepIndex: sIdx, source: 'model', provenance: lastProvenance })
            const sources = decision.sources?.length ? decision.sources : lastDocIds
            await emit({ type: 'answer', text: decision.text, sources }, { stepIndex: sIdx })
            const reason = finalizeAs ?? 'final_answer'
            throw new Halt(reason, reason === 'final_answer' ? STOP_MESSAGES.final_answer : STOP_MESSAGES[reason], decision.text, decision.sources?.length ? decision.sources : undefined)
          }
          if (decision.type === 'ask') {
            await emit({ type: 'decision/parsed', decision }, { stepIndex: sIdx, source: 'model', provenance: lastProvenance })
            await emit({ type: 'answer', text: decision.question, sources: [] }, { stepIndex: sIdx })
            const reason = finalizeAs ?? 'needs_user_input'
            throw new Halt(reason, STOP_MESSAGES[reason], decision.question)
          }

          // ── tool decision ──
          await emit({ type: 'decision/parsed', decision }, { stepIndex: sIdx, source: 'model', provenance: lastProvenance })
          const callId = newId('call')
          const { tool: toolName, rationale } = decision
          const originalArgs = decision.args
          await emit({ type: 'tool/call', callId, tool: toolName, args: originalArgs, rationale }, { stepIndex: sIdx, source: 'model', provenance: lastProvenance })

          const observe = (args: Record<string, unknown>, outcome: ToolOutcome) => {
            observations.push({ callId, tool: toolName, args, outcome, rationale })
          }
          const fail = async (args: Record<string, unknown>, code: ToolErrorCode, message: string, record = true) => {
            if (record) toolCalls.push({ tool: toolName, args, ok: false, code })
            observe(args, { ok: false, code, message })
            errors.push(`${toolName}: ${message}`)
          }

          // (a) tools no longer allowed
          if (mustAnswer) {
            mustAnswerViolations += 1
            const msg = 'Non puoi usare altri strumenti: rispondi ora.'
            await fail(originalArgs, 'DENIED', msg)
            await emit({ type: 'tool/error', callId, tool: toolName, code: 'DENIED', message: msg }, { stepIndex: sIdx, source: 'orchestrator' })
            if (finalizeAs) throw new Halt(finalizeAs, STOP_MESSAGES[finalizeAs], finalizeNote)
            if (mustAnswerViolations >= 2) throw new Halt('invalid_output', 'Il modello ha continuato a chiedere strumenti quando doveva solo rispondere.', 'Il modello non ha fornito una risposta finale quando gli è stato chiesto.')
            return await endStep()
          }

          // (a2) planning: the orchestrator records the plan. Not an action: it does not use up the round of tools.
          if (planning && toolName === PLAN_TOOL.id) {
            await emit({ type: 'tool/execute', callId, tool: toolName }, { stepIndex: sIdx, source: 'orchestrator' })
            const outcome = recordPlan(originalArgs)
            await emit({ type: 'tool/result', callId, tool: toolName, outcome, durationMs: 0 }, { stepIndex: sIdx, source: 'orchestrator' })
            observe(originalArgs, outcome)
            if (outcome.ok) planned = true
            return await endStep()
          }

          // (b) unknown tool
          const tool = deps.registry.get(toolName) ?? deps.mcp.toolDefinitions().find(t => t.id === toolName)
          if (!tool) {
            const msg = `Lo strumento «${toolName}» non esiste. Strumenti disponibili: ${tools.map(t => t.id).join(', ') || 'nessuno'}.`
            await emit({ type: 'tool/validation', callId, tool: toolName, ok: false, errors: [msg] }, { stepIndex: sIdx, source: 'tools' })
            await fail(originalArgs, 'UNKNOWN_TOOL', msg)
            return await endStep()
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
            return await endStep()
          }

          // (d) injected fault + (e) validation
          let args = originalArgs
          let faultLabel = ''
          if (deps.faults.invalidArgsOnce && !faultSpent) {
            faultSpent = true
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
            return await endStep()
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
                finalizeAs = 'approval_denied'
                finalizeNote = `L’azione «${tool.title}» non è stata eseguita perché la persona l’ha rifiutata.`
                mustAnswer = true
                return await endStep()
              }
              approved = true
            } else if (controls) {
              const msg = 'Azione con effetti: richiede supervisione umana, non ancora attiva. Prepara una bozza e rispondi.'
              await emit({ type: 'tool/error', callId, tool: tool.id, code: 'DENIED', message: msg }, { stepIndex: sIdx, source: 'controls', provenance: tool.provenance })
              await emit({ type: 'guard/triggered', guard: 'unsupervised_write', message: `«${tool.id}» ha effetti reali e non c’è ancora supervisione umana: azione bloccata.` }, { stepIndex: sIdx, source: 'controls' })
              await fail(args, 'DENIED', msg)
              return await endStep()
            }
          }

          // (h) execute
          const viaMcp = tool.source === 'mcp' ? tool.mcpServer : undefined
          await emit({ type: 'tool/execute', callId, tool: tool.id, viaMcp }, { stepIndex: sIdx, source: viaMcp ? 'mcp' : 'tools', provenance: tool.provenance })
          const t0 = Date.now()
          const execCtx = { signal, data: deps.data, faults: deps.faults, mcp: deps.mcp, retriever: deps.retriever }
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
          return await endStep()
        })()
      } catch (err) {
        if (err instanceof Halt && !stepEnded) {
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
    const onAbort = () => ctl.abort()
    signal.addEventListener('abort', onAbort)
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      ctl.abort()
    }, timeoutMs)
    try {
      const aborted = new Promise<never>((_, reject) => ctl.signal.addEventListener('abort', () => reject(new Error('aborted'))))
      aborted.catch(() => {})
      return await Promise.race([deps.runtime.generate(req, deps.onToken ?? noop, ctl.signal), aborted])
    } catch (err) {
      if (signal.aborted) throw new Halt('user_stop', STOP_MESSAGES.user_stop)
      if (timedOut) throw modelFail(`tempo massimo del passo (${Math.round(timeoutMs / 1000)} s) superato.`)
      throw modelFail(err instanceof Error ? err.message : String(err))
    } finally {
      clearTimeout(timer)
      signal.removeEventListener('abort', onAbort)
    }
  }
}
