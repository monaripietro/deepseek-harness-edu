import type { ComponentId, TraceEvent } from '../../domain/types'
import { STEP_STOPS } from '../../harness/events'
import { STOP_LABEL, TOOL_ERROR_LABEL } from '../common/labels'
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

const n = (v: number) => v.toLocaleString('it-IT')
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
        'la tua richiesta è entrata nel sistema',
        c.instructions || c.context || c.memory || c.rag || c.orchestrator ? 'l’harness raccoglie ciò che il modello leggerà' : 'la richiesta diventa il contesto, così com’è',
      )
    case 'memory/inject':
      return base(`${n(e.ids.length)} ${e.ids.length === 1 ? 'ricordo torna' : 'ricordi tornano'} nel contesto`, 'l’harness completa il contesto')
    case 'rag/results': {
      const kept = e.hits.filter(h => h.status === 'selected').length
      return base(kept ? `trovati ${kept} frammenti pertinenti nei documenti` : 'nessun frammento abbastanza pertinente', 'l’harness completa il contesto')
    }
    case 'context/assembled':
      return base(`il contesto è pronto (≈ ${n(e.snapshot.budget.usedTokens)} token)`, 'il modello lo legge')
    case 'model/request':
      return base(`il modello riceve ≈ ${n(e.tokensIn)} token`, 'il modello legge e scrive: Avanti si riattiva quando ha finito')
    case 'decision/parsed': {
      const d = e.decision
      if (d.type === 'tool') return base(`il modello chiede «${tool(d.tool)}»`, c.controls ? 'i controlli verificano la richiesta' : 'l’orchestratore prepara la chiamata')
      if (d.type === 'reflect') return base('il modello ha scritto una bozza', 'la bozza torna nel contesto per un riesame')
      if (d.type === 'ask') return base('il modello ti fa una domanda', 'la domanda arriva a te')
      return base('il modello ha deciso di rispondere', 'la risposta arriva a te')
    }
    case 'decision/invalid':
      return base('la risposta del modello non rispetta il formato', 'l’orchestratore gli chiede di riprovare')
    case 'tool/call':
      return base(
        `l’orchestratore riceve la chiamata ${tool(e.tool)}(${trim(argsInline(e.args, 2), 30)})`,
        c.controls ? 'i controlli verificano gli argomenti, poi lo strumento parte' : 'l’harness verifica ed esegue lo strumento',
      )
    case 'mcp/call':
      return base(`la chiamata parte verso il server MCP «${e.serverId}»`, 'il server risponde')
    case 'mcp/result':
      return base('il server MCP ha risposto', 'il risultato torna all’orchestratore')
    case 'tool/result':
      return e.outcome.ok
        ? base(`lo strumento ha risposto: ${trim(e.outcome.summary, 60)}`, c.agentLoop ? 'il risultato torna nel contesto: nuovo giro' : 'il risultato torna al modello per la risposta finale')
        : base(`lo strumento segnala un problema: ${trim(e.outcome.message, 60)}`, 'l’errore torna al modello, che può correggersi')
    case 'tool/error':
      return base(`lo strumento segnala un problema (${TOOL_ERROR_LABEL[e.code].toLowerCase()})`, 'l’errore torna al modello')
    case 'guard/triggered':
      return base(`intervengono i controlli: ${trim(e.message, 70)}`, 'il ciclo si adegua o si ferma')
    case 'answer':
      return base('la risposta finale è pronta', 'la risposta arriva a te e il ciclo si chiude')
    case 'stop':
      return base(`fine: ${STOP_LABEL[e.reason].toLowerCase()}`, 'la prova si conclude')
    default: {
      // Pause can hold the run on any event: describe it with the narration.
      const line = narrate(e, c)
      return base(line ? line.text.replace(/\.$/, '') : 'evento dell’harness', null)
    }
  }
}

/** "Il contesto è pronto" → sentence case for titles. */
export const capitalize = (s: string) => (s ? s[0]?.toUpperCase() + s.slice(1) : s)
