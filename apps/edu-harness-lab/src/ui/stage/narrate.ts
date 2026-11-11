import type { ComponentId, TraceEvent } from '../../domain/types'
import { COMPONENTS } from '../../harness/levels'
import { componentText } from '../../i18nContent'
import { tr } from '../../i18n'
import { CONTEXT_KIND_LABEL, STOP_LABEL, TOOL_ERROR_LABEL, numLocale } from '../common/labels'
import { argsInline } from './deriveStage'

export type Tone = 'info' | 'good' | 'warn' | 'bad'
export type NarrationFamily = 'model' | 'information' | 'action' | 'orchestration' | 'governance' | 'user'

export interface NarrationLine {
  id: string
  seq: number
  step: number
  family: NarrationFamily
  tone: Tone
  text: string
  /** Optional technical term revealed next to the plain sentence. */
  term?: string
}

const toolName = (t: string) => t.replace(/^mcp__(\w+?)__/, 'MCP $1 → ')
const n = (v: number) => v.toLocaleString(numLocale())
/** The noun in the right number for the interface language (English only; Italian keeps its own text). */
const pl = (v: number, one: string, many: string) => (v === 1 ? one : many)

/** "a, b e c" / "a, b and c" */
export function joinList(items: string[]): string {
  if (items.length < 2) return items.join('')
  return tr(`${items.slice(0, -1).join(', ')} e ${items.at(-1) ?? ''}`, `${items.slice(0, -1).join(', ')} and ${items.at(-1) ?? ''}`)
}

/**
 * Plain-Italian narration of what the harness is doing, one sentence per observable event.
 * First the phenomenon, then (in `term`) the technical word.
 */
export function narrate(e: TraceEvent, components: Record<ComponentId, boolean>): Omit<NarrationLine, 'id' | 'seq' | 'step'> | null {
  switch (e.type) {
    case 'run/start':
      return components.orchestrator || components.instructions || components.context || components.memory || components.rag
        ? { family: 'user', tone: 'info', text: tr('Hai fatto la tua richiesta: l’harness la prende in carico prima di passarla al modello.', 'You made your request: the harness takes it over before passing it to the model.') }
        : { family: 'user', tone: 'info', text: tr('Hai fatto la tua richiesta: arriverà al modello così com’è, senza nient’altro.', 'You made your request: it will reach the model as it is, with nothing else.') }
    case 'memory/read':
      return {
        family: 'information',
        tone: 'info',
        text: tr(`La memoria rilegge ${n(e.count)} ricordi salvati in precedenza.`, `Memory rereads ${n(e.count)} saved ${pl(e.count, 'memory', 'memories')}.`),
        term: tr('memoria', 'memory'),
      }
    case 'memory/inject':
      return e.ids.length
        ? {
          family: 'information',
          tone: 'good',
          text: tr(
            `${n(e.ids.length)} ricordi vengono rimessi nel contesto: il modello non li ricorda, glieli ripropone il sistema.`,
            `${n(e.ids.length)} ${pl(e.ids.length, 'memory is', 'memories are')} put back in the context: the model does not remember them, the system presents them to it again.`,
          ),
        }
        : null
    case 'memory/ignore':
      return e.ids.length
        ? {
          family: 'information',
          tone: 'info',
          text: tr(
            `${n(e.ids.length)} ricordi restano fuori: ${e.reason}.`,
            `${n(e.ids.length)} ${pl(e.ids.length, 'memory stays', 'memories stay')} out: not selected for this scenario, or session notes not tied to the task.`,
          ),
        }
        : null
    case 'memory/write':
      return {
        family: 'information',
        tone: 'info',
        text: tr('Il sistema annota in memoria lo stato del compito, per la prossima volta.', 'The system notes the status of the task in memory, for next time.'),
      }
    case 'rag/query':
      return {
        family: 'information',
        tone: 'info',
        text: tr('Il retriever cerca nei documenti aziendali le parti pertinenti alla richiesta.', 'The retriever searches the company documents for the parts relevant to the request.'),
        term: 'retrieval',
      }
    case 'rag/results': {
      const sel = e.hits.filter(h => h.status === 'selected')
      const out = e.hits.filter(h => h.status === 'excluded')
      const top = sel.slice(0, 2).map(h => `${h.docId} (${Math.round(h.normalized * 100)}%)`).join(', ')
      const outdated = out.some(h => h.reason === 'outdated')
      return {
        family: 'information',
        tone: sel.length ? 'good' : 'warn',
        text: sel.length
          ? tr(
            `Trovati ${sel.length} frammenti utili: ${top}.${out.length ? ` Scartati ${out.length}${outdated ? ', tra cui una versione superata della policy' : ''}.` : ''}`,
            `Found ${sel.length} useful ${pl(sel.length, 'passage', 'passages')}: ${top}.${out.length ? ` Discarded ${out.length}${outdated ? ', including an outdated version of the policy' : ''}.` : ''}`,
          )
          : tr('Nessun frammento abbastanza pertinente: al modello non arriverà nessun documento.', 'No passage is relevant enough: no document will reach the model.'),
      }
    }
    case 'context/assembled': {
      const inc = e.snapshot.items.filter(i => i.status === 'included')
      const kinds = [...new Set(inc.map(i => i.kind))]
      if (kinds.length === 1 && kinds[0] === 'message' && inc.length === 1) {
        return {
          family: 'model',
          tone: 'warn',
          text: tr('Il modello vedrà soltanto la tua domanda: niente istruzioni, niente dati, niente documenti.', 'The model will see only your question: no instructions, no data, no documents.'),
          term: tr('finestra di contesto', 'context window'),
        }
      }
      const list = kinds.map(k => CONTEXT_KIND_LABEL[k].toLowerCase()).join(', ')
      const tokens = e.snapshot.budget.usedTokens
      return {
        family: 'model',
        tone: 'info',
        text: tr(
          `Il contesto è pronto: ≈ ${n(tokens)} token (${list}). È tutto ciò che il modello potrà vedere.`,
          `The context is ready: ≈ ${n(tokens)} ${pl(tokens, 'token', 'tokens')} (${list}). This is everything the model will be able to see.`,
        ),
        term: tr('finestra di contesto', 'context window'),
      }
    }
    case 'model/request':
      if (e.reflection)
        return {
          family: 'model',
          tone: 'info',
          text: tr(
            'Avviata una chiamata del ciclo di riflessione. L’output dirà se il modello ha prodotto una bozza, una verifica o una risposta.',
            'A call of the reflection loop has started. The output will say whether the model has produced a draft, a check or an answer.',
          ),
          term: tr('richiesta al modello', 'model request'),
        }
      return e.protocol === 'json'
        ? e.mustAnswer
          ? { family: 'model', tone: 'info', text: tr('Il modello legge il contesto: ora deve dare la risposta finale.', 'The model reads the context: now it must give the final answer.') }
          : {
            family: 'model',
            tone: 'info',
            text: tr(
              'Il modello legge il contesto e deve rispondere con una decisione strutturata: rispondere, chiedere o usare uno strumento.',
              'The model reads the context and must reply with a structured decision: answer, ask, or use a tool.',
            ),
            term: tr('protocollo di decisione', 'decision protocol'),
          }
        : { family: 'model', tone: 'info', text: tr('Il modello legge il contesto e scrive la sua risposta, una parola alla volta.', 'The model reads the context and writes its reply, one word at a time.') }
    case 'model/response': {
      const seconds = (e.durationMs / 1000).toLocaleString(numLocale(), { maximumFractionDigits: 1 })
      return { family: 'model', tone: 'info', text: tr(`Il modello ha finito di scrivere in ${seconds} s.`, `The model finished writing in ${seconds} s.`) }
    }
    case 'decision/parsed':
      if (e.decision.type === 'reflect')
        return {
          family: 'orchestration',
          tone: 'info',
          text: tr(
            'Il modello produce una bozza o una verifica, non la risposta. L’orchestratore la reinserisce nel contesto e avvia un altro passo sullo stesso compito.',
            'The model produces a draft or a check, not the answer. The orchestrator puts it back into the context and starts another step on the same task.',
          ),
          term: tr('ragionamento iterativo', 'iterative reasoning'),
        }
      if (e.decision.type === 'tool' && e.decision.tool === 'pianifica') {
        const plan = e.decision.args.piano ?? ''
        const text = typeof plan === 'string' ? plan : JSON.stringify(plan)
        return {
          family: 'orchestration',
          tone: 'info',
          text: tr(`Il modello scrive il suo piano: ${text.replace(/\s+/g, ' ').slice(0, 220)}`, `The model writes its plan: ${text.replace(/\s+/g, ' ').slice(0, 220)}`),
          term: tr('piano', 'plan'),
        }
      }
      if (e.decision.type === 'tool') {
        const args = Object.keys(e.decision.args).length ? ` (${argsInline(e.decision.args)})` : ''
        return {
          family: 'orchestration',
          tone: 'info',
          text: tr(
            `Il modello chiede di usare «${toolName(e.decision.tool)}»${args}. Non lo esegue: lo chiede all’orchestratore.`,
            `The model asks to use “${toolName(e.decision.tool)}”${args}. It does not run it: it asks the orchestrator.`,
          ),
          term: 'tool call',
        }
      }
      if (e.decision.type === 'ask')
        return { family: 'orchestration', tone: 'warn', text: tr('Mancano informazioni: il modello ti fa una domanda.', 'Information is missing: the model asks you a question.') }
      return { family: 'orchestration', tone: 'good', text: tr('Il modello decide di rispondere.', 'The model decides to answer.') }
    case 'decision/invalid':
      return e.error.startsWith('Numeri calcolati a mente')
        ? {
          family: 'orchestration',
          tone: 'warn',
          text: tr(
            `Il modello ha fatto i conti a mente (${e.error.replace(/^[^(]*\(([^)]*)\).*$/, '$1')}): l’orchestratore non accetta numeri che non vengono da una fonte o da uno strumento.`,
            `The model did the sums in its head (${e.error.replace(/^[^(]*\(([^)]*)\).*$/, '$1')}): the orchestrator does not accept numbers that do not come from a source or a tool.`,
          ),
          term: tr('verifica dei calcoli', 'calculation check'),
        }
        : { family: 'governance', tone: 'warn', text: tr('La risposta del modello non rispetta il formato richiesto.', 'The model’s reply does not follow the required format.') }
    case 'decision/repair':
      if (/prima bozza/.test(e.instruction))
        return {
          family: 'orchestration',
          tone: 'info',
          text: tr(e.instruction, 'The orchestrator asks the model for a guided first draft.'),
          term: tr('bozza guidata', 'guided draft'),
        }
      if (/piano/.test(e.instruction))
        return {
          family: 'orchestration',
          tone: 'info',
          text: tr(
            'Il modello scrive il suo piano con lo strumento «pianifica»: passi numerati, ciascuno con lo strumento da usare. Può aggiornarlo se qualcosa cambia.',
            'The model writes its plan with the tool «pianifica»: numbered steps, each with the tool to use. It can update the plan if something changes.',
          ),
          term: tr('pianificazione', 'planning'),
        }
      return /calcolatrice/.test(e.instruction)
        ? {
          family: 'orchestration',
          tone: 'info',
          text: tr(
            'L’orchestratore apre per il modello una chiamata alla calcolatrice: il modello deve solo scrivere l’espressione.',
            'The orchestrator opens a calculator call for the model: the model only has to write the expression.',
          ),
          term: tr('chiamata guidata', 'guided call'),
        }
        : {
          family: 'governance',
          tone: 'info',
          text: tr('L’orchestratore gli rispiega il formato e gli chiede di riprovare.', 'The orchestrator explains the format to it again and asks it to try again.'),
        }
    case 'tool/validation':
      return e.ok
        ? {
          family: components.controls ? 'governance' : 'orchestration',
          tone: 'good',
          text: tr(
            `${components.controls ? 'I controlli verificano' : 'L’orchestratore verifica'} gli argomenti rispetto allo schema dello strumento: sono validi.`,
            `${components.controls ? 'The controls check' : 'The orchestrator checks'} the arguments against the tool’s schema: they are valid.`,
          ),
          term: tr('validazione', 'validation'),
        }
        : {
          family: 'governance',
          tone: 'bad',
          text: tr(
            `Argomenti non validi: ${(e.errors ?? []).join('; ')}. L’errore torna al modello, che può correggersi.`,
            `Invalid arguments: ${(e.errors ?? []).join('; ')}. The error goes back to the model, which can correct itself.`,
          ),
        }
    case 'tool/execute':
      return e.viaMcp
        ? {
          family: 'action',
          tone: 'info',
          text: tr(
            `L’orchestratore inoltra la chiamata al server MCP «${e.viaMcp}»: lo strumento vive fuori dall’app.`,
            `The orchestrator forwards the call to the MCP server “${e.viaMcp}”: the tool lives outside the app.`,
          ),
          term: 'MCP',
        }
        : {
          family: 'action',
          tone: 'info',
          text: tr(`L’orchestratore esegue «${toolName(e.tool)}».`, `The orchestrator runs “${toolName(e.tool)}”.`),
        }
    case 'tool/result':
      if (e.tool === 'pianifica' && e.outcome.ok)
        return {
          family: 'orchestration',
          tone: 'good',
          text: tr('Piano registrato: resta nel contesto e il modello lo segue passo per passo.', 'Plan recorded: it stays in the context and the model follows it step by step.'),
        }
      return e.outcome.ok
        ? { family: 'action', tone: 'good', text: tr(`Osservazione: ${e.outcome.summary}`, `Observation: ${e.outcome.summary}`) }
        : {
          family: 'action',
          tone: 'bad',
          text: tr(
            `Lo strumento risponde con un problema (${TOOL_ERROR_LABEL[e.outcome.code]}): ${e.outcome.message}`,
            `The tool replies with a problem (${TOOL_ERROR_LABEL[e.outcome.code]}): ${e.outcome.message}`,
          ),
        }
    case 'approval/asked':
      return {
        family: 'governance',
        tone: 'warn',
        text: tr(
          `Azione con effetti: l’agente si ferma e chiede il tuo permesso per «${e.request.toolTitle}».`,
          `An action with effects: the agent stops and asks your permission for “${e.request.toolTitle}”.`,
        ),
        term: 'human in the loop',
      }
    case 'approval/decided':
      return e.outcome === 'allowed-once'
        ? {
          family: 'governance',
          tone: 'good',
          text:
            e.by === 'teacher-auto'
              ? tr('Approvazione automatica (impostata dal docente).', 'Automatic approval (set by the teacher).')
              : tr('Hai approvato: l’azione può procedere.', 'You approved: the action can go ahead.'),
        }
        : {
          family: 'governance',
          tone: 'bad',
          text:
            e.outcome === 'rejected'
              ? tr('Hai rifiutato: l’azione non verrà eseguita.', 'You rejected it: the action will not be carried out.')
              : tr('Richiesta annullata.', 'Request cancelled.'),
        }
    case 'guard/triggered':
      return {
        family: 'governance',
        tone: e.guard === 'repeat' ? 'warn' : 'bad',
        text: tr(`Intervengono i controlli: ${e.message}`, `The controls step in: ${e.message}`),
        term: 'guardrail',
      }
    case 'mcp/discover':
      return { family: 'action', tone: 'info', text: tr(`Il sistema cerca il server MCP «${e.serverId}».`, `The system looks for the MCP server “${e.serverId}”.`) }
    case 'mcp/connect':
      return {
        family: 'action',
        tone: 'good',
        text: e.protocolVersion
          ? tr(`Connesso al server MCP (protocollo ${e.protocolVersion}).`, `Connected to the MCP server (protocol ${e.protocolVersion}).`)
          : tr('Connesso al server MCP.', 'Connected to the MCP server.'),
      }
    case 'mcp/list-tools': {
      const shown = e.tools.slice(0, 3).join(', ')
      const more = e.tools.length > 3 ? '…' : ''
      return {
        family: 'action',
        tone: 'good',
        text: tr(
          `Il server dichiara i suoi strumenti: ${shown}${more}. Diventano disponibili all’agente.`,
          `The server declares its tools: ${shown}${more}. They become available to the agent.`,
        ),
        term: 'discovery',
      }
    }
    case 'mcp/error':
      return { family: 'action', tone: 'bad', text: tr(`Problema con il server MCP: ${e.message}`, `Problem with the MCP server: ${e.message}`) }
    case 'step/start':
      return e.stepIndex > 1
        ? {
          family: 'orchestration',
          tone: 'info',
          text: tr(
            `Nuovo giro del ciclo: passo ${e.stepIndex}. Il modello riparte con l’osservazione nel contesto.`,
            `New round of the loop: step ${e.stepIndex}. The model starts again with the observation in the context.`,
          ),
          term: 'agent loop',
        }
        : null
    case 'answer':
      return { family: 'model', tone: 'good', text: tr('La risposta finale è pronta.', 'The final answer is ready.') }
    case 'stop': {
      const reason = STOP_LABEL[e.reason].toLowerCase()
      return {
        family: 'orchestration',
        tone: e.reason === 'final_answer' ? 'good' : e.reason === 'needs_user_input' ? 'warn' : 'bad',
        text: tr(`Fine: ${reason}.`, `End: ${reason}.`),
        term: tr('condizione di arresto', 'stop condition'),
      }
    }
    case 'harness/plugin-mounted':
      return {
        family: COMPONENTS[e.component].family === 'model' ? 'model' : COMPONENTS[e.component].family,
        tone: 'good',
        text: tr(
          `+ ${componentText(e.component).label}: aggiunto all’harness. Il modello resta lo stesso.`,
          `+ ${componentText(e.component).label}: added to the harness. The model stays the same.`,
        ),
      }
    case 'harness/plugin-unmounted':
      return {
        family: COMPONENTS[e.component].family === 'model' ? 'model' : COMPONENTS[e.component].family,
        tone: 'info',
        text: tr(`− ${componentText(e.component).label}: rimosso dall’harness.`, `− ${componentText(e.component).label}: removed from the harness.`),
      }
    default:
      return null
  }
}
