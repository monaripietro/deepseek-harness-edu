import type { ScenarioContext } from '../../domain/types'

/** Facts and tool guidance for the supplier quote comparison scenario. */
export const context: ScenarioContext = {
  taskData: [
    {
      id: 'prezzo-in-dollari-preventivo',
      title: 'Preventivo del fornitore',
      text: 'Il fornitore propone il Notebook Vega 14 Pro a USD 1,350.',
    },
  ],
  memoryKeys: [],
  documentIds: [],
  instructions:
    'Use cerca_catalogo to retrieve the Vega 14 Pro catalog price and convert the USD 1,350 quote to EUR with converti_valuta; use both returned results, not memory or mental estimates. Compare in EUR. The catalog price is VAT-exclusive, but the quote’s tax basis is unstated: do not call the amounts like-for-like or claim savings until the tax basis and total costs are known. Report the converter’s returned rate and date as a fixed teaching rate, not a live market quote. Never claim a purchase was made. If either tool is unavailable or fails, say the comparison cannot be completed. Answer in Italian.',
}
