/**
 * Safe arithmetic evaluator: tokenizer + recursive-descent parser.
 * Grammar:
 *   expr    := term (('+' | '-') term)*
 *   term    := unary (('*' | '/') unary)*
 *   unary   := '-' unary | '+' unary | power
 *   power   := postfix ('^' unary)?          (right associative)
 *   postfix := primary '%'*
 *   primary := NUMBER | '(' expr ')'
 * No eval / Function anywhere.
 */

export class CalcError extends Error {
  readonly kind: 'syntax' | 'math'
  constructor(message: string, kind: 'syntax' | 'math') {
    super(message)
    this.kind = kind
  }
}

type Token = { t: 'num'; v: number } | { t: 'op'; v: string }

function isDigit(c: string | undefined): boolean {
  return c !== undefined && c >= '0' && c <= '9'
}

function tokenize(src: string): Token[] {
  const out: Token[] = []
  let i = 0
  while (i < src.length) {
    const c = src[i] as string
    if (/\s/.test(c)) {
      i++
      continue
    }
    if (isDigit(c) || ((c === '.' || c === ',') && isDigit(src[i + 1]))) {
      let j = i
      let text = ''
      let seenSep = false
      while (j < src.length) {
        const d = src[j] as string
        if (isDigit(d)) {
          text += d
          j++
        } else if ((d === '.' || d === ',') && !seenSep && isDigit(src[j + 1])) {
          seenSep = true
          text += '.'
          j++
        } else break
      }
      out.push({ t: 'num', v: Number(text) })
      i = j
      continue
    }
    if ('+-*/^()%'.includes(c)) {
      out.push({ t: 'op', v: c })
      i++
      continue
    }
    if (c === '×') {
      out.push({ t: 'op', v: '*' })
      i++
      continue
    }
    if (c === '÷') {
      out.push({ t: 'op', v: '/' })
      i++
      continue
    }
    if (c === '€' || c === '$') {
      i++
      continue
    }
    throw new CalcError(`carattere non valido '${c}' nell'espressione`, 'syntax')
  }
  return out
}

export function evaluateExpression(src: string): number {
  const tokens = tokenize(src)
  if (tokens.length === 0) throw new CalcError("l'espressione è vuota", 'syntax')
  let pos = 0
  const peek = (): Token | undefined => tokens[pos]
  const isOp = (v: string): boolean => {
    const t = peek()
    return t !== undefined && t.t === 'op' && t.v === v
  }

  function expr(): number {
    let left = term()
    while (isOp('+') || isOp('-')) {
      const op = (tokens[pos++] as { v: string }).v
      const right = term()
      left = op === '+' ? left + right : left - right
    }
    return left
  }
  function term(): number {
    let left = unary()
    while (isOp('*') || isOp('/')) {
      const op = (tokens[pos++] as { v: string }).v
      const right = unary()
      if (op === '/') {
        if (right === 0) throw new CalcError('divisione per zero', 'math')
        left = left / right
      } else left = left * right
    }
    return left
  }
  function unary(): number {
    if (isOp('-')) {
      pos++
      return -unary()
    }
    if (isOp('+')) {
      pos++
      return unary()
    }
    return power()
  }
  function power(): number {
    const base = postfix()
    if (isOp('^')) {
      pos++
      const exp = unary()
      const r = Math.pow(base, exp)
      if (!Number.isFinite(r)) throw new CalcError('risultato non rappresentabile', 'math')
      return r
    }
    return base
  }
  function postfix(): number {
    let v = primary()
    while (isOp('%')) {
      pos++
      v = v / 100
    }
    return v
  }
  function primary(): number {
    const t = peek()
    if (t === undefined) throw new CalcError("l'espressione termina in modo inatteso", 'syntax')
    if (t.t === 'num') {
      pos++
      return t.v
    }
    if (t.v === '(') {
      pos++
      const v = expr()
      if (!isOp(')')) throw new CalcError("manca una parentesi chiusa ')'", 'syntax')
      pos++
      return v
    }
    throw new CalcError(`simbolo inatteso '${t.v}'`, 'syntax')
  }

  const result = expr()
  if (pos < tokens.length) {
    const t = tokens[pos] as Token
    throw new CalcError(`simbolo inatteso '${t.v}'`, 'syntax')
  }
  if (!Number.isFinite(result)) throw new CalcError('risultato non rappresentabile', 'math')
  return result
}

export function round2(n: number): number {
  const r = Math.round((n + Number.EPSILON) * 100) / 100
  return Object.is(r, -0) ? 0 : r
}

/** Italian number format, e.g. 5948.72 -> "5.948,72" (explicit grouping, independent of ICU data). */
export function formatItNumber(n: number): string {
  const neg = n < 0
  const [int = '0', dec] = Math.abs(n).toFixed(2).split('.')
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  const decimals = dec && dec !== '00' ? `,${dec}` : ''
  return `${neg ? '-' : ''}${grouped}${decimals}`
}

/** Italian currency-like format with always two decimals: "1.219,00". */
export function formatItMoney(n: number): string {
  const neg = n < 0
  const [int = '0', dec = '00'] = Math.abs(n).toFixed(2).split('.')
  return `${neg ? '-' : ''}${int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${dec}`
}

export interface CalcResult {
  value: number
  text: string
}

export function calculate(expression: string): CalcResult {
  const value = round2(evaluateExpression(expression))
  return { value, text: formatItNumber(value) }
}
