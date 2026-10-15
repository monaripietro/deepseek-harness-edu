import type { JSONSchema, ToolDefinition } from '../../domain/types'

export const FAULT_LABEL = '(guasto iniettato dal docente)'

/** JSON with object keys sorted recursively: identical arguments always give the same string. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const obj = value as Record<string, unknown>
  return `{${Object.keys(obj)
    .sort()
    .map(k => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(',')}}`
}

export function callSignature(tool: string, args: Record<string, unknown>): string {
  return `${tool}::${stableStringify(args)}`
}

export interface RepeatDetector {
  /** Registers a call and returns how many consecutive identical calls there are (1 = first). */
  record(tool: string, args: Record<string, unknown>): number
  reset(): void
}

export function createRepeatDetector(): RepeatDetector {
  let last = ''
  let count = 0
  return {
    record(tool, args) {
      const sig = callSignature(tool, args)
      count = sig === last ? count + 1 : 1
      last = sig
      return count
    },
    reset() {
      last = ''
      count = 0
    },
  }
}

/** Injected fault: removes a required property (or breaks a property type) so validation fails. */
export function corruptArgs(schema: JSONSchema, args: Record<string, unknown>): { args: Record<string, unknown>; changed: boolean } {
  const required = Array.isArray(schema.required) ? (schema.required as unknown[]).filter((r): r is string => typeof r === 'string') : []
  const target = required.find(r => r in args)
  if (target) {
    const { [target]: _removed, ...rest } = args
    void _removed
    return { args: rest, changed: true }
  }
  const first = Object.keys(args)[0]
  if (first) return { args: { ...args, [first]: { valore: args[first] } }, changed: true }
  return { args, changed: false }
}

/** Id of a simulated action ("...SIM...") returned by a tool, if any. */
export function simulatedActionId(data: unknown): string | null {
  if (data && typeof data === 'object') {
    const id = (data as Record<string, unknown>).id
    if (typeof id === 'string' && id.includes('SIM')) return id
  }
  return null
}

const EFFECTS: Record<string, string> = {
  crea_richiesta_acquisto: 'Crea una richiesta di acquisto (simulata) che impegna budget del centro di costo e avvia l’ordine al fornitore.',
  crea_attivita: 'Crea un’attività (simulata) assegnata a una persona, con scadenza.',
  richiedi_approvazione: 'Invia una richiesta di approvazione (simulata) al responsabile previsto dalla policy.',
  invia_messaggio: 'Invia un messaggio (simulato) a un destinatario: l’invio non si può annullare.',
  modifica_dato: 'Modifica un dato aziendale (simulato): l’operazione non si può annullare e il tuo ruolo non la prevede.',
  leggi_scheda_dipendente: 'Legge la scheda di una persona, che contiene dati sensibili.',
  registra_evento: 'Scrive una riga nel registro aziendale (simulato).',
}

export function effectsFor(tool: ToolDefinition): string {
  return EFFECTS[tool.id] ?? `Esegue «${tool.title}» (azione simulata, rischio: ${tool.risk}) con gli argomenti indicati.`
}

export function shortenText(text: string, max = 160): string {
  const t = text.replace(/\s+/g, ' ').trim()
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}
