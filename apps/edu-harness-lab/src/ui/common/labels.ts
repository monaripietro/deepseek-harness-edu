import type { ComponentFamily, ContextKind, ExclusionReason, ProvenanceTag, StopReason, ToolErrorCode, TraceEventType } from '../../domain/types'
import { biRecord, uiLang } from '../../i18n'

/** UI strings shared by every panel. Italian first, English second; they follow the interface language at read time. */

export const PROVENANCE_LABEL = biRecord<ProvenanceTag['provenance']>({
  real: ['REALE', 'REAL'],
  simulated: ['SIMULATO', 'SIMULATED'],
  prerecorded: ['PRECONFIGURATO', 'PRE-RECORDED'],
  unavailable: ['NON DISPONIBILE', 'UNAVAILABLE'],
})

export const PROVENANCE_HELP = biRecord<ProvenanceTag['provenance']>({
  real: ['Calcolo o inferenza eseguiti davvero in questo momento.', 'Computation or inference actually run right now.'],
  simulated: ['Comportamento prodotto da una simulazione didattica: nessun effetto reale.', 'Behaviour produced by a teaching simulation: no real effect.'],
  prerecorded: ['Risultato registrato in precedenza e riprodotto.', 'Result recorded earlier and played back.'],
  unavailable: ['Non eseguibile in questo browser o contesto.', 'Cannot run in this browser or context.'],
})

export const LOCALITY_LABEL = biRecord<ProvenanceTag['locality']>({
  local: ['LOCALE', 'LOCAL'],
  external: ['ESTERNO', 'EXTERNAL'],
})

export const LOCALITY_HELP = biRecord<ProvenanceTag['locality']>({
  local: ['Avviene interamente nel tuo browser, senza rete.', 'Happens entirely in your browser, without network.'],
  external: ['Richiede la rete verso un servizio di terzi.', 'Requires the network to reach a third-party service.'],
})

export const FAMILY_LABEL = biRecord<ComponentFamily>({
  model: ['Modello', 'Model'],
  information: ['Informazioni', 'Information'],
  action: ['Azioni', 'Actions'],
  orchestration: ['Orchestrazione', 'Orchestration'],
  governance: ['Controllo', 'Controls'],
})

export const familyVar = (f: ComponentFamily) => `var(--c-${f})`
export const familySoftVar = (f: ComponentFamily) => `var(--c-${f}-soft)`

export const CONTEXT_KIND_LABEL = biRecord<ContextKind>({
  instruction: ['Istruzioni', 'Instructions'],
  message: ['Messaggio', 'Message'],
  memory: ['Memoria', 'Memory'],
  document: ['Documento', 'Document'],
  toolSchema: ['Descrizione strumenti', 'Tool descriptions'],
  toolResult: ['Risultato strumento', 'Tool result'],
  state: ['Stato del compito', 'Task state'],
  taskData: ['Dati del compito', 'Task data'],
})

export const EXCLUSION_LABEL = biRecord<ExclusionReason>({
  budget: ['Escluso: spazio esaurito', 'Excluded: no space left'],
  lowScore: ['Escluso: poco pertinente', 'Excluded: low relevance'],
  disabled: ['Escluso: componente spento', 'Excluded: component off'],
  userExcluded: ['Escluso da te', 'Excluded by you'],
  outdated: ['Escluso: versione superata', 'Excluded: outdated version'],
  duplicate: ['Escluso: duplicato', 'Excluded: duplicate'],
  notRelevant: ['Escluso: non pertinente', 'Excluded: not relevant'],
})

export const STOP_LABEL = biRecord<StopReason>({
  final_answer: ['Risposta finale', 'Final answer'],
  needs_user_input: ['Servono informazioni da te', 'Needs information from you'],
  max_steps: ['Limite di passi raggiunto', 'Step limit reached'],
  user_stop: ['Fermato da te', 'Stopped by you'],
  timeout: ['Tempo scaduto', 'Time is up'],
  loop_detected: ['Ciclo ripetitivo rilevato', 'Repetitive loop detected'],
  approval_denied: ['Approvazione rifiutata', 'Approval refused'],
  unauthorized_tool: ['Strumento non autorizzato', 'Unauthorised tool'],
  tool_failures: ['Troppi errori degli strumenti', 'Too many tool errors'],
  invalid_output: ['Risposta del modello non valida', 'Invalid model response'],
  model_error: ['Errore del modello', 'Model error'],
})

export const TOOL_ERROR_LABEL = biRecord<ToolErrorCode>({
  INVALID_ARGS: ['Argomenti non validi', 'Invalid arguments'],
  NOT_AUTHORIZED: ['Non autorizzato', 'Not authorised'],
  TIMEOUT: ['Tempo scaduto', 'Time is up'],
  EMPTY: ['Nessun risultato', 'No result'],
  TOOL_ERROR: ['Errore dello strumento', 'Tool error'],
  DENIED: ['Bloccato dai controlli', 'Blocked by controls'],
  UNKNOWN_TOOL: ['Strumento inesistente', 'Unknown tool'],
})

export const EVENT_LABEL = biRecord<TraceEventType>({
  'run/start': ['Richiesta ricevuta', 'Request received'],
  'run/end': ['Esecuzione conclusa', 'Run finished'],
  'harness/plugin-mounted': ['Componente aggiunto', 'Component added'],
  'harness/plugin-unmounted': ['Componente rimosso', 'Component removed'],
  'step/start': ['Nuovo passo', 'New step'],
  'step/end': ['Fine passo', 'End of step'],
  'rag/query': ['Ricerca nei documenti', 'Document search'],
  'rag/results': ['Frammenti trovati', 'Passages found'],
  'memory/read': ['Memoria letta', 'Memory read'],
  'memory/select': ['Ricordi selezionati', 'Memories selected'],
  'memory/inject': ['Ricordi inseriti nel contesto', 'Memories added to the context'],
  'memory/ignore': ['Ricordi ignorati', 'Memories ignored'],
  'memory/write': ['Memoria scritta', 'Memory written'],
  'memory/delete': ['Memoria eliminata', 'Memory deleted'],
  'context/assembled': ['Contesto assemblato', 'Context assembled'],
  'model/request': ['Chiamata al modello', 'Model call'],
  'model/response': ['Risposta del modello', 'Model response'],
  'decision/parsed': ['Decisione osservabile', 'Observable decision'],
  'decision/invalid': ['Formato non valido', 'Invalid format'],
  'decision/repair': ['Richiesta di correzione', 'Correction request'],
  'tool/call': ['Richiesta di uno strumento', 'Tool request'],
  'tool/validation': ['Validazione degli argomenti', 'Argument check'],
  'tool/execute': ['Esecuzione dello strumento', 'Tool run'],
  'tool/result': ['Osservazione ricevuta', 'Observation received'],
  'tool/error': ['Errore dello strumento', 'Tool error'],
  'approval/asked': ['Approvazione richiesta', 'Approval requested'],
  'approval/decided': ['Decisione umana', 'Human decision'],
  'mcp/discover': ['Ricerca del server MCP', 'Searching for the MCP server'],
  'mcp/connect': ['Connessione MCP', 'MCP connection'],
  'mcp/list-tools': ['Strumenti MCP scoperti', 'MCP tools discovered'],
  'mcp/call': ['Chiamata MCP', 'MCP call'],
  'mcp/result': ['Risposta MCP', 'MCP response'],
  'mcp/error': ['Errore MCP', 'MCP error'],
  'mcp/disconnect': ['Disconnessione MCP', 'MCP disconnection'],
  'guard/triggered': ['Controllo intervenuto', 'Control triggered'],
  'answer': ['Risposta finale', 'Final answer'],
  'stop': ['Condizione di arresto', 'Stop condition'],
})

/** Locale for number and date formatting, following the interface language. */
export const numLocale = () => (uiLang() === 'en' ? 'en-GB' : 'it-IT')

export const formatEur = (n: number) =>
  new Intl.NumberFormat(numLocale(), { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 }).format(n)

export const formatBytes = (n: number) => {
  if (!n) return '—'
  const gb = n / 1024 ** 3
  return gb >= 1 ? `${gb.toLocaleString(numLocale(), { maximumFractionDigits: 2 })} GB` : `${(n / 1024 ** 2).toLocaleString(numLocale(), { maximumFractionDigits: 0 })} MB`
}
