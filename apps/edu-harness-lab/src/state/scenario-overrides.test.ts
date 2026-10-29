import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { configForLevel } from '../harness/levels'
import { bus, useLab } from './store'

const original = useLab.getState()

beforeEach(() => {
  bus.clear()
  useLab.setState({
    ...original,
    scenarioId: 'notebook-nuovi-assunti',
    level: 0,
    view: 'guided',
    config: configForLevel(0),
    customTools: [],
  }, true)
})

afterEach(() => {
  bus.clear()
  useLab.setState(original, true)
})

describe('guided scenario overrides', () => {
  it('applies exact scenario tool sets while navigating and switching scenarios', () => {
    useLab.getState().setScenario('confronto-notebook')
    useLab.getState().setLevel(6)
    expect(useLab.getState().config.enabledTools).toEqual(['cerca_catalogo'])

    useLab.getState().setScenario('prezzo-in-dollari')
    expect(useLab.getState().config.enabledTools).toEqual(['cerca_catalogo', 'converti_valuta'])
  })

  it('activates only the simulated code interpreter for the cash-flow report', () => {
    useLab.getState().setScenario('report-andamento-cassa')
    useLab.getState().setLevel(5)

    expect(useLab.getState().config.enabledTools).toEqual(['code_interpreter'])
    expect(useLab.getState().config.components).toMatchObject({
      memory: false,
      rag: false,
      controls: false,
      approval: false,
      mcp: false,
    })
  })

  it('preserves free-lab configuration when changing scenarios', () => {
    const enabledTools = ['custom_free_lab_tool']
    useLab.setState({
      scenarioId: 'confronto-notebook',
      level: 6,
      view: 'lab',
      config: { ...configForLevel(6), enabledTools },
    })

    useLab.getState().setScenario('prezzo-in-dollari')

    expect(useLab.getState().config.enabledTools).toEqual(enabledTools)
  })
})
