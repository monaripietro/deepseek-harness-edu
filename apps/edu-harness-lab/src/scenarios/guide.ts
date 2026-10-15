import type { Scenario } from '../domain/types'
import { localizePrompt } from '../harness/orchestrator/protocol'
import { GUIDE_CHECKERS } from './checkers'
import { context } from './context/notebook-nuovi-assunti'
import { SCENARIO_DATA_EN } from './data.en'

export const GUIDE_ID = 'notebook-nuovi-assunti'

export const GUIDE_REQUEST =
  'Il 3 novembre entrano nel mio team quattro nuovi commerciali. Quale notebook posso ordinare per loro secondo la policy aziendale, quanto spendo in totale IVA inclusa e puoi preparare la richiesta d\'acquisto?'

export const guideScenario: Scenario = {
  id: GUIDE_ID,
  title: 'Notebook per quattro nuovi assunti',
  shortTitle: 'Nuovi assunti',
  lesson: 'Lo stesso modello, la stessa domanda: cambia solo l’harness attorno, e la risposta passa da inventata a verificata e supervisionata.',
  request: GUIDE_REQUEST,
  showcaseLevel: 9,
  // Every layer changes the outcome, up to the supplier's delivery date read through MCP.
  maxLevel: 9,
  checkers: GUIDE_CHECKERS,
  en: {
    request:
      'On 3 November four new salespeople join my team. Which notebook can I order for them under the company policy, ' +
      'how much do I spend in total including VAT, and can you prepare the purchase request?',
    taskData: SCENARIO_DATA_EN.taskData,
    // The task instructions are already English: only the answer language changes.
    instructions: localizePrompt(context.instructions, 'en'),
  },
}
