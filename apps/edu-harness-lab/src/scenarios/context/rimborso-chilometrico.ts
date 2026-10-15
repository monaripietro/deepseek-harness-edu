import type { ScenarioContext } from '../../domain/types'

/** Model-facing context for the own-car mileage-reimbursement question. */
export const context: ScenarioContext = {
  taskData: [
    {
      id: 'trasferta-auto-propria',
      title: 'Rimborso al chilometro con auto propria',
      text: 'La richiesta riguarda il rimborso al chilometro per una trasferta di lavoro con l’auto propria. Non indica una tratta o una distanza.',
    },
  ],
  memoryKeys: [],
  documentIds: ['POL-FIN-07'],
  instructions:
    'This asks for the reimbursement tariff per kilometre, not a total for a particular journey. ' +
    'Retrieve the tariff from the travel policy and cite its document ID. Answer in Italian. ' +
    'Do not invent a route distance or assume a trip is authorized or reimbursable; state eligibility only as the policy describes it. ' +
    'If asked to calculate a journey total and the distance is missing, request it instead of guessing. ' +
    'Keep the policy rate out of these instructions and task data.',
}
