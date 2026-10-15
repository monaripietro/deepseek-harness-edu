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
]
