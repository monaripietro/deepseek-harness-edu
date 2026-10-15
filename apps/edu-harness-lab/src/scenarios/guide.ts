import type { Scenario } from '../domain/types'
import { GUIDE_CHECKERS } from './checkers'

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
  checkers: GUIDE_CHECKERS,
}
