import { describe, expect, it, vi } from 'vitest'
import type {
  ApprovalOutcome,
  ApprovalRequest,
  FaultInjection,
  HarnessConfig,
  MemoryRecord,
  ModelRuntime,
  Scenario,
  ToolDefinition,
  ToolOutcome,
  TraceEvent,
  TurnDeps,
} from '../../domain/types'
import { NO_FAULTS, REAL_LOCAL } from '../../domain/types'
import { SCENARIO_DATA } from '../../scenarios/data'
import { createEventBus } from '../events'
import { baseConfig } from '../levels'
import { runTurn } from './orchestrator'

vi.mock('../tools/validate', () => ({
  validateArgs: (schema: { required?: string[] }, args: Record<string, unknown>) => {
    const missing = (schema.required ?? []).filter(r => !(r in args))
    return missing.length ? { ok: false, errors: missing.map(m => `Manca «${m}»`) } : { ok: true }
  },
}))
vi.mock('../tools/executor', () => ({
  executeTool: async (tool: ToolDefinition, args: Record<string, unknown>, ctx: unknown) => tool.execute(args, ctx as never),
}))

function mkTool(id: string, over: Partial<ToolDefinition> = {}, outcome?: ToolOutcome): ToolDefinition {
  return {
    id,
    title: id,
    description: `Strumento ${id}`,
    purpose: '',
    output: '',
    inputSchema: { type: 'object', properties: { x: { type: 'string' } }, required: ['x'] },
    permissions: [],
    risk: 'read',
    approval: 'never',
    provenance: REAL_LOCAL,
    errors: [],
    latencyMs: [0, 0],
    source: 'builtin',
    execute: () => Promise.resolve(outcome ?? { ok: true, data: id === 'scrivi' ? { id: 'RDA-SIM-1' } : {}, summary: `esito di ${id}` }),
    ...over,
  }
}

const TOOLS = [
  mkTool('calc'),
  mkTool('scrivi', { approval: 'always', risk: 'write' }),
  mkTool('proibito', { forbiddenForRole: true }),
  mkTool('rotto', {}, { ok: false, code: 'TOOL_ERROR', message: 'guasto' }),
]

const scenario: Scenario = {
  id: 's1',
  title: 't',
  shortTitle: 't',
  lesson: '',
  request: 'ciao',
  showcaseLevel: 0,
  checkers: [{ id: 'ck', label: 'ck', check: r => r.stopReason === 'final_answer' }],
}

type Req = Parameters<ModelRuntime['generate']>[0]

function runtime(script: string[], delayMs = 0) {
  const requests: Req[] = []
  let i = 0
  const rt = {
    info: { profile: 'test-double', id: 'sim', label: 'sim', backend: 'none', fingerprint: 'x', provenance: REAL_LOCAL },
    isReady: () => true,
    load: async () => {},
    unload: async () => {},
    generate: async (req: Req) => {
      requests.push(req)
      if (delayMs) await new Promise(r => setTimeout(r, delayMs))
      const text = script[Math.min(i, script.length - 1)] ?? ''
      i += 1
      return { text, durationMs: 1, finishReason: 'stop' as const, provenance: REAL_LOCAL }
    },
  } as unknown as ModelRuntime
  return { rt, requests }
}

const call = (tool: string, args: Record<string, unknown> = { x: '1' }) =>
  JSON.stringify({ azione: 'usa_strumento', strumento: tool, argomenti: args, motivazione: 'test' })
const answer = (t = 'Fine', fonti?: string[]) => JSON.stringify({ azione: 'rispondi', testo: t, ...(fonti ? { fonti } : {}) })

interface Opts {
  on?: string[]
  limits?: Partial<HarnessConfig['limits']>
  approval?: ApprovalOutcome
  faults?: Partial<FaultInjection>
  memory?: MemoryRecord[]
  runtime?: ModelRuntime
}

function setup(script: string[], opts: Opts = {}) {
  const config = baseConfig()
  for (const c of opts.on ?? []) config.components[c as keyof HarnessConfig['components']] = true
  config.enabledTools = TOOLS.map(t => t.id)
  config.limits = { ...config.limits, ...opts.limits }
  const bus = createEventBus()
  const { rt, requests } = runtime(script)
  const asked: ApprovalRequest[] = []
  const written: MemoryRecord[] = []
  const deps = {
    runtime: opts.runtime ?? rt,
    config,
    scenario,
    data: SCENARIO_DATA,
    registry: { list: () => TOOLS, get: (id: string) => TOOLS.find(t => t.id === id), register: () => () => {} },
    memory: {
      list: () => opts.memory ?? [],
      write: (r: Omit<MemoryRecord, 'id' | 'createdAt'>) => {
        const rec = { ...r, id: 'm-new', createdAt: '' }
        written.push(rec)
        return rec
      },
      delete: () => {},
      clear: () => {},
      subscribe: () => () => {},
    },
    retriever: { search: () => [] },
    approvals: {
      request: (req: ApprovalRequest) => {
        asked.push(req)
        return Promise.resolve(opts.approval ?? 'allowed-once')
      },
    },
    mcp: { servers: () => [], connect: async () => {}, toolDefinitions: () => [] },
    bus,
    pacer: { wait: async () => {} },
    faults: { ...NO_FAULTS, ...opts.faults },
    history: [],
    configKey: 'k',
    configLabel: 'L',
  } as unknown as TurnDeps
  const run = (input = 'ciao', signal: AbortSignal = new AbortController().signal) => runTurn(input, deps, signal)
  const types = () => bus.events().map((e: TraceEvent) => e.type)
  const guards = () => bus.events().flatMap(e => (e.type === 'guard/triggered' ? [e.guard] : []))
  return { run, requests, bus, asked, written, types, guards }
}

const FULL = ['tools', 'orchestrator', 'instructions']
const LOOP = [...FULL, 'agentLoop']
const CTRL = [...LOOP, 'controls']

describe('runTurn', () => {
  it('text protocol: one call, level-0 context is only the user message', async () => {
    const s = setup(['Risposta libera'])
    const r = await s.run('domanda')
    expect(r.stopReason).toBe('final_answer')
    expect(r.answer).toBe('Risposta libera')
    expect(s.requests).toHaveLength(1)
    expect(s.requests[0]?.messages).toEqual([{ role: 'user', content: 'domanda' }])
    expect(s.types()[0]).toBe('run/start')
    expect(s.types().slice(-2)).toEqual(['stop', 'run/end'])
    expect(r.checks[0]?.passed).toBe(true)
  })

  it('single round: tool then forced answer', async () => {
    const s = setup([call('calc'), answer('Risultato')], { on: FULL })
    const r = await s.run()
    expect(r.stopReason).toBe('final_answer')
    expect(r.steps).toBe(2)
    expect(r.toolCalls).toEqual([{ tool: 'calc', args: { x: '1' }, ok: true }])
    expect(s.requests[1]?.hints.mustAnswer).toBe(true)
    // Model-facing protocol is in English: the tool list ('## Tools') disappears once an answer is due.
    expect(s.requests[0]?.messages[0]?.content).toContain('## Tools')
    expect(s.requests[1]?.messages[0]?.content).not.toContain('## Tools')
    expect(s.requests[1]?.messages.some(m => m.content.startsWith('[RESULT of calc]'))).toBe(true)
  })

  it('single round: repeated tool requests when an answer is due end in invalid_output', async () => {
    const s = setup([call('calc'), call('calc', { x: '2' }), call('calc', { x: '3' })], { on: FULL })
    const r = await s.run()
    expect(r.stopReason).toBe('invalid_output')
    expect(r.toolCalls.filter(t => t.ok)).toHaveLength(1)
  })

  it('agent loop reaches the final answer after several tools', async () => {
    const s = setup([call('calc', { x: 'a' }), call('calc', { x: 'b' }), answer('Ok', ['POL-IT-04'])], { on: LOOP })
    const r = await s.run()
    expect(r.stopReason).toBe('final_answer')
    expect(r.steps).toBe(3)
    expect(r.sourcesUsed).toEqual(['POL-IT-04'])
  })

  it('controls without approval: write tool is DENIED and the model can answer', async () => {
    const s = setup([call('scrivi'), answer('Bozza pronta')], { on: CTRL })
    const r = await s.run()
    expect(r.stopReason).toBe('final_answer')
    expect(r.toolCalls[0]).toMatchObject({ tool: 'scrivi', ok: false, code: 'DENIED' })
    expect(r.actions).toHaveLength(0)
    expect(s.guards()).toContain('unsupervised_write')
  })

  it('without controls the write tool just executes', async () => {
    const s = setup([call('scrivi'), answer('Fatto')], { on: LOOP })
    const r = await s.run()
    expect(r.actions).toEqual([{ tool: 'scrivi', id: 'RDA-SIM-1', approved: null }])
  })

  it('approval allowed executes and logs the human decision', async () => {
    const s = setup([call('scrivi'), answer('Fatto')], { on: [...CTRL, 'approval'] })
    const r = await s.run()
    expect(s.asked).toHaveLength(1)
    expect(r.humanInterventions).toBe(1)
    expect(r.actions).toEqual([{ tool: 'scrivi', id: 'RDA-SIM-1', approved: true }])
    expect(s.types()).toContain('approval/decided')
  })

  it('approval rejected stops with approval_denied after a final model step', async () => {
    const s = setup([call('scrivi'), answer('Non ho eseguito nulla')], { on: [...CTRL, 'approval'], approval: 'rejected' })
    const r = await s.run()
    expect(r.stopReason).toBe('approval_denied')
    expect(r.answer).toBe('Non ho eseguito nulla')
    expect(r.actions).toHaveLength(0)
    expect(s.requests[1]?.hints.mustAnswer).toBe(true)
    expect(s.requests[1]?.messages.some(m => m.content.includes('rifiutato'))).toBe(true)
  })

  it('approval cancelled is user_stop', async () => {
    const s = setup([call('scrivi')], { on: [...CTRL, 'approval'], approval: 'cancelled' })
    expect((await s.run()).stopReason).toBe('user_stop')
  })

  it('repeat: warns then stops with loop_detected', async () => {
    const s = setup([call('calc')], { on: CTRL })
    const r = await s.run()
    expect(r.stopReason).toBe('loop_detected')
    expect(r.toolCalls).toHaveLength(2)
    expect(s.requests[2]?.hints.guardNotice).toBeTruthy()
    expect(s.guards().filter(g => g === 'repeat')).toHaveLength(2)
  })

  it('unauthorized tool twice stops; without controls it executes', async () => {
    const s = setup([call('proibito')], { on: CTRL })
    const r = await s.run()
    expect(r.stopReason).toBe('unauthorized_tool')
    expect(r.toolCalls).toHaveLength(2)
    const s2 = setup([call('proibito'), answer()], { on: LOOP })
    const r2 = await s2.run()
    expect(r2.toolCalls[0]?.ok).toBe(true)
  })

  it('consecutive tool failures stop with controls', async () => {
    const s = setup([call('rotto', { x: 'a' }), call('rotto', { x: 'b' })], { on: CTRL })
    const r = await s.run()
    expect(r.stopReason).toBe('tool_failures')
    expect(r.answer).toContain('errore')
  })

  it('max_steps: one forced final step, then stop', async () => {
    let n = 0
    const script = Array.from({ length: 10 }, () => call('calc', { x: String((n += 1)) }))
    const s = setup(script, { on: CTRL, limits: { maxSteps: 2 } })
    const r = await s.run()
    expect(r.stopReason).toBe('max_steps')
    expect(r.steps).toBe(3)
    expect(s.requests[2]?.hints.mustAnswer).toBe(true)
    expect(s.guards()).toContain('max_steps')
  })

  it('invalid args come back as observations; injected fault is labelled', async () => {
    const s = setup([call('calc', {}), answer()], { on: LOOP })
    const r = await s.run()
    expect(r.toolCalls[0]).toMatchObject({ ok: false, code: 'INVALID_ARGS' })
    expect(r.stopReason).toBe('final_answer')
    const s2 = setup([call('calc'), answer()], { on: LOOP, faults: { invalidArgsOnce: true } })
    await s2.run()
    const val = s2.bus.events().find(e => e.type === 'tool/validation')
    const errors = val?.errors
    expect(errors?.[0]).toContain('guasto iniettato dal docente')
  })

  it('repairs an invalid decision, then gives up with invalid_output', async () => {
    const ok = setup(['{rotto', answer('Sistemato')], { on: FULL })
    const r = await ok.run()
    expect(r.stopReason).toBe('final_answer')
    expect(ok.requests[1]?.hints.repairAttempt).toBe(1)
    expect(ok.types()).toContain('decision/repair')
    const prose = setup(['solo prosa'], { on: FULL })
    const rp = await prose.run()
    expect(rp.stopReason).toBe('invalid_output')
    expect(rp.answer).toBe('solo prosa')
    expect(prose.requests).toHaveLength(3)
    const bad = setup(['{"azione":"vola"}'], { on: FULL })
    const rb = await bad.run()
    expect(rb.stopReason).toBe('invalid_output')
    expect(rb.answer).not.toContain('vola')
  })

  it('a throwing model becomes a model_error record, never an exception', async () => {
    const boom: ModelRuntime = { ...runtime([]).rt, generate: () => Promise.reject(new Error('boom')) }
    const s = setup([], { runtime: boom })
    const r = await s.run()
    expect(r.stopReason).toBe('model_error')
    expect(r.errors[0]).toContain('boom')
  })

  it('abort yields a user_stop record', async () => {
    const ctl = new AbortController()
    const s = setup([answer()], { on: FULL })
    s.bus.subscribe((e) => {
      if (e.type === 'step/start') ctl.abort()
    })
    const r = await s.run('ciao', ctl.signal)
    expect(r.stopReason).toBe('user_stop')
    expect(s.types().slice(-2)).toEqual(['stop', 'run/end'])
  })

  it('memory: injects persistent records and writes a taskState', async () => {
    const mem: MemoryRecord[] = [
      { id: 'a', scope: 'persistent', kind: 'preference', key: 'centro_costo', text: 'CC-410', createdAt: '', source: 'seed' },
      { id: 'b', scope: 'session', kind: 'observation', key: 'nota', text: 'x', createdAt: '', source: 'user' },
    ]
    const s = setup(['ok'], { on: ['memory'], memory: mem })
    const r = await s.run()
    expect(r.memoryUsed).toEqual(['centro_costo'])
    expect(s.requests[0]?.messages[0]?.content).toContain('## MEMORY')
    expect(s.requests[0]?.messages[0]?.content).toContain('CC-410')
    expect(s.written[0]).toMatchObject({ kind: 'taskState', scope: 'session' })
    expect(s.types()).toContain('memory/ignore')
  })
})
