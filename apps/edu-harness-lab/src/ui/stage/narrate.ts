import type { ComponentId, TraceEvent } from '../../domain/types'
import { COMPONENTS } from '../../harness/levels'
import { CONTEXT_KIND_LABEL, STOP_LABEL, TOOL_ERROR_LABEL } from '../common/labels'
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
const n = (v: number) => v.toLocaleString('it-IT')

/**
 * Plain-Italian narration of what the harness is doing, one sentence per observable event.
 * First the phenomenon, then (in `term`) the technical word.
 */
export function narrate(e: TraceEvent, components: Record<ComponentId, boolean>): Omit<NarrationLine, 'id' | 'seq' | 'step'> | null {
  switch (e.type) {
    case 'run/start':
      return components.orchestrator || components.instructions || components.context || components.memory || components.rag
        ? { family: 'user', tone: 'info', text: 'Hai fatto la tua richiesta: l’harness la prende in carico prima di passarla al modello.' }
        : { family: 'user', tone: 'info', text: 'Hai fatto la tua richiesta: arriverà al modello così com’è, senza nient’altro.' }
    case 'memory/read':
      return { family: 'information', tone: 'info', text: `La memoria rilegge ${n(e.count)} ricordi salvati in precedenza.`, term: 'memoria' }
    case 'memory/inject':
      return e.ids.length ? { family: 'information', tone: 'good', text: `${n(e.ids.length)} ricordi vengono rimessi nel contesto: il modello non li ricorda, glieli ripropone il sistema.` } : null
    case 'memory/ignore':
      return e.ids.length ? { family: 'information', tone: 'info', text: `${n(e.ids.length)} ricordi restano fuori: ${e.reason}.` } : null
    case 'memory/write':
      return { family: 'information', tone: 'info', text: 'Il sistema annota in memoria lo stato del compito, per la prossima volta.' }
    case 'rag/query':
      return { family: 'information', tone: 'info', text: 'Il retriever cerca nei documenti aziendali le parti pertinenti alla richiesta.', term: 'retrieval' }
    case 'rag/results': {
      const sel = e.hits.filter(h => h.status === 'selected')
      const out = e.hits.filter(h => h.status === 'excluded')
      const top = sel.slice(0, 2).map(h => `${h.docId} (${Math.round(h.normalized * 100)}%)`).join(', ')
      const outdated = out.some(h => h.reason === 'outdated')
      return {
        family: 'information',
        tone: sel.length ? 'good' : 'warn',
        text: sel.length
          ? `Trovati ${sel.length} frammenti utili: ${top}.${out.length ? ` Scartati ${out.length}${outdated ? ', tra cui una versione superata della policy' : ''}.` : ''}`
          : 'Nessun frammento abbastanza pertinente: al modello non arriverà nessun documento.',
      }
    }
    case 'context/assembled': {
      const inc = e.snapshot.items.filter(i => i.status === 'included')
      const kinds = [...new Set(inc.map(i => i.kind))]
      if (kinds.length === 1 && kinds[0] === 'message' && inc.length === 1) {
        return { family: 'model', tone: 'warn', text: 'Il modello vedrà soltanto la tua domanda: niente istruzioni, niente dati, niente documenti.', term: 'finestra di contesto' }
      }
      const list = kinds.map(k => CONTEXT_KIND_LABEL[k].toLowerCase()).join(', ')
      return { family: 'model', tone: 'info', text: `Il contesto è pronto: ≈ ${n(e.snapshot.budget.usedTokens)} token (${list}). È tutto ciò che il modello potrà vedere.`, term: 'finestra di contesto' }
    }
    case 'model/request':
      if (e.reflection) return { family: 'model', tone: 'info', text: 'Avviata una chiamata del ciclo di riflessione. L’output dirà se il modello ha prodotto una bozza, una verifica o una risposta.', term: 'richiesta al modello' }
      return e.protocol === 'json'
        ? e.mustAnswer
          ? { family: 'model', tone: 'info', text: 'Il modello legge il contesto: ora deve dare la risposta finale.' }
          : { family: 'model', tone: 'info', text: 'Il modello legge il contesto e deve rispondere con una decisione strutturata: rispondere, chiedere o usare uno strumento.', term: 'protocollo di decisione' }
        : { family: 'model', tone: 'info', text: 'Il modello legge il contesto e scrive la sua risposta, una parola alla volta.' }
    case 'model/response':
      return { family: 'model', tone: 'info', text: `Il modello ha finito di scrivere in ${(e.durationMs / 1000).toLocaleString('it-IT', { maximumFractionDigits: 1 })} s.` }
    case 'decision/parsed':
      if (e.decision.type === 'reflect')
        return { family: 'orchestration', tone: 'info', text: 'Il modello produce una bozza o una verifica, non la risposta. L’orchestratore la reinserisce nel contesto e avvia un altro passo sullo stesso compito.', term: 'ragionamento iterativo' }
      if (e.decision.type === 'tool' && e.decision.tool === 'pianifica') {
        const plan = e.decision.args.piano ?? ''
        const text = typeof plan === 'string' ? plan : JSON.stringify(plan)
        return {
          family: 'orchestration',
          tone: 'info',
          text: `Il modello scrive il suo piano: ${text.replace(/\s+/g, ' ').slice(0, 220)}`,
          term: 'piano',
        }
      }
      if (e.decision.type === 'tool')
        return {
          family: 'orchestration',
          tone: 'info',
          text: `Il modello chiede di usare «${toolName(e.decision.tool)}»${Object.keys(e.decision.args).length ? ` (${argsInline(e.decision.args)})` : ''}. Non lo esegue: lo chiede all’orchestratore.`,
          term: 'tool call',
        }
      if (e.decision.type === 'ask') return { family: 'orchestration', tone: 'warn', text: 'Mancano informazioni: il modello ti fa una domanda.' }
      return { family: 'orchestration', tone: 'good', text: 'Il modello decide di rispondere.' }
    case 'decision/invalid':
      return e.error.startsWith('Numeri calcolati a mente')
        ? { family: 'orchestration', tone: 'warn', text: `Il modello ha fatto i conti a mente (${e.error.replace(/^[^(]*\(([^)]*)\).*$/, '$1')}): l’orchestratore non accetta numeri che non vengono da una fonte o da uno strumento.`, term: 'verifica dei calcoli' }
        : { family: 'governance', tone: 'warn', text: 'La risposta del modello non rispetta il formato richiesto.' }
    case 'decision/repair':
      if (/prima bozza/.test(e.instruction))
        return { family: 'orchestration', tone: 'info', text: e.instruction, term: 'bozza guidata' }
      if (/piano/.test(e.instruction))
        return { family: 'orchestration', tone: 'info', text: 'Prima di agire, l’orchestratore fa scrivere al modello un piano: passi numerati, ciascuno con lo strumento da usare.', term: 'pianificazione' }
      return /calcolatrice/.test(e.instruction)
        ? { family: 'orchestration', tone: 'info', text: 'L’orchestratore apre per il modello una chiamata alla calcolatrice: il modello deve solo scrivere l’espressione.', term: 'chiamata guidata' }
        : { family: 'governance', tone: 'info', text: 'L’orchestratore gli rispiega il formato e gli chiede di riprovare.' }
    case 'tool/validation':
      return e.ok
        ? { family: 'governance', tone: 'good', text: 'I controlli verificano gli argomenti rispetto allo schema dello strumento: sono validi.', term: 'validazione' }
        : { family: 'governance', tone: 'bad', text: `Argomenti non validi: ${(e.errors ?? []).join('; ')}. L’errore torna al modello, che può correggersi.` }
    case 'tool/execute':
      return e.viaMcp
        ? { family: 'action', tone: 'info', text: `L’orchestratore inoltra la chiamata al server MCP «${e.viaMcp}»: lo strumento vive fuori dall’app.`, term: 'MCP' }
        : { family: 'action', tone: 'info', text: `L’orchestratore esegue «${toolName(e.tool)}».` }
    case 'tool/result':
      if (e.tool === 'pianifica' && e.outcome.ok) return { family: 'orchestration', tone: 'good', text: 'Piano registrato: resta nel contesto e il modello lo segue passo per passo.' }
      return e.outcome.ok
        ? { family: 'action', tone: 'good', text: `Osservazione: ${e.outcome.summary}` }
        : { family: 'action', tone: 'bad', text: `Lo strumento risponde con un problema (${TOOL_ERROR_LABEL[e.outcome.code]}): ${e.outcome.message}` }
    case 'approval/asked':
      return { family: 'governance', tone: 'warn', text: `Azione con effetti: l’agente si ferma e chiede il tuo permesso per «${e.request.toolTitle}».`, term: 'human in the loop' }
    case 'approval/decided':
      return e.outcome === 'allowed-once'
        ? { family: 'governance', tone: 'good', text: e.by === 'teacher-auto' ? 'Approvazione automatica (impostata dal docente).' : 'Hai approvato: l’azione può procedere.' }
        : { family: 'governance', tone: 'bad', text: e.outcome === 'rejected' ? 'Hai rifiutato: l’azione non verrà eseguita.' : 'Richiesta annullata.' }
    case 'guard/triggered':
      return { family: 'governance', tone: e.guard === 'repeat' ? 'warn' : 'bad', text: `Intervengono i controlli: ${e.message}`, term: 'guardrail' }
    case 'mcp/discover':
      return { family: 'action', tone: 'info', text: `Il sistema cerca il server MCP «${e.serverId}».` }
    case 'mcp/connect':
      return { family: 'action', tone: 'good', text: `Connesso al server MCP${e.protocolVersion ? ` (protocollo ${e.protocolVersion})` : ''}.` }
    case 'mcp/list-tools':
      return { family: 'action', tone: 'good', text: `Il server dichiara i suoi strumenti: ${e.tools.slice(0, 3).join(', ')}${e.tools.length > 3 ? '…' : ''}. Diventano disponibili all’agente.`, term: 'discovery' }
    case 'mcp/error':
      return { family: 'action', tone: 'bad', text: `Problema con il server MCP: ${e.message}` }
    case 'step/start':
      return e.stepIndex > 1 ? { family: 'orchestration', tone: 'info', text: `Nuovo giro del ciclo: passo ${e.stepIndex}. Il modello riparte con l’osservazione nel contesto.`, term: 'agent loop' } : null
    case 'answer':
      return { family: 'model', tone: 'good', text: 'La risposta finale è pronta.' }
    case 'stop':
      return { family: 'orchestration', tone: e.reason === 'final_answer' ? 'good' : e.reason === 'needs_user_input' ? 'warn' : 'bad', text: `Fine: ${STOP_LABEL[e.reason].toLowerCase()}.`, term: 'condizione di arresto' }
    case 'harness/plugin-mounted':
      return { family: COMPONENTS[e.component].family === 'model' ? 'model' : COMPONENTS[e.component].family, tone: 'good', text: `+ ${COMPONENTS[e.component].label}: aggiunto all’harness. Il modello resta lo stesso.` }
    case 'harness/plugin-unmounted':
      return { family: COMPONENTS[e.component].family === 'model' ? 'model' : COMPONENTS[e.component].family, tone: 'info', text: `− ${COMPONENTS[e.component].label}: rimosso dall’harness.` }
    default:
      return null
  }
}
