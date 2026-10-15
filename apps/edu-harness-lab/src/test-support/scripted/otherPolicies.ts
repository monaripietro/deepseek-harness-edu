/** TEST FIXTURE ONLY — scripted policies for scenarios S1–S9. Never used by the app. */
import type { ContextHints } from '../../domain/types'
import {
  ask,
  catalogItems,
  deniedByControls,
  fmtEur,
  fmtNum,
  hasDoc,
  hasInstructions,
  hasTool,
  isJson,
  knowsDoc,
  num,
  rejectedByHuman,
  reply,
  round2,
  stepState,
  text,
  toolDecision,
} from './policyHelpers'

/**
 * S1–S9: nine demonstration scenarios. Each policy behaves differently by level, driven only by the context:
 *   isolated model  -> confident guess;   with instructions -> prudent, admits ignorance;
 *   with data/tools -> precise, with sources.
 */

const byCodeOrder = (code: string) => (a: Record<string, unknown>) =>
  typeof a.codice === 'string' && a.codice.toUpperCase() === code

// ───────────────────────── S1: rimborso chilometrico senza informazioni ─────────────────────────

const S1_ANSWER =
  'Secondo POL-FIN-07, quando l’uso dell’auto propria è autorizzato in anticipo dal responsabile, il rimborso chilometrico è di 0,42 € al km, calcolato sul percorso più breve tra sede e destinazione, andata e ritorno. Pedaggi e parcheggi sono rimborsati a piè di lista, con giustificativo.'

export function s1(h: ContextHints): string {
  const doc = 'POL-FIN-07'
  if (isJson(h)) {
    if (knowsDoc(h, doc)) return reply(h, S1_ANSWER, [doc])
    const s = stepState(h, 'cerca_policy')
    if (hasTool(h, 'cerca_policy') && s.kind === 'todo' && !h.mustAnswer && !h.guardNotice) {
      return toolDecision('cerca_policy', { domanda: 'rimborso chilometrico auto propria trasferta' }, 'Cerco nelle policy il rimborso chilometrico.')
    }
    return reply(h, 'Non conosco la regola sul rimborso chilometrico: non l’ho trovata nelle fonti che ho a disposizione, quindi non posso darti una cifra. Chiedi all’ufficio amministrazione o fammi accedere alla policy trasferte.', [])
  }
  if (hasDoc(h, doc)) return S1_ANSWER
  if (hasInstructions(h)) {
    return 'Non conosco la policy aziendale sul rimborso chilometrico, quindi non posso darti una cifra: sarebbe inventata. Di solito il rimborso dipende dal regolamento trasferte dell’azienda e dall’autorizzazione del responsabile. Se mi fornisci il documento, ti rispondo con precisione.'
  }
  return 'Certo! In genere le aziende rimborsano 0,60 € al km per l’uso dell’auto propria, più pedaggi e parcheggi. Quindi per una trasferta di 100 km spenderesti circa 60 € e li riavrai in busta paga.'
}

// ───────────────────────── S2: giorni di lavoro agile (RAG) ─────────────────────────

const S2_ANSWER =
  'Secondo POL-HR-02 il lavoro agile è consentito fino a 2 giorni a settimana, anche non consecutivi, concordati con il responsabile e comunicati entro il venerdì della settimana precedente. I giorni non usati non si accumulano. I neoassunti iniziano dopo 30 giorni di presenza in sede; per i commerciali sul campo il lavoro agile è ammesso solo nei giorni senza appuntamenti con i clienti.'

export function s2(h: ContextHints): string {
  const doc = 'POL-HR-02'
  if (isJson(h)) {
    if (knowsDoc(h, doc)) return reply(h, S2_ANSWER, [doc])
    const s = stepState(h, 'cerca_policy')
    if (hasTool(h, 'cerca_policy') && s.kind === 'todo' && !h.mustAnswer && !h.guardNotice) {
      return toolDecision('cerca_policy', { domanda: 'lavoro agile quanti giorni a settimana' }, 'Cerco nelle policy le regole sul lavoro agile.')
    }
    return reply(h, 'Non ho trovato la policy sul lavoro agile, quindi non posso dirti quanti giorni sono consentiti. Chiedi alle Risorse Umane o fammi accedere al documento.', [])
  }
  if (hasDoc(h, doc)) return S2_ANSWER
  if (hasInstructions(h)) {
    return 'Non conosco la policy aziendale sul lavoro agile, quindi non posso dirti quanti giorni a settimana sono consentiti. Dipende dal regolamento interno e dall’accordo con il tuo responsabile. Se mi dai il documento delle Risorse Umane ti rispondo con precisione.'
  }
  return 'Di solito le aziende concedono 3 giorni a settimana di lavoro agile, quindi puoi farne 3, anche consecutivi, senza particolari limiti.'
}

// ───────────────────────── S3: margine percentuale (calcolatrice) ─────────────────────────

export function s3(h: ContextHints): string {
  const expr = '(48000-36480)/48000*100'
  if (isJson(h)) {
    if (!hasTool(h, 'calcolatrice')) {
      return reply(h, 'Non ho uno strumento di calcolo: a mente il margine è circa il 24%, ma non è un risultato verificato.', [])
    }
    const c = stepState(h, 'calcolatrice')
    if (c.kind === 'ok') {
      const v = num(c.data.risultato) ?? 24
      const shown = Number.isInteger(v) ? fmtNum(v, 0) : fmtNum(v, 2)
      return reply(h, `Il margine percentuale è del ${shown}%: (48.000 € - 36.480 €) / 48.000 € = ${shown}%, calcolato con la calcolatrice. Il margine in valore è di 11.520 €.`, [])
    }
    if (c.kind === 'failed' || h.mustAnswer || h.guardNotice) {
      return reply(h, `Non sono riuscito a eseguire il calcolo${c.kind === 'failed' ? ` (${c.message})` : ''}. La formula è (ricavi - costi) / ricavi × 100, ma non ti do un numero non verificato.`, [])
    }
    return toolDecision('calcolatrice', { espressione: expr }, 'Calcolo il margine percentuale con la calcolatrice.')
  }
  if (hasInstructions(h)) {
    return 'La formula è (ricavi - costi) / ricavi × 100. A mente ottengo circa il 24%, ma è un calcolo fatto senza strumenti: ricontrollalo con una calcolatrice prima di usarlo.'
  }
  return 'Il margine percentuale della commessa è circa il 27%: è un buon risultato per questo tipo di lavoro.'
}

// ───────────────────────── S4: confronto tra due notebook ─────────────────────────

export function s4(h: ContextHints): string {
  if (isJson(h)) {
    if (!hasTool(h, 'cerca_catalogo')) {
      return reply(h, 'Non ho accesso al catalogo, quindi non posso confrontare i due modelli con dati veri. Posso dirti solo che entrambi dovrebbero rientrare nella Categoria B, ma servono prezzi e specifiche.', [])
    }
    const s = stepState(h, 'cerca_catalogo')
    if (s.kind === 'todo' && !h.mustAnswer && !h.guardNotice) {
      return toolDecision('cerca_catalogo', { categoria: 'B' }, 'Cerco nel catalogo i notebook di Categoria B per confrontarli.')
    }
    if (s.kind !== 'ok') return reply(h, 'Non sono riuscito a consultare il catalogo, quindi non posso confrontare i due modelli con dati veri.', [])
    const items = catalogItems(s.data)
    const b14 = items.find(i => i.code === 'NB-B14')
    const v14 = items.find(i => i.code === 'NB-V14P')
    if (!b14 || !v14) return reply(h, 'Nel catalogo non ho trovato entrambi i modelli, quindi non posso confrontarli.', [])
    const diff = round2(v14.price - b14.price)
    const rows = [b14, v14].map(i => `| ${i.name} (${i.code}) | ${fmtEur(i.price)} | ${i.specs} |`)
    return reply(
      h,
      `Ecco il confronto dai dati del catalogo (prezzi IVA esclusa):\n\n| Modello | Prezzo | Specifiche |\n|---|---|---|\n${rows.join('\n')}\n\nEntrambi sono di Categoria B. Il Vega 14 Pro costa ${fmtEur(diff)} in più ma pesa meno e ha più autonomia, con 5G opzionale. Se conta il prezzo conviene l’Aurora B14; per la mobilità, il Vega 14 Pro. Non ho verificato la disponibilità a magazzino.`,
      [],
    )
  }
  if (hasInstructions(h)) {
    return 'Non ho le specifiche né i prezzi dei due modelli, quindi non posso confrontarli senza inventare. Per decidere mi servono il catalogo aggiornato, il tetto di spesa del ruolo e la disponibilità a magazzino.'
  }
  return 'Il Notebook Vega 14 Pro è decisamente superiore: 32 GB di RAM, schermo OLED e circa 1.600 € di prezzo, mentre l’Aurora B14 ha 8 GB di RAM e costa circa 900 €. Conviene la Vega.'
}

// ───────────────────────── S5: ordine in ritardo → bozza + attività ─────────────────────────

const ORDER_ID = 'ORD-2026-1187'

export function s5(h: ContextHints): string {
  if (isJson(h)) {
    if (!hasTool(h, 'leggi_ordine_cliente')) {
      return reply(h, 'Non ho accesso agli ordini dei clienti, quindi non so a che punto sia la consegna e non posso preparare una bozza con date vere. Posso scriverne una senza date, da completare dopo aver sentito la logistica.', [])
    }
    const o = stepState(h, 'leggi_ordine_cliente')
    if (o.kind === 'todo' && !h.mustAnswer && !h.guardNotice) {
      return toolDecision('leggi_ordine_cliente', { numero_ordine: ORDER_ID }, `Leggo stato e consegna dell’ordine ${ORDER_ID}.`)
    }
    if (o.kind !== 'ok') return reply(h, `Non sono riuscito a leggere l’ordine ${ORDER_ID}, quindi non posso indicare date al cliente senza inventarle. Riprova più tardi.`, [])

    const cliente = text(o.data.cliente) ?? 'cliente'
    const consegna = text(o.data.consegna_prevista) ?? ''
    const note = text(o.data.note) ?? ''
    const parziale = /dal (\d{1,2}\/\d{1,2})/.exec(note)?.[1]
    const fonti = knowsDoc(h, 'POL-CLI-03') ? ['POL-CLI-03'] : []

    const task = stepState(h, 'crea_attivita')
    const canTask = hasTool(h, 'crea_attivita')
    if (canTask && task.kind === 'todo' && !h.mustAnswer && !h.guardNotice && !rejectedByHuman(h, 'crea_attivita') && !deniedByControls(h, 'crea_attivita')) {
      return toolDecision(
        'crea_attivita',
        { titolo: `Follow-up cliente: ordine ${ORDER_ID} in ritardo`, scadenza: '2026-10-15', assegnatario: 'Laura Bianchi', cliente },
        'Creo un’attività di follow-up per richiamare il cliente.',
      )
    }
    let attivita: string
    if (task.kind === 'ok') attivita = `Ho creato l’attività di follow-up ${text(task.data.id) ?? ''} (SIMULATA), da chiudere entro il 15/10/2026.`
    else if (rejectedByHuman(h, 'crea_attivita')) attivita = 'L’attività di follow-up non è stata creata perché hai rifiutato l’azione: nulla è stato eseguito.'
    else if (deniedByControls(h, 'crea_attivita')) attivita = 'Non ho creato l’attività di follow-up: è un’azione con effetti e richiede supervisione umana, non ancora attiva. Serve una persona che la approvi.'
    else attivita = 'Non ho creato l’attività di follow-up: lo farò se me lo chiedi con gli strumenti adatti.'
    return reply(
      h,
      `L’ordine ${ORDER_ID} di ${cliente} risulta in ritardo: consegna completa prevista il ${consegna}. ${note}\n\nBozza di risposta:\n\n> Gentile cliente, la ringrazio per la segnalazione e mi scuso per il ritardo sull’ordine ${ORDER_ID}, dovuto a un lotto in arrivo in ritardo dal nostro fornitore. La consegna completa è prevista il ${consegna}${parziale ? `; una spedizione parziale è possibile dal ${parziale}` : ''}. Resto a disposizione per qualsiasi chiarimento. Cordiali saluti, Laura Bianchi\n\n${attivita}`,
      fonti,
    )
  }
  if (hasInstructions(h)) {
    return `Non ho accesso agli ordini, quindi non so a che punto sia l’ordine ${ORDER_ID} e non posso indicare date. Ecco una bozza senza date, da completare dopo aver sentito la logistica:\n\n> Gentile cliente, la ringrazio per la segnalazione sull’ordine ${ORDER_ID}. Sto verificando lo stato con la logistica e le fornirò una data certa appena possibile. Cordiali saluti, Laura Bianchi\n\nNon posso creare l’attività di follow-up: non ho strumenti per farlo.`
  }
  return `Ho controllato: l’ordine ${ORDER_ID} è in transito e arriverà domani mattina.\n\nBozza di risposta:\n\n> Gentile cliente, il suo ordine arriverà domani entro le 12. Cordiali saluti, Laura Bianchi\n\nHo anche creato l’attività di follow-up per te.`
}

// ───────────────────────── S6: attività di follow-up con approvazione ─────────────────────────

export function s6(h: ContextHints): string {
  if (isJson(h)) {
    if (!hasTool(h, 'crea_attivita')) {
      return reply(h, 'Non ho uno strumento per creare attività, quindi non l’ho creata. Ti suggerisco di aggiungere tu un promemoria per venerdì 16 ottobre 2026: richiamare Ferramenta Rossi per l’ordine ORD-2026-1187.', [])
    }
    const t = stepState(h, 'crea_attivita')
    if (rejectedByHuman(h, 'crea_attivita')) return reply(h, 'L’attività non è stata creata: hai rifiutato l’azione, quindi non è stato eseguito nulla.', [])
    if (deniedByControls(h, 'crea_attivita')) {
      return reply(h, 'Non ho creato l’attività: è un’azione con effetti e richiede supervisione umana, non ancora attiva. Bozza pronta: «Richiamare Ferramenta Rossi per l’ordine ORD-2026-1187», scadenza venerdì 16/10/2026, assegnata a Laura Bianchi.', [])
    }
    if (t.kind === 'ok') return reply(h, `Ho creato l’attività ${text(t.data.id) ?? ''} (SIMULATA): richiamare Ferramenta Rossi per il follow-up sull’ordine ORD-2026-1187, scadenza venerdì 16/10/2026, assegnata a Laura Bianchi.`, [])
    if (t.kind === 'failed' || h.mustAnswer || h.guardNotice) {
      return reply(h, `Non sono riuscito a creare l’attività${t.kind === 'failed' ? ` (${t.message})` : ''}. Nessuna attività è stata registrata.`, [])
    }
    return toolDecision(
      'crea_attivita',
      { titolo: 'Richiamare Ferramenta Rossi: follow-up ordine ORD-2026-1187', scadenza: '2026-10-16', assegnatario: 'Laura Bianchi', cliente: 'Ferramenta Rossi S.r.l.' },
      'Creo l’attività di follow-up con scadenza venerdì 16/10/2026.',
    )
  }
  if (hasInstructions(h)) {
    return 'Non ho strumenti per creare attività, quindi non l’ho creata. Ti suggerisco di inserire un promemoria per venerdì 16 ottobre 2026: richiamare Ferramenta Rossi per il follow-up sull’ordine ORD-2026-1187.'
  }
  return 'Fatto! Ho creato l’attività: richiamare Ferramenta Rossi entro venerdì. Riceverai un promemoria.'
}

// ───────────────────────── S7: magazzino in timeout ─────────────────────────

export function s7(h: ContextHints): string {
  const same = byCodeOrder('NB-V14P')
  if (isJson(h)) {
    if (!hasTool(h, 'verifica_disponibilita')) {
      return reply(h, 'Non ho accesso al magazzino, quindi non posso dirti quanti NB-V14P ci siano. Chiedi alla logistica.', [])
    }
    const s = stepState(h, 'verifica_disponibilita', same)
    if (s.kind === 'ok') {
      const disp = num(s.data.disponibili) ?? 0
      const giorni = num(s.data.consegna_giorni_lavorativi)
      return reply(
        h,
        `A magazzino ci sono ${disp} pezzi del Notebook Vega 14 Pro (NB-V14P): ${disp >= 4 ? 'i 4 richiesti sono disponibili' : 'i 4 richiesti non sono tutti disponibili'}${giorni !== undefined ? `, consegna stimata in ${giorni} giorni lavorativi` : ''}.`,
        [],
      )
    }
    if (s.kind === 'failed' || h.mustAnswer || h.guardNotice) {
      const why = s.kind === 'failed' ? ` (${s.message})` : ''
      return reply(h, `Non sono riuscito a verificare la disponibilità: il magazzino non risponde${why}. Non posso confermare quanti NB-V14P ci siano, quindi non ti do un numero. Riprova più tardi o chiedi alla logistica.`, [])
    }
    return toolDecision(
      'verifica_disponibilita',
      { codice: 'NB-V14P', quantita: 4 },
      s.retry ? 'Il magazzino non ha risposto: riprovo la stessa verifica una volta.' : 'Verifico la disponibilità di NB-V14P a magazzino.',
    )
  }
  if (hasInstructions(h)) {
    return 'Non ho accesso al magazzino, quindi non so quanti NB-V14P ci siano. Chiedi alla logistica o dammi uno strumento per verificarlo: non voglio darti un numero inventato.'
  }
  return 'Ne abbiamo circa 20 pezzi a magazzino, tutti pronti a partire: i 4 che ti servono sono sicuramente disponibili.'
}

// ───────────────────────── S8: prenotare una sala senza data ─────────────────────────

export function s8(h: ContextHints): string {
  if (hasInstructions(h) || isJson(h)) {
    const q = 'Non ho uno strumento per verificare o prenotare sale. Per quale giorno e a che ora ti serve, per quante persone e in quale sede?'
    return ask(h, q)
  }
  return 'Fatto! Ho prenotato la Sala Blu per domani alle 10:00, per 10 persone. Riceverai la conferma via email.'
}

// ───────────────────────── S9: prezzo in dollari ─────────────────────────

export function s9(h: ContextHints): string {
  if (isJson(h)) {
    const canFx = hasTool(h, 'converti_valuta')
    const canCat = hasTool(h, 'cerca_catalogo')
    if (!canFx && !canCat) {
      return reply(h, 'Non conosco il tasso di cambio né il vostro prezzo di catalogo, quindi non posso dirti se 1.350 dollari convengono. Mi servono entrambi i dati.', [])
    }
    const stop = h.mustAnswer || !!h.guardNotice
    const fx = canFx ? stepState(h, 'converti_valuta') : undefined
    if (fx && fx.kind === 'todo' && !stop) {
      return toolDecision('converti_valuta', { importo: 1350, da: 'USD', a: 'EUR' }, 'Converto 1.350 dollari in euro con il convertitore.')
    }
    const cat = canCat ? stepState(h, 'cerca_catalogo') : undefined
    if (cat && cat.kind === 'todo' && !stop) {
      return toolDecision('cerca_catalogo', { testo: 'Vega' }, 'Cerco nel catalogo il prezzo del Notebook Vega 14 Pro.')
    }
    const eur = fx && fx.kind === 'ok' ? num(fx.data.risultato) : undefined
    const tasso = fx && fx.kind === 'ok' ? num(fx.data.tasso) : undefined
    const dataTassi = fx && fx.kind === 'ok' ? text(fx.data.data_tassi) : undefined
    const item = cat && cat.kind === 'ok' ? catalogItems(cat.data).find(i => i.code === 'NB-V14P') : undefined
    if (eur !== undefined && item) {
      const diff = round2(eur - item.price)
      const verdict = diff > 0 ? `è superiore di ${fmtEur(diff)} per unità` : `è inferiore di ${fmtEur(Math.abs(diff))} per unità`
      return reply(
        h,
        `1.350 dollari equivalgono a ${fmtEur(eur)} (tasso fisso didattico ${fmtNum(tasso ?? 0, 4)} del ${dataTassi ?? 'giorno di riferimento'}, non un tasso di mercato). Il nostro prezzo di catalogo per il Notebook Vega 14 Pro (NB-V14P) è ${fmtEur(item.price)} IVA esclusa. A parità di imposte, il prezzo convertito ${verdict}. Il trattamento IVA dell’offerta non è indicato; mancano anche dazi e trasporto, quindi non posso confermare la convenienza complessiva.`,
        [],
      )
    }
    if (eur !== undefined) return reply(h, `1.350 dollari equivalgono a ${fmtEur(eur)} (tasso fisso didattico). Non ho confrontato il prezzo con il catalogo, quindi non posso dirti se conviene.`, [])
    if (item) return reply(h, `Il nostro prezzo di catalogo per il Notebook Vega 14 Pro (NB-V14P) è ${fmtEur(item.price)} IVA esclusa. Non ho un tasso di cambio per convertire i dollari, quindi non posso confrontare l’offerta.`, [])
    return reply(h, 'Non sono riuscito a ottenere i dati per il confronto (conversione e catalogo), quindi non posso dirti se conviene.', [])
  }
  if (hasInstructions(h)) {
    return 'Non conosco il tasso di cambio di oggi né il vostro prezzo di catalogo, quindi non posso dirti se 1.350 dollari convengono. Mi servono entrambi i dati, più dazi e trasporto.'
  }
  return '1.350 dollari sono circa 1.242 € (1 dollaro vale circa 0,92 €). Il vostro catalogo lo vende a circa 1.300 €, quindi l’offerta americana conviene.'
}
