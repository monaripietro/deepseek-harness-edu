import { create } from 'zustand'
import type {
  ApprovalOutcome,
  ApprovalRequest,
  ApprovalService,
  CapabilityReport,
  ChatMessage,
  ComponentId,
  CustomToolSpec,
  FaultInjection,
  HarnessConfig,
  LevelId,
  LoadProgress,
  ModelInfo,
  ModelProfileId,
  ModelRuntime,
  ProvenanceTag,
  RunRecord,
  Scenario,
  TraceEvent,
  PromptLanguage,
  ThinkingEffort,
} from '../domain/types'
import { NO_FAULTS } from '../domain/types'
import { createEventBus, createPacer, newId } from '../harness/events'
import {
  COMPONENT_ORDER,
  EXPERIMENT,
  LEVELS,
  baseConfig,
  clampLevel,
  configForLevel,
  configKeyOf,
  describeConfig,
  lastLevelOf,
} from '../harness/levels'
import { runTurn } from '../harness/orchestrator/orchestrator'
import { createToolRegistry } from '../harness/tools/registry'
import { BUILTIN_TOOLS } from '../harness/tools/builtin'
import { toolFromSpec } from '../harness/tools/custom'
import { createMemoryStore } from '../harness/memory/memoryStore'
import { createRetriever } from '../harness/rag/retriever'
import { createMcpHub } from '../harness/mcp/hub'
import { DEFAULT_SCENARIO_ID, SCENARIO_DATA, getScenario, scenarioDataFor } from '../scenarios'
import { createTransformersRuntime } from '../runtime/model/transformersRuntime'
import { NOT_LOADED_INFO, PROFILE_LIST, PROFILES, resolveVariant } from '../runtime/model/profiles'
import type { RealProfileId } from '../runtime/model/profiles'
import { cachedBytes, deleteCachedRepo, forgetLastModel, isVariantCached, lastModel, lastRemoteModel, rememberLastModel, rememberRemoteModel, requestPersistentStorage } from '../runtime/model/modelCache'
import { createOpenRouterRuntime } from '../runtime/model/openrouter'
import type { RemoteModel } from '../runtime/model/openrouter'
import { forgetApiKey, hasRememberedApiKey, loadApiKey, maskKey, saveApiKey } from '../runtime/model/secretStore'

const PROMPT_LANGUAGE_KEY = 'harness-lab:prompt-language'
function savedPromptLanguage(): PromptLanguage {
  try {
    return localStorage.getItem(PROMPT_LANGUAGE_KEY) === 'en' ? 'en' : 'it'
  } catch {
    return 'it'
  }
}

const THINKING_KEY = 'harness-lab:thinking'
function savedThinking(): ThinkingEffort {
  try {
    const v = localStorage.getItem(THINKING_KEY)
    return v === 'low' || v === 'medium' || v === 'high' ? v : 'off'
  } catch {
    return 'off'
  }
}
import { detectCapabilities } from '../runtime/model/capabilities'
import { wipeAllLocalData } from '../persistence/db'

// ───────────────────────── Long-lived services (outside React state) ─────────────────────────

export const bus = createEventBus()
export const registry = createToolRegistry()
for (const t of BUILTIN_TOOLS) registry.register(t)
export const retriever = createRetriever(SCENARIO_DATA.documents)
export const memory = createMemoryStore(SCENARIO_DATA.memorySeeds)

let faultsRef: FaultInjection = NO_FAULTS
export const mcpHub = createMcpHub({ bus, data: () => scenarioDataFor(useLab.getState().promptLanguage), faults: () => faultsRef })

let liveRuntime: ModelRuntime | null = null
let abortCtl: AbortController | null = null
const customToolDisposers = new Map<string, () => void>()

function currentScenario(): Scenario {
  return getScenario(useLab.getState().scenarioId)
}

function withScenarioDefaults(config: HarnessConfig, scenario: Scenario): HarnessConfig {
  return scenario.reflectionPrompt
    ? { ...config, components: { ...config.components, tools: false, approval: false, mcp: false }, enabledTools: [], mcpServers: [] }
    : config
}

const pacer = createPacer(() => {
  const s = useLab.getState()
  return { speed: s.fastForward ? 0 : s.speed, paused: s.paused, stepMode: s.stepMode }
})

// ───────────────────────── State ─────────────────────────

export type View = 'guided' | 'lab' | 'compare'
export type SidePanel = 'chat' | 'context' | 'trace'
export type LabId = 'tools' | 'rag' | 'mcp' | 'memory'
export type Theme = 'light' | 'dark' | 'aula'
export type RunStatus = 'idle' | 'running' | 'awaitingApproval' | 'done' | 'stopped' | 'error'

export interface ChatEntry {
  id: string
  role: 'user' | 'assistant' | 'note'
  text: string
  runId?: string
  configLabel?: string
  provenance?: ProvenanceTag
  stopReason?: RunRecord['stopReason']
  streaming?: boolean
  /** Reasoning text of each model call of the run (thinking models only), shown when expanded. */
  reasoning?: string[]
}

export interface ComparisonRow {
  key: string
  label: string
  short: string
  record?: RunRecord
  status: 'pending' | 'running' | 'done' | 'error'
  error?: string
}

export interface LabState {
  // navigation & presentation
  view: View
  panel: SidePanel
  lab: LabId | null
  teacherOpen: boolean
  theme: Theme
  presentation: boolean
  welcomeDone: boolean

  // harness
  level: LevelId
  config: HarnessConfig
  scenarioId: string
  customTools: CustomToolSpec[]

  // model (always a real model: nothing runs until it is loaded)
  profile: ModelProfileId | null
  /** Set when the user tries to run before the model is ready: the UI opens the model setup. */
  needsModel: boolean
  capabilities: CapabilityReport | null
  loadProgress: LoadProgress
  modelInfo: ModelInfo

  // run
  status: RunStatus
  currentRunId: string | null
  events: TraceEvent[]
  chat: ChatEntry[]
  history: ChatMessage[]
  runs: RunRecord[]
  pendingApproval: (ApprovalRequest & { resolve: (o: ApprovalOutcome) => void }) | null
  streamingText: string
  /**
   * What the model is doing now, before any visible text: reading the context or reasoning
   * (token count, 0 = unknown). Never the reasoning text.
   */
  modelActivity: { kind: 'reading' | 'thinking'; since: number; tokens: number } | null
  /** Reasoning text of the current model call, and of the finished calls of the last run. */
  reasoningText: string
  runReasoning: string[]

  // playback / teacher
  speed: number
  paused: boolean
  stepMode: boolean
  fastForward: boolean
  faults: FaultInjection

  // comparison
  comparison: ComparisonRow[]
  comparing: boolean

  // actions
  setView: (v: View) => void
  setPanel: (p: SidePanel) => void
  openLab: (l: LabId | null) => void
  setTeacherOpen: (o: boolean) => void
  setTheme: (t: Theme) => void
  setPresentation: (p: boolean) => void
  finishWelcome: () => void

  setLevel: (l: LevelId) => void
  nextLevel: () => void
  prevLevel: () => void
  toggleComponent: (c: ComponentId) => void
  updateConfig: (patch: Partial<HarnessConfig>) => void
  setScenario: (id: string) => void
  addCustomTool: (spec: CustomToolSpec) => void
  removeCustomTool: (id: string) => void

  detect: () => Promise<void>
  loadModel: (p: RealProfileId, opts?: { cacheOnly?: boolean }) => Promise<void>
  /** Language of what the model reads and answers (scenario texts, data, tool results). The UI stays Italian. */
  promptLanguage: PromptLanguage
  setPromptLanguage: (l: PromptLanguage) => void
  /** Reasoning effort for models that can think (local Qwen3/Gemma 4, OpenRouter reasoning models). */
  thinking: ThinkingEffort
  setThinking: (e: ThinkingEffort) => void
  /** OpenRouter key status (never the key itself). */
  openRouterKey: { present: boolean; remembered: boolean; masked: string | null }
  refreshOpenRouterKey: () => Promise<void>
  saveOpenRouterKey: (key: string, remember: boolean) => Promise<void>
  forgetOpenRouterKey: () => Promise<void>
  remoteModel: RemoteModel | null
  useOpenRouterModel: (m: RemoteModel, opts?: { silent?: boolean }) => Promise<void>
  /** Models whose files are already in the browser cache, with the bytes they use. */
  cachedModels: Partial<Record<RealProfileId, number>>
  refreshModelCache: () => Promise<void>
  /** Restart the model used last time, only if it is fully cached (no download). */
  resumeLastModel: () => Promise<boolean>
  deleteCachedModel: (p: RealProfileId) => Promise<void>
  dismissNeedsModel: () => void

  send: (input?: string) => Promise<RunRecord | null>
  stop: () => void
  decideApproval: (o: ApprovalOutcome) => void
  resetConversation: () => void

  setSpeed: (s: number) => void
  togglePause: () => void
  setStepMode: (on: boolean) => void
  step: () => void
  setFaults: (f: Partial<FaultInjection>) => void

  runExperiment: () => Promise<void>
  wipeData: () => Promise<void>
}

const initialConfig = configForLevel(0)

/** Components that require other components to make sense. */
function normalizeComponents(cfg: HarnessConfig, changed: ComponentId, on: boolean, reflection = false): HarnessConfig {
  const c = { ...cfg.components, [changed]: on, model: true }
  if (on) {
    if (changed === 'tools' || changed === 'agentLoop' || changed === 'controls' || changed === 'approval' || changed === 'mcp') c.orchestrator = true
    if ((changed === 'agentLoop' && !reflection) || changed === 'approval' || changed === 'mcp') c.tools = true
  } else {
    if (changed === 'orchestrator') { c.tools = false; c.agentLoop = false; c.controls = false; c.approval = false; c.mcp = false }
    if (changed === 'tools') { if (!reflection) c.agentLoop = false; c.approval = false; c.mcp = false }
  }
  const next: HarnessConfig = { ...cfg, components: c }
  if (c.tools && next.enabledTools.length === 0) next.enabledTools = ['calcolatrice']
  if (!c.tools) next.enabledTools = []
  if (c.mcp && next.mcpServers.length === 0) next.mcpServers = ['techsupply']
  if (!c.mcp) next.mcpServers = []
  return next
}

function emitComponentDiff(prev: HarnessConfig, next: HarnessConfig) {
  for (const c of COMPONENT_ORDER) {
    if (prev.components[c] !== next.components[c]) {
      bus.emit('harness', { type: next.components[c] ? 'harness/plugin-mounted' : 'harness/plugin-unmounted', component: c }, { source: c })
    }
  }
}

/** The loaded real model, or null (then the UI asks to load it first). */
function activeRuntime(): ModelRuntime | null {
  return liveRuntime?.isReady() ? liveRuntime : null
}

const approvalsFor = (auto: boolean): ApprovalService => ({
  request(req, signal) {
    return new Promise<ApprovalOutcome>((resolve) => {
      if (auto) {
        setTimeout(() =>{  resolve('allowed-once') }, 600)
        return
      }
      const onAbort = () => {
        useLab.setState({ pendingApproval: null, status: 'running' })
        resolve('cancelled')
      }
      signal.addEventListener('abort', onAbort, { once: true })
      useLab.setState({
        status: 'awaitingApproval',
        pendingApproval: {
          ...req,
          resolve: (o) => {
            signal.removeEventListener('abort', onAbort)
            useLab.setState({ pendingApproval: null, status: 'running' })
            resolve(o)
          },
        },
      })
    })
  },
})

export const useLab = create<LabState>()((set, get) => ({
  view: 'guided',
  panel: 'chat',
  lab: null,
  teacherOpen: false,
  theme: 'light',
  presentation: false,
  welcomeDone: false,

  level: 0,
  config: initialConfig,
  scenarioId: DEFAULT_SCENARIO_ID,
  customTools: [],

  profile: null,
  needsModel: false,
  capabilities: null,
  cachedModels: {},
  promptLanguage: savedPromptLanguage(),
  thinking: savedThinking(),
  openRouterKey: { present: hasRememberedApiKey(), remembered: hasRememberedApiKey(), masked: null },
  remoteModel: null,
  loadProgress: { phase: 'idle', loadedBytes: 0, totalBytes: 0 },
  modelInfo: NOT_LOADED_INFO,

  status: 'idle',
  currentRunId: null,
  events: [],
  chat: [],
  history: [],
  runs: [],
  pendingApproval: null,
  streamingText: '',
  modelActivity: null,
  reasoningText: '',
  runReasoning: [],

  speed: 1,
  paused: false,
  stepMode: false,
  fastForward: false,
  faults: NO_FAULTS,

  comparison: [],
  comparing: false,

  setView: (view) =>{  set({ view }) },
  setPanel: (panel) =>{  set({ panel }) },
  openLab: (lab) =>{  set({ lab }) },
  setTeacherOpen: (teacherOpen) =>{  set({ teacherOpen }) },
  setTheme: (theme) =>{  set({ theme }) },
  setPresentation: (presentation) =>{  set({ presentation }) },
  finishWelcome: () =>{  set({ welcomeDone: true }) },

  setLevel(requested) {
    const scenario = currentScenario()
    // The guided path of a scenario stops at its last useful level.
    const level = clampLevel(requested, scenario)
    const prev = get().config
    const next = configForLevel(level, prev)
    next.enabledTools = [...next.enabledTools, ...(level >= 6 ? get().customTools.map(t => t.id) : [])]
    const configured = withScenarioDefaults(next, scenario)
    emitComponentDiff(prev, configured)
    set({ level, config: configured })
  },
  nextLevel() {
    const l = get().level
    if (l < lastLevelOf(currentScenario())) get().setLevel((l + 1) as LevelId)
  },
  prevLevel() {
    const l = get().level
    if (l > 0) get().setLevel((l - 1) as LevelId)
  },
  toggleComponent(c) {
    if (c === 'model') return
    const prev = get().config
    const next = normalizeComponents(prev, c, !prev.components[c], !!currentScenario().reflectionPrompt)
    emitComponentDiff(prev, next)
    set({ config: next })
  },
  updateConfig(patch) {
    set({ config: { ...get().config, ...patch } })
  },
  setScenario(scenarioId) {
    const scenario = getScenario(scenarioId)
    const s = get()
    if (s.scenarioId === scenarioId) return
    const previous = currentScenario()
    const faults = scenario.faults ?? (previous.faults ? NO_FAULTS : s.faults)
    // Past the new scenario's last useful level the guided path steps back to it; the free laboratory keeps its configuration.
    const level = clampLevel(s.level, scenario)
    const clampedGuided = level !== s.level && s.view === 'guided'
    if (!previous.reflectionPrompt && !scenario.reflectionPrompt && !clampedGuided) {
      set({ scenarioId, level, history: [], faults })
      return
    }
    const defaults = configForLevel(level, s.config)
    defaults.enabledTools = [...defaults.enabledTools, ...(level >= 6 ? s.customTools.map(t => t.id) : [])]
    const config = withScenarioDefaults(defaults, scenario)
    emitComponentDiff(s.config, config)
    set({ scenarioId, level, config, history: [], faults })
  },
  addCustomTool(spec) {
    customToolDisposers.get(spec.id)?.()
    customToolDisposers.set(spec.id, registry.register(toolFromSpec(spec)))
    const cfg = get().config
    set({
      customTools: [...get().customTools.filter(t => t.id !== spec.id), spec],
      config: cfg.components.tools && !cfg.enabledTools.includes(spec.id) ? { ...cfg, enabledTools: [...cfg.enabledTools, spec.id] } : cfg,
    })
  },
  removeCustomTool(id) {
    customToolDisposers.get(id)?.()
    customToolDisposers.delete(id)
    const cfg = get().config
    set({
      customTools: get().customTools.filter(t => t.id !== id),
      config: { ...cfg, enabledTools: cfg.enabledTools.filter(t => t !== id) },
    })
  },

  async detect() {
    const capabilities = await detectCapabilities()
    set({ capabilities })
  },
  dismissNeedsModel() {
    set({ needsModel: false })
  },
  async loadModel(profile, opts) {
    if (liveRuntime && liveRuntime.info.profile !== profile) {
      // Switching (also from the cloud model): the old one stops being "in use" right away.
      await liveRuntime.unload()
      set({ modelInfo: NOT_LOADED_INFO })
    }
    if (!liveRuntime || liveRuntime.info.profile !== profile) {
      liveRuntime = createTransformersRuntime(profile, { thinking: () => get().thinking })
    }
    const rt = liveRuntime
    let source: 'cache' | 'network' = opts?.cacheOnly || get().cachedModels[profile] ? 'cache' : 'network'
    set({ profile, loadProgress: { phase: 'checking', loadedBytes: 0, totalBytes: rt.info.sizeBytes ?? 0, source } })
    try {
      // Already on disk: read it from there only (no network round trips, much faster);
      // if a file is missing after all, fall back to a normal download.
      if (source === 'cache' && !opts?.cacheOnly) {
        try {
          await rt.load((p) =>{  set({ loadProgress: { ...p, source: 'cache' } }) }, undefined, { cacheOnly: true })
        } catch {
          source = 'network'
        }
      }
      if (!rt.isReady()) await rt.load((p) =>{  set({ loadProgress: { ...p, source } }) }, undefined, opts)
      set({ modelInfo: rt.info, needsModel: false, loadProgress: { phase: 'ready', loadedBytes: 1, totalBytes: 1, source } })
      rememberLastModel(profile)
      // Keep the downloaded weights: ask the browser not to evict them, then update what is on disk.
      if (source === 'network') void requestPersistentStorage()
      void get().refreshModelCache()
    } catch (err) {
      if (opts?.cacheOnly) {
        // Silent restart failed (e.g. files evicted): back to the normal "load a model" flow.
        set({ loadProgress: { phase: 'idle', loadedBytes: 0, totalBytes: 0 } })
        return
      }
      set({ loadProgress: { phase: 'error', loadedBytes: 0, totalBytes: 0, message: err instanceof Error ? err.message : String(err) } })
    }
  },
  async refreshModelCache() {
    const caps = get().capabilities ?? (await detectCapabilities())
    if (!get().capabilities) set({ capabilities: caps })
    const next: Partial<Record<RealProfileId, number>> = {}
    for (const p of PROFILE_LIST) {
      const variant = resolveVariant(p, caps.webgpu, caps.shaderF16)
      if (variant && (await isVariantCached(p.repo, variant.dtype))) next[p.id] = await cachedBytes(p.repo)
    }
    set({ cachedModels: next })
  },
  setPromptLanguage(promptLanguage) {
    set({ promptLanguage, history: [] })
    try {
      localStorage.setItem(PROMPT_LANGUAGE_KEY, promptLanguage)
    } catch {
      /* storage unavailable */
    }
  },
  setThinking(thinking) {
    set({ thinking })
    try {
      localStorage.setItem(THINKING_KEY, thinking)
    } catch {
      /* storage unavailable */
    }
  },
  async refreshOpenRouterKey() {
    const key = await loadApiKey()
    set({ openRouterKey: { present: !!key, remembered: hasRememberedApiKey(), masked: key ? maskKey(key) : null } })
  },
  async saveOpenRouterKey(key, remember) {
    await saveApiKey(key, remember)
    await get().refreshOpenRouterKey()
  },
  async forgetOpenRouterKey() {
    await forgetApiKey()
    if (liveRuntime?.info.profile === 'openrouter') {
      await liveRuntime.unload()
      liveRuntime = null
      set({ modelInfo: NOT_LOADED_INFO, profile: null, loadProgress: { phase: 'idle', loadedBytes: 0, totalBytes: 0 } })
    }
    await get().refreshOpenRouterKey()
  },
  async useOpenRouterModel(model, opts) {
    // Free the local model (GPU/CPU memory): the remote one runs elsewhere.
    if (liveRuntime) await liveRuntime.unload()
    liveRuntime = createOpenRouterRuntime({ model, apiKey: loadApiKey, thinking: () => get().thinking })
    const rt = liveRuntime
    set({ profile: 'openrouter', remoteModel: model, loadProgress: { phase: 'checking', loadedBytes: 0, totalBytes: 0, source: 'network' } })
    try {
      await rt.load((p) =>{  set({ loadProgress: p }) })
      set({ modelInfo: rt.info, needsModel: false, loadProgress: { phase: 'ready', loadedBytes: 1, totalBytes: 1, source: 'network' } })
      rememberLastModel('openrouter')
      rememberRemoteModel(model)
    } catch (err) {
      liveRuntime = null
      set({
        modelInfo: NOT_LOADED_INFO,
        loadProgress: opts?.silent
          ? { phase: 'idle', loadedBytes: 0, totalBytes: 0 }
          : { phase: 'error', loadedBytes: 0, totalBytes: 0, message: err instanceof Error ? err.message : String(err) },
      })
    }
  },
  async resumeLastModel() {
    const last = lastModel()
    if (!last || liveRuntime?.isReady()) return false
    const phase = get().loadProgress.phase
    if (phase === 'checking' || phase === 'downloading' || phase === 'initializing') return false
    if (last === 'openrouter') {
      const remote = lastRemoteModel()
      if (!remote || !(await loadApiKey())) return false
      await get().useOpenRouterModel(remote, { silent: true })
      return liveRuntime?.isReady() ?? false
    }
    await get().refreshModelCache()
    if (!get().cachedModels[last]) return false
    await get().loadModel(last, { cacheOnly: true })
    return liveRuntime?.isReady() ?? false
  },
  async deleteCachedModel(profile) {
    await deleteCachedRepo(PROFILES[profile].repo)
    if (lastModel() === profile) forgetLastModel()
    await get().refreshModelCache()
  },

  async send(input) {
    const s = get()
    if (s.status === 'running' || s.status === 'awaitingApproval') return null
    const language = get().promptLanguage
    const scenario = getScenario(get().scenarioId, language)
    const text = (input ?? scenario.request).trim()
    if (!text) return null
    const runtime = activeRuntime()
    if (!runtime) {
      set({ needsModel: true })
      return null
    }
    abortCtl = new AbortController()
    pacer.reset()
    const userEntry: ChatEntry = { id: newId('msg'), role: 'user', text }
    const assistantId = newId('msg')
    set({
      status: 'running',
      chat: [...s.chat, userEntry, { id: assistantId, role: 'assistant', text: '', streaming: true, provenance: runtime.info.provenance }],
      streamingText: '',
      reasoningText: '',
      runReasoning: [],
      panel: s.panel,
    })
    try {
      const record = await runTurn(
        text,
        {
          runtime,
          config: s.config,
          scenario,
          data: scenarioDataFor(language),
          language,
          registry,
          memory,
          retriever,
          approvals: approvalsFor(s.config.autoApprove),
          mcp: mcpHub,
          bus,
          pacer,
          faults: s.faults,
          history: s.config.components.memory ? s.history : [],
          configKey: configKeyOf(s.config),
          configLabel: describeConfig(s.config),
          onToken: (t) =>{  set({ streamingText: get().streamingText + t, modelActivity: null }) },
          onThinking: (tokens, text) => {
            if (tokens === null) return
            const activity = get().modelActivity
            set({
              ...(text !== undefined ? { reasoningText: text } : {}),
              // Once visible text has started the indicator stays off; only the text is updated.
              ...(activity ? { modelActivity: { kind: 'thinking' as const, since: activity.since, tokens } } : {}),
            })
          },
          // Each model call streams on its own: the text shown is always the current call's.
          onModelCall: (active) =>{
            set(
              active
                ? { streamingText: '', reasoningText: '', modelActivity: { kind: 'reading', since: Date.now(), tokens: 0 } }
                : {
                  modelActivity: null,
                  runReasoning: get().reasoningText ? [...get().runReasoning, get().reasoningText] : get().runReasoning,
                  reasoningText: '',
                },
            ) },
        },
        abortCtl.signal,
      )
      set({
        status: record.stopReason === 'user_stop' ? 'stopped' : 'done',
        currentRunId: record.id,
        runs: [...get().runs, record],
        history: [...get().history, { role: 'user', content: text }, { role: 'assistant', content: record.answer }],
        chat: get().chat.map(m =>
          m.id === assistantId
            ? {
              ...m,
              text: record.answer,
              streaming: false,
              runId: record.id,
              configLabel: record.configLabel,
              provenance: record.modelProvenance,
              stopReason: record.stopReason,
              reasoning: get().runReasoning,
            }
            : m,
        ),
        streamingText: '',
      })
      return record
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      set({
        status: 'error',
        chat: get().chat.map(m => (m.id === assistantId ? { ...m, text: `Si è verificato un errore: ${message}`, streaming: false } : m)),
      })
      return null
    } finally {
      abortCtl = null
    }
  },
  stop() {
    abortCtl?.abort()
    pacer.flush()
    const p = get().pendingApproval
    if (p) p.resolve('cancelled')
  },
  decideApproval(o) {
    get().pendingApproval?.resolve(o)
  },
  resetConversation() {
    get().stop()
    bus.clear()
    memory.clear('session')
    set({ chat: [], history: [], events: [], status: 'idle', currentRunId: null, streamingText: '', modelActivity: null, reasoningText: '', runReasoning: [] })
  },

  setSpeed(speed) {
    set({ speed })
    pacer.poke()
  },
  togglePause() {
    set({ paused: !get().paused })
    pacer.poke()
  },
  setStepMode(stepMode) {
    set({ stepMode })
    pacer.poke()
  },
  step() {
    pacer.step()
  },
  setFaults(f) {
    const faults = { ...get().faults, ...f }
    faultsRef = faults
    set({ faults })
  },

  async runExperiment() {
    if (get().comparing) return
    const runtime = activeRuntime()
    if (!runtime) {
      set({ needsModel: true })
      return
    }
    const language = get().promptLanguage
    const scenario = getScenario(get().scenarioId, language)
    const rows: ComparisonRow[] = EXPERIMENT.map(e => ({ key: e.key, label: e.label, short: e.short, status: 'pending' }))
    set({ comparing: true, comparison: rows, fastForward: true })
    const fastPacer = createPacer(() => ({ speed: 0, paused: false, stepMode: false }))
    for (const exp of EXPERIMENT) {
      set({ comparison: get().comparison.map(r => (r.key === exp.key ? { ...r, status: 'running' } : r)) })
      // Each configuration starts from the same state: no session memory carried over between columns.
      memory.clear('session')
      try {
        const record = await runTurn(
          scenario.request,
          {
            runtime,
            config: withScenarioDefaults({ ...exp.config, autoApprove: true }, scenario),
            scenario,
            data: scenarioDataFor(language),
            language,
            registry,
            memory,
            retriever,
            approvals: approvalsFor(true),
            mcp: mcpHub,
            bus,
            pacer: fastPacer,
            faults: get().faults,
            history: [],
            configKey: exp.key,
            configLabel: exp.label,
          },
          new AbortController().signal,
        )
        set({ comparison: get().comparison.map(r => (r.key === exp.key ? { ...r, status: 'done', record } : r)) })
      } catch (err) {
        set({ comparison: get().comparison.map(r => (r.key === exp.key ? { ...r, status: 'error', error: String(err) } : r)) })
      }
    }
    set({ comparing: false, fastForward: false })
  },

  async wipeData() {
    get().resetConversation()
    memory.clear()
    await wipeAllLocalData()
    set({ runs: [], comparison: [], customTools: [], config: baseConfig(), level: 0 })
  },
}))

// Mirror the trace into React state (append-only).
bus.subscribe((e) => {
  useLab.setState({ events: [...bus.events()], currentRunId: e.runId !== 'harness' && e.runId !== 'lab' ? e.runId : useLab.getState().currentRunId })
})

export { LEVELS }
