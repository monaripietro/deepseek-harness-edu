import type { PromptLanguage, ToolDefinition, ToolOutcome } from '../../domain/types'
import { REAL_LOCAL } from '../../domain/types'
import { t } from './lang'

/** Records the plan written by the model (no side effects). Texts in the prompt language (default Italian). */
export function recordPlan(args: Record<string, unknown>, lang?: PromptLanguage): ToolOutcome {
  const piano = typeof args.piano === 'string' ? args.piano.trim() : ''
  if (!piano) {
    const message = t(lang, 'Il piano è vuoto: scrivi i passi numerati.', 'The plan is empty: write the numbered steps.')
    return { ok: false, code: 'INVALID_ARGS', message }
  }
  return { ok: true, data: { piano }, summary: `${t(lang, 'Piano registrato', 'Plan recorded')}:\n${piano}` }
}

/**
 * Planning step of the orchestrator, offered to the model as a tool and forced as its first call:
 * writing "1) cerca_catalogo … 2) calcolatrice … 3) answer" makes small models pick tools instead of
 * improvising. The orchestrator records the plan itself: it is not an action and does not use up
 * the single round of tools of the levels without the agent loop.
 */
export const PLAN_TOOL: ToolDefinition = {
  id: 'pianifica',
  title: 'Piano di lavoro',
  description:
    'Write your plan before acting: 2 to 5 numbered steps, each naming the tool it will use (or "answer" for the final answer). ' +
    'Always your first call.',
  purpose: 'Prima di agire il modello scrive il suo piano: l’orchestratore lo obbliga, così sceglie gli strumenti invece di improvvisare.',
  inputSchema: {
    type: 'object',
    properties: {
      piano: { type: 'string', description: 'Numbered steps, e.g. "1) calcolatrice: compute the margin 2) answer with the result".' },
    },
    required: ['piano'],
    additionalProperties: false,
  },
  output: 'Il piano registrato, che resta nel contesto per i passi successivi.',
  permissions: [],
  risk: 'read',
  approval: 'never',
  provenance: { ...REAL_LOCAL, note: 'passo di pianificazione dell’orchestratore' },
  errors: [{ code: 'INVALID_ARGS', message: 'Piano vuoto.' }],
  latencyMs: [0, 0],
  source: 'builtin',
  execute(args, ctx) {
    return Promise.resolve(recordPlan(args, ctx.lang))
  },
}
