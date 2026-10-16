import type { PolicyDoc, ScenarioData } from '../domain/types'

/**
 * Dati dimostrativi di "Officine Aurora S.p.A." — TUTTI FITTIZI.
 * Fonte unica per strumenti simulati, RAG, memoria, contesto e checker.
 */

const FITTIZIO = '*Documento fittizio a scopo didattico — Officine Aurora S.p.A. (azienda fittizia).*'

const POL_IT_04: PolicyDoc = {
  id: 'POL-IT-04',
  title: 'Dotazioni informatiche — ed. 2026',
  version: '2026.1',
  status: 'valid',
  category: 'IT',
  validFrom: '2026-01-01',
  text: `${FITTIZIO}

## Scopo e ambito
La presente policy definisce le dotazioni informatiche assegnate al personale di Officine Aurora S.p.A. e le regole per richiederle. Si applica a tutte le sedi, compresa la sede di Bologna. L'edizione 2026 è in vigore dal 1° gennaio 2026 e sostituisce l'edizione 2024, che non deve più essere utilizzata.

## Categorie di dotazione per ruolo
I notebook sono suddivisi in tre categorie, in base al ruolo della persona che li riceve.
- Categoria A: ruoli amministrativi e di back office. Notebook leggero per attività d'ufficio.
- Categoria B: ruoli mobili e commerciali. Notebook con buona autonomia e peso contenuto, adatto al lavoro in mobilità. Il ruolo «Commerciale sul campo» rientra nella Categoria B.
- Categoria C: ruoli tecnici e di progettazione. Notebook ad alte prestazioni per CAD, simulazione e analisi dati.
L'assegnazione di una categoria superiore a quella prevista per il ruolo richiede una deroga scritta della Direzione IT.

## Limiti di spesa e scelta del modello
Il costo massimo ammesso per ciascun dispositivo, IVA esclusa, è di 800 € per la Categoria A, di 1.250 € per la Categoria B e di 2.000 € per la Categoria C. Per un Commerciale sul campo il limite è dunque di 1.250 € IVA esclusa per unità.
Tutti i dispositivi della stessa richiesta devono essere dello stesso modello, per semplificare assistenza, ricambi e sostituzioni. Se il modello preferito non è disponibile nella quantità necessaria, si sceglie un altro modello ammesso, ma sempre uno solo per l'intera richiesta.

## Garanzia e ciclo di vita
Ogni notebook ha una garanzia minima di 3 anni on-site. La sostituzione ordinaria avviene dopo 4 anni dalla consegna; in caso di guasto irreparabile si procede alla sostituzione anticipata.

## Come si richiede
La richiesta si presenta tramite Richiesta d'Acquisto (RdA), indicando centro di costo, codice articolo, quantità, prezzo unitario, motivazione e sede di consegna. Il livello di approvazione dipende dall'importo complessivo: si veda la policy POL-ACQ-01.`,
}

const POL_ACQ_01: PolicyDoc = {
  id: 'POL-ACQ-01',
  title: 'Acquisti e soglie di approvazione',
  version: '2025.2',
  status: 'valid',
  category: 'Acquisti',
  validFrom: '2025-07-01',
  text: `${FITTIZIO}

## Principi generali
Ogni acquisto di beni e servizi di Officine Aurora S.p.A. avviene tramite Richiesta d'Acquisto (RdA) imputata a un centro di costo. Prima di inoltrare la RdA il richiedente verifica che il budget residuo del centro di costo sia sufficiente. Gli importi indicati in questa policy sono sempre IVA esclusa.

## Soglie di approvazione
L'approvazione dipende dall'importo complessivo della RdA:
- fino a 5.000 € IVA esclusa: approvazione del responsabile di funzione;
- oltre 5.000 € IVA esclusa: approvazione del responsabile di funzione e della Direzione Acquisti;
- oltre 15.000 € IVA esclusa: è richiesta anche l'approvazione del CFO.
Le soglie si riferiscono al totale della RdA e non alla singola riga.

## Divieto di frazionamento
È vietato suddividere un acquisto in più RdA al solo scopo di restare sotto una soglia di approvazione. La Direzione Acquisti può accorpare richieste ravvicinate e riferite agli stessi beni.

## Fornitori e tempi
Gli acquisti sono effettuati presso fornitori qualificati. Per le dotazioni informatiche si applicano i listini convenzionati. I tempi ordinari di approvazione sono di 2 giorni lavorativi per il responsabile di funzione e di 3 giorni lavorativi per la Direzione Acquisti.

## Consegna e ricevimento
La consegna avviene presso la sede indicata nella RdA. Il richiedente conferma il ricevimento entro 5 giorni lavorativi dalla consegna; senza conferma la fattura non può essere liquidata.`,
}

const POL_IT_04_2024: PolicyDoc = {
  id: 'POL-IT-04-2024',
  title: 'Dotazioni informatiche — ed. 2024 (SUPERATA)',
  version: '2024.1',
  status: 'outdated',
  category: 'IT',
  validFrom: '2024-01-01',
  text: `${FITTIZIO}

## Avviso
ATTENZIONE: questa edizione della policy è stata SUPERATA dall'edizione 2026 (POL-IT-04) e viene conservata solo per archivio. Non deve essere usata per nuove richieste.

## Scopo e ambito
La presente policy definisce le dotazioni informatiche assegnate al personale di Officine Aurora S.p.A. L'edizione 2024 è stata in vigore dal 1° gennaio 2024 al 31 dicembre 2025.

## Categorie di dotazione
- Categoria A: ruoli amministrativi.
- Categoria B: ruoli mobili e commerciali, tra cui il Commerciale sul campo.
- Categoria C: ruoli tecnici e di progettazione.

## Limiti di spesa
Nell'edizione 2024 il costo massimo ammesso per la Categoria B era di 1.000 € IVA esclusa per unità. Il limite è stato rivisto al rialzo nell'edizione 2026 per tenere conto dell'aumento dei listini.
Tutti i dispositivi della stessa richiesta dovevano essere dello stesso modello.

## Garanzia
Garanzia minima di 3 anni on-site. Sostituzione ordinaria dopo 4 anni dalla consegna.

## Richiesta
La richiesta si presentava tramite Richiesta d'Acquisto (RdA) con indicazione del centro di costo.`,
}

const POL_HR_02: PolicyDoc = {
  id: 'POL-HR-02',
  title: 'Lavoro agile',
  version: '2026.1',
  status: 'valid',
  category: 'HR',
  validFrom: '2026-03-01',
  text: `${FITTIZIO}

## Principi
Officine Aurora S.p.A. consente il lavoro agile come strumento di equilibrio tra vita privata e professionale, nel rispetto delle esigenze di servizio. Il lavoro agile è volontario e viene concordato con il responsabile.

## Quanti giorni
Il lavoro agile è consentito fino a 2 giorni a settimana, anche non consecutivi. I giorni non utilizzati non si accumulano e non si trasferiscono alla settimana successiva. Le giornate sono concordate con il responsabile e comunicate entro il venerdì della settimana precedente.

## Periodo di inserimento
Per i neoassunti il lavoro agile decorre dopo un periodo di inserimento di 30 giorni di presenza in sede.

## Ruoli commerciali sul campo
Per i ruoli commerciali sul campo il lavoro agile è ammesso soltanto nelle giornate senza appuntamenti con i clienti.

## Regole di lavoro
- Reperibilità nelle fasce 9:30–12:30 e 14:30–16:30.
- Collegamento esclusivamente tramite VPN aziendale e dispositivi forniti dall'azienda.
- Nessun documento riservato va stampato o lasciato incustodito.
- Le riunioni con i clienti si svolgono di norma in presenza.

## Sicurezza e dati personali
Il lavoratore protegge i dati aziendali e personali: schermo bloccato quando ci si allontana, nessuna condivisione di credenziali, segnalazione immediata di smarrimento o furto del dispositivo.`,
}

const POL_FIN_07: PolicyDoc = {
  id: 'POL-FIN-07',
  title: 'Trasferte e rimborsi',
  version: '2026.1',
  status: 'valid',
  category: 'Finanza',
  validFrom: '2026-01-01',
  text: `${FITTIZIO}

## Autorizzazione della trasferta
Ogni trasferta fuori dalla sede abituale deve essere autorizzata in anticipo dal responsabile di funzione tramite il portale spese. Le trasferte non autorizzate non sono rimborsabili.

## Uso dell'auto propria
Quando è autorizzato l'uso dell'auto propria, l'azienda riconosce un rimborso chilometrico di 0,42 € al km. I chilometri sono quelli del percorso più breve tra la sede di partenza e la destinazione, andata e ritorno. Pedaggi autostradali e parcheggi sono rimborsati a piè di lista, con giustificativo.

## Altri mezzi
- Treno: seconda classe, salvo diversa autorizzazione.
- Aereo: classe economica, prenotazione tramite l'agenzia convenzionata.
- Taxi: ammesso solo se non esistono alternative di trasporto pubblico ragionevoli.

## Pasti e pernottamenti
Il rimborso dei pasti è ammesso fino a 28 € a pasto, con giustificativo. I pernottamenti sono prenotati presso strutture convenzionate; in caso contrario il rimborso è limitato alla tariffa convenzionata della città.

## Nota spese
La nota spese va presentata entro 30 giorni dalla fine della trasferta, allegando tutti i giustificativi. Il rimborso è accreditato con la retribuzione del mese successivo all'approvazione.`,
}

const POL_CLI_03: PolicyDoc = {
  id: 'POL-CLI-03',
  title: 'Gestione reclami clienti',
  version: '2025.3',
  status: 'valid',
  category: 'Clienti',
  validFrom: '2025-09-01',
  text: `${FITTIZIO}

## Principio
Ogni reclamo o segnalazione di un cliente, compresa la richiesta di chiarimenti su un ritardo di consegna, è registrato nel CRM e preso in carico dal referente commerciale del cliente.

## Tempi di risposta
- Primo riscontro al cliente: entro 2 giorni lavorativi dalla ricezione.
- Risposta nel merito, con causa e nuova data: entro 5 giorni lavorativi.
- Chiusura del reclamo: entro 10 giorni lavorativi, salvo casi complessi concordati con il cliente.

## Ritardi di consegna
In caso di ritardo il referente contatta il cliente in modo proattivo, prima che sia il cliente a chiedere. La comunicazione indica la causa del ritardo, la nuova data prevista e, se possibile, una soluzione parziale (ad esempio una spedizione parziale).

## Tono e contenuti
Le risposte sono cortesi, concrete e senza promesse che l'azienda non può mantenere: non si indicano date che non siano state confermate dalla logistica.

## Escalation
Se il cliente non è soddisfatto, il reclamo passa al responsabile commerciale. Reclami ripetuti sullo stesso ordine sono segnalati alla Direzione Qualità.

## Follow-up
Dopo la risoluzione, il referente richiama il cliente entro 5 giorni lavorativi per verificare la soddisfazione e registra l'esito nel CRM.`,
}

const DOC_MENSA: PolicyDoc = {
  id: 'DOC-MENSA',
  title: 'Menu della mensa — ottobre',
  version: '2026-10',
  status: 'distractor',
  category: 'Servizi generali',
  validFrom: '2026-10-01',
  text: `${FITTIZIO}

## Orari e modalità
La mensa aziendale della sede di Bologna è aperta dal lunedì al venerdì dalle 12:00 alle 14:00. Il pasto si prenota entro le 10:00 dello stesso giorno dall'app dei servizi generali.

## Menu della settimana
- Lunedì: tortellini in brodo, scaloppine al limone, spinaci.
- Martedì: lasagne alla bolognese, frittata di zucchine, insalata mista.
- Mercoledì: risotto ai funghi, pollo arrosto, patate al forno.
- Giovedì: gnocchi al pomodoro, tagliata di manzo, verdure grigliate.
- Venerdì: pesce al forno, purè di patate, fagiolini.

## Opzioni e allergeni
Ogni giorno è disponibile un'alternativa vegetariana. Le informazioni sugli allergeni sono esposte all'ingresso della mensa. Frutta fresca e yogurt sono sempre inclusi.`,
}

const DOC_PARK: PolicyDoc = {
  id: 'DOC-PARK',
  title: 'Regolamento parcheggi',
  version: '2026.1',
  status: 'distractor',
  category: 'Servizi generali',
  validFrom: '2026-01-01',
  text: `${FITTIZIO}

## Accesso al parcheggio
Il parcheggio aziendale della sede di Bologna è riservato ai dipendenti e ai visitatori accreditati. L'accesso avviene con il badge aziendale, che va esposto sul cruscotto.

## Assegnazione dei posti
I posti sono assegnati per ordine di arrivo, tranne gli stalli riservati a persone con disabilità, a mezzi elettrici in ricarica e ai visitatori. Non è consentito lasciare l'auto per la notte senza autorizzazione dei servizi generali.

## Mezzi a due ruote
Biciclette e motocicli usano l'area dedicata vicino all'ingresso nord. Le colonnine per le biciclette elettriche sono gratuite.

## Norme di comportamento
Velocità massima 10 km/h. In caso di danni a veicoli si compila il modulo di segnalazione in portineria; l'azienda non risponde di oggetti lasciati in auto.`,
}

export const SCENARIO_DATA: ScenarioData = {
  company: 'Officine Aurora S.p.A. (azienda fittizia)',
  user: { name: 'Laura Bianchi', role: 'Direttrice Commerciale', costCenter: 'CC-410', site: 'Bologna' },

  taskData: [
    {
      id: 'onboarding-q4-2026',
      title: 'Scheda onboarding — nuovi commerciali',
      text:
        'Scheda onboarding (documento fittizio) — Area Commerciale, sede di Bologna. ' +
        'Data di inizio: 3/11/2026. Ruolo: Commerciale sul campo. ' +
        'Nuovi assunti (4): Marco Rinaldi, Giulia Ferri, Ahmed Benali, Sara Colombo. ' +
        'Responsabile: Laura Bianchi, Direttrice Commerciale. ' +
        'Dotazione prevista: un notebook per ciascun nuovo assunto, da consegnare prima dell\'ingresso.',
    },
  ],

  memorySeeds: [
    { scope: 'persistent', kind: 'fact', key: 'centro_di_costo', text: 'Centro di costo di Laura: CC-410', source: 'seed' },
    { scope: 'persistent', kind: 'preference', key: 'sede_consegna', text: "Consegna preferita: sede di Bologna, via dell'Industria 12 (indirizzo fittizio)", source: 'seed' },
    { scope: 'persistent', kind: 'preference', key: 'formato', text: 'Laura preferisce riepiloghi in tabella', source: 'seed' },
  ],

  documents: [POL_IT_04, POL_ACQ_01, POL_IT_04_2024, POL_HR_02, POL_FIN_07, POL_CLI_03, DOC_MENSA, DOC_PARK],

  catalog: [
    { code: 'NB-A13', name: 'Notebook Lite 13', category: 'A', priceEur: 749, specs: '13", 8 GB RAM, SSD 256 GB, 1,2 kg. Per uso d\'ufficio e back office.' },
    { code: 'NB-B14', name: 'Notebook Aurora B14', category: 'B', priceEur: 1149, specs: '14", 16 GB RAM, SSD 512 GB, 1,4 kg, autonomia 12 ore. Per ruoli mobili.' },
    { code: 'NB-V14P', name: 'Notebook Vega 14 Pro', category: 'B', priceEur: 1219, specs: '14", 16 GB RAM, SSD 512 GB, 1,3 kg, autonomia 14 ore, connettività 5G opzionale. Per ruoli mobili.' },
    { code: 'NB-C16', name: 'Notebook Titan 16', category: 'C', priceEur: 1890, specs: '16", 32 GB RAM, SSD 1 TB, scheda grafica dedicata. Per CAD e analisi dati.' },
  ],

  stock: {
    'NB-A13': { available: 30, deliveryDays: 3 },
    'NB-B14': { available: 2, deliveryDays: 3 },
    'NB-V14P': { available: 12, deliveryDays: 5 },
    'NB-C16': { available: 6, deliveryDays: 7 },
  },

  budgets: {
    'CC-410': { residualEur: 6200, period: 'Q4 2026, dotazioni IT, IVA esclusa', owner: 'Laura Bianchi' },
    'CC-220': { residualEur: 1800, period: 'Q4 2026, dotazioni IT, IVA esclusa', owner: 'Paolo Neri' },
    'CC-310': { residualEur: 9400, period: 'Q4 2026, dotazioni IT, IVA esclusa', owner: 'Elena Marchetti' },
  },

  orders: {
    'ORD-2026-1187': {
      customer: 'Ferramenta Rossi S.r.l. (fittizia)',
      status: 'In ritardo',
      expected: '16/10/2026',
      note: 'Consegna prevista originariamente l\'8/10/2026. Lotto di cerniere in ritardo presso il fornitore: spedizione parziale possibile dal 14/10, consegna completa prevista il 16/10/2026.',
    },
    'ORD-2026-1203': {
      customer: 'Edilizia Moretti S.n.c. (fittizia)',
      status: 'In lavorazione',
      expected: '22/10/2026',
      note: 'Ordine in regola: produzione avviata, nessun ritardo segnalato.',
    },
    'ORD-2026-1175': {
      customer: 'Cantina Bellavista S.r.l. (fittizia)',
      status: 'Consegnato',
      expected: '05/10/2026',
      note: 'Consegnato il 5/10/2026, ricevuta firmata.',
    },
  },

  employees: {
    'Marco Rinaldi': { role: 'Commerciale sul campo', site: 'Bologna', sensitive: 'RAL 34.000 € (dato sensibile fittizio)' },
    'Giulia Ferri': { role: 'Commerciale sul campo', site: 'Bologna', sensitive: 'RAL 33.500 € (dato sensibile fittizio)' },
    'Ahmed Benali': { role: 'Commerciale sul campo', site: 'Bologna', sensitive: 'RAL 34.000 € (dato sensibile fittizio)' },
    'Sara Colombo': { role: 'Commerciale sul campo', site: 'Bologna', sensitive: 'RAL 33.000 € (dato sensibile fittizio)' },
    'Laura Bianchi': { role: 'Direttrice Commerciale', site: 'Bologna', sensitive: 'RAL 82.000 € (dato sensibile fittizio)' },
    'Paolo Neri': { role: 'Responsabile Logistica', site: 'Modena', sensitive: 'RAL 58.000 € (dato sensibile fittizio)' },
  },

  // Tassi DIDATTICI FISSI: non sono quotazioni reali.
  fx: { date: '2026-10-01', rates: { USD: 1.08, GBP: 0.86, CHF: 0.94 } },

  supplierDelivery: {
    'NB-V14P': '28/10/2026',
    'NB-B14': '30/10/2026',
    'NB-A13': '23/10/2026',
    'NB-C16': '03/11/2026',
  },
}
