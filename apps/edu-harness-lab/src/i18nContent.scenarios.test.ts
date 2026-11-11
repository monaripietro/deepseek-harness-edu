import { afterEach, describe, expect, it } from 'vitest'
import { SCENARIOS } from './scenarios'
import { BUILTIN_TOOLS } from './harness/tools/builtin'
import { PLAN_TOOL } from './harness/tools/planning'
import { SIMULATED_TOOLS } from './harness/mcp/simulatedServer'
import { SIMULATED_MCP_SERVER, levelsFor } from './harness/levels'
import { LEVEL_OVERRIDE_EN, SCENARIO_EN, TOOL_EN, levelText, scenarioText, toolText } from './i18nContent'
import { useUiLang } from './i18n'

const ALL_TOOLS = [
  ...BUILTIN_TOOLS,
  PLAN_TOOL,
  ...SIMULATED_TOOLS.map(tool => ({
    id: `mcp__${SIMULATED_MCP_SERVER}__${tool.name}`,
    title: tool.title ?? tool.name,
    purpose: '',
    output: '',
  })),
]

afterEach(() => {
  useUiLang.setState({ lang: 'it' })
})

describe('English content: scenarios', () => {
  it.each(SCENARIOS.map(s => [s.id, s] as const))('%s has English title, shortTitle and lesson', (id, scenario) => {
    const en = SCENARIO_EN[id]
    expect(en?.title, `title of ${id}`).toBeTruthy()
    expect(en?.shortTitle, `shortTitle of ${id}`).toBeTruthy()
    expect(en?.lesson, `lesson of ${id}`).toBeTruthy()
    expect(en?.title).not.toBe(scenario.title)
  })

  it('returns the English scenario texts only in English mode', () => {
    const scenario = SCENARIOS[0]
    if (!scenario) throw new Error('no scenario')
    expect(scenarioText(scenario).title).toBe(scenario.title)
    useUiLang.setState({ lang: 'en' })
    expect(scenarioText(scenario).title).toBe(SCENARIO_EN[scenario.id]?.title)
  })
})

describe('English content: level overrides', () => {
  it('has an English entry for every override copy field of every scenario', () => {
    for (const scenario of SCENARIOS) {
      for (const [levelId, override] of Object.entries(scenario.levelOverrides ?? {})) {
        const copy = override?.copy
        if (!copy) continue
        const key = `${scenario.id}:${levelId}`
        const en = LEVEL_OVERRIDE_EN[key]
        expect(en, `missing English override ${key}`).toBeDefined()
        for (const field of Object.keys(copy) as (keyof typeof copy)[]) {
          expect(en?.[field], `${key}.${field}`).toBeTruthy()
        }
      }
    }
  })

  it('applies the English override in English mode', () => {
    const scenario = SCENARIOS.find(s => s.id === 'margine-commessa')
    expect(scenario).toBeDefined()
    const level = levelsFor(scenario).find(l => l.id === 5)
    expect(level).toBeDefined()
    if (!level || !scenario) throw new Error('missing scenario or level')
    expect(levelText(level, scenario.id).title).toBe('Calcolo del margine')
    useUiLang.setState({ lang: 'en' })
    expect(levelText(level, scenario.id).title).toBe('Calculating the margin')
    expect(levelText(level, scenario.id).action).toBe('Ask the calculator for the percentage margin on revenue.')
  })
})

describe('English content: tools', () => {
  it.each(ALL_TOOLS.map(tool => [tool.id, tool] as const))('%s has an English title, purpose and output', (id, tool) => {
    const en = TOOL_EN[id]
    expect(en?.title, `title of ${id}`).toBeTruthy()
    expect(en?.purpose, `purpose of ${id}`).toBeTruthy()
    expect(en?.output, `output of ${id}`).toBeTruthy()
    expect(en?.title).not.toBe(tool.title)
  })

  it('returns the English tool texts only in English mode', () => {
    const tool = BUILTIN_TOOLS.find(item => item.id === 'calcolatrice')
    if (!tool) throw new Error('no calculator')
    expect(toolText(tool).title).toBe('Calcolatrice')
    useUiLang.setState({ lang: 'en' })
    expect(toolText(tool).title).toBe('Calculator')
  })
})
