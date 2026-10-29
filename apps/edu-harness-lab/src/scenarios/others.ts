import type { Scenario, ScenarioContext } from '../domain/types'
import { NO_FAULTS } from '../domain/types'
import { localizePrompt } from '../harness/orchestrator/protocol'
import {
  S1_CHECKERS,
  S2_CHECKERS,
  S3_CHECKERS,
  S4_CHECKERS,
  S5_CHECKERS,
  S6_CHECKERS,
  S7_CHECKERS,
  S8_CHECKERS,
  S9_CHECKERS,
} from './checkers'
import { context as comparison } from './context/confronto-notebook'
import { context as followUp } from './context/followup-cliente'
import { context as remoteWork } from './context/lavoro-agile'
import { context as margin } from './context/margine-commessa'
import { context as lateOrder } from './context/ordine-in-ritardo'
import { context as currency } from './context/prezzo-in-dollari'
import { context as mileage } from './context/rimborso-chilometrico'
import { context as meetingRoom } from './context/sala-senza-data'
import { context as stockTimeout } from './context/timeout-magazzino'
import { CASH_FLOW_REPORT_TASK_DATA_EN, context as cashFlowReport } from './context/report-andamento-cassa'

/** The task instructions are already English: in English mode only the answer language changes. */
const englishInstructions = (context: ScenarioContext): string => localizePrompt(context.instructions, 'en')

// ───────────────────────── Scenario definitions ─────────────────────────

export const OTHER_SCENARIOS: Scenario[] = [
  {
    id: 'rimborso-chilometrico',
    title: 'Rimborso chilometrico',
    shortTitle: 'Rimborso km',
    lesson: 'Senza informazioni, un modello isolato indovina con sicurezza: le istruzioni lo rendono prudente, i documenti lo rendono preciso.',
    request: 'Se uso la mia auto per una trasferta di lavoro, quanto mi rimborsa l’azienda al chilometro?',
    showcaseLevel: 1,
    // The rate and its source (POL-FIN-07) come from the retrieved policy.
    maxLevel: 4,
    checkers: S1_CHECKERS,
    levelOverrides: {
      2: {
        copy: {
          phenomenon: 'La richiesta riguarda una trasferta con l’auto propria; il tasso arriva dalla policy aziendale.',
        },
      },
      3: {
        adds: [],
        copy: {
          action: 'Verifica se un fatto salvato è pertinente alla domanda.',
          phenomenon: 'Nessuna preferenza personale cambia il rimborso: conta la policy aziendale.',
        },
      },
      4: {
        copy: {
          phenomenon: 'La policy POL-FIN-07 fornisce il tasso per chilometro e la fonte da citare.',
        },
      },
    },
    en: {
      request: 'If I use my own car for a business trip, how much does the company reimburse me for each kilometre?',
      taskData: [
        {
          id: 'trasferta-auto-propria',
          title: 'Reimbursement for each kilometre with your own car',
          text:
            'The request is about the reimbursement for each kilometre on a business trip with your own car. ' +
            'It does not state a route or a distance.',
        },
      ],
      instructions: englishInstructions(mileage),
    },
  },
  {
    id: 'lavoro-agile',
    title: 'Giorni di lavoro agile',
    shortTitle: 'Lavoro agile',
    lesson: 'La conoscenza aziendale arriva dai documenti recuperati (RAG), non dal modello: la risposta cita la fonte.',
    request: 'Quanti giorni a settimana posso lavorare in lavoro agile?',
    showcaseLevel: 4,
    // Answered and cited from the retrieved HR policy (POL-HR-02).
    maxLevel: 4,
    checkers: S2_CHECKERS,
    levelOverrides: {
      2: {
        copy: {
          phenomenon: 'Il contesto fornisce la domanda sui giorni di lavoro agile; il limite arriva dalla policy HR.',
        },
      },
      3: {
        adds: [],
        copy: {
          action: 'Verifica se un fatto salvato è pertinente alla domanda.',
          phenomenon: 'Nessuna preferenza di formato cambia il numero di giorni consentiti.',
        },
      },
      4: {
        copy: {
          phenomenon: 'La policy HR POL-HR-02 fornisce il limite settimanale e la fonte da citare.',
        },
      },
    },
    en: {
      request: 'How many days a week can I work remotely?',
      taskData: [
        {
          id: 'lavoro-agile-request',
          title: 'Question about remote work',
          text: 'The request is about how many days a week are allowed for remote work.',
        },
      ],
      instructions: englishInstructions(remoteWork),
    },
  },
  {
    id: 'margine-commessa',
    title: 'Margine di una commessa',
    shortTitle: 'Margine',
    lesson: 'I calcoli non si fanno “a mente”: il modello chiede alla calcolatrice e riporta il risultato esatto.',
    request: 'La commessa Bianchi ha ricavi per 48.000 € e costi per 36.480 €: qual è il margine percentuale sui ricavi?',
    showcaseLevel: 5,
    // The calculator (first tool) gives the exact margin.
    maxLevel: 5,
    checkers: S3_CHECKERS,
    levelOverrides: {
      2: {
        copy: {
          phenomenon: 'Il contesto contiene i ricavi e i costi forniti nella richiesta.',
        },
      },
      3: {
        adds: [],
        copy: {
          action: 'Verifica se un fatto salvato è pertinente al calcolo.',
          phenomenon: 'Il margine dipende solo dai ricavi e dai costi del compito.',
        },
      },
      4: {
        adds: [],
        copy: {
          phenomenon: 'Per questo calcolo non serve recuperare documenti aziendali.',
        },
      },
      5: {
        copy: {
          title: 'Calcolo del margine',
          action: 'Chiedi alla calcolatrice il margine percentuale sui ricavi.',
          phenomenon: 'La calcolatrice restituisce il margine esatto del 24%.',
        },
      },
    },
    en: {
      request: 'The Bianchi project has revenue of €48,000 and costs of €36,480: what is the percentage margin on revenue?',
      taskData: [
        {
          id: 'commessa-bianchi',
          title: 'Bianchi project data',
          text: 'Revenue: €48,000; costs: €36,480.',
        },
      ],
      instructions: englishInstructions(margin),
    },
  },
  {
    id: 'confronto-notebook',
    title: 'Confronto tra due notebook',
    shortTitle: 'Confronto',
    lesson: 'Con il catalogo come strumento il confronto usa prezzi e specifiche vere, invece di numeri plausibili ma inventati.',
    request: 'Devo scegliere tra il Notebook Aurora B14 e il Notebook Vega 14 Pro per un commerciale sul campo: che differenze ci sono e quale conviene?',
    showcaseLevel: 6,
    // Real prices and specifications come from the catalog tool.
    maxLevel: 6,
    checkers: S4_CHECKERS,
    levelOverrides: {
      2: {
        copy: {
          phenomenon: 'Il contesto identifica i due notebook da confrontare per un commerciale sul campo.',
        },
      },
      3: {
        adds: [],
        copy: {
          action: 'Verifica se un fatto salvato è pertinente alla scelta.',
          phenomenon: 'La richiesta non contiene una preferenza personale da recuperare.',
        },
      },
      4: {
        adds: [],
        copy: {
          phenomenon: 'Il confronto userà le specifiche e i prezzi restituiti dal catalogo, non una policy RAG.',
        },
      },
      5: {
        adds: ['orchestrator', 'agentLoop'],
        enabledTools: [],
        copy: {
          title: 'Ciclo di ricerca',
          action: 'Prepara il ciclo che potrà interrogare il catalogo al livello successivo.',
          phenomenon: 'Il modello non ha ancora uno strumento di catalogo disponibile.',
        },
      },
      6: {
        adds: ['tools'],
        enabledTools: ['cerca_catalogo'],
        copy: {
          title: 'Confronto dal catalogo',
          action: 'Recupera prezzi e specifiche dei due notebook dal catalogo.',
          phenomenon: 'Il confronto usa dati reali del catalogo e non inventa specifiche.',
        },
      },
    },
    en: {
      request:
        'I have to choose between the Notebook Aurora B14 and the Notebook Vega 14 Pro for a field salesperson: ' +
        'what are the differences, and which one is the better choice?',
      taskData: [
        {
          id: 'confronto-notebook',
          title: 'Notebook comparison for the field salesperson',
          text:
            'The user is weighing the Notebook Aurora B14 and the Notebook Vega 14 Pro for a field salesperson ' +
            'and asks for a comparison to decide which one is the better choice.',
        },
      ],
      instructions: englishInstructions(comparison),
    },
  },
  {
    id: 'ordine-in-ritardo',
    title: 'Ordine cliente in ritardo',
    shortTitle: 'Ordine in ritardo',
    lesson: 'Il sistema legge l’ordine, prepara la bozza con date vere e propone un’azione: l’attività passa dall’approvazione di una persona.',
    request: 'Ferramenta Rossi mi scrive che l’ordine ORD-2026-1187 non è ancora arrivato. Controlla a che punto è, preparami una bozza di risposta e crea un’attività di follow-up per me.',
    showcaseLevel: 8,
    // The follow-up task needs a person's approval; MCP adds nothing here.
    maxLevel: 8,
    checkers: S5_CHECKERS,
    levelOverrides: {
      2: {
        copy: {
          phenomenon: 'Il contesto identifica il cliente e l’ordine ORD-2026-1187 da controllare.',
        },
      },
      5: {
        adds: ['orchestrator', 'agentLoop'],
        enabledTools: [],
        copy: {
          title: 'Ciclo di lavoro',
          action: 'Prepara il ciclo che userà gli strumenti di ordine e follow-up.',
          phenomenon: 'Il modello non ha ancora strumenti attivi per questo compito.',
        },
      },
      6: {
        adds: ['tools'],
        enabledTools: ['cerca_policy', 'leggi_ordine_cliente'],
        copy: {
          title: 'Verifica dell’ordine',
          action: 'Leggi lo stato dell’ordine e recupera la policy pertinente.',
          phenomenon: 'Il sistema controlla l’ordine e la policy prima di preparare il follow-up.',
        },
      },
      7: {
        enabledTools: ['cerca_policy', 'leggi_ordine_cliente'],
        copy: {
          title: 'Controlli sul ciclo',
          action: 'Limita i tentativi di ricerca e ferma le ripetizioni senza progresso.',
          phenomenon: 'Il ciclo cerca lo stato e la policy entro limiti definiti.',
        },
      },
      8: {
        enabledTools: ['cerca_policy', 'leggi_ordine_cliente', 'crea_attivita'],
        copy: {
          title: 'Follow-up supervisionato',
          action: 'Prepara l’attività e chiedi approvazione prima di crearla.',
          phenomenon: 'La bozza usa i dati verificati dell’ordine; la creazione attende una persona.',
        },
      },
    },
    en: {
      request:
        'Ferramenta Rossi has written to me that order ORD-2026-1187 has not arrived yet. ' +
        'Check where it stands, prepare a draft reply for me and create a follow-up task for me.',
      taskData: [
        {
          id: 'ordine-in-ritardo',
          title: 'Report about ORD-2026-1187',
          text:
            'Ferramenta Rossi reports that order ORD-2026-1187 has not arrived yet. ' +
            'Check the status, prepare a draft reply and create a follow-up task.',
        },
      ],
      instructions: englishInstructions(lateOrder),
    },
  },
  {
    id: 'followup-cliente',
    title: 'Follow-up cliente entro venerdì',
    shortTitle: 'Follow-up',
    lesson: 'Creare un’attività ha effetti: senza strumenti il modello non può farlo (e non deve dire di averlo fatto), con gli strumenti serve l’approvazione.',
    request: 'Crea un’attività per richiamare Ferramenta Rossi entro venerdì 16 ottobre 2026, per il follow-up sull’ordine ORD-2026-1187.',
    showcaseLevel: 8,
    // Creating the task is an action with effects: it passes through human approval.
    maxLevel: 8,
    checkers: S6_CHECKERS,
    levelOverrides: {
      2: {
        copy: {
          phenomenon: 'Il contesto contiene cliente, ordine e scadenza del richiamo.',
        },
      },
      4: {
        adds: [],
        copy: {
          phenomenon: 'La richiesta contiene già i dati del follow-up; non serve una ricerca documentale.',
        },
      },
      5: {
        adds: ['orchestrator', 'agentLoop'],
        enabledTools: [],
        copy: {
          title: 'Ciclo di lavoro',
          action: 'Prepara il ciclo senza esporre ancora un’azione con effetti.',
          phenomenon: 'Il modello non può creare l’attività con gli strumenti attualmente abilitati.',
        },
      },
      6: {
        adds: [],
        enabledTools: [],
        copy: {
          title: 'Azione non ancora disponibile',
          action: 'Mantieni disabilitata la creazione finché non è attiva la supervisione.',
          phenomenon: 'A questo livello non è possibile creare o dichiarare creata un’attività.',
        },
      },
      7: {
        enabledTools: [],
        copy: {
          title: 'Ciclo entro limiti',
          action: 'Limita i tentativi prima di abilitare l’azione supervisionata.',
          phenomenon: 'I controlli governano il ciclo; l’attività non viene ancora creata.',
        },
      },
      8: {
        adds: ['tools', 'approval'],
        enabledTools: ['crea_attivita'],
        copy: {
          title: 'Attività supervisionata',
          action: 'Abilita la creazione dell’attività e richiedi approvazione.',
          phenomenon: 'L’attività viene creata solo dopo l’approvazione della persona.',
        },
      },
    },
    en: {
      request: 'Create a task to call Ferramenta Rossi back by Friday 16 October 2026, for the follow-up on order ORD-2026-1187.',
      taskData: [
        {
          id: 'followup-cliente-ordine-1187',
          title: 'Follow-up on the Ferramenta Rossi order',
          text: 'Call Ferramenta Rossi back for the follow-up on order ORD-2026-1187 by Friday 16 October 2026.',
        },
      ],
      instructions: englishInstructions(followUp),
    },
  },
  {
    id: 'timeout-magazzino',
    faults: { ...NO_FAULTS, timeout: ['verifica_disponibilita'] },
    title: 'Magazzino che non risponde',
    shortTitle: 'Timeout',
    lesson: 'Quando uno strumento va in errore, un buon sistema riprova una volta e poi dice onestamente che non sa, senza inventare.',
    request: 'Quanti Notebook Vega 14 Pro (NB-V14P) abbiamo a magazzino? Me ne servono 4.',
    showcaseLevel: 7,
    // Controls bound the retries and stop after repeated tool failures.
    maxLevel: 7,
    checkers: S7_CHECKERS,
    levelOverrides: {
      2: {
        copy: {
          phenomenon: 'Il contesto specifica il modello Vega 14 Pro, il codice NB-V14P e la quantità richiesta.',
        },
      },
      4: {
        adds: [],
        copy: {
          phenomenon: 'I documenti non mostrano la disponibilità corrente: serve interrogare il magazzino.',
        },
      },
      5: {
        adds: ['orchestrator', 'agentLoop'],
        enabledTools: [],
        copy: {
          title: 'Ciclo di verifica',
          action: 'Prepara il ciclo che interrogherà il magazzino.',
          phenomenon: 'Senza lo strumento di magazzino il modello non può verificare la quantità disponibile.',
        },
      },
      6: {
        adds: ['tools'],
        enabledTools: ['verifica_disponibilita'],
        copy: {
          title: 'Verifica del magazzino',
          action: 'Interroga lo strumento di disponibilità del magazzino.',
          phenomenon: 'La richiesta di disponibilità scade per il timeout simulato.',
        },
      },
      7: {
        enabledTools: ['verifica_disponibilita'],
        copy: {
          title: 'Retry entro limiti',
          action: 'Consenti un solo retry e poi interrompi il ciclo.',
          phenomenon: 'Dopo il secondo timeout il sistema dichiara che la quantità non è verificabile.',
        },
      },
    },
    en: {
      request: 'How many Notebook Vega 14 Pro (NB-V14P) do we have in stock? I need 4.',
      taskData: [
        {
          id: 'vega-14p-availability-request',
          title: 'Availability request',
          text: 'Requested product: Notebook Vega 14 Pro (NB-V14P). Requested quantity: 4.',
        },
      ],
      instructions: englishInstructions(stockTimeout),
    },
  },
  {
    id: 'sala-senza-data',
    title: 'Prenotare una sala senza data',
    shortTitle: 'Sala riunioni',
    lesson: 'Con informazioni insufficienti la risposta giusta è una domanda, non una prenotazione inventata.',
    request: 'Prenota una sala riunioni per la presentazione ai nuovi assunti.',
    showcaseLevel: 1,
    // The instructions make it ask for date and time; no later layer can book a room.
    maxLevel: 1,
    checkers: S8_CHECKERS,
    levelOverrides: {
      1: {
        copy: {
          phenomenon: 'Invece di inventare disponibilità o orari, il modello chiede i dettagli mancanti per prenotare la sala.',
        },
      },
    },
    en: {
      request: 'Book a meeting room for the presentation to the new hires.',
      taskData: [
        {
          id: 'sala-presentazione',
          title: 'Room request for a presentation',
          text:
            'A meeting room is requested for a presentation to the new hires. The request does not specify the date, ' +
            'the start time, the duration, the number of attendees or the preferred site.',
        },
      ],
      instructions: englishInstructions(meetingRoom),
    },
  },
  {
    id: 'prezzo-in-dollari',
    title: 'Prezzo in dollari',
    shortTitle: 'Dollari',
    lesson: 'Davanti a più strumenti il modello sceglie quali usare: catalogo per il prezzo nostro, convertitore per quello in dollari.',
    request: 'Un fornitore americano mi propone il Notebook Vega 14 Pro a 1.350 dollari. Conviene rispetto al nostro prezzo di catalogo?',
    showcaseLevel: 6,
    // Catalog and currency converter are both available from level 6.
    maxLevel: 6,
    checkers: S9_CHECKERS,
    levelOverrides: {
      2: {
        copy: {
          phenomenon: 'Il contesto identifica il prodotto e la richiesta di confrontare il prezzo in dollari con quello in euro.',
        },
      },
      3: {
        adds: [],
        copy: {
          action: 'Verifica se un fatto salvato è pertinente al confronto dei prezzi.',
          phenomenon: 'La conversione usa il tasso didattico dichiarato, non una preferenza salvata.',
        },
      },
      4: {
        adds: [],
        copy: {
          phenomenon: 'Per il prezzo serve il catalogo e per la conversione il tasso dichiarato; non una ricerca RAG.',
        },
      },
      5: {
        adds: ['orchestrator', 'agentLoop'],
        enabledTools: [],
        copy: {
          title: 'Ciclo di ricerca',
          action: 'Prepara il ciclo che interrogherà catalogo e conversione valuta.',
          phenomenon: 'Nessuno strumento di prezzo o cambio è ancora disponibile al modello.',
        },
      },
      6: {
        adds: ['tools'],
        enabledTools: ['cerca_catalogo', 'converti_valuta'],
        copy: {
          title: 'Prezzo e conversione',
          action: 'Recupera il prezzo dal catalogo e convertilo al tasso dichiarato.',
          phenomenon: 'Il confronto usa il prezzo reale e la conversione fornita dallo strumento.',
        },
      },
    },
    en: {
      request:
        'An American supplier is offering me the Notebook Vega 14 Pro at 1,350 dollars. ' +
        'Is that a better deal than our catalog price?',
      taskData: [
        {
          id: 'prezzo-in-dollari-preventivo',
          title: 'Supplier quote',
          text: 'The supplier offers the Notebook Vega 14 Pro at USD 1,350.',
        },
      ],
      instructions: englishInstructions(currency),
    },
  },
  {
    id: 'report-andamento-cassa',
    title: 'Officina Lume: cassa sotto pressione',
    shortTitle: 'Cassa sotto pressione',
    lesson:
      'Ispirato a una chat di base, questo caso evidenzia la riduzione della cassa e la principale uscita senza RAG o previsioni; l’interprete di codice è simulato.',
    request:
      'Per Officina Lume prepara un report gestionale della cassa del primo semestre 2026 con un foglio di riepilogo mensile e uno delle uscite per categoria. Indica saldo iniziale e finale, variazione complessiva, mese con il saldo finale più basso e categoria di spesa maggiore. Usa solo i dati forniti; niente previsioni.',
    showcaseLevel: 5,
    maxLevel: 5,
    checkers: [],
    levelOverrides: {
      2: {
        copy: {
          phenomenon: 'Il saldo iniziale e i movimenti di Officina Lume da gennaio a giugno sono forniti nei dati del compito.',
        },
      },
      3: {
        adds: [],
        copy: {
          title: 'Nessuna memoria',
          action: 'Non aggiungere preferenze o fatti salvati alla richiesta.',
          phenomenon: 'La risposta usa solo il messaggio e i dati del trimestre.',
        },
      },
      4: {
        adds: [],
        copy: {
          title: 'Nessuna ricerca RAG',
          action: 'Non cercare documenti aziendali o fonti esterne.',
          phenomenon: 'Per questo report il modello usa soltanto i dati del compito.',
        },
      },
      5: {
        adds: ['tools', 'orchestrator', 'agentLoop'],
        enabledTools: ['code_interpreter'],
        copy: {
          title: 'Interprete di codice simulato',
          action: 'Avvia lo script di cassa predefinito sui dati del compito.',
          phenomenon: 'Due fogli riepilogano sei mesi di flussi e le spese per categoria; il workbook non è scaricabile.',
          term: 'Code Interpreter',
          message: 'Il modello non deve scrivere codice: il simulatore esegue una routine fissa, senza valutare codice arbitrario.',
        },
      },
    },
    en: {
      request:
        'Prepare a cash-management report for Officina Lume for the first half of 2026, with one monthly summary sheet and one expense-category sheet. Report the opening and closing cash, overall change, month with the lowest closing balance and largest expense category. Use only the supplied data; do not forecast.',
      taskData: [CASH_FLOW_REPORT_TASK_DATA_EN],
      instructions: englishInstructions(cashFlowReport),
    },
  },
]
