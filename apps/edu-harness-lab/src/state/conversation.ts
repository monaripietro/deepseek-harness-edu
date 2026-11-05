/**
 * The restart rule, shared by the store (which resets the conversation) and the UI (which tells the
 * learner what the next send will do): asking the scenario request or a question already asked starts
 * again from an empty context; any other question is a follow-up that keeps the conversation.
 */
export type SendMode = 'first' | 'restart' | 'followup'

/** Same request, ignoring surrounding and repeated whitespace. */
export function sameRequest(a: string, b: string): boolean {
  const norm = (t: string) => t.trim().replace(/\s+/g, ' ')
  return norm(a) === norm(b)
}

export function sendModeFor(text: string, scenarioRequest: string, askedBefore: readonly string[]): SendMode {
  if (askedBefore.length === 0) return 'first'
  return sameRequest(text, scenarioRequest) || askedBefore.some(q => sameRequest(q, text)) ? 'restart' : 'followup'
}
