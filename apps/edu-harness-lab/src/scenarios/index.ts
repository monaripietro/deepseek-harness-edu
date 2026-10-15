import type { Scenario } from '../domain/types'
import { SCENARIO_DATA } from './data'
import { guideScenario } from './guide'
import { OTHER_SCENARIOS } from './others'

export { SCENARIO_DATA }
export const DEFAULT_SCENARIO_ID = 'notebook-nuovi-assunti'
export const SCENARIOS: Scenario[] = [guideScenario, ...OTHER_SCENARIOS]
