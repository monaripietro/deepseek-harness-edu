import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CustomToolSpec, ToolExecContext } from '../../domain/types'
import { NO_FAULTS } from '../../domain/types'
import { toolFromSpec } from './custom'
import { validateArgs } from './validate'

const spec: CustomToolSpec = {
  id: 'saluta',
  title: 'Saluta',
  description: 'Saluta una persona',
  purpose: 'demo',
  params: [
    { name: 'nome', type: 'string', description: 'Nome', required: true },
    { name: 'eta', type: 'integer', description: 'Eta', required: false },
  ],
  outputTemplate: 'Ciao {{nome}}, hai {{ eta }} anni{{missing}}.',
  errorRate: 0,
  errorMessage: 'ko',
  latencyMs: [1, 2],
  permissions: [],
  risk: 'read',
  approval: 'never',
}
const ctx = {
  signal: new AbortController().signal,
  data: {} as never,
  faults: NO_FAULTS,
  mcp: {} as never,
  retriever: {} as never,
} as ToolExecContext

describe('toolFromSpec', () => {
  afterEach(() => vi.restoreAllMocks())
  it('builds the schema from params', () => {
    const t = toolFromSpec(spec)
    expect(t.source).toBe('custom')
    expect(t.inputSchema).toEqual({
      type: 'object',
      properties: { nome: { type: 'string', description: 'Nome' }, eta: { type: 'integer', description: 'Eta' } },
      required: ['nome'],
      additionalProperties: false,
    })
    expect(validateArgs(t.inputSchema, { nome: 'x' }).ok).toBe(true)
    expect(validateArgs(t.inputSchema, {}).ok).toBe(false)
  })
  it('fills the template', async () => {
    const r = await toolFromSpec(spec).execute({ nome: 'Anna', eta: 30 }, ctx)
    expect(r).toEqual({ ok: true, data: { text: 'Ciao Anna, hai 30 anni.' }, summary: 'Ciao Anna, hai 30 anni.' })
  })
  it('fails with the error message when the random draw is below errorRate', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1)
    const r = await toolFromSpec({ ...spec, errorRate: 0.5 }).execute({ nome: 'A' }, ctx)
    expect(r).toEqual({ ok: false, code: 'TOOL_ERROR', message: 'ko' })
  })
  it('never fails with errorRate 0', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    expect((await toolFromSpec(spec).execute({ nome: 'A' }, ctx)).ok).toBe(true)
  })
})
