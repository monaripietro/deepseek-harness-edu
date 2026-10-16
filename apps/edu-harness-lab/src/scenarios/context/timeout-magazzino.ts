import type { ScenarioContext, ScenarioData } from '../../domain/types'

const taskData: ScenarioData['taskData'] = [
  {
    id: 'vega-14p-availability-request',
    title: 'Richiesta di disponibilità',
    text: 'Prodotto richiesto: Notebook Vega 14 Pro (NB-V14P). Quantità richiesta: 4.',
  },
]

const memoryKeys: string[] = []
const documentIds: string[] = []

const instructions: string = [
  'Answer in Italian.',
  'Use verifica_disponibilita to check current stock for NB-V14P; catalog data is not live availability.',
  'A confirmed quantity below 4 means stock is insufficient; a failed or missing result means availability is unverified, not insufficient.',
  'Retry a genuine transient failure at most once; if availability still cannot be verified, state that uncertainty.',
  'Never invent stock or present stale catalog data as current availability.',
].join(' ')

/** Provides the requested product and quantity plus rules for verifying current stock. */
export const context: ScenarioContext = {
  taskData,
  memoryKeys,
  documentIds,
  instructions,
}
