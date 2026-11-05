import type { PromptLanguage, ToolDefinition, ToolOutcome } from '../../domain/types'
import { REAL_LOCAL } from '../../domain/types'
import { t } from './lang'

/**
 * Records the plan written by the model (no side effects). Version 1 is the first plan, later calls update it
 * (the new plan replaces the old one). Texts in the prompt language (default Italian).
 */
export function recordPlan(args: Record<string, unknown>, lang?: PromptLanguage, version = 1): ToolOutcome {
  const piano = typeof args.piano === 'string' ? args.piano.trim() : ''
  if (!piano) {
    const message = t(lang, 'Il piano è vuoto: scrivi i passi numerati.', 'The plan is empty: write the numbered steps.')
    return { ok: false, code: 'INVALID_ARGS', message }
  }
  const motivo = typeof args.motivo === 'string' ? args.motivo.trim() : ''
  const head =
    version > 1 ? `${t(lang, 'Piano aggiornato', 'Plan updated')} (${t(lang, 'versione', 'version')} ${version})` : t(lang, 'Piano registrato', 'Plan recorded')
  const why = motivo ? `
${t(lang, 'Motivo', 'Reason')}: ${motivo}` : ''
  return { ok: true, data: { piano, versione: version, ...(motivo ? { motivo } : {}) }, summary: `${head}:
${piano}${why}` }
}

/**
 * Planning tool, available at every step: call it to create the plan and again to update it (the new plan
 * replaces the old one). The orchestrator records it itself: it is not an action, does not use up the single
 * round of tools of the levels without the agent loop and does not count as a repeated call.
 */
export const PLAN_TOOL: ToolDefinition = {
  id: 'pianifica',
  title: 'Piano di lavoro',
  description:
    'Create or update your plan: 2 to 5 numbered steps, each naming the tool it will use (or "answer" for the final answer). ' +
    'Use it at the start of tasks with several steps, and again if a step fails or the information changes: the new plan replaces the old one.',
  purpose: 'Crea o aggiorna il piano: usalo all’inizio dei compiti con più passi e di nuovo se un passo fallisce o le informazioni cambiano.',
  inputSchema: {
    type: 'object',
    properties: {
      piano: { type: 'string', description: 'Numbered steps, e.g. "1) calcolatrice: compute the margin 2) answer with the result".' },
      motivo: { type: 'string', description: 'Only when updating: why the plan changed.' },
    },
    required: ['piano'],
    additionalProperties: false,
  },
  output: 'Il piano registrato (o aggiornato, con il numero di versione): resta nel contesto, solo l’ultima versione.',
  permissions: [],
  risk: 'read',
  approval: 'never',
  provenance: { ...REAL_LOCAL, note: 'pianificazione registrata dall’orchestratore' },
  errors: [{ code: 'INVALID_ARGS', message: 'Piano vuoto.' }],
  latencyMs: [0, 0],
  source: 'builtin',
  execute(args, ctx) {
    return Promise.resolve(recordPlan(args, ctx.lang))
  },
}
