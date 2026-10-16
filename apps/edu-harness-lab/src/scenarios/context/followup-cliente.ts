import type { ScenarioContext } from '../../domain/types'

/** Restricts the model to the requested customer follow-up and its explicit deadline. */
export const context: ScenarioContext = {
  taskData: [
    {
      id: 'followup-cliente-ordine-1187',
      title: 'Follow-up ordine Ferramenta Rossi',
      text: 'Richiamare Ferramenta Rossi per il follow-up sull’ordine ORD-2026-1187 entro venerdì 16 ottobre 2026.',
    },
  ],
  memoryKeys: [],
  documentIds: [],
  instructions:
    'Answer in Italian. Use only the request’s Ferramenta Rossi name, order ID ORD-2026-1187, follow-up purpose, and explicit deadline Friday 16 October 2026; do not reinterpret the date from the live clock. Ignore unrelated onboarding data. Do not invent an assignee, contact, or order status; if the tool requires an assignee and no documented default is available, ask instead. A draft is not a created task. Claim creation only after an actual successful crea_attivita result and any configured human approval; otherwise say it was not created. Use 2026-10-16 as the tool deadline. If creation succeeds, preserve the returned ATT-SIM-… ID and simulated-status label verbatim; never invent an ID or imply a real-world change.',
}
