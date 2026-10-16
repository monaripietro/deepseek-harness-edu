import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { configForLevel, lastLevelOf, LEVEL6_TOOLS, levelsFor } from '../harness/levels'
import { DEFAULT_SCENARIO_ID, getScenario, SCENARIOS } from '../scenarios'
import { bus, useLab } from './store'

const originalState = useLab.getState()
const REFLECTION_SCENARIO = 'ragionamento-iterativo'

beforeEach(() => {
  bus.clear()
  useLab.setState({
    ...originalState,
    scenarioId: DEFAULT_SCENARIO_ID,
    level: 0,
    config: configForLevel(0),
    events: [],
  }, true)
})

afterEach(() => {
  bus.clear()
  useLab.setState(originalState, true)
})

describe('reflection scenario configuration', () => {
  it('keeps the isolated-model level and enables reflection without tools at loop-enabled levels', () => {
    useLab.getState().setScenario(REFLECTION_SCENARIO)
    expect(useLab.getState().config.enabledTools).toEqual([])
    expect(useLab.getState().level).toBe(0)

    useLab.getState().setLevel(7)
    const config = useLab.getState().config
    expect(config.enabledTools).toEqual([])
    expect(config.components.tools).toBe(false)
    expect(config.components.agentLoop).toBe(true)
    expect(config.components.controls).toBe(true)

    useLab.getState().setLevel(1)
    expect(useLab.getState().config.enabledTools).toEqual([])
    useLab.getState().setLevel(5)
    expect(useLab.getState().config.enabledTools).toEqual([])
    expect(useLab.getState().config.components.agentLoop).toBe(true)
  })

  it('restores the level defaults when leaving the reflection scenario', () => {
    useLab.getState().setLevel(7)
    useLab.getState().setScenario(REFLECTION_SCENARIO)
    expect(useLab.getState().config.enabledTools).toEqual([])

    useLab.getState().setScenario(DEFAULT_SCENARIO_ID)
    expect(useLab.getState().config.enabledTools).toEqual(LEVEL6_TOOLS)
    expect(useLab.getState().config.components.controls).toBe(true)
  })

  it('can activate the agent loop in the free laboratory without activating tools', () => {
    useLab.getState().setScenario(REFLECTION_SCENARIO)
    useLab.getState().toggleComponent('agentLoop')
    expect(useLab.getState().config.enabledTools).toEqual([])
    expect(useLab.getState().config.components.agentLoop).toBe(true)
    expect(useLab.getState().config.components.orchestrator).toBe(true)
    expect(useLab.getState().config.components.tools).toBe(false)
  })

  it('does not enable tools when another component changes', () => {
    useLab.getState().setScenario(REFLECTION_SCENARIO)
    useLab.getState().setLevel(7)
    useLab.getState().updateConfig({ enabledTools: [] })
    useLab.getState().toggleComponent('memory')
    expect(useLab.getState().config.enabledTools).toEqual([])
  })

  it('preserves customized tools when switching between ordinary scenarios', () => {
    useLab.getState().setLevel(7)
    useLab.getState().updateConfig({ enabledTools: ['leggi_budget'] })
    useLab.getState().setScenario('ordine-in-ritardo')
    expect(useLab.getState().level).toBe(7)
    expect(useLab.getState().config.enabledTools).toEqual(['leggi_budget'])
  })

  it('drops conversation context when changing scenarios, but preserves it for the same selection', () => {
    const history = [{ role: 'user' as const, content: 'Marco Rinaldi: domanda precedente.' }]
    useLab.setState({ history })
    useLab.getState().setScenario(DEFAULT_SCENARIO_ID)
    expect(useLab.getState().history).toBe(history)
    useLab.getState().setScenario('sala-senza-data')
    expect(useLab.getState().history).toEqual([])
  })

  it('selects the warehouse timeout demonstration and removes its faults when leaving', () => {
    useLab.getState().setScenario('timeout-magazzino')
    expect(useLab.getState().faults.timeout).toEqual(['verifica_disponibilita'])
    useLab.getState().setScenario('lavoro-agile')
    expect(useLab.getState().faults.timeout).toEqual([])
  })
})

describe('guided path length per scenario', () => {
  it('gives every scenario a last level that is not before the level where it shows its point', () => {
    for (const scenario of SCENARIOS) {
      expect(scenario.maxLevel, scenario.id).toBeDefined()
      expect(lastLevelOf(scenario), scenario.id).toBeGreaterThanOrEqual(scenario.showcaseLevel)
    }
    expect(lastLevelOf(getScenario(DEFAULT_SCENARIO_ID))).toBe(9)
    expect(levelsFor(getScenario('sala-senza-data')).map(l => l.id)).toEqual([0, 1])
    expect(levelsFor(getScenario('lavoro-agile'))).toHaveLength(5)
    expect(levelsFor(undefined)).toHaveLength(10)
  })

  it('stops next-level navigation and direct jumps at the scenario’s last level', () => {
    useLab.getState().setScenario('margine-commessa')
    useLab.getState().setLevel(4)
    useLab.getState().nextLevel()
    expect(useLab.getState().level).toBe(5)
    expect(useLab.getState().config.enabledTools).toEqual(['calcolatrice'])
    useLab.getState().nextLevel()
    expect(useLab.getState().level).toBe(5)
    useLab.getState().setLevel(9)
    expect(useLab.getState().level).toBe(5)
    expect(useLab.getState().config.components.mcp).toBe(false)
  })

  it('steps back to the new scenario’s last level when the current one is past it', () => {
    useLab.getState().setLevel(8)
    useLab.getState().setScenario('sala-senza-data')
    const state = useLab.getState()
    expect(state.level).toBe(1)
    expect(state.config.components).toEqual(configForLevel(1).components)
    expect(state.config.enabledTools).toEqual([])

    useLab.getState().setScenario(DEFAULT_SCENARIO_ID)
    expect(useLab.getState().level).toBe(1)
  })

  it('keeps the free laboratory configuration when the scenario path is shorter', () => {
    useLab.getState().setLevel(7)
    useLab.setState({ view: 'lab' })
    useLab.getState().toggleComponent('mcp')
    const config = useLab.getState().config
    useLab.getState().setScenario('lavoro-agile')
    expect(useLab.getState().level).toBe(4)
    expect(useLab.getState().config).toBe(config)
  })
})
