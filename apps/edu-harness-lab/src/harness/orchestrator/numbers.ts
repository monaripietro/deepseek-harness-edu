/**
 * Arithmetic checks of the orchestrator: small models compute "in their head" (and often wrongly).
 * - needsCalculation: the request itself contains the operands of a calculation → the calculator is called first;
 * - unverifiedNumbers: numbers in an answer that appear in no source (request, tool results, documents, data)
 *   → the answer is not accepted and the model must use the calculator.
 */

interface Num {
  raw: string
  value: number
  pct: boolean
}

/** Italian and plain number formats: 48.000 · 5.948,72 · 1219 · 1.22 · 24% · 24,5 %. Codes like NB-V14P or ORD-2026-1187 are skipped. */
export function parseNumbers(text: string): Num[] {
  const out: Num[] = []
  const re = /(?<![\w-])(\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?)(\s*%)?(?![\w-])/g
  for (const m of text.matchAll(re)) {
    const raw = m[1]
    if (raw === undefined) continue
    let norm: string
    if (raw.includes(',')) norm = raw.replace(/\./g, '').replace(',', '.')
    else if (/^\d{1,3}(\.\d{3})+$/.test(raw)) norm = raw.replace(/\./g, '')
    else norm = raw
    const value = Number(norm)
    if (Number.isFinite(value)) out.push({ raw: `${raw}${m[2] ? '%' : ''}`, value, pct: !!m[2] })
  }
  return out
}

/** Numbers worth checking: percentages, decimals, and amounts ≥ 100 (not years). Small integers are counts, days, dates. */
function significant(n: Num): boolean {
  if (n.pct) return true
  if (!Number.isInteger(n.value)) return true
  if (n.value >= 1900 && n.value <= 2100 && !/[.,]/.test(n.raw)) return false
  return n.value >= 100
}

const close = (a: number, b: number) => Math.abs(a - b) <= 0.01 || (b !== 0 && Math.abs(a - b) / Math.abs(b) < 0.0005)

/** Significant numbers of `answer` that do not appear in `sources` (with rounding tolerance). */
export function unverifiedNumbers(answer: string, sources: string): string[] {
  const known = parseNumbers(sources).map(n => n.value)
  const odd = new Set<string>()
  for (const n of parseNumbers(answer)) {
    if (!significant(n)) continue
    if (!known.some(k => close(n.value, k))) odd.add(n.raw)
  }
  return [...odd]
}

const CALC_CUE_TERMS = [
  /margin|percentual|%|total|somm|differen|media\b|\biva\b|scont|ricaric|guadagn|utile/,
  /quanto (spend|cost|vien|fa|risparmi)|costo (total|complessiv)|moltiplic|divid|rapporto|incidenza/,
]
const CALC_CUE = new RegExp(`(${CALC_CUE_TERMS.map(r => r.source).join('|')})`, 'i')

/** The request contains at least two amounts and asks for a calculation with them. */
export function needsCalculation(request: string): boolean {
  return parseNumbers(request).filter(significant).length >= 2 && CALC_CUE.test(request)
}
