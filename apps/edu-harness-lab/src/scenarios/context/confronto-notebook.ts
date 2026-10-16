import type { ScenarioContext } from '../../domain/types'

/** Context for comparing the two notebook models for a field salesperson. */
export const context: ScenarioContext = {
  taskData: [
    {
      id: 'confronto-notebook',
      title: 'Confronto notebook per il commerciale sul campo',
      text:
        'La persona valuta il Notebook Aurora B14 e il Notebook Vega 14 Pro per un commerciale sul campo e chiede un confronto per decidere quale convenga.',
    },
  ],
  memoryKeys: ['formato'],
  documentIds: ['POL-IT-04'],
  instructions:
    'Answer in Italian. Retrieve both named models from the catalog first; compare the returned specifications and prices, using a like-for-like basis for unit prices (same currency and VAT treatment). If RAG retrieves a current, applicable policy, apply it to a field salesperson and cite its ID; otherwise do not invent policy limits. Base any recommendation on retrieved catalog facts and applicable policy, and explain the trade-off. Present it as a recommendation, not an order or purchase; do not initiate a purchase. Do not claim availability, delivery dates, approval, or completed actions unless a tool confirms them. If required facts are unavailable, say what is unknown.',
}
