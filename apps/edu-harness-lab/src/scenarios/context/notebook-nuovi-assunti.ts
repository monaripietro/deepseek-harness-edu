import type { ScenarioContext } from '../../domain/types'
import { SCENARIO_DATA } from '../data'

/** Model-facing context for the new-hire notebook purchase scenario. */
export const context: ScenarioContext = {
  taskData: SCENARIO_DATA.taskData,
  memoryKeys: ['centro_di_costo', 'sede_consegna', 'formato'],
  documentIds: ['POL-IT-04', 'POL-ACQ-01', 'POL-IT-04-2024'],
  instructions:
    'Answer in Italian. Use only supplied onboarding facts; do not invent names, roles, or dates. Apply current IT and purchasing policies, not superseded editions, and cite used policy IDs. Use available capabilities to retrieve policy, catalog, stock, and cost-center budget data; choose one compliant model with enough stock for all four and calculate the VAT-inclusive total with the calculator. Use saved cost-center and delivery details when available. Verify supplier delivery against the start date only through an available supplier capability. Create a purchase request only through the provided action; claim success only after its successful result and required approval. If a lookup or action fails or is unavailable, state what remains unverified.',
}
