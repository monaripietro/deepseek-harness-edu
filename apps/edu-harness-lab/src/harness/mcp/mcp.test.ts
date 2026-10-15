import { describe, expect, it, vi } from 'vitest'
import { NO_FAULTS } from '../../domain/types'
import type { FaultInjection } from '../../domain/types'
import { SCENARIO_DATA } from '../../scenarios'
import { createEventBus } from '../events'
import { MCP_SERVERS, isAllowedUrl } from './allowlist'
import { createMcpHub } from './hub'
import { createSimulatedMcpTransport } from './simulatedServer'

function mkHub(faults: Partial<FaultInjection> = {}, fetchImpl?: typeof fetch) {
  const f = { ...NO_FAULTS, ...faults }
  return createMcpHub({ bus: createEventBus(), data: () => SCENARIO_DATA, faults: () => f, simulatedLatencyMs: [0, 0], fetchImpl })
}
const sig = () => new AbortController().signal
function state(hub: ReturnType<typeof mkHub>, id: string) {
  const found = hub.servers().find(s => s.server.id === id)
  if (!found) throw new Error(`server ${id} not found`)
  return found
}
function at<T>(items: readonly T[], i: number): T {
  const item = items[i]
  if (item === undefined) throw new Error(`missing item ${i}`)
  return item
}

describe('simulated MCP server via hub', () => {
  it('connects techsupply and lists its tools', async () => {
    const hub = mkHub()
    await hub.connect('techsupply')
    const s = state(hub, 'techsupply')
    expect(s.state).toBe('connected')
    expect(s.tools.map(t => t.name)).toEqual(['verifica_consegna', 'listino'])
    expect(s.protocolVersion).toBe('2025-06-18')
  })

  it('callTool returns the delivery date for NB-V14P', async () => {
    const hub = mkHub()
    await hub.connect('techsupply')
    const r = await hub.callTool('techsupply', 'verifica_consegna', { codice: 'NB-V14P', quantita: 4, cap: '40128' }, sig())
    expect(r.isError).toBe(false)
    expect(r.text).toContain('28/10/2026')
    expect(r.text).toContain('Bologna')
    const bad = await hub.callTool('techsupply', 'verifica_consegna', { codice: 'ZZ', quantita: 1, cap: '40128' }, sig())
    expect(bad.isError).toBe(true)
    const lst = await hub.callTool('techsupply', 'listino', { codice: 'NB-V14P' }, sig())
    expect(lst.text).toContain('1.219,00')
  })

  it('wire log contains initialize, tools/list and tools/call', async () => {
    const hub = mkHub()
    await hub.connect('techsupply')
    await hub.callTool('techsupply', 'listino', { codice: 'NB-B14' }, sig())
    const methods = state(hub, 'techsupply').wire.map(w => w.msg.method).filter(Boolean)
    expect(methods).toEqual(['initialize', 'notifications/initialized', 'tools/list', 'tools/call'])
    const dirs = state(hub, 'techsupply').wire.map(w => w.dir)
    expect(dirs).toContain('in')
    expect(dirs).toContain('out')
  })

  it('faults.mcpDown puts the server in error state', async () => {
    const hub = mkHub({ mcpDown: true })
    await hub.connect('techsupply')
    const s = state(hub, 'techsupply')
    expect(s.state).toBe('error')
    expect(s.error).toMatch(/non raggiungibile/)
    expect(hub.toolDefinitions()).toEqual([])
  })

  it('toolDefinitions exposes mcp__techsupply__* names and they execute', async () => {
    const hub = mkHub()
    await hub.connect('techsupply')
    const defs = hub.toolDefinitions()
    expect(defs.map(d => d.id)).toEqual(['mcp__techsupply__verifica_consegna', 'mcp__techsupply__listino'])
    const def = at(defs, 0)
    expect(def.source).toBe('mcp')
    expect(def.mcpServer).toBe('techsupply')
    const out = await def.execute(
      { codice: 'NB-V14P', quantita: 4, cap: '40128' },
      { signal: sig(), data: SCENARIO_DATA, faults: NO_FAULTS, mcp: hub, retriever: {} as never },
    )
    expect(out).toMatchObject({ ok: true })
    const empty = await def.execute(
      { codice: 'ZZ', quantita: 1, cap: '40128' },
      { signal: sig(), data: SCENARIO_DATA, faults: NO_FAULTS, mcp: hub, retriever: {} as never },
    )
    expect(empty).toMatchObject({ ok: false, code: 'EMPTY' })
  })

  it('callTool on a disconnected server throws; disconnect clears tools; subscribers are notified', async () => {
    const hub = mkHub()
    await expect(hub.callTool('techsupply', 'listino', {}, sig())).rejects.toThrow(/non è connesso/)
    await expect(hub.connect('nope')).rejects.toThrow()
    const cb = vi.fn()
    const off = hub.subscribe(cb)
    await hub.connect('techsupply')
    expect(cb).toHaveBeenCalled()
    await hub.disconnect('techsupply')
    expect(state(hub, 'techsupply')).toMatchObject({ state: 'disconnected', tools: [] })
    off()
  })

  it('transport requires initialize before tools/list and handles unknown methods', async () => {
    const t = createSimulatedMcpTransport({ data: () => SCENARIO_DATA, faults: () => NO_FAULTS, latencyMs: [0, 0] })
    const r1 = await t.send({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
    expect(r1?.error?.code).toBe(-32002)
    await t.send({ jsonrpc: '2.0', id: 2, method: 'initialize' })
    expect((await t.send({ jsonrpc: '2.0', id: 3, method: 'foo' }))?.error?.code).toBe(-32601)
    expect(await t.send({ jsonrpc: '2.0', method: 'notifications/initialized' })).toBeNull()
  })
})

describe('allowlist and real HTTP transport', () => {
  it('real servers are only mslearn and deepwiki', () => {
    expect(MCP_SERVERS.filter(s => s.kind === 'real').map(s => s.id).sort()).toEqual(['deepwiki', 'mslearn'])
    expect(MCP_SERVERS.map(s => s.id)).toContain('techsupply')
    expect(isAllowedUrl('https://learn.microsoft.com/api/mcp')).toBe(true)
    expect(isAllowedUrl('https://mcp.deepwiki.com/mcp')).toBe(true)
    expect(isAllowedUrl('https://evil.example.com/mcp')).toBe(false)
    expect(isAllowedUrl('http://localhost:3000/mcp')).toBe(false)
    expect(isAllowedUrl('https://learn.microsoft.com/api/mcp/extra')).toBe(false)
  })

  it('connects over fetch POST with credentials omit, session and protocol headers', async () => {
    const calls: { url: string; init: RequestInit }[] = []
    const init = { jsonrpc: '2.0', id: 1, result: { protocolVersion: '2025-06-18', capabilities: {}, serverInfo: { name: 'Real', version: '1' } } }
    const list = { jsonrpc: '2.0', id: 2, result: { tools: [{ name: 'search', description: 'cerca', inputSchema: { type: 'object' } }] } }
    const fetchMock = vi.fn(async (url: string | URL | Request, reqInit?: RequestInit) => {
      calls.push({ url: String(url), init: reqInit ?? {} })
      const body = JSON.parse(String(reqInit?.body)) as { id?: number; method: string }
      if (body.method === 'initialize') {
        return new Response(`event: message\ndata: ${JSON.stringify(init)}\n\n`, {
          status: 200,
          headers: { 'content-type': 'text/event-stream', 'mcp-session-id': 'sess-123' },
        })
      }
      if (body.id === undefined) return new Response(null, { status: 202 })
      return new Response(JSON.stringify(list), { status: 200, headers: { 'content-type': 'application/json' } })
    })
    const hub = mkHub({}, fetchMock as unknown as typeof fetch)
    await hub.connect('mslearn')
    const s = state(hub, 'mslearn')
    expect(s.state).toBe('connected')
    expect(s.tools.map(t => t.name)).toEqual(['search'])
    expect(s.serverInfo?.name).toBe('Real')

    expect(calls).toHaveLength(3)
    const headersOf = (i: number) => at(calls, i).init.headers as Record<string, string>
    for (const c of calls) {
      expect(c.init.method).toBe('POST')
      expect(c.init.credentials).toBe('omit')
      expect(isAllowedUrl(c.url)).toBe(true)
      expect(c.url).toBe('https://learn.microsoft.com/api/mcp')
    }
    // first request: no session yet
    expect(headersOf(0)['Mcp-Session-Id']).toBeUndefined()
    // subsequent requests carry the session id and negotiated protocol version
    expect(headersOf(1)['Mcp-Session-Id']).toBe('sess-123')
    expect(headersOf(1)['MCP-Protocol-Version']).toBe('2025-06-18')
    expect(headersOf(2)['Mcp-Session-Id']).toBe('sess-123')
    expect(headersOf(2)['MCP-Protocol-Version']).toBe('2025-06-18')

    // real tools require approval and are tagged as external
    const def = at(hub.toolDefinitions(), 0)
    expect(def.id).toBe('mcp__mslearn__search')
    expect(def.approval).toBe('always')
    expect(def.provenance.locality).toBe('external')

    await hub.disconnect('mslearn')
    // disconnect never sends anything (no DELETE)
    expect(calls).toHaveLength(3)
  })

  it('a network failure leads to an error state, and only allowlisted URLs are used', async () => {
    const urls: string[] = []
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      urls.push(String(url))
      throw new TypeError('Failed to fetch')
    })
    const hub = mkHub({}, fetchMock as unknown as typeof fetch)
    await hub.connect('deepwiki')
    expect(state(hub, 'deepwiki').state).toBe('error')
    expect(state(hub, 'deepwiki').error).toMatch(/CORS|rete/)
    expect(urls).toEqual(['https://mcp.deepwiki.com/mcp'])
    expect(urls.every(isAllowedUrl)).toBe(true)
  })

  it('does not hit the network for the simulated server', async () => {
    const fetchMock = vi.fn()
    const hub = mkHub({}, fetchMock as unknown as typeof fetch)
    await hub.connect('techsupply')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
