import { describe, expect, it, vi } from 'vitest'
import type { FaultInjection, ToolDefinition, ToolExecContext, ToolOutcome } from '../../domain/types'
import { NO_FAULTS } from '../../domain/types'
import { executeTool } from './executor'

function mkTool(execute: ToolDefinition['execute'], latencyMs: [number, number] = [0, 0]): ToolDefinition {
  return {
    id: 't1',
    title: 'T',
    description: 'd',
    purpose: 'p',
    inputSchema: { type: 'object' },
    output: 'o',
    permissions: [],
    risk: 'read',
    approval: 'never',
    provenance: { provenance: 'simulated', locality: 'local' },
    errors: [],
    latencyMs,
    source: 'builtin',
    execute,
  }
}
function mkCtx(faults: Partial<FaultInjection> = {}, signal: AbortSignal = new AbortController().signal): ToolExecContext {
  return { signal, data: {} as never, faults: { ...NO_FAULTS, ...faults }, mcp: {} as never, retriever: {} as never }
}
const okOutcome: ToolOutcome = { ok: true, data: 1, summary: 'ok' }

describe('executeTool', () => {
  it('returns the tool outcome', async () => {
    const r = await executeTool(mkTool(() => Promise.resolve(okOutcome)), {}, mkCtx(), 500)
    expect(r).toEqual(okOutcome)
  })
  it('timeout fault yields TIMEOUT without calling execute', async () => {
    const exec = vi.fn(() => Promise.resolve(okOutcome))
    const r = await executeTool(mkTool(exec), {}, mkCtx({ timeout: ['t1'] }), 20)
    expect(r).toMatchObject({ ok: false, code: 'TIMEOUT' })
    expect(exec).not.toHaveBeenCalled()
  })
  it('error fault yields TOOL_ERROR', async () => {
    const exec = vi.fn(() => Promise.resolve(okOutcome))
    const r = await executeTool(mkTool(exec), {}, mkCtx({ error: ['t1'] }), 200)
    expect(r).toMatchObject({ ok: false, code: 'TOOL_ERROR' })
    expect(exec).not.toHaveBeenCalled()
  })
  it('empty fault yields EMPTY', async () => {
    const r = await executeTool(mkTool(() => Promise.resolve(okOutcome)), {}, mkCtx({ empty: ['t1'] }), 200)
    expect(r).toMatchObject({ ok: false, code: 'EMPTY' })
  })
  it('a slow tool is raced against the timeout', async () => {
    const slow = mkTool(() => new Promise<ToolOutcome>(res => setTimeout(() =>{  res(okOutcome) }, 300)))
    const r = await executeTool(slow, {}, mkCtx(), 30)
    expect(r).toMatchObject({ ok: false, code: 'TIMEOUT' })
  })
  it('a timed-out call aborts the signal given to the tool', async () => {
    let sig: AbortSignal | undefined
    const slow = mkTool((_a, ctx) => {
      sig = ctx.signal
      return new Promise<ToolOutcome>(() => undefined)
    })
    await executeTool(slow, {}, mkCtx(), 20)
    expect(sig?.aborted).toBe(true)
  })
  it('an already aborted signal returns TOOL_ERROR', async () => {
    const ac = new AbortController()
    ac.abort()
    const exec = vi.fn(() => Promise.resolve(okOutcome))
    const r = await executeTool(mkTool(exec), {}, mkCtx({}, ac.signal), 100)
    expect(r).toMatchObject({ ok: false, code: 'TOOL_ERROR' })
    expect(exec).not.toHaveBeenCalled()
  })
  it('aborting during latency stops the call', async () => {
    const ac = new AbortController()
    const p = executeTool(mkTool(() => Promise.resolve(okOutcome), [500, 500]), {}, mkCtx({}, ac.signal), 2000)
    setTimeout(() =>{  ac.abort() }, 10)
    const r = await p
    expect(r).toMatchObject({ ok: false, code: 'TOOL_ERROR' })
  })
  it('aborting during a timeout fault stops the wait', async () => {
    const ac = new AbortController()
    const p = executeTool(mkTool(() => Promise.resolve(okOutcome)), {}, mkCtx({ timeout: ['t1'] }, ac.signal), 5000)
    setTimeout(() =>{  ac.abort() }, 10)
    const r = await p
    expect(r).toMatchObject({ ok: false, code: 'TOOL_ERROR' })
  })
  it('thrown errors become TOOL_ERROR and never throw', async () => {
    const r = await executeTool(
      mkTool(() => Promise.reject(new Error('boom'))),
      {},
      mkCtx(),
      200,
    )
    expect(r).toMatchObject({ ok: false, code: 'TOOL_ERROR' })
    expect((r as { message: string }).message).toContain('boom')
  })
  it.each(['sync', 42])('synchronous non-Error throws become TOOL_ERROR (%s)', async (error: unknown) => {
    const result = await executeTool(
      mkTool(() => {
        throw error
      }),
      {},
      mkCtx(),
      200,
    )
    expect(result).toMatchObject({ ok: false, code: 'TOOL_ERROR' })
  })
})
