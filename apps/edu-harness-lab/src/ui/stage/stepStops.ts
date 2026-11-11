import type { ComponentId, TraceEvent } from '../../domain/types'
import { STEP_STOPS } from '../../harness/events'
import { tr } from '../../i18n'
import { STOP_LABEL, TOOL_ERROR_LABEL, numLocale } from '../common/labels'
import { argsInline, currentRunEvents } from './deriveStage'
import { narrate } from './narrate'

/**
 * Step-by-step mode: where the run is held and what «Avanti» will do. One plain phrase per stop
 * (the events the pacer waits on), so a click always shows a visible, announced change.
 */
export interface HoldText {
  /** "Tappa 4": the stops of this run so far, the held one included (0 when it is not a stop). */
  stop: number
  /** What has just happened (the state the machine shows). */
  here: string
  /** What the next click makes happen, or null when there is nothing to announce. */
  next: string | null
}

const n = (v: number) => v.toLocaleString(numLocale())
const tool = (t: string) => t.replace(/^mcp__\w+?__/, '')
const trim = (s: string, max: number) => {
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}

/** Number of the stop the run is held on: the visible events of the current run up to it. */
export function stopNumber(events: readonly TraceEvent[], held: TraceEvent): number {
  const { list } = currentRunEvents(events)
  let count = 0
  for (const e of list) {
    if (STEP_STOPS.has(e.type)) count += 1
    if (e.id === held.id) return STEP_STOPS.has(e.type) ? count : 0
  }
  return 0
}

/** What the machine shows while held on this event, and what comes next. */
export function holdText(e: TraceEvent, c: Record<ComponentId, boolean>, events: readonly TraceEvent[]): HoldText {
  const stop = stopNumber(events, e)
  const base = (here: string, next: string | null): HoldText => ({ stop, here, next })
  switch (e.type) {
    case 'run/start':
      return base(
        tr('la tua richiesta è entrata nel sistema', 'your request has entered the system'),
        c.instructions || c.context || c.memory || c.rag || c.orchestrator
          ? tr('l’harness raccoglie ciò che il modello leggerà', 'the harness collects what the model will read')
          : tr('la richiesta diventa il contesto, così com’è', 'the request becomes the context, as it is'),
      )
    case 'memory/inject': {
      const k = e.ids.length
      return base(
        tr(`${n(k)} ${k === 1 ? 'ricordo torna' : 'ricordi tornano'} nel contesto`, `${n(k)} ${k === 1 ? 'memory is back' : 'memories are back'} in the context`),
        tr('l’harness completa il contesto', 'the harness completes the context'),
      )
    }
    case 'rag/results': {
      const kept = e.hits.filter(h => h.status === 'selected').length
      return base(
        kept
          ? tr(`trovati ${kept} frammenti pertinenti nei documenti`, `found ${kept} relevant passages in the documents`)
          : tr('nessun frammento abbastanza pertinente', 'no passage relevant enough'),
        tr('l’harness completa il contesto', 'the harness completes the context'),
      )
    }
    case 'context/assembled':
      return base(
        tr(`il contesto è pronto (≈ ${n(e.snapshot.budget.usedTokens)} token)`, `the context is ready (≈ ${n(e.snapshot.budget.usedTokens)} tokens)`),
        tr('il modello lo legge', 'the model reads it'),
      )
    case 'model/request':
      return base(
        tr(`il modello riceve ≈ ${n(e.tokensIn)} token`, `the model receives ≈ ${n(e.tokensIn)} tokens`),
        tr('il modello legge e scrive: Avanti si riattiva quando ha finito', 'the model reads and writes: Next becomes available again when it has finished'),
      )
    case 'decision/parsed': {
      const d = e.decision
      if (d.type === 'tool')
        return base(
          tr(`il modello chiede «${tool(d.tool)}»`, `the model asks for “${tool(d.tool)}”`),
          c.controls
            ? tr('i controlli verificano la richiesta', 'the controls check the request')
            : tr('l’orchestratore prepara la chiamata', 'the orchestrator prepares the call'),
        )
      if (d.type === 'reflect')
        return base(
          tr('il modello ha scritto una bozza', 'the model has written a draft'),
          tr('la bozza torna nel contesto per un riesame', 'the draft goes back into the context for a review'),
        )
      if (d.type === 'ask')
        return base(tr('il modello ti fa una domanda', 'the model asks you a question'), tr('la domanda arriva a te', 'the question reaches you'))
      return base(tr('il modello ha deciso di rispondere', 'the model has decided to answer'), tr('la risposta arriva a te', 'the answer reaches you'))
    }
    case 'decision/invalid':
      return base(
        tr('la risposta del modello non rispetta il formato', 'the model’s reply does not follow the format'),
        tr('l’orchestratore gli chiede di riprovare', 'the orchestrator asks it to try again'),
      )
    case 'tool/call':
      return base(
        tr(`l’orchestratore riceve la chiamata ${tool(e.tool)}(${trim(argsInline(e.args, 2), 30)})`, `the orchestrator receives the call ${tool(e.tool)}(${trim(argsInline(e.args, 2), 30)})`),
        c.controls
          ? tr('i controlli verificano gli argomenti, poi lo strumento parte', 'the controls check the arguments, then the tool starts')
          : tr('l’harness verifica ed esegue lo strumento', 'the harness checks and runs the tool'),
      )
    case 'mcp/call':
      return base(
        tr(`la chiamata parte verso il server MCP «${e.serverId}»`, `the call goes out to the MCP server “${e.serverId}”`),
        tr('il server risponde', 'the server replies'),
      )
    case 'mcp/result':
      return base(tr('il server MCP ha risposto', 'the MCP server has replied'), tr('il risultato torna all’orchestratore', 'the result goes back to the orchestrator'))
    case 'tool/result':
      return e.outcome.ok
        ? base(
          tr(`lo strumento ha risposto: ${trim(e.outcome.summary, 60)}`, `the tool has replied: ${trim(e.outcome.summary, 60)}`),
          c.agentLoop
            ? tr('il risultato torna nel contesto: nuovo giro', 'the result goes back into the context: new round')
            : tr('il risultato torna al modello per la risposta finale', 'the result goes back to the model for the final answer'),
        )
        : base(
          tr(`lo strumento segnala un problema: ${trim(e.outcome.message, 60)}`, `the tool reports a problem: ${trim(e.outcome.message, 60)}`),
          tr('l’errore torna al modello, che può correggersi', 'the error goes back to the model, which can correct itself'),
        )
    case 'tool/error':
      return base(
        tr(
          `lo strumento segnala un problema (${TOOL_ERROR_LABEL[e.code].toLowerCase()})`,
          `the tool reports a problem (${TOOL_ERROR_LABEL[e.code].toLowerCase()})`,
        ),
        tr('l’errore torna al modello', 'the error goes back to the model'),
      )
    case 'guard/triggered':
      return base(
        tr(`intervengono i controlli: ${trim(e.message, 70)}`, `the controls step in: ${trim(e.message, 70)}`),
        tr('il ciclo si adegua o si ferma', 'the loop adjusts or stops'),
      )
    case 'answer':
      return base(
        tr('la risposta finale è pronta', 'the final answer is ready'),
        tr('la risposta arriva a te e il ciclo si chiude', 'the answer reaches you and the loop closes'),
      )
    case 'stop':
      return base(
        tr(`fine: ${STOP_LABEL[e.reason].toLowerCase()}`, `end: ${STOP_LABEL[e.reason].toLowerCase()}`),
        tr('la prova si conclude', 'the run ends'),
      )
    default: {
      // Pause can hold the run on any event: describe it with the narration.
      const line = narrate(e, c)
      return base(line ? line.text.replace(/\.$/, '') : tr('evento dell’harness', 'harness event'), null)
    }
  }
}

/** "Il contesto è pronto" → sentence case for titles. */
export const capitalize = (s: string) => (s ? s[0]?.toUpperCase() + s.slice(1) : s)
