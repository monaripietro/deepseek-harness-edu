import { describe, expect, it } from 'vitest'
import { getScenario } from '../scenarios'
import { configForLevel, levelFor, levelsFor } from './levels'

describe('scenario guided-level overrides', () => {
  it('keeps numeric level IDs while resolving scenario-specific copy and components', () => {
    const scenario = getScenario('ragionamento-iterativo')
    const levels = levelsFor(scenario)

    expect(levels.map(level => level.id)).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
    expect(levelFor(scenario, 5)).toMatchObject({
      title: 'Ciclo di revisione',
      adds: ['orchestrator', 'agentLoop'],
    })
    expect(levelFor(scenario, 6)).toMatchObject({
      title: 'Verifica del candidato',
      adds: [],
    })
    expect(levelFor(scenario, 7)).toMatchObject({
      title: 'Risposta verificata',
      adds: ['controls'],
    })
  })

  it('limits each guided scenario to its enabled tools', () => {
    const guide = getScenario('notebook-nuovi-assunti')
    const comparison = getScenario('confronto-notebook')
    const followUp = getScenario('followup-cliente')
    const timeout = getScenario('timeout-magazzino')
    const currency = getScenario('prezzo-in-dollari')
    const reflection = getScenario('ragionamento-iterativo')
    const cashFlow = getScenario('report-andamento-cassa')

    expect(configForLevel(6, undefined, guide).enabledTools).not.toContain('crea_richiesta_acquisto')
    expect(configForLevel(8, undefined, guide).enabledTools).toContain('crea_richiesta_acquisto')
    expect(configForLevel(5, undefined, comparison).enabledTools).toEqual([])
    expect(configForLevel(6, undefined, comparison).enabledTools).toEqual(['cerca_catalogo'])
    expect(configForLevel(6, undefined, followUp).enabledTools).toEqual([])
    expect(configForLevel(8, undefined, followUp).enabledTools).toEqual(['crea_attivita'])
    expect(configForLevel(6, undefined, timeout).enabledTools).toEqual(['verifica_disponibilita'])
    expect(configForLevel(7, undefined, timeout).enabledTools).toEqual(['verifica_disponibilita'])
    expect(configForLevel(6, undefined, currency).enabledTools).toEqual(['cerca_catalogo', 'converti_valuta'])
    expect(configForLevel(7, undefined, reflection).enabledTools).toEqual([])
    expect(configForLevel(5, undefined, cashFlow).enabledTools).toEqual(['code_interpreter'])
  })

  it('does not activate memory or RAG when a scenario marks those layers irrelevant', () => {
    const mileage = getScenario('rimborso-chilometrico')
    const comparison = getScenario('confronto-notebook')
    const margin = getScenario('margine-commessa')
    const reflection = getScenario('ragionamento-iterativo')
    const cashFlow = getScenario('report-andamento-cassa')

    expect(configForLevel(3, undefined, mileage).components.memory).toBe(false)
    expect(configForLevel(4, undefined, comparison).components.rag).toBe(false)
    expect(configForLevel(4, undefined, margin).components.rag).toBe(false)
    expect(configForLevel(4, undefined, reflection).components.rag).toBe(false)
    expect(configForLevel(7, undefined, reflection).components.controls).toBe(true)
    expect(configForLevel(7, undefined, reflection).components.tools).toBe(false)
    expect(configForLevel(5, undefined, cashFlow).components).toMatchObject({
      model: true,
      instructions: true,
      context: true,
      memory: false,
      rag: false,
      tools: true,
      orchestrator: true,
      agentLoop: true,
      controls: false,
      approval: false,
      mcp: false,
    })
    expect(cashFlow.context).toMatchObject({
      memoryKeys: [],
      documentIds: [],
      replacesGeneralInstructions: true,
    })
  })

  it('keeps unoverridden guided levels on the shared configuration', () => {
    const scenario = getScenario('notebook-nuovi-assunti')
    expect(levelFor(scenario, 9)).toEqual(levelsFor().find(level => level.id === 9))
    expect(configForLevel(5).enabledTools).toContain('calcolatrice')
  })
})
