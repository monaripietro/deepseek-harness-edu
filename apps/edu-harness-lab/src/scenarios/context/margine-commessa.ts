import type { ScenarioContext } from '../../domain/types'

/** Model context tailored to the Bianchi job margin question. */
export const context: ScenarioContext = {
  taskData: [
    {
      id: 'commessa-bianchi',
      title: 'Dati della commessa Bianchi',
      text: 'Ricavi: 48.000 €; costi: 36.480 €.',
    },
  ],
  memoryKeys: [],
  documentIds: [],
  instructions:
    'Answer in Italian. Margin on revenue is (revenue - costs) / revenue * 100; it is not markup on cost, which divides by costs. ' +
    'Use the calculator tool for the arithmetic whenever it is available. In your final answer, state the percentage actually obtained and briefly show the calculation. ' +
    'Never invent a value or claim a calculation or tool call you did not perform.',
}
