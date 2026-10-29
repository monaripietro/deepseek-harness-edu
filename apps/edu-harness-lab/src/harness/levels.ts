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
    phenomenon: 'Le istruzioni definiscono il compito, i limiti e il formato della risposta.',
    term: 'System prompt',
    message: 'Le istruzioni guidano il modello senza aggiungere dati aziendali o strumenti.',
    adds: ['instructions'],
  },
  {
    id: 2,
    title: 'Contesto',
    action: 'Metti davanti al modello i dati del compito.',
    phenomenon: 'Il modello riceve i fatti selezionati per questa richiesta; non li deduce da dati estranei al compito.',
    term: 'Context window',
    message: 'Il modello può utilizzare soltanto ciò che il sistema gli rende disponibile.',
    adds: ['context'],
  },
  {
    id: 3,
    title: 'Memoria',
    action: 'Aggiungi alla richiesta i fatti salvati che sono pertinenti.',
    phenomenon: 'La memoria può fornire fatti pertinenti; il modello non li conserva da solo.',
    term: 'Memoria (sessione e persistente)',
    message: 'Il sistema seleziona i fatti salvati da includere; se nessuno è pertinente, non aggiunge memoria.',
    adds: ['memory'],
  },
  {
    id: 4,
    title: 'Conoscenza aziendale (RAG)',
    action: 'Cerca nei documenti le informazioni pertinenti alla richiesta.',
    phenomenon: 'I passaggi recuperati aggiungono evidenze al contesto; non eseguono azioni.',
    term: 'Retrieval-Augmented Generation',
    message: 'La RAG recupera informazioni. Non compie automaticamente un’azione nel mondo esterno.',
    adds: ['rag'],
  },
  {
    id: 5,
    title: 'Ciclo con strumenti',
    action: 'Abilita gli strumenti pertinenti e l’orchestratore che gestisce le chiamate.',
    phenomenon: 'Il modello può chiedere uno strumento abilitato; l’orchestratore lo esegue e gli restituisce il risultato.',
    term: 'Tool calling e agent loop',
    message: 'Il modello può richiedere soltanto gli strumenti abilitati per il compito.',
    adds: ['tools', 'orchestrator', 'agentLoop'],
  },
  {
    id: 6,
    title: 'Strumenti pertinenti',
    action: 'Abilita solo gli strumenti utili a questo scenario.',
    phenomenon: 'Il modello può scegliere tra gli strumenti configurati per il compito, non tra tutti quelli registrati.',
    term: 'Tool registry',
    message: 'Il registro espone al modello soltanto gli strumenti abilitati per il compito.',
    adds: [],
  },
  {
    id: 7,
    title: 'Controlli',
    action: 'Limita i tentativi e interrompi i cicli che non fanno progressi.',
    phenomenon: 'I controlli applicano limiti al ciclo e alle azioni abilitate in questo scenario.',
    term: 'Guardrail',
    message: 'I controlli governano i tentativi e gli effetti possibili del ciclo.',
    adds: ['controls'],
  },
  {
    id: 8,
    title: 'Supervisione umana',
    action: 'Richiedi approvazione prima di eseguire un’azione con effetti.',
    phenomenon: 'L’agente mostra l’azione proposta e attende la decisione di una persona.',
    term: 'Human in the loop',
    message: 'Le azioni con effetti reali passano da una persona.',
    adds: ['approval'],
  },
  {
    id: 9,
    title: 'Strumenti esterni via MCP',
    action: 'Collega il server MCP del fornitore.',
    phenomenon: 'Il sistema scopre gli strumenti del server MCP configurato e li rende disponibili al modello.',
    term: 'Model Context Protocol',
    message: 'MCP collega strumenti esterni tramite un protocollo condiviso.',
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

/**
 * Builds the cumulative harness configuration for a guided level.
 *
 * @param level - Highest guided level to enable.
 * @param prev - Existing configuration whose non-level settings should be retained.
 * @param scenario - Optional scenario-specific component and tool overrides.
 * @returns The cumulative configuration through `level`.
 */
export function configForLevel(
  level: LevelId,
  prev?: HarnessConfig,
  scenario?: Pick<Scenario, 'levelOverrides'>,
): HarnessConfig {
  const cfg = prev ? { ...prev, components: emptyComponents() } : baseConfig()
  cfg.enabledTools = []
  cfg.mcpServers = []
  for (const l of LEVELS) {
    if (l.id > level) break
    const override = scenario?.levelOverrides?.[l.id]
    for (const c of override?.adds ?? l.adds) cfg.components[c] = true
    if (l.id === 5) cfg.enabledTools = [...LEVEL5_TOOLS]
    if (l.id === 6) cfg.enabledTools = [...LEVEL6_TOOLS]
    if (l.id === 9) cfg.mcpServers = [SIMULATED_MCP_SERVER]
    if (override?.enabledTools !== undefined) cfg.enabledTools = [...override.enabledTools]
    if (override?.mcpServers !== undefined) cfg.mcpServers = [...override.mcpServers]
  }
  return cfg
}

const LAST_LEVEL: LevelId = 9

/** Last guided level a scenario needs (the whole path when it does not say, or when there is no scenario). */
export function lastLevelOf(scenario?: Pick<Scenario, 'maxLevel'>): LevelId {
  return scenario?.maxLevel ?? LAST_LEVEL
}

/**
 * Resolves the levels shown for a scenario, including its copy and component overrides.
 *
 * @param scenario - Scenario whose guided path should be resolved.
 * @returns The visible levels up to the scenario's maximum level.
 */
export function levelsFor(scenario?: Pick<Scenario, 'maxLevel' | 'levelOverrides'>): LevelDef[] {
  const last = lastLevelOf(scenario)
  return LEVELS.filter(l => l.id <= last).map(level => levelFor(scenario, level.id))
}

/**
 * Resolves a shared guided level with a scenario's copy and component additions.
 *
 * @param scenario - Scenario-specific overrides, if any.
 * @param id - Numeric guided-level identifier.
 * @returns The resolved level definition.
 * @throws If `id` does not identify a shared guided level.
 */
export function levelFor(
  scenario: Pick<Scenario, 'levelOverrides'> | undefined,
  id: LevelId,
): LevelDef {
  const level = LEVELS.find(item => item.id === id)
  if (!level) throw new Error(`Livello non disponibile: ${id}`)
  const override = scenario?.levelOverrides?.[id]
  return {
    ...level,
    ...override?.copy,
    adds: override?.adds ?? level.adds,
  }
}

/**
 * Checks whether any level through `through` changes the scenario's guided configuration.
 *
 * @param scenario - Scenario-specific overrides to inspect.
 * @param through - Highest level included in the check.
 * @returns Whether a component, built-in tool, or MCP server override applies.
 */
export function hasScenarioConfigOverrides(
  scenario: Pick<Scenario, 'levelOverrides'>,
  through: LevelId,
): boolean {
  return LEVELS.some((level) => {
    if (level.id > through) return false
    const override = scenario.levelOverrides?.[level.id]
    return override?.adds !== undefined || override?.enabledTools !== undefined || override?.mcpServers !== undefined
  })
}

/**
 * Checks whether a scenario defines an exact built-in tool set through `through`.
 *
 * @param scenario - Scenario-specific overrides to inspect.
 * @param through - Highest level included in the check.
 * @returns Whether an exact tool-set override applies.
 */
export function hasScenarioToolOverrides(
  scenario: Pick<Scenario, 'levelOverrides'>,
  through: LevelId,
): boolean {
  return LEVELS.some((level) => {
    if (level.id > through) return false
    return scenario.levelOverrides?.[level.id]?.enabledTools !== undefined
  })
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
