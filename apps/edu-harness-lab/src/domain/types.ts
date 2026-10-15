/**
 * Core domain types shared by every module of Harness Lab.
 * Rule: modules may add types locally, but never rename or reshape these.
 */

// ───────────────────────── Provenance ─────────────────────────

/** What kind of output this is: really computed, didactic simulation, recorded earlier, or impossible here. */
export type Provenance = 'real' | 'simulated' | 'prerecorded' | 'unavailable'
/** Where it happens: entirely in the browser, or through a third-party network service. */
export type Locality = 'local' | 'external'

export interface ProvenanceTag {
  provenance: Provenance
  locality: Locality
  note?: string
  recordedAt?: string
}

export const REAL_LOCAL: ProvenanceTag = { provenance: 'real', locality: 'local' }
export const SIMULATED_LOCAL: ProvenanceTag = { provenance: 'simulated', locality: 'local' }
export const REAL_EXTERNAL: ProvenanceTag = { provenance: 'real', locality: 'external' }

// ───────────────────────── Harness components & levels ─────────────────────────

export type ComponentId =
  | 'model'
  | 'instructions'
  | 'context'
  | 'memory'
  | 'rag'
  | 'tools'
  | 'orchestrator'
  | 'agentLoop'
  | 'controls'
  | 'approval'
  | 'mcp'

export type ComponentFamily = 'model' | 'information' | 'action' | 'orchestration' | 'governance'
export type LevelId = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9
export type ModelMode = 'live' | 'replay' | 'simulated'

export interface LoopLimits {
  /** Max model steps in one turn when `controls` is on. */
  maxSteps: number
  stepTimeoutMs: number
  toolTimeoutMs: number
  turnTimeoutMs: number
  /** Consecutive identical (tool, args) calls before an advisory reminder. */
  repeatWarnAt: number
  /** Consecutive identical (tool, args) calls before stopping with `loop_detected`. */
  repeatStopAt: number
  /** Consecutive tool failures before stopping with `tool_failures`. */
  maxToolFailures: number
  /** Repair attempts for an invalid model decision. */
  maxRepairs: number
}

/** Always-on technical safety net used when the `controls` plugin is OFF (declared in the UI). */
/** Without the Controls component nothing limits the loop (steps or time): only the user's Stop button. */
export const SAFETY_NET: Pick<LoopLimits, 'maxSteps' | 'turnTimeoutMs'> = { maxSteps: Number.POSITIVE_INFINITY, turnTimeoutMs: Number.POSITIVE_INFINITY }

export interface RagSettings {
  mode: 'deterministic' | 'vector'
  topK: number
  /** Minimum normalized score (0..1) to keep a chunk. */
  minScore: number
  includeOutdated: boolean
  includeDistractors: boolean
  /** Chunk ids the user forced in / out from the RAG Lab. */
  pinnedChunkIds: string[]
  excludedChunkIds: string[]
}

export interface HarnessConfig {
  components: Record<ComponentId, boolean>
  /** Tool ids exposed to the model (subset of the registry). */
  enabledTools: string[]
  limits: LoopLimits
  rag: RagSettings
  memory: { persistent: boolean }
  /** Ids of connected MCP servers whose tools are exposed (simulated or real allowlisted). */
  mcpServers: string[]
  /** Teacher option: approve automatically (still logged as a human decision by the teacher preset). */
  autoApprove: boolean
}

// ───────────────────────── Context ─────────────────────────

export type ContextKind =
  | 'instruction'
  | 'message'
  | 'memory'
  | 'document'
  | 'toolSchema'
  | 'toolResult'
  | 'state'
  | 'taskData'

export type ExclusionReason =
  | 'budget'
  | 'lowScore'
  | 'disabled'
  | 'userExcluded'
  | 'outdated'
  | 'duplicate'
  | 'notRelevant'

export type ChatRole = 'system' | 'user' | 'assistant' | 'tool'

export interface ChatMessage {
  role: ChatRole
  content: string
  name?: string
  /** Native tool calls made by the assistant (rendered by the model's chat template). */
  tool_calls?: { name: string; arguments: Record<string, unknown> }[]
}

/** Tool description in the Hugging Face / OpenAI format accepted by chat templates. */
export interface ModelToolSpec {
  type: 'function'
  function: { name: string; description: string; parameters: JSONSchema }
}

export interface ContextItem {
  id: string
  kind: ContextKind
  role: ChatRole
  source: ComponentId
  title: string
  text: string
  tokens: number
  priority: number
  pinned?: boolean
  status: 'included' | 'excluded'
  exclusionReason?: ExclusionReason
  provenance: ProvenanceTag
  /** e.g. document id, memory id, tool call id */
  refs?: string[]
}

export interface ContextSnapshot {
  id: string
  stepIndex: number
  items: ContextItem[]
  budget: { maxTokens: number; usedTokens: number }
  /** Logical messages actually sent to the runtime. */
  messages: ChatMessage[]
}

/**
 * Structured facts about what the context contains, derived from the snapshot.
 * Real models ignore them; scripted test doubles use them to imitate a model
 * that can only "see" what the harness put in its context.
 */
export interface ContextHints {
  scenarioId: string
  /** Kinds actually included in the context. */
  presentKinds: ContextKind[]
  /** Tools exposed to the model in this request. */
  availableTools: string[]
  /** Observations already returned to the model in this turn, in order. */
  toolResults: ToolObservation[]
  /** Ids of documents whose chunks are included. */
  docIds: string[]
  /** Keys of memory records included. */
  memoryKeys: string[]
  /** 'json' when the decision protocol is active (tools available), 'text' otherwise. */
  protocol: 'json' | 'text'
  /** True when the harness forbids further tool calls (single round done, or step budget exhausted). */
  mustAnswer: boolean
  /** 0 on the first attempt; >0 when the harness is asking to repair an invalid output. */
  repairAttempt: number
  /** Advisory text injected by the controls (e.g. repeat reminder), if any. */
  guardNotice?: string
  stepIndex: number
}

export interface ToolObservation {
  callId: string
  tool: string
  args: Record<string, unknown>
  outcome: ToolOutcome
}

// ───────────────────────── Model runtime ─────────────────────────

export type ModelProfileId = 'lfm-350m' | 'qwen3-0.6b' | 'lfm-1.2b' | 'gemma4-e2b' | 'openrouter' | 'test-double'

/** How much the model may "think" before answering (only for models that support it; the reasoning is never shown). */
export type ThinkingEffort = 'off' | 'low' | 'medium' | 'high'
export type ModelBackend = 'webgpu' | 'wasm' | 'remote' | 'none'

export interface ModelInfo {
  profile: ModelProfileId
  /** Hugging Face repo id. */
  id: string
  label: string
  backend: ModelBackend
  dtype?: string
  /** Approximate download size in bytes. */
  sizeBytes?: number
  /** Short constant fingerprint shown on the canvas to prove the model never changes. */
  fingerprint: string
  license?: string
  /** The model was trained for tool calling: the harness passes tools to its chat template. */
  nativeTools?: boolean
  /** The model can reason before answering (thinking effort applies). */
  reasoning?: boolean
  provenance: ProvenanceTag
}

export interface LoadProgress {
  phase: 'idle' | 'checking' | 'downloading' | 'initializing' | 'ready' | 'error'
  loadedBytes: number
  totalBytes: number
  file?: string
  message?: string
  /** Where the weights come from: the browser cache (already downloaded) or the network. */
  source?: 'cache' | 'network'
}

export interface ModelRequest {
  messages: ChatMessage[]
  maxNewTokens: number
  hints: ContextHints
  /** Tools passed to the chat template when the model supports native tool calling. */
  tools?: ModelToolSpec[]
  /**
   * Guided call: the runtime writes the opening of a call to this tool (in the model's native format)
   * and the model only completes the argument. Used by the orchestrator when a calculation is needed.
   */
  forceTool?: { name: string; arg: string }
}

export interface ModelResponse {
  text: string
  tokensIn?: number
  tokensOut?: number
  durationMs: number
  finishReason: 'stop' | 'length' | 'aborted' | 'error'
  provenance: ProvenanceTag
}

export interface ModelRuntime {
  readonly info: ModelInfo
  isReady(): boolean
  /** `cacheOnly`: use only files already in the browser cache, never the network. */
  load(onProgress: (p: LoadProgress) => void, signal?: AbortSignal, opts?: { cacheOnly?: boolean }): Promise<void>
  /** `onThinking`: reasoning in progress (token count when known, 0 = unknown) and its text when available. */
  generate(
    req: ModelRequest,
    onToken: (t: string) => void,
    signal: AbortSignal,
    onThinking?: (tokens: number | null, text?: string) => void,
  ): Promise<ModelResponse>
  unload(): Promise<void>
}

export interface CapabilityReport {
  webgpu: boolean
  shaderF16: boolean
  adapterInfo?: { vendor?: string; architecture?: string; description?: string }
  maxBufferSize?: number
  maxStorageBufferBindingSize?: number
  storageQuotaBytes?: number
  storageUsageBytes?: number
  deviceMemoryGb?: number
  browser: string
  /** Recommended profile and the reasons, in plain Italian. */
  recommended: ModelProfileId
  reasons: string[]
}

// ───────────────────────── Decision protocol ─────────────────────────

export type ModelDecision =
  | { type: 'answer'; text: string; sources?: string[] }
  | { type: 'tool'; tool: string; args: Record<string, unknown>; rationale?: string }
  | { type: 'ask'; question: string }

// ───────────────────────── Tools ─────────────────────────

export type JSONSchema = Record<string, unknown>

export type Permission =
  | 'read:policies'
  | 'read:catalog'
  | 'read:inventory'
  | 'read:budget'
  | 'read:customers'
  | 'write:tasks'
  | 'write:requests'
  | 'write:data'
  | 'send:messages'
  | 'use:sensitive'
  | 'network:mcp'

export type ToolRisk = 'read' | 'write' | 'irreversible'
export type ApprovalPolicy = 'never' | 'always'
export type ToolErrorCode =
  | 'INVALID_ARGS'
  | 'NOT_AUTHORIZED'
  | 'TIMEOUT'
  | 'EMPTY'
  | 'TOOL_ERROR'
  | 'DENIED'
  | 'UNKNOWN_TOOL'

export type ToolOutcome =
  | { ok: true; data: unknown; /** Plain-Italian observation returned to the model. */ summary: string }
  | { ok: false; code: ToolErrorCode; message: string }

export interface FaultInjection {
  /** Tool ids that will time out. */
  timeout: string[]
  /** Tool ids that will fail with TOOL_ERROR. */
  error: string[]
  /** Tool ids that will return an empty result. */
  empty: string[]
  /** Corrupt the model's first tool arguments once (teacher fault). */
  invalidArgsOnce: boolean
  /** Simulated MCP server unreachable. */
  mcpDown: boolean
}

export const NO_FAULTS: FaultInjection = { timeout: [], error: [], empty: [], invalidArgsOnce: false, mcpDown: false }

export interface ToolExecContext {
  signal: AbortSignal
  data: ScenarioData
  faults: FaultInjection
  mcp: McpHub
  retriever: Retriever
}

export interface ToolDefinition {
  /** Name seen by the model (Italian snake_case, MCP tools: mcp__<server>__<tool>). */
  id: string
  title: string
  /** Description given to the model. */
  description: string
  /** Plain-language purpose shown to people. */
  purpose: string
  inputSchema: JSONSchema
  /** Plain description of the output. */
  output: string
  permissions: Permission[]
  risk: ToolRisk
  approval: ApprovalPolicy
  provenance: ProvenanceTag
  errors: { code: ToolErrorCode; message: string }[]
  latencyMs: [number, number]
  source: 'builtin' | 'custom' | 'mcp'
  mcpServer?: string
  /** True when the demo user's role lacks the permission (e.g. modifica_dato). */
  forbiddenForRole?: boolean
  execute(args: Record<string, unknown>, ctx: ToolExecContext): Promise<ToolOutcome>
}

/** Declarative tool authored in the Tool Lab: no code, only templates. */
export interface CustomToolSpec {
  id: string
  title: string
  description: string
  purpose: string
  params: { name: string; type: 'string' | 'number' | 'integer' | 'boolean'; description: string; required: boolean }[]
  /** Output template; `{{param}}` placeholders are replaced with argument values. */
  outputTemplate: string
  /** Probability 0..1 of a simulated failure. */
  errorRate: number
  errorMessage: string
  latencyMs: [number, number]
  permissions: Permission[]
  risk: ToolRisk
  approval: ApprovalPolicy
}

export type Disposer = () => void

export interface ToolRegistry {
  list(): ToolDefinition[]
  get(id: string): ToolDefinition | undefined
  register(tool: ToolDefinition): Disposer
}

// ───────────────────────── Approval ─────────────────────────

export type ApprovalOutcome = 'allowed-once' | 'rejected' | 'cancelled'

export interface ApprovalRequest {
  id: string
  callId: string
  toolId: string
  toolTitle: string
  args: Record<string, unknown>
  /** "Motivazione dichiarata" produced by the model as part of its structured output. */
  rationale?: string
  risk: ToolRisk
  /** Expected effects in plain Italian. */
  effects: string
  /** Data used to build the action (sources, tool results). */
  dataUsed: string[]
  provenance: ProvenanceTag
}

export interface ApprovalService {
  request(req: ApprovalRequest, signal: AbortSignal): Promise<ApprovalOutcome>
}

// ───────────────────────── Memory ─────────────────────────

export type MemoryKind = 'preference' | 'fact' | 'taskState' | 'observation'
export type MemoryScope = 'session' | 'persistent'

export interface MemoryRecord {
  id: string
  scope: MemoryScope
  kind: MemoryKind
  key: string
  text: string
  createdAt: string
  source: 'seed' | 'user' | 'tool' | 'model'
}

export interface MemoryStore {
  list(): MemoryRecord[]
  write(rec: Omit<MemoryRecord, 'id' | 'createdAt'>): MemoryRecord
  delete(id: string): void
  clear(scope?: MemoryScope): void
  subscribe(cb: () => void): Disposer
}

// ───────────────────────── Knowledge (RAG) ─────────────────────────

export interface PolicyDoc {
  id: string
  title: string
  version: string
  /** 'valid' current policy, 'outdated' superseded version, 'distractor' irrelevant document. */
  status: 'valid' | 'outdated' | 'distractor'
  category: string
  validFrom?: string
  text: string
  /** True for documents added by the user in the RAG Lab. */
  userAdded?: boolean
}

export interface Chunk {
  id: string
  docId: string
  index: number
  heading: string
  text: string
}

export interface RetrievalHit {
  chunk: Chunk
  doc: PolicyDoc
  /** Raw retriever score. */
  score: number
  /** Score normalized to 0..1 within the query. */
  normalized: number
  status: 'selected' | 'excluded'
  reason?: ExclusionReason
}

export interface Retriever {
  search(query: string, settings: RagSettings): RetrievalHit[]
  addDocument(doc: PolicyDoc): void
  removeDocument(docId: string): void
  documents(): PolicyDoc[]
  chunks(): Chunk[]
}

// ───────────────────────── MCP ─────────────────────────

export interface JsonRpcMessage {
  jsonrpc: '2.0'
  id?: number | string
  method?: string
  params?: unknown
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

export interface McpToolDescriptor {
  name: string
  title?: string
  description: string
  inputSchema: JSONSchema
}

export interface McpServerDescriptor {
  id: string
  label: string
  kind: 'simulated' | 'real'
  url?: string
  description: string
  provenance: ProvenanceTag
}

export type McpConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error'

export interface McpServerState {
  server: McpServerDescriptor
  state: McpConnectionState
  protocolVersion?: string
  serverInfo?: { name: string; version?: string }
  tools: McpToolDescriptor[]
  error?: string
  /** JSON-RPC wire log, newest last. */
  wire: { dir: 'out' | 'in'; at: number; msg: JsonRpcMessage }[]
}

export interface McpHub {
  servers(): McpServerState[]
  connect(serverId: string): Promise<void>
  disconnect(serverId: string): Promise<void>
  callTool(serverId: string, tool: string, args: Record<string, unknown>, signal: AbortSignal): Promise<{ text: string; isError: boolean }>
  /** ToolDefinitions (mcp__<server>__<tool>) for connected servers. */
  toolDefinitions(): ToolDefinition[]
  subscribe(cb: () => void): Disposer
}

// ───────────────────────── Scenarios ─────────────────────────

export interface Product {
  code: string
  name: string
  category: 'A' | 'B' | 'C'
  priceEur: number
  specs: string
}

export interface ScenarioData {
  company: string
  user: { name: string; role: string; costCenter: string; site: string }
  /** Task context pack (level 2). */
  taskData: { id: string; title: string; text: string }[]
  /** Memory seeds (level 3). */
  memorySeeds: Omit<MemoryRecord, 'id' | 'createdAt'>[]
  documents: PolicyDoc[]
  catalog: Product[]
  stock: Record<string, { available: number; deliveryDays: number }>
  budgets: Record<string, { residualEur: number; period: string; owner: string }>
  orders: Record<string, { customer: string; status: string; expected: string; note: string }>
  employees: Record<string, { role: string; site: string; sensitive: string }>
  /** Fixed didactic FX rates, EUR -> currency, with the date they refer to. */
  fx: { date: string; rates: Record<'USD' | 'GBP' | 'CHF', number> }
  /** Simulated MCP supplier delivery estimates by product code. */
  supplierDelivery: Record<string, string>
}

export interface RunCheck {
  id: string
  label: string
  passed: boolean
}

export interface Checker {
  id: string
  label: string
  check(run: RunRecord): boolean
}

export interface Scenario {
  id: string
  title: string
  shortTitle: string
  /** What this scenario teaches, one sentence. */
  lesson: string
  request: string
  /** Level at which the scenario shows its point. */
  showcaseLevel: LevelId
  checkers: Checker[]
}

// ───────────────────────── Runs ─────────────────────────

export type StopReason =
  | 'final_answer'
  | 'needs_user_input'
  | 'max_steps'
  | 'user_stop'
  | 'timeout'
  | 'loop_detected'
  | 'approval_denied'
  | 'unauthorized_tool'
  | 'tool_failures'
  | 'invalid_output'
  | 'model_error'

export interface RunRecord {
  id: string
  scenarioId: string
  configKey: string
  configLabel: string
  input: string
  answer: string
  startedAt: string
  durationMs: number
  steps: number
  toolCalls: { tool: string; args: Record<string, unknown>; ok: boolean; code?: ToolErrorCode }[]
  sourcesUsed: string[]
  memoryUsed: string[]
  errors: string[]
  humanInterventions: number
  /** Simulated actions really "performed" in the simulation, e.g. RDA-SIM-2026-0042. */
  actions: { tool: string; id: string; approved: boolean | null }[]
  stopReason: StopReason
  checks: RunCheck[]
  modelInfo: ModelInfo
  modelProvenance: ProvenanceTag
}

// ───────────────────────── Orchestration ─────────────────────────

export interface Pacer {
  /** Resolves when the UI is ready for the next event (speed, pause, step mode). */
  wait(event: TraceEvent): Promise<void>
}

export interface TurnDeps {
  runtime: ModelRuntime
  config: HarnessConfig
  scenario: Scenario
  data: ScenarioData
  registry: ToolRegistry
  memory: MemoryStore
  retriever: Retriever
  approvals: ApprovalService
  mcp: McpHub
  bus: EventBus
  pacer: Pacer
  faults: FaultInjection
  /** Previous user/assistant turns of this conversation (conversation history). */
  history: ChatMessage[]
  configKey: string
  configLabel: string
  onToken?: (t: string) => void
  onThinking?: (tokens: number | null, text?: string) => void
  /** A model call starts (true) or ends (false). */
  onModelCall?: (active: boolean) => void
}

// ───────────────────────── Trace events ─────────────────────────

export interface TraceEventBase {
  id: string
  seq: number
  at: number
  runId: string
  stepIndex?: number
  source: ComponentId | 'user' | 'ui'
  provenance: ProvenanceTag
}

export type TraceEventBody =
  | { type: 'run/start'; input: string; configKey: string; configLabel: string; scenarioId: string; model: ModelInfo }
  | { type: 'run/end'; record: RunRecord }
  | { type: 'harness/plugin-mounted'; component: ComponentId }
  | { type: 'harness/plugin-unmounted'; component: ComponentId }
  | { type: 'step/start'; stepIndex: number }
  | { type: 'step/end'; stepIndex: number }
  | { type: 'rag/query'; query: string; mode: RagSettings['mode'] }
  | { type: 'rag/results'; hits: { chunkId: string; docId: string; title: string; score: number; normalized: number; status: 'selected' | 'excluded'; reason?: ExclusionReason }[] }
  | { type: 'memory/read'; count: number }
  | { type: 'memory/select'; ids: string[] }
  | { type: 'memory/inject'; ids: string[] }
  | { type: 'memory/ignore'; ids: string[]; reason: string }
  | { type: 'memory/write'; record: MemoryRecord }
  | { type: 'memory/delete'; id: string }
  | { type: 'context/assembled'; snapshot: ContextSnapshot }
  | { type: 'model/request'; tokensIn: number; protocol: 'json' | 'text'; mustAnswer: boolean }
  | { type: 'model/response'; text: string; durationMs: number; finishReason: ModelResponse['finishReason']; tokensOut?: number }
  | { type: 'decision/parsed'; decision: ModelDecision }
  | { type: 'decision/invalid'; raw: string; error: string; attempt: number }
  | { type: 'decision/repair'; attempt: number; instruction: string }
  | { type: 'tool/call'; callId: string; tool: string; args: Record<string, unknown>; rationale?: string }
  | { type: 'tool/validation'; callId: string; tool: string; ok: boolean; errors?: string[] }
  | { type: 'tool/execute'; callId: string; tool: string; viaMcp?: string }
  | { type: 'tool/result'; callId: string; tool: string; outcome: ToolOutcome; durationMs: number }
  | { type: 'tool/error'; callId: string; tool: string; code: ToolErrorCode; message: string }
  | { type: 'approval/asked'; request: ApprovalRequest }
  | { type: 'approval/decided'; requestId: string; outcome: ApprovalOutcome; by: 'human' | 'teacher-auto' }
  | { type: 'mcp/discover'; serverId: string }
  | { type: 'mcp/connect'; serverId: string; protocolVersion?: string }
  | { type: 'mcp/list-tools'; serverId: string; tools: string[] }
  | { type: 'mcp/call'; serverId: string; tool: string; args: Record<string, unknown> }
  | { type: 'mcp/result'; serverId: string; tool: string; isError: boolean; text: string }
  | { type: 'mcp/error'; serverId: string; message: string }
  | { type: 'mcp/disconnect'; serverId: string }
  | { type: 'guard/triggered'; guard: 'repeat' | 'max_steps' | 'timeout' | 'tool_failures' | 'unauthorized' | 'unsupervised_write' | 'safety_net'; message: string }
  | { type: 'answer'; text: string; sources: string[] }
  | { type: 'stop'; reason: StopReason; message: string }

export type TraceEvent = TraceEventBase & TraceEventBody
export type TraceEventType = TraceEventBody['type']

export interface EventBus {
  /** Append the event to the trace and notify subscribers; returns the stored event. */
  emit(runId: string, body: TraceEventBody, meta?: { stepIndex?: number; source?: TraceEventBase['source']; provenance?: ProvenanceTag }): TraceEvent
  subscribe(cb: (e: TraceEvent) => void): Disposer
  events(): readonly TraceEvent[]
  clear(): void
}
