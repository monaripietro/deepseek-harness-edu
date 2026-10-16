import type { ScenarioContext } from '../../domain/types'

/** Context for the room-presentation request, with no supplied scheduling or venue details. */
export const context: ScenarioContext = {
  taskData: [
    {
      id: 'sala-presentazione',
      title: 'Richiesta di sala per una presentazione',
      text:
        'È richiesta una sala riunioni per una presentazione ai nuovi assunti. La richiesta non specifica la data, l’orario d’inizio, la durata, il numero di partecipanti o la sede desiderata.',
    },
  ],
  memoryKeys: [],
  documentIds: [],
  instructions:
    'Reply in Italian. Treat this as a request for a meeting room for a presentation to new hires. The date, start time, duration, expected attendee count, and preferred meeting site are unspecified; ask one brief question covering all five. Do not draw on onboarding data from another scenario. The lab has no room inventory, availability-check tool, or booking capability; state that you cannot verify availability or reserve a room. Do not invent a room, schedule, attendee count, company rule, or completed reservation.',
}
