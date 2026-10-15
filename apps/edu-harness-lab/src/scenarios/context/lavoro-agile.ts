import type { ScenarioContext } from '../../domain/types'

/** Model context for the remote-work policy question. */
export const context: ScenarioContext = {
  taskData: [
    {
      id: 'lavoro-agile-request',
      title: 'Richiesta sul lavoro agile',
      text: 'La richiesta riguarda quanti giorni a settimana sono consentiti per il lavoro agile.',
    },
  ],
  memoryKeys: ['formato'],
  documentIds: ['POL-HR-02'],
  instructions:
    'Answer in Italian. Retrieve the company HR policy for remote work, answer from its text, and cite the document ID. Include relevant caveats only when stated in the retrieved policy. Do not infer the user’s role, tenure, or personal eligibility from unrelated context. If you cannot retrieve the policy, say you cannot verify the rule rather than guessing.',
}
