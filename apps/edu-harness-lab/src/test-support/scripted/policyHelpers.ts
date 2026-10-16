import type { ContextHints, ToolObservation } from '../../domain/types'

/**
 * Helpers shared by the rule-based policies of the SimulatedModel.
 * A policy sees ONLY the ContextHints: what the harness put in the context.
 */

// ───────────────────────── Formatting (Italian) ─────────────────────────

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/** 1219 -> "1.219,00" */
export function fmtNum(n: number, decimals = 2): string {
  const neg = n < 0
  const [int = '0', dec = ''] = Math.abs(n).toFixed(decimals).split('.')
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${neg ? '-' : ''}${grouped}${decimals > 0 ? `,${dec}` : ''}`
}

/** 1219 -> "1.219,00 €" */
export function fmtEur(n: number): string {
  return `${fmtNum(n, 2)} €`
}

/** 1250 -> "1.250 €" (no decimals, for round policy figures) */
export function fmtEurInt(n: number): string {
  return `${fmtNum(n, 0)} €`
}

// ───────────────────────── Protocol output ─────────────────────────

export function isJson(h: ContextHints): boolean {
  return h.protocol === 'json'
}

export function toolDecision(strumento: string, argomenti: Record<string, unknown>, motivazione: string): string {
  return JSON.stringify({ azione: 'usa_strumento', strumento, argomenti, motivazione })
}

export function answerDecision(testo: string, fonti?: string[]): string {
  return JSON.stringify({ azione: 'rispondi', testo, ...(fonti && fonti.length ? { fonti } : {}) })
}

export function askDecision(domanda: string): string {
  return JSON.stringify({ azione: 'chiedi', domanda })
}

/** Final answer in the active protocol: JSON object when tools are around, plain text otherwise. */
export function reply(h: ContextHints, testo: string, fonti: string[] = []): string {
  return isJson(h) ? answerDecision(testo, fonti) : testo
}

/** A clarifying question in the active protocol. */
export function ask(h: ContextHints, domanda: string): string {
  return isJson(h) ? askDecision(domanda) : domanda
}

// ───────────────────────── Reading the context ─────────────────────────

export const hasKind = (h: ContextHints, kind: ContextHints['presentKinds'][number]): boolean => h.presentKinds.includes(kind)
export const hasInstructions = (h: ContextHints): boolean => hasKind(h, 'instruction')
export const hasDoc = (h: ContextHints, id: string): boolean => h.docIds.includes(id)
export const hasTool = (h: ContextHints, id: string): boolean => h.availableTools.includes(id)
export const hasMemory = (h: ContextHints, key: string): boolean => h.memoryKeys.includes(key)

export type ArgPredicate = (args: Record<string, unknown>) => boolean

export function obsOf(h: ContextHints, tool: string, same?: ArgPredicate): ToolObservation[] {
  return h.toolResults.filter(o => o.tool === tool && (!same || same(o.args)))
}

export type OkData = { data: Record<string, unknown>; summary: string }

/** Last successful observation of a tool (optionally for matching args). */
export function okOf(h: ContextHints, tool: string, same?: ArgPredicate): OkData | undefined {
  const list = obsOf(h, tool, same).filter(o => o.outcome.ok)
  const last = list[list.length - 1]
  if (!last || !last.outcome.ok) return undefined
  const d = last.outcome.data
  return { data: d && typeof d === 'object' ? (d as Record<string, unknown>) : {}, summary: last.outcome.summary }
}

export function failuresOf(h: ContextHints, tool: string, same?: ArgPredicate): Extract<ToolObservation['outcome'], { ok: false }>[] {
  return obsOf(h, tool, same).flatMap(o => (o.outcome.ok ? [] : [o.outcome]))
}

export type StepState =
  | { kind: 'ok'; data: Record<string, unknown>; summary: string }
  | { kind: 'todo'; retry: boolean }
  | { kind: 'failed'; message: string; code: string }

/**
 * State of one tool call: done, to be (re)issued, or given up after two failures.
 * A first TIMEOUT / TOOL_ERROR / INVALID_ARGS means "retry the same call once".
 */
export function stepState(h: ContextHints, tool: string, same?: ArgPredicate): StepState {
  const ok = okOf(h, tool, same)
  if (ok) return { kind: 'ok', ...ok }
  const fails = failuresOf(h, tool, same)
  const last = fails[fails.length - 1]
  if (fails.length >= 2 && last) return { kind: 'failed', message: last.message, code: last.code }
  return { kind: 'todo', retry: fails.length > 0 }
}

export const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
export const text = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)

export interface CatalogItem {
  code: string
  name: string
  category: string
  price: number
  specs: string
}

/** Products from a cerca_catalogo observation. */
export function catalogItems(data: Record<string, unknown>): CatalogItem[] {
  const list = Array.isArray(data.prodotti) ? data.prodotti : []
  const out: CatalogItem[] = []
  for (const p of list) {
    if (!p || typeof p !== 'object') continue
    const r = p as Record<string, unknown>
    const code = text(r.codice)
    const price = num(r.prezzo_eur_iva_esclusa)
    if (!code || price === undefined) continue
    out.push({ code, name: text(r.nome) ?? code, category: text(r.categoria) ?? '', price, specs: text(r.specifiche) ?? '' })
  }
  return out.sort((a, b) => a.price - b.price)
}

/** Does a cerca_policy observation contain a passage of this document? */
export function policyResultHasDoc(h: ContextHints, docId: string): boolean {
  const ok = okOf(h, 'cerca_policy')
  if (!ok) return false
  const list = Array.isArray(ok.data.risultati) ? ok.data.risultati : []
  return list.some(r => !!r && typeof r === 'object' && (r as Record<string, unknown>).doc_id === docId)
}

/** Document available either in the context (RAG) or through a policy search. */
export function knowsDoc(h: ContextHints, docId: string): boolean {
  return hasDoc(h, docId) || policyResultHasDoc(h, docId)
}

export function rejectedByHuman(h: ContextHints, tool: string): boolean {
  return failuresOf(h, tool).some(f => f.code === 'DENIED' && /rifiutato/i.test(f.message))
}

export function deniedByControls(h: ContextHints, tool: string): boolean {
  return failuresOf(h, tool).some(f => f.code === 'DENIED' && !/rifiutato/i.test(f.message))
}

export function toolLabel(tool: string): string {
  const labels: Record<string, string> = {
    cerca_catalogo: 'la ricerca nel catalogo',
    verifica_disponibilita: 'la verifica della disponibilità a magazzino',
    calcolatrice: 'il calcolo',
    leggi_budget: 'la lettura del budget',
    mcp__techsupply__verifica_consegna: 'la verifica della consegna del fornitore',
    crea_richiesta_acquisto: 'la creazione della richiesta d’acquisto',
    crea_attivita: 'la creazione dell’attività',
    cerca_policy: 'la ricerca nelle policy',
    leggi_ordine_cliente: 'la lettura dell’ordine',
    converti_valuta: 'la conversione di valuta',
  }
  return labels[tool] ?? `lo strumento ${tool}`
}
