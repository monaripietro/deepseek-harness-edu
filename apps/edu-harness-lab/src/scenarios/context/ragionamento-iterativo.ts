import type { ScenarioContext } from '../../domain/types'

/** Task facts for the iterative review scenario: only what the request does not already say. */
export const context: ScenarioContext = {
  taskData: [
    {
      id: 'iterative-review-positions',
      title: 'Posizioni',
      text: 'Le posizioni vanno da 1 (prima) a 4 (ultima). Ogni nome ha una sola posizione.',
    },
  ],
  memoryKeys: [],
  documentIds: [],
  // A puzzle, not a company task: the general assistant rules (persona, citations, tables) would only add noise.
  instructions: 'Solve the ordering task of the user. Answer in Italian.',
  replacesGeneralInstructions: true,
}
