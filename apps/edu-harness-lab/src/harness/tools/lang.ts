import type { PromptLanguage } from '../../domain/types'
import { formatEnMoney, formatItMoney } from './calculator'

/**
 * Tiny helpers for the texts the model reads in tool results (prompt language 'it' or 'en').
 * The app UI stays Italian: only model-facing texts switch language.
 */

/** The Italian or the English text of a model-facing message (default Italian). */
export function t(lang: PromptLanguage | undefined, it: string, en: string): string {
  return lang === 'en' ? en : it
}

/**
 * Format tool arguments as text; encode objects and arrays as JSON.
 * @param value - Argument supplied to the tool.
 * @returns An empty string for nullish values, otherwise its text or JSON representation.
 * @throws If an object cannot be serialized as JSON.
 */
export function argumentText(value: unknown): string {
  if (value === undefined || value === null) return ''
  switch (typeof value) {
    case 'string':
      return value
    case 'number':
    case 'bigint':
    case 'boolean':
    case 'symbol':
      return String(value)
    case 'function':
      return value.toString()
    default:
      return JSON.stringify(value)
  }
}

/** Euro amount: "1.219,00 €" in Italian, "€1,219.00" in English. */
export function formatEur(n: number, lang: PromptLanguage | undefined): string {
  if (lang !== 'en') return `${formatItMoney(n)} €`
  return n < 0 ? `-€${formatEnMoney(-n)}` : `€${formatEnMoney(n)}`
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** English date: "2026-10-16" or "16/10/2026" -> "16 October 2026"; any other text is returned unchanged. */
export function formatEnDate(text: string): string {
  const s = text.trim()
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  const it = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s)
  const [y, m, d] = iso ? [iso[1], iso[2], iso[3]] : it ? [it[3], it[2], it[1]] : []
  const month = MONTHS[Number(m) - 1]
  const day = Number(d)
  if (!y || !month || !Number.isInteger(day) || day < 1 || day > 31) return text
  return `${day} ${month} ${y}`
}

/** "1 working day", "3 working days". */
export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

/**
 * An error whose message is Italian (shown in the app) with an English version for the model.
 * `message` stays Italian so the UI and existing checks are unchanged.
 */
export class LocalizedError extends Error {
  readonly en: string
  constructor(it: string, en: string) {
    super(it)
    this.en = en
  }
}

/** Text of an error in the prompt language: the English version of a LocalizedError when `lang` is 'en'. */
export function errorText(err: unknown, lang: PromptLanguage | undefined): string {
  if (lang === 'en' && err instanceof LocalizedError) return err.en
  return err instanceof Error ? err.message : String(err)
}
