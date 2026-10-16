/** Test-only draft/review responses; production inference never imports this policy. */
import type { ContextHints } from '../../domain/types'
import { reply } from './policyHelpers'

/** Candidate and correction emitted by the scripted model in separate loop iterations. */
export const REFLECTION_TEST_PASSES = [
  'Proposta: Delta, Beta, Alfa, Gamma. Verifica: Gamma è ultima, quindi la proposta viola un vincolo.',
  'Correzione: Delta, Gamma, Beta, Alfa. Delta precede Beta, Alfa segue subito Beta, Gamma è seconda: tutti i vincoli sono soddisfatti.',
] as const

/** Final answer of the scripted run: the full order first, then the confirmation. */
export const REFLECTION_TEST_ANSWER = 'Delta, Gamma, Beta, Alfa.\n\nDelta precede Beta; Alfa segue subito Beta; Gamma non è prima né ultima.'

/**
 * Revises a candidate before a final answer, with no tools or native reasoning channel.
 * In the reflection loop it answers with the tagged blocks of that protocol; otherwise in the active protocol.
 * @param hints Information actually included in the current model request.
 * @returns A `<self_reflection>` draft, a `<final_answer>`, or a plain answer when the loop is off.
 */
export function simulateReflection(hints: ContextHints): string {
  if (!hints.reflections) return reply(hints, REFLECTION_TEST_ANSWER)
  const text = REFLECTION_TEST_PASSES[hints.reflections.length]
  return text ? `<self_reflection>\n${text}\n</self_reflection>` : `<final_answer>\n${REFLECTION_TEST_ANSWER}\n</final_answer>`
}
