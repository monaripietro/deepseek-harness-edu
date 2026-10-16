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

import type { PromptLanguage } from '../../domain/types'

export class CalcError extends Error {
  readonly kind: 'syntax' | 'math'
  /** English version of the (Italian) message, for English prompts. */
  readonly en: string
  constructor(message: string, kind: 'syntax' | 'math', en: string = message) {
    super(message)
    this.kind = kind
    this.en = en
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
    throw new CalcError(`carattere non valido '${c}' nell'espressione`, 'syntax', `invalid character '${c}' in the expression`)
  }
  return out
}

export function evaluateExpression(src: string): number {
  const tokens = tokenize(src)
  if (tokens.length === 0) throw new CalcError("l'espressione è vuota", 'syntax', 'the expression is empty')
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
        if (right === 0) throw new CalcError('divisione per zero', 'math', 'division by zero')
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
      if (!Number.isFinite(r)) throw new CalcError('risultato non rappresentabile', 'math', 'the result cannot be represented')
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
    if (t === undefined) throw new CalcError("l'espressione termina in modo inatteso", 'syntax', 'the expression ends unexpectedly')
    if (t.t === 'num') {
      pos++
      return t.v
    }
    if (t.v === '(') {
      pos++
      const v = expr()
      if (!isOp(')')) throw new CalcError("manca una parentesi chiusa ')'", 'syntax', "a closing parenthesis ')' is missing")
      pos++
      return v
    }
    throw new CalcError(`simbolo inatteso '${t.v}'`, 'syntax', `unexpected symbol '${t.v}'`)
  }

  const result = expr()
  if (pos < tokens.length) {
    const t = tokens[pos] as Token
    throw new CalcError(`simbolo inatteso '${t.v}'`, 'syntax', `unexpected symbol '${t.v}'`)
  }
  if (!Number.isFinite(result)) throw new CalcError('risultato non rappresentabile', 'math', 'the result cannot be represented')
  return result
}

export function round2(n: number): number {
  const r = Math.round((n + Number.EPSILON) * 100) / 100
  return Object.is(r, -0) ? 0 : r
}

/** Groups thousands and writes 2 decimals with the given separators; `keepZeros` false drops ",00". */
function formatGrouped(n: number, thousands: string, decimal: string, keepZeros: boolean): string {
  const neg = n < 0
  const [int = '0', dec = '00'] = Math.abs(n).toFixed(2).split('.')
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, thousands)
  const decimals = keepZeros || dec !== '00' ? `${decimal}${dec}` : ''
  return `${neg ? '-' : ''}${grouped}${decimals}`
}

/** Italian number format, e.g. 5948.72 -> "5.948,72" (explicit grouping, independent of ICU data). */
export function formatItNumber(n: number): string {
  return formatGrouped(n, '.', ',', false)
}

/** Italian currency-like format with always two decimals: "1.219,00". */
export function formatItMoney(n: number): string {
  return formatGrouped(n, '.', ',', true)
}

/** English number format, e.g. 5948.72 -> "5,948.72" (like formatItNumber, decimals only when not zero). */
export function formatEnNumber(n: number): string {
  return formatGrouped(n, ',', '.', false)
}

/** English currency-like format with always two decimals: "1,219.00". */
export function formatEnMoney(n: number): string {
  return formatGrouped(n, ',', '.', true)
}

export interface CalcResult {
  value: number
  text: string
}

/** Evaluates and rounds to 2 decimals; `text` is formatted for the prompt language (default Italian). */
export function calculate(expression: string, lang: PromptLanguage = 'it'): CalcResult {
  const value = round2(evaluateExpression(expression))
  return { value, text: lang === 'en' ? formatEnNumber(value) : formatItNumber(value) }
}
