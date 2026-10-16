import type { ComponentFamily, ComponentId, HarnessConfig, LevelId, LoopLimits, RagSettings, Scenario } from '../domain/types'

export interface ComponentMeta {
  id: ComponentId
  label: string
  family: ComponentFamily
  /** Where it sits on the canvas. */
  ring: 'core' | 'reads' | 'acts' | 'governs' | 'external'
  /** One plain sentence: what it does. */
  short: string
  /** Is it part of the model or of the harness? */
  partOf: 'model' | 'harness'
}

export const COMPONENTS: Record<ComponentId, ComponentMeta> = {
  model: { id: 'model', label: 'Modello linguistico', family: 'model', ring: 'core', partOf: 'model', short: 'Riceve testo e produce testo. I suoi pesi non cambiano mai.' },
  instructions: { id: 'instructions', label: 'Istruzioni di sistema', family: 'information', ring: 'reads', partOf: 'harness', short: 'Ruolo, obiettivo, tono, regole, formato e limiti della risposta.' },
  context: { id: 'context', label: 'Contesto del compito', family: 'information', ring: 'reads', partOf: 'harness', short: 'I dati pertinenti al compito, scelti dal sistema e messi davanti al modello.' },
  memory: { id: 'memory', label: 'Memoria', family: 'information', ring: 'reads', partOf: 'harness', short: 'Fatti e preferenze salvati dal sistema e rimessi nel contesto quando servono.' },
  rag: { id: 'rag', label: 'Conoscenza (RAG)', family: 'information', ring: 'reads', partOf: 'harness', short: 'Cerca nei documenti aziendali i frammenti pertinenti e li aggiunge al contesto.' },
  tools: { id: 'tools', label: 'Strumenti', family: 'action', ring: 'acts', partOf: 'harness', short: 'Funzioni che il sistema esegue quando il modello le chiede: calcoli, ricerche, azioni.' },
  orchestrator: { id: 'orchestrator', label: 'Orchestratore', family: 'orchestration', ring: 'governs', partOf: 'harness', short: 'Interpreta la richiesta del modello, esegue lo strumento e gli riporta il risultato.' },
  agentLoop: { id: 'agentLoop', label: 'Ciclo agentico', family: 'orchestration', ring: 'governs', partOf: 'harness', short: 'Ripete il giro modello → strumento → osservazione finché l’obiettivo è raggiunto.' },
  controls: { id: 'controls', label: 'Controlli', family: 'governance', ring: 'governs', partOf: 'harness', short: 'Limiti di passi e tempo, permessi, rilevamento dei cicli, blocco delle azioni non supervisionate.' },
  approval: { id: 'approval', label: 'Supervisione umana', family: 'governance', ring: 'governs', partOf: 'harness', short: 'Le azioni con effetti passano da una persona che approva o rifiuta.' },
  mcp: { id: 'mcp', label: 'Server MCP', family: 'action', ring: 'external', partOf: 'harness', short: 'Collega strumenti esterni con un protocollo standard: cambia il cavo, non il cervello.' },
}

export const COMPONENT_ORDER: ComponentId[] = [
  'model', 'instructions', 'context', 'memory', 'rag', 'tools', 'orchestrator', 'agentLoop', 'controls', 'approval', 'mcp',
]

export const DEFAULT_LIMITS: LoopLimits = {
  maxSteps: 10,
  stepTimeoutMs: 90_000,
  toolTimeoutMs: 4_000,
  turnTimeoutMs: 240_000,
  repeatWarnAt: 2,
  repeatStopAt: 3,
  maxToolFailures: 2,
  maxRepairs: 2,
}

export const DEFAULT_RAG: RagSettings = {
  mode: 'deterministic',
  topK: 3,
  minScore: 0.35,
  includeOutdated: false,
  includeDistractors: false,
  pinnedChunkIds: [],
  excludedChunkIds: [],
}

/** Tools exposed at level 5 and at level 6+. */
export const LEVEL5_TOOLS = ['calcolatrice']
/**
 * Tools exposed from level 6. Small models choose better among few tools, so only the ones the scenarios
 * need are on by default; the others (registra_evento, invia_messaggio, modifica_dato, …) can be switched
 * on from the Tool Lab.
 */
export const LEVEL6_TOOLS = [
  'calcolatrice',
  'cerca_policy',
  'cerca_catalogo',
  'verifica_disponibilita',
  'leggi_budget',
  'converti_valuta',
  'leggi_ordine_cliente',
  'crea_attivita',
  'crea_richiesta_acquisto',
]

export const SIMULATED_MCP_SERVER = 'techsupply'

export interface LevelDef {
  id: LevelId
  title: string
  /** What the user does in this level. */
  action: string
  /** The concrete phenomenon to observe, shown BEFORE the technical term. */
  phenomenon: string
  /** The technical term revealed after the phenomenon. */
  term: string
  /** Didactic message (fixed text). */
  message: string
  /** Components switched on at this level (cumulative). */
  adds: ComponentId[]
}

export const LEVELS: LevelDef[] = [
  {
    id: 0,
    title: 'Il modello, da solo',
    action: 'Fai la domanda al modello così com’è.',
    phenomenon: 'Risponde con sicurezza, ma non conosce la tua azienda: niente policy, niente prezzi veri, nessuna azione possibile.',
    term: 'LLM isolato',
    message: 'Questo è il modello. Tutto il resto deve ancora essere costruito.',
    adds: ['model'],
  },
  {
    id: 1,
    title: 'Istruzioni di sistema',
    action: 'Aggiungi ruolo, regole e formato della risposta.',
    phenomenon: 'Stesso modello, risposta diversa: più ordinata, più prudente, dichiara ciò che non sa invece di inventare.',
    term: 'System prompt',
    message: 'Il modello non è cambiato. Gli abbiamo costruito attorno una prima struttura di comportamento.',
    adds: ['instructions'],
  },
  {
    id: 2,
    title: 'Contesto',
    action: 'Metti davanti al modello i dati del compito.',
    phenomenon: 'Ora conosce i nomi dei nuovi assunti e la data di inizio: solo perché il sistema glieli ha passati.',
    term: 'Context window',
    message: 'Il modello può utilizzare soltanto ciò che il sistema gli rende disponibile.',
    adds: ['context'],
  },
  {
    id: 3,
    title: 'Memoria',
    action: 'Attiva la memoria: preferenze e fatti salvati in precedenza.',
    phenomenon: 'Ricorda centro di costo e sede di consegna. Ma non è il modello a ricordare: è il sistema che rilegge e reinserisce.',
    term: 'Memoria (sessione e persistente)',
    message: 'La memoria non è nel modello: è il sistema che decide cosa ricordare e cosa rimettere nel contesto.',
    adds: ['memory'],
  },
  {
    id: 4,
    title: 'Conoscenza aziendale (RAG)',
    action: 'Collega i documenti aziendali e osserva la ricerca.',
    phenomenon: 'Ora cita la policy giusta e i tetti di spesa. Ha letto i frammenti trovati, ma non ha ancora fatto nulla.',
    term: 'Retrieval-Augmented Generation',
    message: 'La RAG recupera informazioni. Non compie automaticamente un’azione nel mondo esterno.',
    adds: ['rag'],
  },
  {
    id: 5,
    title: 'Il primo strumento',
    action: 'Dai al sistema una calcolatrice e un orchestratore che ripete il giro finché serve.',
    phenomenon: 'Il modello non calcola: chiede. L’orchestratore esegue, gli riporta il risultato esatto e lo lascia continuare finché ha finito.',
    term: 'Tool calling e agent loop',
    message: 'Il modello non esegue nulla: chiede. È l’orchestratore che esegue, riporta il risultato e ripete il giro finché serve.',
    adds: ['tools', 'orchestrator', 'agentLoop'],
  },
  {
    id: 6,
    title: 'Più strumenti',
    action: 'Aggiungi catalogo, magazzino, budget e azioni.',
    phenomenon: 'Cerca nel catalogo, verifica il magazzino, legge il budget e ricalcola da solo… e crea la richiesta d’acquisto senza che nessuno controlli.',
    term: 'Tool registry',
    message: 'Più strumenti significa più scelte: il sistema deve descriverli bene e controllare come vengono usati.',
    adds: [],
  },
  {
    id: 7,
    title: 'Controlli',
    action: 'Metti limiti a passi e tempi, ferma i cicli ripetuti e blocca le azioni non supervisionate.',
    phenomenon: 'Il ciclo continua a cercare, verificare e ricalcolare, ma dentro limiti chiari: la richiesta d’acquisto ora resta bloccata.',
    term: 'Guardrail',
    message: 'Agire, osservare, correggere, riprovare: il ciclo è dell’harness, e l’harness lo governa con dei limiti.',
    adds: ['controls'],
  },
  {
    id: 8,
    title: 'Supervisione umana',
    action: 'Le azioni con effetti ora passano da te.',
    phenomenon: 'L’agente prepara la richiesta d’acquisto, si ferma e ti mostra cosa sta per fare. Decidi tu.',
    term: 'Human in the loop',
    message: 'Le azioni con effetti reali passano da una persona.',
    adds: ['approval'],
  },
  {
    id: 9,
    title: 'Strumenti esterni via MCP',
    action: 'Collega il server MCP del fornitore.',
    phenomenon: 'Il sistema scopre da solo gli strumenti del fornitore e verifica la data di consegna.',
    term: 'Model Context Protocol',
    message: 'MCP è un modo standard per collegare strumenti esterni: cambia il cavo, non il cervello.',
    adds: ['mcp'],
  },
]

export function emptyComponents(): Record<ComponentId, boolean> {
  return {
    model: true, instructions: false, context: false, memory: false, rag: false, tools: false,
    orchestrator: false, agentLoop: false, controls: false, approval: false, mcp: false,
  }
}

export function baseConfig(): HarnessConfig {
  return {
    components: emptyComponents(),
    enabledTools: [],
    limits: { ...DEFAULT_LIMITS },
    rag: { ...DEFAULT_RAG },
    memory: { persistent: true },
    mcpServers: [],
    autoApprove: false,
  }
}

/** Cumulative harness configuration for a guided level. */
export function configForLevel(level: LevelId, prev?: HarnessConfig): HarnessConfig {
  const cfg = prev ? { ...prev, components: emptyComponents() } : baseConfig()
  for (const l of LEVELS) {
    if (l.id > level) break
    for (const c of l.adds) cfg.components[c] = true
  }
  cfg.enabledTools = level >= 6 ? [...LEVEL6_TOOLS] : level === 5 ? [...LEVEL5_TOOLS] : []
  cfg.mcpServers = level >= 9 ? [SIMULATED_MCP_SERVER] : []
  return cfg
}

const LAST_LEVEL: LevelId = 9

/** Last guided level a scenario needs (the whole path when it does not say, or when there is no scenario). */
export function lastLevelOf(scenario?: Pick<Scenario, 'maxLevel'>): LevelId {
  return scenario?.maxLevel ?? LAST_LEVEL
}

/** The guided levels shown for a scenario: from the isolated model up to the last one that changes its outcome. */
export function levelsFor(scenario?: Pick<Scenario, 'maxLevel'>): LevelDef[] {
  const last = lastLevelOf(scenario)
  return LEVELS.filter(l => l.id <= last)
}

/** A guided level kept within the scenario's path. */
export function clampLevel(level: LevelId, scenario?: Pick<Scenario, 'maxLevel'>): LevelId {
  const last = lastLevelOf(scenario)
  return level > last ? last : level
}

export interface ExperimentConfig {
  key: string
  label: string
  short: string
  config: HarnessConfig
}

function withComponents(on: ComponentId[], tools: string[], mcp: string[] = []): HarnessConfig {
  const cfg = baseConfig()
  for (const c of on) cfg.components[c] = true
  cfg.enabledTools = tools
  cfg.mcpServers = mcp
  return cfg
}

const LOOP: ComponentId[] = ['model', 'instructions', 'context', 'memory', 'rag', 'tools', 'orchestrator', 'agentLoop']

/** The ten configurations of the fundamental experiment: same model, same request. */
export const EXPERIMENT: ExperimentConfig[] = [
  { key: 'c01', short: 'Modello', label: '1 · Modello isolato', config: withComponents(['model'], []) },
  { key: 'c02', short: '+ Istruzioni', label: '2 · + Istruzioni', config: withComponents(['model', 'instructions'], []) },
  { key: 'c03', short: '+ Contesto', label: '3 · + Contesto', config: withComponents(['model', 'instructions', 'context'], []) },
  { key: 'c04', short: '+ Memoria', label: '4 · + Memoria', config: withComponents(['model', 'instructions', 'context', 'memory'], []) },
  { key: 'c05', short: '+ RAG', label: '5 · + RAG', config: withComponents(['model', 'instructions', 'context', 'memory', 'rag'], []) },
  { key: 'c06', short: '+ 1 strumento', label: '6 · + Un tool e ciclo', config: withComponents(LOOP, LEVEL5_TOOLS) },
  { key: 'c07', short: '+ Più strumenti', label: '7 · + Più tool', config: withComponents(LOOP, LEVEL6_TOOLS) },
  { key: 'c08', short: '+ Controlli', label: '8 · + Controlli', config: withComponents([...LOOP, 'controls'], LEVEL6_TOOLS) },
  { key: 'c09', short: '+ Supervisione', label: '9 · + Supervisione umana', config: withComponents([...LOOP, 'controls', 'approval'], LEVEL6_TOOLS) },
  { key: 'c10', short: 'Completo', label: '10 · Sistema completo', config: withComponents(['model', 'instructions', 'context', 'memory', 'rag', 'tools', 'orchestrator', 'agentLoop', 'controls', 'approval', 'mcp'], LEVEL6_TOOLS, [SIMULATED_MCP_SERVER]) },
]

/** Stable key describing a configuration (used for recordings and comparisons). */
export function configKeyOf(cfg: HarnessConfig): string {
  const on = (Object.keys(cfg.components) as ComponentId[]).filter(c => cfg.components[c]).sort()
  return `${on.join('+')}|tools:${[...cfg.enabledTools].sort().join(',')}|mcp:${[...cfg.mcpServers].sort().join(',')}`
}

export function describeConfig(cfg: HarnessConfig): string {
  const exp = EXPERIMENT.find(e => configKeyOf(e.config) === configKeyOf(cfg))
  if (exp) return exp.label
  const on = COMPONENT_ORDER.filter(c => cfg.components[c] && c !== 'model').map(c => COMPONENTS[c].label)
  return on.length ? `Modello + ${on.join(', ')}` : 'Modello isolato'
}
