import type { PromptLanguage, Scenario, ScenarioContext, ScenarioData } from '../domain/types'
import { context as onboarding } from './context/notebook-nuovi-assunti'
import { context as mileage } from './context/rimborso-chilometrico'
import { context as remoteWork } from './context/lavoro-agile'
import { context as margin } from './context/margine-commessa'
import { context as comparison } from './context/confronto-notebook'
import { context as lateOrder } from './context/ordine-in-ritardo'
import { context as followUp } from './context/followup-cliente'
import { context as stockTimeout } from './context/timeout-magazzino'
import { context as meetingRoom } from './context/sala-senza-data'
import { context as currency } from './context/prezzo-in-dollari'
import { context as reflection } from './context/ragionamento-iterativo'
import { SCENARIO_DATA } from './data'
import { SCENARIO_DATA_EN } from './data.en'
import { guideScenario } from './guide'
import { OTHER_SCENARIOS } from './others'
import { reflectionScenario } from './reflection'

export { SCENARIO_DATA }
export const DEFAULT_SCENARIO_ID = 'notebook-nuovi-assunti'

const CONTEXTS: Record<string, ScenarioContext> = {
  'notebook-nuovi-assunti': onboarding,
  'rimborso-chilometrico': mileage,
  'lavoro-agile': remoteWork,
  'margine-commessa': margin,
  'confronto-notebook': comparison,
  'ordine-in-ritardo': lateOrder,
  'followup-cliente': followUp,
  'timeout-magazzino': stockTimeout,
  'sala-senza-data': meetingRoom,
  'prezzo-in-dollari': currency,
  'ragionamento-iterativo': reflection,
}

export const SCENARIOS = [guideScenario, ...OTHER_SCENARIOS, reflectionScenario].map((scenario) => {
  const context = CONTEXTS[scenario.id]
  if (!context) throw new Error(`Contesto dello scenario non definito: ${scenario.id}`)
  return { ...scenario, context }
})

/**
 * Resolves a catalog scenario with its task-specific context, in the prompt language.
 * @param id Catalog scenario identifier.
 * @param lang Prompt language: 'en' swaps in the English model-facing texts (request, task data, instructions, reflection prompt).
 * @returns The scenario and its explicit context profile.
 * @throws If the identifier is not in the catalog.
 */
export function getScenario(id: Scenario['id'], lang: PromptLanguage = 'it') {
  const scenario = SCENARIOS.find(item => item.id === id)
  if (!scenario) throw new Error(`Scenario non disponibile: ${id}`)
  const en = scenario.en
  if (lang !== 'en' || !en) return scenario
  return {
    ...scenario,
    request: en.request,
    ...(en.reflectionPrompt ?? scenario.reflectionPrompt ? { reflectionPrompt: en.reflectionPrompt ?? scenario.reflectionPrompt } : {}),
    context: {
      ...scenario.context,
      taskData: en.taskData ?? scenario.context.taskData,
      instructions: en.instructions ?? scenario.context.instructions,
    },
  }
}

/** The scenario request in the prompt language ('' for an unknown scenario). */
export function requestFor(id: Scenario['id'], lang: PromptLanguage = 'it'): string {
  return SCENARIOS.some(item => item.id === id) ? getScenario(id, lang).request : ''
}

/** Demo data (documents, memory, catalog, orders…) in the prompt language. */
export function scenarioDataFor(lang: PromptLanguage = 'it'): ScenarioData {
  return lang === 'en' ? SCENARIO_DATA_EN : SCENARIO_DATA
}
