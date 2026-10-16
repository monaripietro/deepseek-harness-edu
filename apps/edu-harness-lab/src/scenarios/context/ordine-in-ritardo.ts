import type { ScenarioContext, ScenarioData } from '../../domain/types'

const taskData: ScenarioData['taskData'] = [
  {
    id: 'ordine-in-ritardo',
    title: 'Segnalazione su ORD-2026-1187',
    text: 'Ferramenta Rossi segnala che l’ordine ORD-2026-1187 non è ancora arrivato. Verifica lo stato, prepara una bozza di risposta e crea un’attività di follow-up.',
  },
]

/** Selects the request details and communication policy for the delayed-order scenario. */
export const context: ScenarioContext = {
  taskData,
  memoryKeys: [],
  documentIds: ['POL-CLI-03'],
  instructions:
    'Respond in Italian. Use the order lookup tool to retrieve the current status for the customer and order in the request. Apply POL-CLI-03 and cite it in your Italian summary, but keep internal policy references out of the customer-facing draft. Include a delivery cause, date, or partial shipment only if the lookup confirms it with logistics; do not make unconfirmed promises or invent a task deadline. Label the message as a draft and never claim it was sent. Create the follow-up task only through the task tool; report it as created only after successful execution and any required human approval. State whether the action was real or simulated; report failures or pending approval honestly.',
}
