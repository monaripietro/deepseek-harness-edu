import type {
  Disposer,
  EventBus,
  FaultInjection,
  JsonRpcMessage,
  McpHub,
  McpServerDescriptor,
  McpServerState,
  McpToolDescriptor,
  ScenarioData,
  ToolDefinition,
  ToolOutcome,
} from '../../domain/types'
import { MCP_SERVERS } from './allowlist'
import { createHttpTransport } from './httpClient'
import type { McpTransport } from './simulatedServer'
import { createSimulatedMcpTransport } from './simulatedServer'

export const MCP_RUN_ID = 'mcp'
export const CLIENT_PROTOCOL_VERSION = '2025-06-18'
export const SUPPORTED_PROTOCOL_VERSIONS = ['2024-11-05', '2025-03-26', '2025-06-18', '2025-11-25']
const MAX_WIRE = 300
const MAX_TEXT = 4000

export interface McpHubDeps {
  bus: EventBus
  data: () => ScenarioData
  faults: () => FaultInjection
  /** Test hooks. */
  fetchImpl?: typeof fetch
  simulatedLatencyMs?: [number, number]
}

export function sanitizeId(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9_]/g, '_')
}

/** Plain text only: control characters removed, length capped. */
function toPlainText(s: string): string {
  const clean = s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
  return clean.length > MAX_TEXT ? `${clean.slice(0, MAX_TEXT)}… [testo troncato]` : clean
}

interface InternalServer {
  desc: McpServerDescriptor
  state: McpServerState
  transport: McpTransport | null
  nextId: number
}

export function createMcpHub(deps: McpHubDeps): McpHub {
  const { bus } = deps
  const subs = new Set<() => void>()
  const servers = new Map<string, InternalServer>()
  let snapshot: McpServerState[] = []

  for (const desc of MCP_SERVERS) {
    servers.set(desc.id, {
      desc,
      state: { server: desc, state: 'disconnected', tools: [], wire: [] },
      transport: null,
      nextId: 1,
    })
  }

  const notify = () => {
    snapshot = MCP_SERVERS.map(d => (servers.get(d.id) as InternalServer).state)
    for (const cb of subs) cb()
  }
  notify()

  const patch = (s: InternalServer, p: Partial<McpServerState>) => {
    s.state = { ...s.state, ...p }
    notify()
  }
  const logWire = (s: InternalServer, dir: 'out' | 'in', msg: JsonRpcMessage) => {
    const wire = [...s.state.wire, { dir, at: Date.now(), msg }].slice(-MAX_WIRE)
    patch(s, { wire })
  }
  const emit = (s: InternalServer, body: Parameters<EventBus['emit']>[1]) =>
    bus.emit(MCP_RUN_ID, body, { source: 'mcp', provenance: s.desc.provenance })

  function makeTransport(s: InternalServer): McpTransport {
    if (s.desc.kind === 'simulated') {
      return createSimulatedMcpTransport({ data: deps.data, faults: deps.faults, latencyMs: deps.simulatedLatencyMs })
    }
    return createHttpTransport(s.desc.url as string, deps.fetchImpl)
  }

  /** Send a JSON-RPC request, recording both directions on the wire log. */
  async function rpc(s: InternalServer, method: string, params: unknown, signal?: AbortSignal): Promise<unknown> {
    if (!s.transport) throw new Error('Server MCP non connesso.')
    const id = s.nextId++
    const out: JsonRpcMessage = { jsonrpc: '2.0', id, method, params }
    logWire(s, 'out', out)
    const res = await s.transport.send(out, signal)
    if (!res) throw new Error('Il server MCP non ha restituito alcuna risposta.')
    logWire(s, 'in', res)
    if (res.error) throw new Error(`Errore MCP (${res.error.code}): ${res.error.message}`)
    return res.result
  }

  async function notifyServer(s: InternalServer, method: string, params?: unknown): Promise<void> {
    if (!s.transport) return
    const msg: JsonRpcMessage = { jsonrpc: '2.0', method, ...(params === undefined ? {} : { params }) }
    logWire(s, 'out', msg)
    await s.transport.send(msg)
  }

  async function connect(serverId: string): Promise<void> {
    const s = servers.get(serverId)
    if (!s) throw new Error(`Server MCP sconosciuto: ${serverId}`)
    if (s.state.state === 'connecting' || s.state.state === 'connected') return
    s.transport?.close()
    s.transport = makeTransport(s)
    s.nextId = 1
    patch(s, { state: 'connecting', error: undefined, tools: [], wire: [], protocolVersion: undefined, serverInfo: undefined })
    emit(s, { type: 'mcp/discover', serverId })
    try {
      const init = (await rpc(s, 'initialize', {
        protocolVersion: CLIENT_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: 'harness-lab', version: '0.1.0' },
      })) as { protocolVersion?: string; serverInfo?: { name: string; version?: string } } | undefined
      const negotiated = init?.protocolVersion ?? CLIENT_PROTOCOL_VERSION
      if (!SUPPORTED_PROTOCOL_VERSIONS.includes(negotiated)) {
        throw new Error(`Il server usa una versione del protocollo non supportata (${negotiated}).`)
      }
      s.transport.setProtocolVersion(negotiated)
      await notifyServer(s, 'notifications/initialized')
      patch(s, { protocolVersion: negotiated, serverInfo: init?.serverInfo })
      emit(s, { type: 'mcp/connect', serverId, protocolVersion: negotiated })

      const tools: McpToolDescriptor[] = []
      let cursor: string | undefined
      for (let page = 0; page < 5; page++) {
        const list = (await rpc(s, 'tools/list', cursor ? { cursor } : {})) as
          | { tools?: McpToolDescriptor[]; nextCursor?: string }
          | undefined
        for (const t of list?.tools ?? []) {
          tools.push({
            name: String(t.name),
            title: t.title,
            description: typeof t.description === 'string' ? t.description : '',
            inputSchema: t.inputSchema && typeof t.inputSchema === 'object' ? t.inputSchema : { type: 'object' },
          })
        }
        cursor = list?.nextCursor
        if (!cursor) break
      }
      patch(s, { state: 'connected', tools })
      emit(s, { type: 'mcp/list-tools', serverId, tools: tools.map(t => t.name) })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      s.transport?.close()
      s.transport = null
      patch(s, { state: 'error', error: message, tools: [] })
      emit(s, { type: 'mcp/error', serverId, message })
    }
  }

  async function disconnect(serverId: string): Promise<void> {
    const s = servers.get(serverId)
    if (!s) return
    const wasActive = s.state.state !== 'disconnected'
    s.transport?.close() // forgets the in-memory session; no DELETE is ever sent
    s.transport = null
    patch(s, { state: 'disconnected', tools: [], error: undefined, protocolVersion: undefined, serverInfo: undefined })
    if (wasActive) emit(s, { type: 'mcp/disconnect', serverId })
  }

  async function callTool(
    serverId: string,
    tool: string,
    args: Record<string, unknown>,
    signal: AbortSignal,
  ): Promise<{ text: string; isError: boolean }> {
    const s = servers.get(serverId)
    if (!s) throw new Error(`Server MCP sconosciuto: ${serverId}`)
    if (s.state.state !== 'connected' || !s.transport) throw new Error(`Il server MCP "${s.desc.label}" non è connesso.`)
    emit(s, { type: 'mcp/call', serverId, tool, args })
    try {
      const result = (await rpc(s, 'tools/call', { name: tool, arguments: args }, signal)) as
        | { content?: { type?: string; text?: string }[]; isError?: boolean }
        | undefined
      const text = toPlainText(
        (result?.content ?? [])
          .filter(c => c && c.type === 'text' && typeof c.text === 'string')
          .map(c => c.text as string)
          .join('\n'),
      )
      const isError = result?.isError === true
      emit(s, { type: 'mcp/result', serverId, tool, isError, text })
      return { text, isError }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      emit(s, { type: 'mcp/error', serverId, message })
      throw err instanceof Error ? err : new Error(message)
    }
  }

  function toolDefinitions(): ToolDefinition[] {
    const defs: ToolDefinition[] = []
    for (const s of servers.values()) {
      if (s.state.state !== 'connected') continue
      const simulated = s.desc.kind === 'simulated'
      for (const t of s.state.tools) {
        defs.push({
          id: `mcp__${sanitizeId(s.desc.id)}__${sanitizeId(t.name)}`,
          title: t.title || t.name,
          description: `[MCP ${s.desc.label}] ${t.description}`,
          purpose: `Strumento esposto dal server MCP "${s.desc.label}", scoperto con tools/list.`,
          inputSchema: t.inputSchema,
          output: 'Testo restituito dal server MCP.',
          permissions: ['network:mcp'],
          risk: 'read',
          approval: simulated ? 'never' : 'always',
          provenance: s.desc.provenance,
          errors: [
            { code: 'TOOL_ERROR', message: 'Server MCP non raggiungibile o errore restituito dal server.' },
            ...(simulated ? [{ code: 'EMPTY' as const, message: 'Articolo non trovato.' }] : []),
          ],
          latencyMs: simulated ? [100, 300] : [50, 150],
          source: 'mcp',
          mcpServer: s.desc.id,
          async execute(args, ctx): Promise<ToolOutcome> {
            try {
              const r = await callTool(s.desc.id, t.name, args, ctx.signal)
              if (r.isError) {
                return /non trovat/i.test(r.text)
                  ? { ok: false, code: 'EMPTY', message: r.text }
                  : { ok: false, code: 'TOOL_ERROR', message: r.text || 'Il server MCP ha restituito un errore.' }
              }
              return { ok: true, data: { text: r.text, server: s.desc.id }, summary: r.text || '(risposta vuota)' }
            } catch (err) {
              return { ok: false, code: 'TOOL_ERROR', message: err instanceof Error ? err.message : String(err) }
            }
          },
        })
      }
    }
    return defs
  }

  return {
    servers: () => snapshot,
    connect,
    disconnect,
    callTool,
    toolDefinitions,
    subscribe(cb): Disposer {
      subs.add(cb)
      return () => subs.delete(cb)
    },
  }
}
