/** Test-only draft/review responses; production inference never imports this policy. */
import type { ContextHints } from '../../domain/types'
import { reply } from './policyHelpers'

/** Invalid candidate and corrected order emitted by the scripted model in separate loop iterations. */
export const REFLECTION_TEST_DRAFTS = [
  '1 = Delta, 2 = Beta, 3 = Alfa, 4 = Gamma.',
  '1 = Delta, 2 = Gamma, 3 = Beta, 4 = Alfa.',
] as const

/** Final answer of the scripted run: the full order first, then the confirmation. */
export const REFLECTION_TEST_ANSWER = 'Delta, Gamma, Beta, Alfa.\n\nDelta precede Beta; Alfa segue subito Beta; Gamma non è prima né ultima.'

/**
 * Revises a candidate after host-checked feedback, with no tools or native reasoning channel.
 * In the reflection loop it returns one tagged order per iteration, then a distinct final answer.
 * @param hints Information actually included in the current model request.
 * @returns A `<self_reflection>` draft, a `<final_answer>`, or a plain answer when the loop is off.
 */
export function simulateReflection(hints: ContextHints): string {
  if (!hints.reflections) return reply(hints, REFLECTION_TEST_ANSWER)
  const text = REFLECTION_TEST_DRAFTS[hints.reflections.length]
  return text ? `<self_reflection>\n${text}\n</self_reflection>` : `<final_answer>\n${REFLECTION_TEST_ANSWER}\n</final_answer>`
}
