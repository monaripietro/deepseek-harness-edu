import Ajv from 'ajv/dist/2020'
import type { ErrorObject, ValidateFunction } from 'ajv/dist/2020'
import type { JSONSchema } from '../../domain/types'

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

/** Validate tool arguments against a JSON Schema; messages are in Italian. */
export function validateArgs(schema: JSONSchema, args: unknown): { ok: true } | { ok: false; errors: string[] } {
  try {
    const validate = compile(schema)
    if (validate(args)) return { ok: true }
    const errors = [...new Set((validate.errors ?? []).map(italianMessage))]
    return { ok: false, errors: errors.length ? errors : ['argomenti non validi'] }
  } catch (err) {
    return { ok: false, errors: [`schema degli argomenti non valido: ${err instanceof Error ? err.message : String(err)}`] }
  }
}
