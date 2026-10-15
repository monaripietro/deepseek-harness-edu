/**
 * TEST FIXTURE ONLY — scripted policy that imitates a model for the guide scenario,
 * used to exercise the orchestrator deterministically. Never used by the app.
 */
import type { ContextHints } from '../../domain/types'
import {
  answerDecision,
  askDecision,
  catalogItems,
  deniedByControls,
  fmtEur,
  fmtEurInt,
  hasDoc,
  hasInstructions,
  hasKind,
  hasMemory,
  hasTool,
  knowsDoc,
  num,
  okOf,
  rejectedByHuman,
  round2,
  stepState,
  text,
  toolDecision,
  toolLabel,
  type CatalogItem,
} from './policyHelpers'


const QTY = 4
const VAT = 1.22
const CAP_BOLOGNA = '40128'
const CC = 'CC-410'
const LIMIT_B = 1250
const MCP_DELIVERY = 'mcp__techsupply__verifica_consegna'

// ═════════════════════════ Protocol "text": no tools ═════════════════════════

function guideText(h: ContextHints): string {
  const instr = hasInstructions(h)
  const task = hasKind(h, 'taskData')
  const validPolicy = hasDoc(h, 'POL-IT-04')
  const oldPolicy = hasDoc(h, 'POL-IT-04-2024')
  const acq = hasDoc(h, 'POL-ACQ-01')
  const knowsCc = hasMemory(h, 'centro_di_costo')
  const knowsSite = hasMemory(h, 'sede_consegna')
  const table = hasMemory(h, 'formato')

  // 1) The bare model: confident, generic, invented.
  if (!instr && !validPolicy && !oldPolicy) {
    const lines = [
      task
        ? 'Certo! Per i 4 nuovi commerciali che iniziano il 3/11/2026 (Marco Rinaldi, Giulia Ferri, Ahmed Benali e Sara Colombo) ti consiglio l’UltraBook Pro 15.'
        : 'Certo! Per i quattro nuovi commerciali ti consiglio l’UltraBook Pro 15: è un notebook affidabile, leggero e molto diffuso nelle aziende.',
      'Il prezzo è intorno ai 1.400 € a unità, quindi in totale spenderai circa 6.832 € IVA inclusa (4 × 1.400 € più IVA al 22%).',
      knowsCc || knowsSite ? 'Uso i dati che conosco per la consegna e procedo.' : '',
      'Se vuoi posso inviare l’ordine subito: dimmi solo l’indirizzo di consegna e la mando al fornitore.',
    ]
    return lines.filter(Boolean).join('\n\n')
  }

  // 2) Knowledge from documents: the policy is in the context.
  if (validPolicy || oldPolicy) {
    const limit = validPolicy ? LIMIT_B : 1000
    const ceiling = validPolicy ? 'circa 6.000 €' : 'circa 4.880 €'
    const paragraphs: string[] = []
    if (validPolicy) {
      paragraphs.push(
        `Secondo POL-IT-04 (ed. 2026) il ruolo «Commerciale sul campo» rientra nella Categoria B, con un massimo di ${fmtEurInt(limit)} IVA esclusa per unità. Tutti i dispositivi della stessa richiesta devono essere dello stesso modello.`,
      )
    } else {
      paragraphs.push(
        `Secondo la policy dotazioni informatiche (POL-IT-04-2024) i ruoli commerciali sono in Categoria B, con un massimo di ${fmtEurInt(limit)} IVA esclusa per unità. Tutti i dispositivi della stessa richiesta devono essere dello stesso modello.`,
      )
    }
    paragraphs.push(
      `Per 4 persone il tetto complessivo è ${ceiling} IVA inclusa. È solo una stima a mente: non posso calcolarlo con precisione e non vedo il catalogo né il magazzino, quindi non so quale modello scegliere né quanto spenderai davvero.`,
    )
    if (acq) {
      paragraphs.push('Per l’approvazione vale POL-ACQ-01: fino a 5.000 € IVA esclusa basta il responsabile di funzione, oltre serve anche la Direzione Acquisti.')
    }
    const facts: string[] = []
    if (task) facts.push('Nuovi assunti: 4 (Marco Rinaldi, Giulia Ferri, Ahmed Benali, Sara Colombo), inizio 3/11/2026')
    if (knowsCc) facts.push(`Centro di costo: ${CC}`)
    if (knowsSite) facts.push('Consegna: sede di Bologna, via dell’Industria 12')
    if (table) {
      const rows = [
        ['Ruolo e categoria', validPolicy ? 'Commerciale sul campo, Categoria B' : 'Commerciale, Categoria B (ed. 2024)'],
        ['Tetto per unità', `${fmtEurInt(limit)} IVA esclusa`],
        ['Tetto indicativo per 4 persone', `${ceiling} IVA inclusa (stima)`],
        ...(task ? [['Nuovi assunti', '4 dal 3/11/2026']] : []),
        ...(knowsCc ? [['Centro di costo', CC]] : []),
        ...(knowsSite ? [['Consegna', 'Bologna']] : []),
        ['Modello e prezzo reale', 'da definire: manca il catalogo'],
        ['Richiesta d’acquisto', 'non posso crearla, solo prepararne la bozza'],
      ]
      paragraphs.push(`| Voce | Valore |\n|---|---|\n${rows.map(([a, b]) => `| ${a} | ${b} |`).join('\n')}`)
    } else if (facts.length) {
      paragraphs.push(facts.map(f => `- ${f}`).join('\n'))
    }
    paragraphs.push('Per proseguire mi servono il catalogo con i prezzi, la disponibilità a magazzino e uno strumento per calcolare il totale e creare la richiesta d’acquisto, che qui non ho.')
    return paragraphs.join('\n\n')
  }

  // 3) Instructions but no policy: orderly, honest, does not invent.
  const known: string[] = []
  if (task) known.push('So che il 3/11/2026 entrano 4 commerciali sul campo: Marco Rinaldi, Giulia Ferri, Ahmed Benali e Sara Colombo.')
  if (knowsCc) known.push(`Il centro di costo è ${CC}.`)
  if (knowsSite) known.push('La consegna è prevista a Bologna, in via dell’Industria 12.')
  const needs = [
    'la policy sulle dotazioni informatiche (categoria e tetto di spesa per il ruolo)',
    'il catalogo con modelli e prezzi aggiornati',
    'la disponibilità a magazzino',
    ...(task ? [] : ['ruolo, numero di persone e data di ingresso']),
    ...(knowsCc && knowsSite ? [] : ['centro di costo e sede di consegna']),
  ]
  const parts: string[] = []
  parts.push('Non conosco la policy aziendale sui notebook né i prezzi del catalogo, quindi non posso indicarti un modello né un totale: sarebbero dati inventati.')
  if (known.length) {
    if (table) {
      const rows = [
        ...(task ? [['Nuovi assunti', '4 (Marco Rinaldi, Giulia Ferri, Ahmed Benali, Sara Colombo), dal 3/11/2026']] : []),
        ...(knowsCc ? [['Centro di costo', CC]] : []),
        ...(knowsSite ? [['Consegna', 'Bologna, via dell’Industria 12']] : []),
        ['Policy e tetto di spesa', 'sconosciuti'],
        ['Modello e prezzo', 'sconosciuti'],
      ]
      parts.push(`Quello che so, in tabella:\n\n| Voce | Valore |\n|---|---|\n${rows.map(([a, b]) => `| ${a} | ${b} |`).join('\n')}`)
    } else {
      parts.push(known.join(' '))
    }
  }
  parts.push(`Per rispondere mi servono:\n${needs.map(n => `- ${n}`).join('\n')}`)
  parts.push('Inoltre non posso creare la richiesta d’acquisto: non ho strumenti per farlo. Posso solo prepararne una bozza quando avrò i dati.')
  return parts.join('\n\n')
}

// ═════════════════════════ Protocol "json": tools ═════════════════════════

const byCode =
  (code: string) =>
    (a: Record<string, unknown>): boolean =>
      String(a.codice ?? '').toUpperCase() === code

function sources(h: ContextHints): string[] {
  const out: string[] = []
  if (knowsDoc(h, 'POL-IT-04')) out.push('POL-IT-04')
  if (knowsDoc(h, 'POL-ACQ-01')) out.push('POL-ACQ-01')
  return out
}

function table(name: string, code: string, price: number, total?: number): string {
  const imponibile = round2(QTY * price)
  const iva = round2(imponibile * (VAT - 1))
  const tot = total ?? round2(imponibile + iva)
  return [
    '| Articolo | Quantità | Prezzo unitario | Imponibile | IVA 22% | Totale |',
    '|---|---|---|---|---|---|',
    `| ${name} (${code}) | ${QTY} | ${fmtEur(price)} | ${fmtEur(imponibile)} | ${fmtEur(iva)} | ${fmtEur(tot)} |`,
  ].join('\n')
}

interface LoopState {
  candidates: CatalogItem[]
  chosen?: CatalogItem
  skipped: { item: CatalogItem; available: number }[]
  deliveryDays?: number
  total?: number
  budget?: number
  delivery?: string
  rdaId?: string
  catalogOk: boolean
  /** Description of an exhausted failure, if any. */
  failure?: string
}

function collect(h: ContextHints): LoopState {
  const st: LoopState = { candidates: [], skipped: [], catalogOk: false }
  const cat = stepState(h, 'cerca_catalogo')
  if (cat.kind === 'failed') st.failure = `${toolLabel('cerca_catalogo')} non è andata a buon fine (${cat.message})`
  if (cat.kind !== 'ok') return st
  st.catalogOk = true
  const policyKnown = knowsDoc(h, 'POL-IT-04')
  st.candidates = catalogItems(cat.data).filter(p => p.category === 'B' && (!policyKnown || p.price <= LIMIT_B))
  for (const item of st.candidates) {
    const s = stepState(h, 'verifica_disponibilita', byCode(item.code))
    if (s.kind === 'failed') {
      st.failure = `${toolLabel('verifica_disponibilita')} per ${item.code} non è andata a buon fine (${s.message})`
      return st
    }
    if (s.kind !== 'ok') return st
    if (s.data.sufficiente === true) {
      st.chosen = item
      st.deliveryDays = num(s.data.consegna_giorni_lavorativi)
      break
    }
    st.skipped.push({ item, available: num(s.data.disponibili) ?? 0 })
  }
  if (!st.chosen) return st
  const calc = okOf(h, 'calcolatrice')
  st.total = calc ? num(calc.data.risultato) : undefined
  const bud = okOf(h, 'leggi_budget')
  st.budget = bud ? num(bud.data.residuo_eur_iva_esclusa) : undefined
  const del = okOf(h, MCP_DELIVERY)
  st.delivery = del ? /(\d{2}\/\d{2}\/\d{4})/.exec(text(del.data.text) ?? del.summary)?.[1] : undefined
  const rda = okOf(h, 'crea_richiesta_acquisto')
  st.rdaId = rda ? text(rda.data.id) : undefined
  const calcFail = stepState(h, 'calcolatrice')
  if (calcFail.kind === 'failed') st.failure = `${toolLabel('calcolatrice')} non è andato a buon fine (${calcFail.message})`
  return st
}

function finalLoop(h: ContextHints, st: LoopState): string {
  const fonti = sources(h)
  const policyKnown = fonti.includes('POL-IT-04')
  const failure = st.failure ? ` Attenzione: ${st.failure}.` : ''

  // No model could be confirmed.
  if (!st.chosen) {
    if (st.catalogOk && st.candidates.length > 0) {
      const cheapest = st.candidates[0] as CatalogItem
      const tot = round2(QTY * cheapest.price * VAT)
      const parts = [
        `Il modello più economico ammesso è ${cheapest.name} (${cheapest.code}) a ${fmtEur(cheapest.price)} IVA esclusa${policyKnown ? `, entro il tetto di ${fmtEurInt(LIMIT_B)} per unità di POL-IT-04` : ''}.`,
        `Per ${QTY} pezzi il totale indicativo è ${fmtEur(tot)} IVA inclusa (${QTY} × ${fmtEur(cheapest.price)} più IVA al 22%).`,
        st.failure
          ? `Non posso confermarlo: ${st.failure}, quindi la disponibilità non è verificata.`
          : 'Non ho verificato la disponibilità a magazzino, il budget del centro di costo né la consegna, e non ho creato la richiesta d’acquisto.',
      ]
      return answerDecision(parts.join('\n\n'), fonti)
    }
    const parts = [
      `Non sono riuscito a completare l’analisi con le informazioni ottenute.${failure}`,
      policyKnown ? `Quello che so da POL-IT-04: il ruolo rientra nella Categoria B, massimo ${fmtEurInt(LIMIT_B)} IVA esclusa per unità, stesso modello per tutta la richiesta.` : 'Non conosco ancora la policy né i prezzi del catalogo.',
      'Non ho creato alcuna richiesta d’acquisto. Riprova più tardi oppure chiedi aiuto a un referente.',
    ]
    return answerDecision(parts.join('\n\n'), fonti)
  }

  const c = st.chosen
  const imponibile = round2(QTY * c.price)
  const sc = st.skipped[0]
  const why = sc
    ? `${sc.item.name} (${sc.item.code}), più economico, ha solo ${sc.available} pezzi disponibili su ${QTY} richiesti, e la policy impone lo stesso modello per tutta la richiesta`
    : 'è il modello più economico disponibile nella quantità richiesta'
  const intro = `Puoi ordinare ${QTY} × ${c.name} (${c.code}): è di Categoria B${policyKnown ? `, entro il tetto di ${fmtEurInt(LIMIT_B)} IVA esclusa per unità di POL-IT-04` : ''}; ${why}.`

  const lines: string[] = [intro, table(c.name, c.code, c.price, st.total)]

  if (st.budget !== undefined) {
    const left = round2(st.budget - imponibile)
    lines.push(
      left >= 0
        ? `Budget residuo ${CC}: ${fmtEur(st.budget)} IVA esclusa; l’imponibile di ${fmtEur(imponibile)} è coperto (restano ${fmtEur(left)}).`
        : `Attenzione: il budget residuo ${CC} è ${fmtEur(st.budget)} IVA esclusa e non copre l’imponibile di ${fmtEur(imponibile)}.`,
    )
  } else {
    lines.push('Non ho verificato il budget residuo del centro di costo.')
  }
  if (knowsDoc(h, 'POL-ACQ-01')) {
    lines.push(
      imponibile <= 5000
        ? `Soglia POL-ACQ-01: ${fmtEur(imponibile)} sono sotto i 5.000 € IVA esclusa, quindi basta l’approvazione del responsabile di funzione.`
        : `Soglia POL-ACQ-01: ${fmtEur(imponibile)} superano i 5.000 € IVA esclusa, quindi serve anche la Direzione Acquisti.`,
    )
  }
  if (st.delivery) {
    lines.push(`Consegna stimata dal fornitore: ${st.delivery} (verificata con TechSupply via MCP, SIMULATO), prima del 3/11/2026.`)
  } else if (st.deliveryDays !== undefined) {
    lines.push(`Il magazzino indica ${st.deliveryDays} giorni lavorativi per la consegna; non ho verificato la data con il fornitore.`)
  }

  if (st.rdaId) {
    lines.push(`Ho creato la richiesta d’acquisto ${st.rdaId}: è SIMULATA, nessun ordine reale è partito.`)
  } else if (rejectedByHuman(h, 'crea_richiesta_acquisto')) {
    lines.push('La richiesta d’acquisto non è stata creata: l’azione è stata rifiutata, quindi non è stato eseguito nulla. La bozza qui sopra resta a disposizione se vuoi riprendere.')
  } else if (deniedByControls(h, 'crea_richiesta_acquisto')) {
    lines.push('Non ho creato la richiesta d’acquisto: è un’azione con effetti e richiede supervisione umana, non ancora attiva. Qui sopra c’è la bozza: serve una persona che la supervisioni e la approvi.')
  } else {
    lines.push('Non ho creato la richiesta d’acquisto: questa è la bozza da inoltrare con approvazione.')
  }
  if (failure) lines.push(failure.trim())
  return answerDecision(lines.join('\n\n'), fonti)
}

function guideCalcOnly(h: ContextHints): string {
  const known = knowsDoc(h, 'POL-IT-04')
  if (!known) {
    const pol = stepState(h, 'cerca_policy')
    if (hasTool(h, 'cerca_policy') && pol.kind === 'todo' && !h.mustAnswer) {
      return toolDecision('cerca_policy', { domanda: 'tetto di spesa notebook Categoria B commerciale sul campo' }, 'Cerco nelle policy il tetto di spesa per i notebook.')
    }
    return answerDecision('Non conosco il tetto di spesa per i notebook: serve la policy sulle dotazioni informatiche e non posso inventare cifre.', [])
  }
  const calc = stepState(h, 'calcolatrice')
  if (calc.kind === 'ok') {
    const v = num(calc.data.risultato) ?? QTY * LIMIT_B * VAT
    return answerDecision(
      `Il tetto massimo ammesso da POL-IT-04 è ${fmtEur(v)} IVA inclusa (${QTY} × ${fmtEurInt(LIMIT_B)} × 1,22): ${fmtEurInt(LIMIT_B)} IVA esclusa per unità di Categoria B, stesso modello per tutti.\n\nÈ un tetto, non il costo reale: non posso consultare il catalogo né il magazzino, quindi non so quale modello scegliere né il totale effettivo. Non posso nemmeno creare la richiesta d’acquisto.`,
      sources(h),
    )
  }
  if (calc.kind === 'failed' || h.mustAnswer || h.guardNotice) {
    return answerDecision(`Non sono riuscito a eseguire il calcolo${calc.kind === 'failed' ? ` (${calc.message})` : ''}. Da POL-IT-04: massimo ${fmtEurInt(LIMIT_B)} IVA esclusa per unità, quindi non posso darti un totale affidabile.`, sources(h))
  }
  return toolDecision('calcolatrice', { espressione: `${QTY}*${LIMIT_B}*1.22` }, 'Calcolo il tetto massimo: 4 notebook × 1.250 € più IVA 22%.')
}

function guideJson(h: ContextHints): string {
  const hasCatalog = hasTool(h, 'cerca_catalogo')
  if (!hasCatalog) return guideCalcOnly(h)

  const st = collect(h)
  if (h.guardNotice || h.mustAnswer) return finalLoop(h, st)

  // 0) policy knowledge, only when the context does not already hold it
  if (!knowsDoc(h, 'POL-IT-04') && hasTool(h, 'cerca_policy')) {
    const pol = stepState(h, 'cerca_policy')
    if (pol.kind === 'todo') {
      return toolDecision('cerca_policy', { domanda: 'tetto di spesa notebook Categoria B commerciale sul campo' }, 'Cerco nelle policy il tetto di spesa per i notebook.')
    }
  }

  // 1) catalogue
  const cat = stepState(h, 'cerca_catalogo')
  if (cat.kind === 'todo') return toolDecision('cerca_catalogo', { categoria: 'B' }, 'Cerco nel catalogo i notebook di Categoria B.')
  if (cat.kind === 'failed') return finalLoop(h, st)

  // 2) availability of the candidates, cheapest first
  if (!hasTool(h, 'verifica_disponibilita')) return finalLoop(h, st)
  for (const item of st.candidates) {
    const s = stepState(h, 'verifica_disponibilita', byCode(item.code))
    if (s.kind === 'failed') return finalLoop(h, st)
    if (s.kind === 'todo') {
      return toolDecision('verifica_disponibilita', { codice: item.code, quantita: QTY }, `Verifico se ${item.code} è disponibile in ${QTY} pezzi.`)
    }
    if (s.data.sufficiente === true) break
  }
  if (!st.chosen) return finalLoop(h, st)
  const chosen = st.chosen

  // 3) exact total
  if (hasTool(h, 'calcolatrice')) {
    const calc = stepState(h, 'calcolatrice')
    if (calc.kind === 'todo') return toolDecision('calcolatrice', { espressione: `${QTY}*${chosen.price}*1.22` }, 'Calcolo il totale IVA inclusa con la calcolatrice.')
    if (calc.kind === 'failed') return finalLoop(h, st)
  }

  // 4) budget (needs the cost center, which only memory can provide)
  const knowsCc = hasMemory(h, 'centro_di_costo')
  if (hasTool(h, 'leggi_budget')) {
    if (!knowsCc && stepState(h, 'leggi_budget').kind === 'todo') return askDecision('Su quale centro di costo devo imputare la richiesta?')
    const b = stepState(h, 'leggi_budget')
    if (b.kind === 'todo') return toolDecision('leggi_budget', { centro_di_costo: CC }, `Leggo il budget residuo di ${CC}.`)
  }

  // 5) supplier delivery over MCP, when connected
  if (hasTool(h, MCP_DELIVERY)) {
    const d = stepState(h, MCP_DELIVERY)
    if (d.kind === 'todo') return toolDecision(MCP_DELIVERY, { codice: chosen.code, quantita: QTY, cap: CAP_BOLOGNA }, 'Chiedo al fornitore la data di consegna a Bologna.')
  }

  // 6) the purchase request
  if (!hasTool(h, 'crea_richiesta_acquisto')) return finalLoop(h, st)
  if (rejectedByHuman(h, 'crea_richiesta_acquisto') || deniedByControls(h, 'crea_richiesta_acquisto')) return finalLoop(h, st)
  if (st.budget !== undefined && st.budget < QTY * chosen.price) return finalLoop(h, st)
  if (!knowsCc) return askDecision('Su quale centro di costo devo imputare la richiesta d’acquisto?')
  const rda = stepState(h, 'crea_richiesta_acquisto')
  if (rda.kind === 'todo') {
    return toolDecision(
      'crea_richiesta_acquisto',
      {
        centro_di_costo: CC,
        codice_articolo: chosen.code,
        quantita: QTY,
        prezzo_unitario: chosen.price,
        motivazione: 'Dotazione per 4 nuovi commerciali sul campo (Categoria B) in ingresso il 3/11/2026',
        consegna: 'Bologna, entro il 3/11/2026',
      },
      'Preparo la richiesta d’acquisto per i 4 notebook.',
    )
  }
  if (rda.kind === 'failed') return finalLoop(h, { ...st, failure: `${toolLabel('crea_richiesta_acquisto')} non è andata a buon fine (${rda.message})` })
  return finalLoop(h, st)
}

export function simulateGuide(h: ContextHints): string {
  return h.protocol === 'json' ? guideJson(h) : guideText(h)
}
