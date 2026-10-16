import type { ComponentFamily, ContextKind, ExclusionReason, ProvenanceTag, StopReason, ToolErrorCode, TraceEventType } from '../../domain/types'

/** Italian UI strings shared by every panel (i18n-ready: one place to translate). */

export const PROVENANCE_LABEL: Record<ProvenanceTag['provenance'], string> = {
  real: 'REALE',
  simulated: 'SIMULATO',
  prerecorded: 'PRECONFIGURATO',
  unavailable: 'NON DISPONIBILE',
}

export const PROVENANCE_HELP: Record<ProvenanceTag['provenance'], string> = {
  real: 'Calcolo o inferenza eseguiti davvero in questo momento.',
  simulated: 'Comportamento prodotto da una simulazione didattica: nessun effetto reale.',
  prerecorded: 'Risultato registrato in precedenza e riprodotto.',
  unavailable: 'Non eseguibile in questo browser o contesto.',
}

export const LOCALITY_LABEL: Record<ProvenanceTag['locality'], string> = {
  local: 'LOCALE',
  external: 'ESTERNO',
}

export const LOCALITY_HELP: Record<ProvenanceTag['locality'], string> = {
  local: 'Avviene interamente nel tuo browser, senza rete.',
  external: 'Richiede la rete verso un servizio di terzi.',
}

export const FAMILY_LABEL: Record<ComponentFamily, string> = {
  model: 'Modello',
  information: 'Informazioni',
  action: 'Azioni',
  orchestration: 'Orchestrazione',
  governance: 'Controllo',
}

export const familyVar = (f: ComponentFamily) => `var(--c-${f})`
export const familySoftVar = (f: ComponentFamily) => `var(--c-${f}-soft)`

export const CONTEXT_KIND_LABEL: Record<ContextKind, string> = {
  instruction: 'Istruzioni',
  message: 'Messaggio',
  memory: 'Memoria',
  document: 'Documento',
  toolSchema: 'Descrizione strumenti',
  toolResult: 'Risultato strumento',
  state: 'Stato del compito',
  taskData: 'Dati del compito',
}

export const EXCLUSION_LABEL: Record<ExclusionReason, string> = {
  budget: 'Escluso: spazio esaurito',
  lowScore: 'Escluso: poco pertinente',
  disabled: 'Escluso: componente spento',
  userExcluded: 'Escluso da te',
  outdated: 'Escluso: versione superata',
  duplicate: 'Escluso: duplicato',
  notRelevant: 'Escluso: non pertinente',
}

export const STOP_LABEL: Record<StopReason, string> = {
  final_answer: 'Risposta finale',
  needs_user_input: 'Servono informazioni da te',
  max_steps: 'Limite di passi raggiunto',
  user_stop: 'Fermato da te',
  timeout: 'Tempo scaduto',
  loop_detected: 'Ciclo ripetitivo rilevato',
  approval_denied: 'Approvazione rifiutata',
  unauthorized_tool: 'Strumento non autorizzato',
  tool_failures: 'Troppi errori degli strumenti',
  invalid_output: 'Risposta del modello non valida',
  model_error: 'Errore del modello',
}

export const TOOL_ERROR_LABEL: Record<ToolErrorCode, string> = {
  INVALID_ARGS: 'Argomenti non validi',
  NOT_AUTHORIZED: 'Non autorizzato',
  TIMEOUT: 'Tempo scaduto',
  EMPTY: 'Nessun risultato',
  TOOL_ERROR: 'Errore dello strumento',
  DENIED: 'Bloccato dai controlli',
  UNKNOWN_TOOL: 'Strumento inesistente',
}

export const EVENT_LABEL: Record<TraceEventType, string> = {
  'run/start': 'Richiesta ricevuta',
  'run/end': 'Esecuzione conclusa',
  'harness/plugin-mounted': 'Componente aggiunto',
  'harness/plugin-unmounted': 'Componente rimosso',
  'step/start': 'Nuovo passo',
  'step/end': 'Fine passo',
  'rag/query': 'Ricerca nei documenti',
  'rag/results': 'Frammenti trovati',
  'memory/read': 'Memoria letta',
  'memory/select': 'Ricordi selezionati',
  'memory/inject': 'Ricordi inseriti nel contesto',
  'memory/ignore': 'Ricordi ignorati',
  'memory/write': 'Memoria scritta',
  'memory/delete': 'Memoria eliminata',
  'context/assembled': 'Contesto assemblato',
  'model/request': 'Chiamata al modello',
  'model/response': 'Risposta del modello',
  'decision/parsed': 'Decisione osservabile',
  'decision/invalid': 'Formato non valido',
  'decision/repair': 'Richiesta di correzione',
  'tool/call': 'Richiesta di uno strumento',
  'tool/validation': 'Validazione degli argomenti',
  'tool/execute': 'Esecuzione dello strumento',
  'tool/result': 'Osservazione ricevuta',
  'tool/error': 'Errore dello strumento',
  'approval/asked': 'Approvazione richiesta',
  'approval/decided': 'Decisione umana',
  'mcp/discover': 'Ricerca del server MCP',
  'mcp/connect': 'Connessione MCP',
  'mcp/list-tools': 'Strumenti MCP scoperti',
  'mcp/call': 'Chiamata MCP',
  'mcp/result': 'Risposta MCP',
  'mcp/error': 'Errore MCP',
  'mcp/disconnect': 'Disconnessione MCP',
  'guard/triggered': 'Controllo intervenuto',
  'answer': 'Risposta finale',
  'stop': 'Condizione di arresto',
}

export const formatEur = (n: number) =>
  new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 }).format(n)

export const formatBytes = (n: number) => {
  if (!n) return '—'
  const gb = n / 1024 ** 3
  return gb >= 1 ? `${gb.toLocaleString('it-IT', { maximumFractionDigits: 2 })} GB` : `${(n / 1024 ** 2).toLocaleString('it-IT', { maximumFractionDigits: 0 })} MB`
}
