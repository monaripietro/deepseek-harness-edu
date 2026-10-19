/** Scenario-specific instructions for revising the same candidate across model calls without tools. */
import type { Scenario } from '../domain/types'

const NAMES = ['Alfa', 'Beta', 'Gamma', 'Delta'] as const
type Name = (typeof NAMES)[number]
const NAME = '(alfa|beta|gamma|delta)'
const PLAIN_ORDER = new RegExp(
  `^\\s*(?:(?:(?:my|the|proposed|candidate)\\s+)?order(?:\\s+is)?\\s*[:=.-]\\s*)?${NAME}\\s*[,;]\\s*${NAME}\\s*[,;]\\s*${NAME}\\s*[,;]\\s*${NAME}\\b`,
  'i',
)

/**
 * The complete order at the start of a draft, or the last complete numbered order in it.
 * @param draft Text of one `<self_reflection>` block.
 * @returns The parsed order from first to last, or null when it is incomplete or repeats a name.
 */
export function lastOrder(draft: string): Name[] | null {
  const numbered = [...draft.matchAll(/\b([1-4])\s*[=:.)-]\s*(alfa|beta|gamma|delta)\b/gi)]
  if (numbered.length) {
    let current: (Name | undefined)[] = []
    let last: Name[] | null = null
    for (const match of numbered) {
      const position = Number(match[1])
      const name = NAMES.find(item => item.toLowerCase() === (match[2] ?? '').toLowerCase())
      if (!name) continue
      if (position === 1) {
        current = []
        last = null
      }
      current[position - 1] = name
      if (current.length === 4 && current[0] && current[1] && current[2] && current[3]) {
        const order = current as Name[]
        last = new Set(order).size === NAMES.length ? order : null
      }
    }
    return last
  }

  const plain = PLAIN_ORDER.exec(draft)
  if (!plain) return null
  const order = plain.slice(1, 5).map(value => NAMES.find(item => item.toLowerCase() === value?.toLowerCase()))
  if (order.some((item): item is undefined => item === undefined)) return null
  const names = order as Name[]
  return new Set(names).size === NAMES.length ? names : null
}

/**
 * The model's order restated with the actual result of every rule; an incomplete or repeated name requests a new order.
 * @param draft Text of one `<self_reflection>` block.
 * @returns Deterministic rule feedback and whether a complete unique order was parsed.
 */
export function readBackOrder(draft: string): { text: string; complete: boolean } {
  const order = lastOrder(draft)
  if (!order) {
    return {
      text: 'Your draft does not contain one complete order with Alfa, Beta, Gamma and Delta exactly once. Write one comma-separated order in <self_reflection>; the harness will check it.',
      complete: false,
    }
  }
  const results = ruleResults(order)
  const passed = results.every(result => result.passed)
  const text = [
    `Your latest order: ${order.map((name, index) => `${index + 1} = ${name}`).join(', ')}.`,
    ...results.map(result => result.text),
    passed
      ? 'The harness verified that all three rules pass.'
      : 'Revise the order using these results. Do not grade the rules yourself.',
  ].join('\n')
  return { text, complete: true }
}

/**
 * Evaluates the position rules for the four-name order.
 * @param order The complete order, from first to last.
 * @returns Each rule's result and deterministic feedback.
 */
function ruleResults(order: Name[]): { passed: boolean; text: string }[] {
  const position = (name: Name) => order.indexOf(name) + 1
  const delta = position('Delta')
  const beta = position('Beta')
  const alfa = position('Alfa')
  const gamma = position('Gamma')
  const rule1 = delta < beta
  const rule2 = alfa === beta + 1
  const rule3 = gamma !== 1 && gamma !== 4
  return [
    {
      passed: rule1,
      text: rule1
        ? `Rule 1 passes: Delta at position ${delta} is before Beta at position ${beta}.`
        : `Rule 1 fails: Delta at position ${delta} is not before Beta at position ${beta}.`,
    },
    {
      passed: rule2,
      text: rule2
        ? `Rule 2 passes: Alfa at position ${alfa} is immediately after Beta at position ${beta}.`
        : `Rule 2 fails: Alfa at position ${alfa} is not immediately after Beta at position ${beta}; Alfa must be at position ${beta + 1}.`,
    },
    {
      passed: rule3,
      text: rule3
        ? `Rule 3 passes: Gamma at position ${gamma} is neither first nor last.`
        : `Rule 3 fails: Gamma at position ${gamma} is first or last; it must be second or third.`,
    },
  ]
}

/**
 * Evaluates the order in a draft or final answer without reading the model's rule claims.
 * @param text One reflection draft or final answer.
 * @returns 'pass' when the order satisfies all rules, 'fail' when it violates any rule, or null when no unique order is present.
 */
export function orderVerdict(text: string): 'pass' | 'fail' | null {
  const order = lastOrder(text)
  if (!order) return null
  return ruleResults(order).every(result => result.passed) ? 'pass' : 'fail'
}

const reflectionPrompt =
  'Method:\n' +
  'In <self_reflection>, write or revise only one comma-separated order, using each name exactly once.\n' +
  'Use the harness feedback in the next turn. Do not grade the rules yourself.\n' +
  'Write <final_answer> only when the harness confirms that all three rules pass. Put the comma-separated order first, then confirm them briefly.'

/** Demonstrates prompt-guided self-revision through the agent loop rather than a reasoning tool. */
export const reflectionScenario: Scenario = {
  id: 'ragionamento-iterativo',
  title: 'Ragionamento con il ciclo agentico',
  shortTitle: 'Ragionamento iterativo',
  lesson: 'Il system prompt guida il modello a riesaminare e correggere la stessa proposta in più chiamate, senza strumenti: è ragionamento simulato, non thinking nativo.',
  request:
    'Metti in ordine quattro dimostrazioni: Alfa, Beta, Gamma e Delta. Regole: 1) Delta viene prima di Beta. ' +
    '2) Alfa viene subito dopo Beta. 3) Gamma non è né prima né ultima. Nella risposta finale scrivi prima l’ordine, poi conferma le regole.',
  reflectionPrompt,
  reflectionGuide: {
    draftStart: 'My order: ',
    readback: readBackOrder,
    verdict: orderVerdict,
  },
  en: {
    request:
      'Put four demos in order: Alfa, Beta, Gamma and Delta. Rules: 1) Delta comes before Beta. 2) Alfa comes right after Beta. ' +
      '3) Gamma is not first and not last. In the final answer, write the order first, then confirm the rules.',
    taskData: [
      { id: 'iterative-review-positions', title: 'Positions', text: 'Positions go from 1 (first) to 4 (last). Each name has exactly one position.' },
    ],
    instructions: 'Solve the ordering task of the user. Answer in English.',
    reflectionPrompt,
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
