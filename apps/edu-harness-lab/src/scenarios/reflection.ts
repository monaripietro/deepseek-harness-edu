/** Scenario-specific instructions for revising the same candidate across model calls without tools. */
import type { Scenario } from '../domain/types'

const NAMES = ['Alfa', 'Beta', 'Gamma', 'Delta'] as const
type Name = (typeof NAMES)[number]

/**
 * The last complete order written as "1 = name … 4 = name" in a draft (each name once), or null.
 * @param draft Text of one `<self_reflection>` block.
 */
export function lastOrder(draft: string): Name[] | null {
  let current: (Name | undefined)[] = []
  let last: Name[] | null = null
  for (const match of draft.matchAll(/\b([1-4])\s*[=:.)-]\s*(alfa|beta|gamma|delta)\b/gi)) {
    const position = Number(match[1])
    const name = NAMES.find(item => item.toLowerCase() === (match[2] ?? '').toLowerCase())
    if (!name) continue
    if (position === 1) current = []
    current[position - 1] = name
    const filled = current.filter((item): item is Name => item !== undefined)
    if (filled.length === 4 && new Set(filled).size === 4) last = filled
  }
  return last
}

/**
 * Read-back of a draft for the next call: the draft's own order, and each rule with that order's position numbers.
 * Deterministic restatement only: the model still answers yes or no and decides what to do next.
 * @param draft Text of one `<self_reflection>` block.
 */
export function readBackOrder(draft: string): { text: string; complete: boolean } {
  const order = lastOrder(draft)
  if (!order) {
    return { text: 'Your draft has no complete order. Write it as: 1 = name, 2 = name, 3 = name, 4 = name, each name once.', complete: false }
  }
  const at = (name: Name) => order.indexOf(name) + 1
  const text = [
    `Your latest order: ${order.map((name, index) => `${index + 1} = ${name}`).join(', ')}.`,
    'Check it with these numbers. Answer each question with yes or no:',
    `Rule 1: is ${at('Delta')} < ${at('Beta')}?`,
    `Rule 2: is ${at('Alfa')} = ${at('Beta')} + 1?`,
    `Rule 3: is ${at('Gamma')} equal to 2 or 3?`,
  ].join('\n')
  return { text, complete: true }
}

const YES = /\b(yes|true|ok|correct|holds?)\b/i
const NO = /\b(no|not|false|wrong|incorrect|fails?)\b/i

/**
 * The model's own answers in a check: "Rule N: … yes/no" for the three rules. Reads its words, never the order.
 * @param check Text of one `<self_reflection>` block written as a check.
 * @returns 'fail' if any rule is answered no, 'pass' if all three are answered yes, null if unclear.
 */
export function rulesVerdict(check: string): 'pass' | 'fail' | null {
  // One segment per "Rule N", whether the model writes them on separate lines or on one.
  const segments = check.split(/(?=\brule\s*[1-3]\b)/i)
  const answers = [1, 2, 3].map((rule) => {
    const line = segments.find(text => new RegExp(`^rule\\s*${rule}\\b`, 'i').test(text))
    if (!line) return null
    // The answer after the question mark (or the whole line if there is none).
    const answer = line.includes('?') ? line.slice(line.lastIndexOf('?') + 1) : line
    if (NO.test(answer)) return 'no'
    return YES.test(answer) ? 'yes' : null
  })
  if (answers.includes('no')) return 'fail'
  return answers.every(answer => answer === 'yes') ? 'pass' : null
}

/** Demonstrates prompt-guided self-revision through the agent loop rather than a reasoning tool. */
export const reflectionScenario: Scenario = {
  id: 'ragionamento-iterativo',
  title: 'Ragionamento con il ciclo agentico',
  shortTitle: 'Ragionamento iterativo',
  lesson: 'Il system prompt guida il modello a riesaminare e correggere la stessa proposta in più chiamate, senza strumenti: è ragionamento simulato, non thinking nativo.',
  request:
    'Metti in ordine quattro dimostrazioni: Alfa, Beta, Gamma e Delta. Regole: 1) Delta viene prima di Beta. ' +
    '2) Alfa viene subito dopo Beta. 3) Gamma non è né prima né ultima. Nella risposta finale scrivi prima l’ordine, poi conferma le regole.',
  // Short numbered steps with placeholders, never an order the model could copy. The harness reads each draft back
  // with the rules turned into comparisons of position numbers, which even a small model can answer.
  reflectionPrompt:
    'Method:\n' +
    '1. In <self_reflection>, write an order: 1 = name, 2 = name, 3 = name, 4 = name.\n' +
    '2. Then you get each rule with your numbers. Answer yes or no for each one.\n' +
    '3. If one answer is no, write a new order in a new <self_reflection>.\n' +
    '4. If all answers are yes, reply with <final_answer>: the order, then that the rules hold.',
  reflectionGuide: {
    // Names the four labels right before the first slot, so the model fills it with a name (not with a number).
    // No trailing space: the next token (" Alfa") carries its own leading space.
    draftStart: 'My order, with each of Alfa, Beta, Gamma, Delta once:\n1 =',
    checkStart: 'Rule 1:',
    readback: readBackOrder,
    verdict: rulesVerdict,
  },
  en: {
    request:
      'Put four demos in order: Alfa, Beta, Gamma and Delta. Rules: 1) Delta comes before Beta. 2) Alfa comes right after Beta. ' +
      '3) Gamma is not first and not last. In the final answer, write the order first, then confirm the rules.',
    taskData: [
      { id: 'iterative-review-positions', title: 'Positions', text: 'Positions go from 1 (first) to 4 (last). Each name has exactly one position.' },
    ],
    instructions: 'Solve the ordering task of the user. Answer in English.',
  },
  showcaseLevel: 7,
  // Agent loop plus controls (repeat detection) show the point; approval and MCP are switched off here.
  maxLevel: 7,
  checkers: [
    {
      id: 'riflessioni-iterate',
      // At least one draft read back in a later call: more passes only when the model needs them, never forced.
      label: 'Almeno una bozza ripresa in una chiamata successiva prima della risposta',
      check: run => run.stopReason === 'final_answer' && (run.reflections?.length ?? 0) >= 1,
    },
    {
      id: 'nessun-tool',
      label: 'Nessuna chiamata a strumenti',
      check: run => run.toolCalls.length === 0,
    },
    {
      id: 'ordine-vincoli',
      label: 'Ordine finale conforme ai tre vincoli',
      check: (run) => {
        const names = run.answer.match(/\b(?:alfa|beta|gamma|delta)\b/gi) ?? []
        return run.stopReason === 'final_answer' && names.slice(0, 4).map(name => name.toLowerCase()).join(',') === 'delta,gamma,beta,alfa'
      },
    },
    {
      id: 'risposta-separata',
      label: 'Risposta finale distinta dalle bozze (nessun tag, nessuna bozza pubblicata come risposta)',
      check: run => run.stopReason === 'final_answer' && !!run.reflections?.length &&
        !/<\s*\/?\s*(?:self_reflection|final_answer)\b/i.test(run.answer) &&
        run.reflections.every(text => text.trim() !== run.answer.trim()),
    },
  ],
}
