import { afterEach, describe, expect, it } from 'vitest'
import { useUiLang } from './i18n'
import { COMPONENT_EN, LEVEL_EN, componentText, levelText } from './i18nContent'
import { COMPONENT_ORDER, EXPERIMENT, LEVELS, baseConfig, describeConfig } from './harness/levels'
import type { LevelDef } from './harness/levels'

afterEach(() => {
  useUiLang.setState({ lang: 'it' })
})

function level(id: number): LevelDef {
  const found = LEVELS.find(l => l.id === id)
  if (!found) throw new Error(`no level ${id}`)
  return found
}

function experiment(key: string) {
  const found = EXPERIMENT.find(e => e.key === key)
  if (!found) throw new Error(`no experiment ${key}`)
  return found
}

describe('English content maps', () => {
  it('has English copy for every guided level', () => {
    for (const level of LEVELS) {
      const copy = LEVEL_EN[level.id]
      expect(copy?.title, `title of level ${level.id}`).toBeTruthy()
      expect(copy?.action, `action of level ${level.id}`).toBeTruthy()
      expect(copy?.phenomenon, `phenomenon of level ${level.id}`).toBeTruthy()
      expect(copy?.term, `term of level ${level.id}`).toBeTruthy()
      expect(copy?.message, `message of level ${level.id}`).toBeTruthy()
    }
  })

  it('has English label and short text for every component', () => {
    for (const id of COMPONENT_ORDER) {
      expect(COMPONENT_EN[id]?.label, `label of ${id}`).toBeTruthy()
      expect(COMPONENT_EN[id]?.short, `short of ${id}`).toBeTruthy()
    }
  })
})

describe('language-aware content', () => {
  it('keeps the Italian texts by default', () => {
    expect(levelText(level(0)).title).toBe('Il modello, da solo')
    expect(componentText('model').label).toBe('Modello linguistico')
  })

  it('shows levels and components in English when the interface is English', () => {
    useUiLang.setState({ lang: 'en' })
    expect(levelText(level(0)).title).toBe('The model, on its own')
    expect(levelText(level(8)).title).toBe('Human approval')
    expect(componentText('approval')).toEqual({ label: 'Human approval', short: expect.stringContaining('approves or rejects') })
    expect(componentText('tools').label).toBe('Tools')
  })

  it('shows experiment labels and configuration descriptions in English', () => {
    expect(experiment('c01').label).toBe('1 · Modello isolato')
    expect(describeConfig(baseConfig())).toBe('1 · Modello isolato')

    useUiLang.setState({ lang: 'en' })
    expect(experiment('c01').label).toBe('1 · Isolated model')
    expect(experiment('c04').short).toBe('+ Memory')
    expect(describeConfig(baseConfig())).toBe('1 · Isolated model')
    const custom = { ...baseConfig(), components: { ...baseConfig().components, instructions: true, tools: true } }
    expect(describeConfig(custom)).toBe('Model + System instructions, Tools')
  })
})
