import Ajv from 'ajv/dist/2020'
import type { ErrorObject, ValidateFunction } from 'ajv/dist/2020'
import type { JSONSchema, PromptLanguage } from '../../domain/types'

const ajv = new Ajv({ allErrors: true, strict: false })
const cache = new WeakMap<object, ValidateFunction>()

function compile(schema: JSONSchema): ValidateFunction {
  let v = cache.get(schema)
  if (!v) {
    v = ajv.compile(schema)
    cache.set(schema, v)
  }
  return v
}

function italianMessage(e: ErrorObject): string {
  const field = e.instancePath.replace(/^\//, '').replace(/\//g, '.')
  const label = field ? `'${field}'` : "l'oggetto degli argomenti"
  const p = e.params as Record<string, unknown>
  switch (e.keyword) {
    case 'required':
      return `manca il campo obbligatorio '${String(p.missingProperty)}'`
    case 'additionalProperties':
      return `campo non previsto '${String(p.additionalProperty)}'`
    case 'type': {
      const names: Record<string, string> = {
        integer: 'un intero',
        number: 'un numero',
        string: 'una stringa di testo',
        boolean: 'vero o falso',
        object: 'un oggetto',
        array: 'una lista',
      }
      const t = String(p.type)
      return `${label} deve essere ${names[t] ?? t}`
    }
    case 'enum':
      return `${label} deve essere uno tra: ${(p.allowedValues as unknown[]).map(String).join(', ')}`
    case 'const':
      return `${label} deve valere ${String(p.allowedValue)}`
    case 'minimum':
      return `${label} deve essere maggiore o uguale a ${String(p.limit)}`
    case 'maximum':
      return `${label} deve essere minore o uguale a ${String(p.limit)}`
    case 'exclusiveMinimum':
      return `${label} deve essere maggiore di ${String(p.limit)}`
    case 'exclusiveMaximum':
      return `${label} deve essere minore di ${String(p.limit)}`
    case 'minLength':
      return `${label} deve avere almeno ${String(p.limit)} caratteri`
    case 'maxLength':
      return `${label} deve avere al massimo ${String(p.limit)} caratteri`
    case 'pattern':
      return `${label} non ha il formato atteso`
    case 'format':
      return `${label} non ha il formato atteso (${String(p.format)})`
    default:
      return `${label} non è valido${e.message ? ` (${e.message})` : ''}`
  }
}

function englishMessage(e: ErrorObject): string {
  const field = e.instancePath.replace(/^\//, '').replace(/\//g, '.')
  const label = field ? `'${field}'` : 'the arguments object'
  const p = e.params as Record<string, unknown>
  switch (e.keyword) {
    case 'required':
      return `missing required field '${String(p.missingProperty)}'`
    case 'additionalProperties':
      return `unexpected field '${String(p.additionalProperty)}'`
    case 'type': {
      const names: Record<string, string> = {
        integer: 'an integer',
        number: 'a number',
        string: 'a text string',
        boolean: 'true or false',
        object: 'an object',
        array: 'a list',
      }
      const t = String(p.type)
      return `${label} must be ${names[t] ?? t}`
    }
    case 'enum':
      return `${label} must be one of: ${(p.allowedValues as unknown[]).map(String).join(', ')}`
    case 'const':
      return `${label} must be ${String(p.allowedValue)}`
    case 'minimum':
      return `${label} must be greater than or equal to ${String(p.limit)}`
    case 'maximum':
      return `${label} must be less than or equal to ${String(p.limit)}`
    case 'exclusiveMinimum':
      return `${label} must be greater than ${String(p.limit)}`
    case 'exclusiveMaximum':
      return `${label} must be less than ${String(p.limit)}`
    case 'minLength':
      return `${label} must have at least ${String(p.limit)} characters`
    case 'maxLength':
      return `${label} must have at most ${String(p.limit)} characters`
    case 'pattern':
      return `${label} does not have the expected format`
    case 'format':
      return `${label} does not have the expected format (${String(p.format)})`
    default:
      return `${label} is not valid${e.message ? ` (${e.message})` : ''}`
  }
}

/** Validate tool arguments against a JSON Schema; messages in the prompt language (default Italian). */
export function validateArgs(schema: JSONSchema, args: unknown, lang?: PromptLanguage): { ok: true } | { ok: false; errors: string[] } {
  const en = lang === 'en'
  try {
    const validate = compile(schema)
    if (validate(args)) return { ok: true }
    const errors = [...new Set((validate.errors ?? []).map(en ? englishMessage : italianMessage))]
    return { ok: false, errors: errors.length ? errors : [en ? 'invalid arguments' : 'argomenti non validi'] }
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    return { ok: false, errors: [en ? `invalid arguments schema: ${detail}` : `schema degli argomenti non valido: ${detail}`] }
  }
}
