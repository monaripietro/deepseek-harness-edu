import type { JSONSchema, Product, PromptLanguage, ToolDefinition, ToolExecContext, ToolOutcome } from '../../domain/types'
import { REAL_LOCAL, SIMULATED_LOCAL } from '../../domain/types'
import { DEFAULT_RAG } from '../levels'
import { businessLog } from './businessLog'
import { CalcError, calculate, formatEnMoney, formatEnNumber, formatItMoney, formatItNumber } from './calculator'
import { argumentText, formatEnDate, formatEur, plural, t } from './lang'
import { normalize } from '../rag/text'

const SIM_NOTE = '(SIMULATO: nessun sistema reale è stato modificato)'
const SIM_NOTE_EN = '(SIMULATED: no real system was changed)'
const VAT_RATE = 0.22

// ───────────────────────── helpers ─────────────────────────

function ok(data: unknown, summary: string): ToolOutcome {
  return { ok: true, data, summary }
}
function fail(code: Extract<ToolOutcome, { ok: false }>['code'], message: string): ToolOutcome {
  return { ok: false, code, message }
}
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}
/** Euro amount in the prompt language: "1.219,00 €" (default Italian) or "€1,219.00". */
function eur(n: number, lang?: PromptLanguage): string {
  return formatEur(n, lang)
}
function str(v: unknown): string {
  return argumentText(v).trim()
}

/** Next simulated id: PREFIX-SIM-2026-NNNN, numbered from the entries already in the business log. */
function nextSimId(prefix: string, firstNumber: number): string {
  const tag = `${prefix}-SIM-2026-`
  const used = businessLog.list().filter(e => e.id.startsWith(tag)).length
  return `${tag}${String(firstNumber + used).padStart(4, '0')}`
}

function logAction(id: string, tool: string, title: string, details: string): void {
  businessLog.add({ id, tool, title, details })
}

function schema(properties: Record<string, unknown>, required: string[]): JSONSchema {
  return { type: 'object', properties, required, additionalProperties: false }
}

const DATE_PATTERN = '^\\d{4}-\\d{2}-\\d{2}$'

type ToolSpec = Omit<ToolDefinition, 'source' | 'execute'> & {
  execute: (args: Record<string, unknown>, ctx: ToolExecContext) => Promise<ToolOutcome> | ToolOutcome
}

function define(spec: ToolSpec): ToolDefinition {
  const { execute, ...rest } = spec
  return { ...rest, source: 'builtin', execute: async (args, ctx) => execute(args, ctx) }
}

function findProduct(ctx: ToolExecContext, code: string): Product | undefined {
  const c = code.trim().toUpperCase()
  return ctx.data.catalog.find(p => p.code.toUpperCase() === c)
}

function describeProduct(p: Product, lang?: PromptLanguage): string {
  return lang === 'en'
    ? `${p.code} - ${p.name} (Category ${p.category}, ${eur(p.priceEur, lang)} excl. VAT; ${p.specs})`
    : `${p.code} - ${p.name} (Categoria ${p.category}, ${eur(p.priceEur)} IVA esclusa; ${p.specs})`
}

// ───────────────────────── tools ─────────────────────────

const calcolatrice = define({
  id: 'calcolatrice',
  title: 'Calcolatrice',
  description: 'Exact calculator for + - * / ^ and parentheses. ALWAYS use it for totals, VAT (multiply by 1.22), percentages and differences. Returns the result with 2 decimals.',
  purpose: 'Esegue calcoli esatti con un parser sicuro (nessun codice eseguito), così i numeri non sono "inventati" dal modello.',
  inputSchema: schema(
    { espressione: { type: 'string', description: 'Arithmetic expression with plain numbers, e.g. "3*250*1.22" or "(500-420)/500*100".' } },
    ['espressione'],
  ),
  output: 'Il risultato numerico (2 decimali) e l\'espressione calcolata.',
  permissions: [],
  risk: 'read',
  approval: 'never',
  provenance: { ...REAL_LOCAL, note: 'parser aritmetico sicuro nel browser' },
  errors: [
    { code: 'INVALID_ARGS', message: 'Espressione non valida (sintassi o caratteri non ammessi).' },
    { code: 'TOOL_ERROR', message: 'Errore di calcolo, ad esempio divisione per zero.' },
  ],
  latencyMs: [150, 350],
  execute(args, ctx) {
    const lang = ctx.lang
    const expr = str(args.espressione)
    try {
      const { value, text } = calculate(expr, lang)
      return ok({ espressione: expr, risultato: value }, `${expr} = ${text}`)
    } catch (err) {
      if (err instanceof CalcError) {
        return err.kind === 'math'
          ? fail('TOOL_ERROR', t(lang, `Errore di calcolo: ${err.message}.`, `Calculation error: ${err.en}.`))
          : fail('INVALID_ARGS', t(lang, `Espressione non valida: ${err.message}.`, `Invalid expression: ${err.en}.`))
      }
      return fail('TOOL_ERROR', t(lang, 'Errore di calcolo imprevisto.', 'Unexpected calculation error.'))
    }
  },
})

const CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF'] as const

const converti_valuta = define({
  id: 'converti_valuta',
  title: 'Convertitore di valuta',
  description: 'Converts an amount between EUR, USD, GBP and CHF with fixed teaching rates. Use it when a price is not in EUR.',
  purpose: 'Mostra uno strumento di calcolo che usa una tabella di tassi preconfigurata e datata.',
  inputSchema: schema(
    {
      importo: { type: 'number', description: 'Amount to convert, a plain number, e.g. 250.' },
      da: { type: 'string', enum: [...CURRENCIES], description: 'Currency of the amount, e.g. "USD".' },
      a: { type: 'string', enum: [...CURRENCIES], description: 'Target currency, usually "EUR".' },
    },
    ['importo', 'da', 'a'],
  ),
  output: 'Importo convertito (2 decimali), tasso usato e data della tabella dei tassi.',
  permissions: [],
  risk: 'read',
  approval: 'never',
  provenance: { ...REAL_LOCAL, note: 'calcolo reale con tassi fissi didattici (tabella preconfigurata)' },
  errors: [{ code: 'INVALID_ARGS', message: 'Valuta non supportata o importo non valido.' }],
  latencyMs: [150, 300],
  execute(args, ctx) {
    const lang = ctx.lang
    const importo = Number(args.importo)
    const da = str(args.da).toUpperCase()
    const a = str(args.a).toUpperCase()
    const rates: Record<string, number> = { EUR: 1, ...ctx.data.fx.rates }
    const rFrom = rates[da]
    const rTo = rates[a]
    if (!Number.isFinite(importo)) {
      return fail('INVALID_ARGS', t(lang, "L'importo non è un numero valido.", 'The amount is not a valid number.'))
    }
    if (rFrom === undefined || rTo === undefined) {
      const list = CURRENCIES.join(', ')
      return fail('INVALID_ARGS', t(lang, `Valuta non supportata: usa ${list}.`, `Unsupported currency: use ${list}.`))
    }
    const converted = round2((importo / rFrom) * rTo)
    const rate = rTo / rFrom
    const shownRate = round2(rate * 10000) / 10000
    const date = ctx.data.fx.date
    const summary = lang === 'en'
      ? `${formatEnMoney(importo)} ${da} = ${formatEnMoney(converted)} ${a} ` +
        `(fixed teaching rate ${formatEnNumber(shownRate)} as of ${formatEnDate(date)}, not a market rate)`
      : `${formatItMoney(importo)} ${da} = ${formatItMoney(converted)} ${a} ` +
        `(tasso ${formatItNumber(shownRate)} fisso didattico del ${date}, non un tasso di mercato)`
    return ok({ importo, da, a, risultato: converted, tasso: rate, data_tassi: date }, summary)
  },
})

const cerca_policy = define({
  id: 'cerca_policy',
  title: 'Cerca nelle policy aziendali',
  description: 'Searches the company policies (IT equipment, purchases, remote work, travel, expenses). Returns passages with their document ID. Use it for any company rule, limit or approval threshold, then cite the ID.',
  purpose: 'Usa lo stesso motore di ricerca locale della RAG: mostra come un tool può recuperare conoscenza.',
  inputSchema: schema(
    {
      domanda: { type: 'string', description: 'A few ITALIAN keywords, e.g. "notebook commerciali categoria" or "rimborso chilometrico".' },
      max_risultati: { type: 'integer', minimum: 1, maximum: 8, description: 'Optional: how many passages, default 3.' },
    },
    ['domanda'],
  ),
  output: 'Elenco di passaggi con identificativo del documento, titolo, versione e testo.',
  permissions: ['read:policies'],
  risk: 'read',
  approval: 'never',
  provenance: { ...REAL_LOCAL, note: 'ricerca reale sul corpus locale di documenti fittizi' },
  errors: [{ code: 'EMPTY', message: 'Nessun passaggio pertinente trovato.' }],
  latencyMs: [250, 600],
  execute(args, ctx) {
    const lang = ctx.lang
    const domanda = str(args.domanda)
    const topK = typeof args.max_risultati === 'number' ? args.max_risultati : 3
    const hits = ctx.retriever.search(domanda, { ...DEFAULT_RAG, topK }).filter(h => h.status === 'selected')
    if (hits.length === 0) {
      return fail('EMPTY', t(lang, `Nessun passaggio pertinente trovato per "${domanda}".`, `No relevant passage found for "${domanda}".`))
    }
    const risultati = hits.map(h => ({
      doc_id: h.doc.id,
      chunk_id: h.chunk.id,
      titolo: h.doc.title,
      versione: h.doc.version,
      sezione: h.chunk.heading,
      testo: h.chunk.text,
      punteggio: round2(h.normalized),
    }))
    const lines = risultati.map(r => `[${r.doc_id}] ${r.titolo} (${r.versione}) - ${r.sezione}: ${r.testo}`).join('\n')
    const found = t(lang, `Trovati ${risultati.length} passaggi`, `Found ${plural(risultati.length, 'passage', 'passages')}`)
    return ok({ risultati }, `${found}:\n${lines}`)
  },
})

const cerca_catalogo = define({
  id: 'cerca_catalogo',
  title: 'Cerca nel catalogo prodotti',
  description: 'Lists products of the company catalog with code, name, unit price (EUR, VAT excluded) and specs. Simplest call: only the category, e.g. {"categoria": "B"}. Never invent codes or prices.',
  purpose: 'Interroga un catalogo fittizio: i prezzi usati nelle risposte devono provenire da qui.',
  inputSchema: schema(
    {
      categoria: { type: 'string', enum: ['A', 'B', 'C'], description: 'Equipment category: "A", "B" or "C".' },
      testo: { type: 'string', description: 'Optional: ONE word from the product name, e.g. "Vega". Leave it out to list the whole category.' },
      prezzo_max: { type: 'number', description: 'Optional: maximum unit price in EUR, VAT excluded.' },
    },
    [],
  ),
  output: 'Elenco di prodotti con codice, nome, categoria, prezzo IVA esclusa e specifiche.',
  permissions: ['read:catalog'],
  risk: 'read',
  approval: 'never',
  provenance: { ...SIMULATED_LOCAL, note: 'catalogo fittizio a scopo didattico' },
  errors: [{ code: 'EMPTY', message: 'Nessun prodotto corrisponde ai filtri.' }],
  latencyMs: [250, 700],
  execute(args, ctx) {
    const lang = ctx.lang
    const categoria = str(args.categoria).toUpperCase()
    const testo = normalize(str(args.testo))
    const words = testo.split(/\s+/).filter(Boolean)
    const prezzoMax = typeof args.prezzo_max === 'number' ? args.prezzo_max : undefined
    const base = ctx.data.catalog.filter(
      p => (!categoria || p.category === categoria) && (prezzoMax === undefined || p.priceEur <= prezzoMax),
    )
    const hay = (p: Product) => normalize(`${p.code} ${p.name} ${p.specs}`)
    // Small models often pass extra words (company name, whole sentences): fall back from "all words" to "any word" to "no text filter".
    let found = words.length ? base.filter(p => words.every(w => hay(p).includes(w))) : base
    if (!found.length && words.length) found = base.filter(p => words.some(w => w.length > 2 && hay(p).includes(w)))
    let note = ''
    if (!found.length && words.length && base.length) {
      found = base
      note = t(
        lang,
        ` (nessun prodotto contiene "${str(args.testo)}": ecco tutti i prodotti${categoria ? ` della categoria ${categoria}` : ''})`,
        ` (no product contains "${str(args.testo)}": here are all the products${categoria ? ` in category ${categoria}` : ''})`,
      )
    }
    if (found.length === 0) {
      return fail('EMPTY', t(lang, 'Nessun prodotto corrisponde ai filtri indicati.', 'No product matches the given filters.'))
    }
    const prodotti = found.map(p => ({
      codice: p.code,
      nome: p.name,
      categoria: p.category,
      prezzo_eur_iva_esclusa: p.priceEur,
      specifiche: p.specs,
    }))
    const head = t(lang, `Trovati ${found.length} prodotti`, `Found ${plural(found.length, 'product', 'products')}`)
    return ok({ prodotti }, `${head}${note}:\n${found.map(p => describeProduct(p, lang)).join('\n')}`)
  },
})

const verifica_disponibilita = define({
  id: 'verifica_disponibilita',
  title: 'Verifica disponibilità a magazzino',
  description: 'Checks if the warehouse has enough units of one product for the needed quantity, and the delivery time. Use it before choosing a product to buy.',
  purpose: 'Interroga un magazzino fittizio; può essere reso lento o in errore dal pannello dei guasti.',
  inputSchema: schema(
    {
      codice: { type: 'string', description: 'Product code exactly as in the catalog result (format "NB-...").' },
      quantita: { type: 'integer', minimum: 1, description: 'Number of units needed, an integer, e.g. 3.' },
    },
    ['codice', 'quantita'],
  ),
  output: 'Codice, quantità richiesta e disponibile, se è sufficiente e giorni lavorativi di consegna.',
  permissions: ['read:inventory'],
  risk: 'read',
  approval: 'never',
  provenance: { ...SIMULATED_LOCAL, note: 'magazzino fittizio' },
  errors: [
    { code: 'TIMEOUT', message: 'Il magazzino non risponde in tempo (guasto iniettabile).' },
    { code: 'EMPTY', message: 'Codice articolo sconosciuto.' },
  ],
  latencyMs: [300, 800],
  execute(args, ctx) {
    const lang = ctx.lang
    const codice = str(args.codice).toUpperCase()
    const richiesti = Number(args.quantita)
    const entry = ctx.data.stock[codice]
    if (!entry) {
      return fail('EMPTY', t(lang, `Codice articolo sconosciuto: ${codice || '(vuoto)'}.`, `Unknown product code: ${codice || '(empty)'}.`))
    }
    const sufficiente = entry.available >= richiesti
    const data = { codice, richiesti, disponibili: entry.available, sufficiente, consegna_giorni_lavorativi: entry.deliveryDays }
    if (lang === 'en') {
      const missing = plural(richiesti - entry.available, 'unit', 'units')
      const verdict = sufficiente ? 'quantity SUFFICIENT' : `quantity NOT sufficient (${missing} short)`
      const days = plural(entry.deliveryDays, 'working day', 'working days')
      return ok(data, `${codice}: requested ${richiesti}, in stock ${entry.available} - ${verdict}. Estimated delivery: ${days}.`)
    }
    const verdict = sufficiente ? 'quantità SUFFICIENTE' : `quantità NON sufficiente (mancano ${richiesti - entry.available} pezzi)`
    return ok(
      data,
      `${codice}: richiesti ${richiesti}, disponibili ${entry.available} - ${verdict}. Consegna stimata: ${entry.deliveryDays} giorni lavorativi.`,
    )
  },
})

const leggi_budget = define({
  id: 'leggi_budget',
  title: 'Leggi budget del centro di costo',
  description: 'Reads the remaining budget (EUR, VAT excluded) of the user\'s own cost center. Other departments are not allowed.',
  purpose: 'Mostra un controllo di autorizzazione: lo strumento rifiuta i centri di costo altrui.',
  inputSchema: schema({ centro_di_costo: { type: 'string', description: 'Cost center code from memory or task data (format "CC-...").' } }, ['centro_di_costo']),
  output: 'Budget residuo in euro IVA esclusa, periodo e responsabile.',
  permissions: ['read:budget'],
  risk: 'read',
  approval: 'never',
  provenance: { ...SIMULATED_LOCAL, note: 'dati di budget fittizi' },
  errors: [{ code: 'NOT_AUTHORIZED', message: 'Centro di costo non appartenente all\'utente.' }],
  latencyMs: [250, 600],
  execute(args, ctx) {
    const lang = ctx.lang
    const cc = str(args.centro_di_costo).toUpperCase()
    const own = ctx.data.user.costCenter
    if (cc !== own.toUpperCase()) {
      return fail(
        'NOT_AUTHORIZED',
        t(
          lang,
          `Non sei autorizzato a leggere il budget del centro di costo ${cc}: puoi consultare solo ${own}.`,
          `You are not authorized to read the budget of cost center ${cc}: you can only read ${own}.`,
        ),
      )
    }
    const b = ctx.data.budgets[own] ?? ctx.data.budgets[cc]
    if (!b) return fail('EMPTY', t(lang, `Nessun budget registrato per ${cc}.`, `No budget recorded for ${cc}.`))
    return ok(
      { centro_di_costo: cc, residuo_eur_iva_esclusa: b.residualEur, periodo: b.period, responsabile: b.owner },
      t(
        lang,
        `Budget residuo ${cc} (${b.period}): ${eur(b.residualEur)} IVA esclusa. Responsabile: ${b.owner}.`,
        `Remaining budget of ${cc} (${b.period}): ${eur(b.residualEur, lang)} excl. VAT. Budget owner: ${b.owner}.`,
      ),
    )
  },
})

const leggi_ordine_cliente = define({
  id: 'leggi_ordine_cliente',
  title: 'Leggi ordine cliente',
  description: 'Reads status, expected delivery date and notes of a customer order. Use it for any question about an order.',
  purpose: 'Interroga un gestionale ordini fittizio.',
  inputSchema: schema({ numero_ordine: { type: 'string', description: 'Order number exactly as written by the user (format "ORD-...").' } }, ['numero_ordine']),
  output: 'Cliente, stato, consegna prevista e note dell\'ordine.',
  permissions: ['read:customers'],
  risk: 'read',
  approval: 'never',
  provenance: { ...SIMULATED_LOCAL, note: 'ordini fittizi' },
  errors: [{ code: 'EMPTY', message: 'Ordine non trovato.' }],
  latencyMs: [250, 650],
  execute(args, ctx) {
    const lang = ctx.lang
    const numero = str(args.numero_ordine).toUpperCase()
    const key = Object.keys(ctx.data.orders).find(k => k.toUpperCase() === numero)
    const o = key ? ctx.data.orders[key] : undefined
    if (!key || !o) return fail('EMPTY', t(lang, `Ordine ${numero || '(vuoto)'} non trovato.`, `Order ${numero || '(empty)'} not found.`))
    return ok(
      { numero_ordine: key, cliente: o.customer, stato: o.status, consegna_prevista: o.expected, note: o.note },
      t(
        lang,
        `Ordine ${key} del cliente ${o.customer}: stato "${o.status}", consegna prevista ${o.expected}. Note: ${o.note}`,
        `Order ${key} for customer ${o.customer}: status "${o.status}", expected delivery ${formatEnDate(o.expected)}. Notes: ${o.note}`,
      ),
    )
  },
})

const leggi_scheda_dipendente = define({
  id: 'leggi_scheda_dipendente',
  title: 'Leggi scheda dipendente (dati sensibili)',
  description: 'Reads an employee\'s personal HR file (sensitive data). Needs special permission and human approval. Use it only if truly necessary.',
  purpose: 'Mostra come i dati sensibili richiedano permessi dedicati e supervisione umana.',
  inputSchema: schema({ nome: { type: 'string', description: 'Full name of the employee.' } }, ['nome']),
  output: 'Ruolo e sede del dipendente, se il ruolo dell\'utente è autorizzato.',
  permissions: ['use:sensitive'],
  risk: 'read',
  approval: 'always',
  provenance: { ...SIMULATED_LOCAL, note: 'schede dipendenti fittizie' },
  errors: [{ code: 'NOT_AUTHORIZED', message: 'Il ruolo dell\'utente non può leggere dati sensibili.' }],
  latencyMs: [300, 700],
  execute(args, ctx) {
    const nome = str(args.nome)
    const role = ctx.data.user.role
    return fail(
      'NOT_AUTHORIZED',
      t(
        ctx.lang,
        `Accesso negato: la scheda di ${nome || 'questo dipendente'} contiene dati sensibili e il ruolo "${role}" ` +
          'non è autorizzato a leggerla.',
        `Access denied: the HR file of ${nome || 'this employee'} contains sensitive data and the role "${role}" ` +
          'is not authorized to read it.',
      ),
    )
  },
})

const registra_evento = define({
  id: 'registra_evento',
  title: 'Registra evento nel registro aziendale',
  description: 'Writes one line in the company event log (simulated), e.g. a note or an outcome. Low risk: it changes nothing else.',
  purpose: 'Esempio di scrittura a basso rischio: visibile nel registro dei sistemi aziendali simulati.',
  inputSchema: schema(
    {
      tipo: { type: 'string', description: 'Event type: "nota", "esito" or "promemoria".' },
      descrizione: { type: 'string', minLength: 1, description: 'Short description in Italian.' },
    },
    ['tipo', 'descrizione'],
  ),
  output: 'Identificativo simulato dell\'evento (EVT-SIM-…).',
  permissions: ['write:data'],
  risk: 'write',
  approval: 'never',
  provenance: { ...SIMULATED_LOCAL, note: 'registro aziendale simulato, visibile nell\'app' },
  errors: [{ code: 'INVALID_ARGS', message: 'Tipo o descrizione mancanti.' }],
  latencyMs: [150, 400],
  execute(args, ctx) {
    const lang = ctx.lang
    const tipo = str(args.tipo)
    const descrizione = str(args.descrizione)
    if (!tipo || !descrizione) {
      const message = t(lang, 'Servono sia il tipo sia la descrizione dell\'evento.', 'Both the event type and description are required.')
      return fail('INVALID_ARGS', message)
    }
    const id = nextSimId('EVT', 1)
    logAction(id, 'registra_evento', `Evento registrato (${tipo})`, descrizione)
    return ok(
      { id, tipo, descrizione, simulato: true },
      t(
        lang,
        `Evento ${id} registrato nel registro aziendale: [${tipo}] ${descrizione} ${SIM_NOTE}`,
        `Event ${id} recorded in the company log: [${tipo}] ${descrizione} ${SIM_NOTE_EN}`,
      ),
    )
  },
})

const crea_attivita = define({
  id: 'crea_attivita',
  title: 'Crea attività',
  description: 'Creates a follow-up task with title, due date and assignee, optionally linked to a customer (simulated; a person must approve it).',
  purpose: 'Esempio di scrittura con effetti sui sistemi aziendali (simulati).',
  inputSchema: schema(
    {
      titolo: { type: 'string', minLength: 1, description: 'Short task title in Italian.' },
      scadenza: { type: 'string', pattern: DATE_PATTERN, description: 'Due date as YYYY-MM-DD, e.g. "2026-12-01".' },
      assegnatario: { type: 'string', minLength: 1, description: 'Person responsible: the user, unless the request names someone else.' },
      cliente: { type: 'string', description: 'Optional: customer name.' },
    },
    ['titolo', 'scadenza', 'assegnatario'],
  ),
  output: 'Identificativo simulato dell\'attività (ATT-SIM-…).',
  permissions: ['write:tasks'],
  risk: 'write',
  approval: 'always',
  provenance: { ...SIMULATED_LOCAL, note: 'sistema attività simulato' },
  errors: [{ code: 'INVALID_ARGS', message: 'Titolo, scadenza o assegnatario non validi.' }],
  latencyMs: [300, 700],
  execute(args, ctx) {
    const lang = ctx.lang
    const titolo = str(args.titolo)
    const scadenza = str(args.scadenza)
    const assegnatario = str(args.assegnatario)
    const cliente = str(args.cliente)
    if (!titolo || !assegnatario) {
      return fail('INVALID_ARGS', t(lang, 'Titolo e assegnatario sono obbligatori.', 'Title and assignee are required.'))
    }
    if (Number.isNaN(Date.parse(scadenza))) {
      const it = `La scadenza "${scadenza}" non è una data valida (usa AAAA-MM-GG).`
      return fail('INVALID_ARGS', t(lang, it, `The due date "${scadenza}" is not a valid date (use YYYY-MM-DD).`))
    }
    const id = nextSimId('ATT', 1)
    // The business log is shown in the app: Italian. The model reads the summary in the prompt language.
    const details = `${titolo} - scadenza ${scadenza} - assegnata a ${assegnatario}${cliente ? ` - cliente ${cliente}` : ''}`
    logAction(id, 'crea_attivita', 'Attività creata', details)
    const detailsEn = `${titolo} - due ${formatEnDate(scadenza)} - assigned to ${assegnatario}${cliente ? ` - customer ${cliente}` : ''}`
    const summary = lang === 'en' ? `Task ${id} created: ${detailsEn} ${SIM_NOTE_EN}` : `Attività ${id} creata: ${details} ${SIM_NOTE}`
    return ok({ id, titolo, scadenza, assegnatario, cliente: cliente || undefined, simulato: true }, summary)
  },
})

const crea_richiesta_acquisto = define({
  id: 'crea_richiesta_acquisto',
  title: 'Crea richiesta d\'acquisto',
  description: 'Creates a purchase request for one catalog product (simulated; a person must approve it). Call it LAST, after checking policy, stock and budget. The unit price must be the catalog price, VAT excluded.',
  purpose: 'Esempio di azione finale del compito guida: produce una RDA simulata (ID con "SIM").',
  inputSchema: schema(
    {
      centro_di_costo: { type: 'string', description: 'The user\'s cost center (format "CC-...").' },
      codice_articolo: { type: 'string', description: 'Product code chosen from the catalog (format "NB-...").' },
      quantita: { type: 'integer', minimum: 1, description: 'Number of units, an integer.' },
      prezzo_unitario: { type: 'number', exclusiveMinimum: 0, description: 'Unit price in EUR, VAT excluded, copied from the catalog (a number).' },
      motivazione: { type: 'string', minLength: 1, description: 'Short reason in Italian.' },
      consegna: { type: 'string', minLength: 1, description: 'Delivery place and date in Italian, from memory or task data.' },
    },
    ['centro_di_costo', 'codice_articolo', 'quantita', 'prezzo_unitario', 'motivazione', 'consegna'],
  ),
  output: 'Identificativo simulato della richiesta (RDA-SIM-…) con imponibile, IVA e totale.',
  permissions: ['write:requests'],
  risk: 'write',
  approval: 'always',
  provenance: { ...SIMULATED_LOCAL, note: 'sistema acquisti simulato' },
  errors: [
    { code: 'INVALID_ARGS', message: 'Articolo sconosciuto, quantità o prezzo non coerenti col catalogo.' },
    { code: 'DENIED', message: 'Azione non consentita senza supervisione umana.' },
  ],
  latencyMs: [400, 900],
  execute(args, ctx) {
    const lang = ctx.lang
    const cc = str(args.centro_di_costo).toUpperCase()
    const product = findProduct(ctx, str(args.codice_articolo))
    const quantita = Number(args.quantita)
    const prezzo = Number(args.prezzo_unitario)
    const motivazione = str(args.motivazione)
    const consegna = str(args.consegna)
    const own = ctx.data.user.costCenter
    if (cc !== own.toUpperCase()) {
      const it = `Non puoi creare richieste sul centro di costo ${cc}: il tuo è ${own}.`
      return fail('NOT_AUTHORIZED', t(lang, it, `You cannot create requests on cost center ${cc}: yours is ${own}.`))
    }
    if (!product) {
      const code = str(args.codice_articolo)
      const it = `Codice articolo "${code}" non presente nel catalogo.`
      return fail('INVALID_ARGS', t(lang, it, `Product code "${code}" is not in the catalog.`))
    }
    if (!Number.isInteger(quantita) || quantita < 1) {
      const message = t(lang, 'La quantità deve essere un intero di almeno 1.', 'The quantity must be an integer of at least 1.')
      return fail('INVALID_ARGS', message)
    }
    if (Math.abs(prezzo - product.priceEur) > 0.005) {
      return fail(
        'INVALID_ARGS',
        t(
          lang,
          `Il prezzo unitario ${eur(prezzo)} non coincide con il catalogo (${product.code}: ${eur(product.priceEur)} IVA esclusa).`,
          `The unit price ${eur(prezzo, lang)} does not match the catalog (${product.code}: ${eur(product.priceEur, lang)} excl. VAT).`,
        ),
      )
    }
    const imponibile = round2(quantita * product.priceEur)
    const iva = round2(imponibile * VAT_RATE)
    const totale = round2(imponibile + iva)
    const id = nextSimId('RDA', 42)
    // The business log is shown in the app: Italian. The model reads the summary in the prompt language.
    const details = `${quantita} × ${product.code} a ${eur(product.priceEur)} = ${eur(imponibile)} IVA esclusa (IVA 22% ${eur(iva)}, totale ${eur(totale)}) - ${cc} - consegna: ${consegna} - motivo: ${motivazione}`
    logAction(id, 'crea_richiesta_acquisto', 'Richiesta d\'acquisto creata', details)
    const e = (n: number) => eur(n, lang)
    const amounts = `${quantita} × ${product.code} at ${e(product.priceEur)} = ${e(imponibile)} excl. VAT ` +
      `(VAT 22% ${e(iva)}, total ${e(totale)})`
    const summary = lang === 'en'
      ? `Purchase request ${id} created: ${amounts} - ${cc} - delivery: ${consegna} - reason: ${motivazione} ${SIM_NOTE_EN}`
      : `Richiesta d'acquisto ${id} creata: ${details} ${SIM_NOTE}`
    return ok(
      {
        id,
        centro_di_costo: cc,
        codice_articolo: product.code,
        quantita,
        prezzo_unitario: product.priceEur,
        imponibile,
        iva,
        totale,
        consegna,
        motivazione,
        simulato: true,
      },
      summary,
    )
  },
})

const richiedi_approvazione = define({
  id: 'richiedi_approvazione',
  title: 'Richiedi approvazione aziendale',
  description: 'Sends a document (e.g. a purchase request) to the approver required by the company policy (simulated business workflow). Use it only if the policy requires an approval.',
  purpose: 'Distingue l\'approvazione aziendale (azione simulata) dal cancello di supervisione umana dell\'harness.',
  inputSchema: schema(
    {
      tipo: { type: 'string', description: 'Approval type, e.g. "acquisto".' },
      riferimento: { type: 'string', description: 'ID of the document to approve, copied from a tool result (e.g. "RDA-SIM-...").' },
      approvatore: { type: 'string', description: 'Approver role from the policy.' },
    },
    ['tipo', 'riferimento', 'approvatore'],
  ),
  output: 'Identificativo simulato del workflow di approvazione (APP-SIM-…).',
  permissions: ['write:requests'],
  risk: 'write',
  approval: 'always',
  provenance: { ...SIMULATED_LOCAL, note: 'workflow di approvazione simulato' },
  errors: [{ code: 'INVALID_ARGS', message: 'Tipo, riferimento o approvatore mancanti.' }],
  latencyMs: [300, 700],
  execute(args, ctx) {
    const lang = ctx.lang
    const tipo = str(args.tipo)
    const riferimento = str(args.riferimento)
    const approvatore = str(args.approvatore)
    if (!tipo || !riferimento || !approvatore) {
      return fail('INVALID_ARGS', t(lang, 'Servono tipo, riferimento e approvatore.', 'Type, reference and approver are required.'))
    }
    const id = nextSimId('APP', 1)
    const details = `${tipo} - riferimento ${riferimento} - approvatore ${approvatore}`
    logAction(id, 'richiedi_approvazione', 'Approvazione richiesta', details)
    const summary = lang === 'en'
      ? `Approval request ${id} submitted: ${tipo} - reference ${riferimento} - approver ${approvatore} ${SIM_NOTE_EN}`
      : `Richiesta di approvazione ${id} inoltrata: ${details} ${SIM_NOTE}`
    return ok({ id, tipo, riferimento, approvatore, simulato: true }, summary)
  },
})

const invia_messaggio = define({
  id: 'invia_messaggio',
  title: 'Invia messaggio',
  description: 'Sends an email to a person or a customer (simulated; cannot be undone; a person must approve it). Use it only if the user asks to send.',
  purpose: 'Esempio di azione irreversibile: in questa app nessun messaggio parte davvero.',
  inputSchema: schema(
    {
      destinatario: { type: 'string', minLength: 1, description: 'Recipient name or address.' },
      oggetto: { type: 'string', minLength: 1, description: 'Subject in Italian.' },
      testo: { type: 'string', minLength: 1, description: 'Message text in Italian.' },
    },
    ['destinatario', 'oggetto', 'testo'],
  ),
  output: 'Identificativo simulato del messaggio (MSG-SIM-…).',
  permissions: ['send:messages'],
  risk: 'irreversible',
  approval: 'always',
  provenance: { ...SIMULATED_LOCAL, note: 'posta simulata: nessun messaggio reale' },
  errors: [{ code: 'INVALID_ARGS', message: 'Destinatario, oggetto o testo mancanti.' }],
  latencyMs: [300, 800],
  execute(args, ctx) {
    const lang = ctx.lang
    const destinatario = str(args.destinatario)
    const oggetto = str(args.oggetto)
    const testo = str(args.testo)
    if (!destinatario || !oggetto || !testo) {
      return fail('INVALID_ARGS', t(lang, 'Servono destinatario, oggetto e testo.', 'Recipient, subject and text are required.'))
    }
    const id = nextSimId('MSG', 1)
    logAction(id, 'invia_messaggio', `Messaggio a ${destinatario}`, `Oggetto: ${oggetto}\n${testo}`)
    return ok(
      { id, destinatario, oggetto, simulato: true },
      t(
        lang,
        `Messaggio ${id} inviato a ${destinatario} (oggetto: "${oggetto}") ${SIM_NOTE}`,
        `Message ${id} sent to ${destinatario} (subject: "${oggetto}") ${SIM_NOTE_EN}`,
      ),
    )
  },
})

const modifica_dato = define({
  id: 'modifica_dato',
  title: 'Modifica dato aziendale',
  description: 'Changes one field in a company database (cannot be undone). Not needed for normal requests.',
  purpose: 'Strumento presente nel registro ma NON autorizzato per il ruolo dell\'utente demo: mostra come i permessi bloccano un\'azione.',
  inputSchema: schema(
    {
      entita: { type: 'string', description: 'Record type, e.g. "cliente".' },
      campo: { type: 'string', description: 'Field name.' },
      valore: { type: 'string', description: 'New value.' },
    },
    ['entita', 'campo', 'valore'],
  ),
  output: 'Esito della modifica (sempre rifiutata per questo ruolo).',
  permissions: ['write:data'],
  risk: 'irreversible',
  approval: 'always',
  provenance: { ...SIMULATED_LOCAL, note: 'archivio simulato' },
  errors: [{ code: 'NOT_AUTHORIZED', message: 'Il ruolo dell\'utente non può modificare dati.' }],
  latencyMs: [250, 600],
  forbiddenForRole: true,
  execute(args, ctx) {
    const id = nextSimId('MOD', 1)
    logAction(id, 'modifica_dato', 'Modifica RIFIUTATA (permessi insufficienti)', `${str(args.entita)}.${str(args.campo)} = ${str(args.valore)}`)
    const role = ctx.data.user.role
    return fail(
      'NOT_AUTHORIZED',
      t(
        ctx.lang,
        `Modifica rifiutata (${id}): il ruolo "${role}" non ha il permesso di modificare dati. Nessun dato è stato cambiato ${SIM_NOTE}`,
        `Change refused (${id}): the role "${role}" is not allowed to change data. No data was changed ${SIM_NOTE_EN}`,
      ),
    )
  },
})

export const BUILTIN_TOOLS: ToolDefinition[] = [
  calcolatrice,
  converti_valuta,
  cerca_policy,
  cerca_catalogo,
  verifica_disponibilita,
  leggi_budget,
  leggi_ordine_cliente,
  leggi_scheda_dipendente,
  registra_evento,
  crea_attivita,
  crea_richiesta_acquisto,
  richiedi_approvazione,
  invia_messaggio,
  modifica_dato,
]
