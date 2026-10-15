import { describe, expect, it } from 'vitest'
import type { ScenarioData } from '../domain/types'
import { SCENARIO_DATA_EN } from './data.en'
import { getScenario, SCENARIOS, SCENARIO_DATA } from './index'

/** Common Italian function words: none of them may survive in an English model-facing text. */
const ITALIAN_WORDS = /(?:^|[\s(])(?:il|della|degli|delle|che|per la|sono|nella|dalla)\s/i
/** Italian formats the English checkers do not read: "1.250 €", "€ 1.250", "0,42", "16/10/2026". */
const ITALIAN_FORMATS = /\d\s?€|€\s?\d{1,3}\.\d{3}|\d,\d{1,2}\b|\b\d{1,2}\/\d{1,2}\/\d{4}\b/
/** The reflection scenario is translated separately: it is checked once it has its English texts. */
const PENDING = 'ragionamento-iterativo'

type Labelled = [label: string, text: string]

/** Every text the model can read from the demo data, labelled for readable failures. */
function modelFacingTexts(data: ScenarioData): Labelled[] {
  return [
    ['company', data.company],
    ['user.role', data.user.role],
    ['user.site', data.user.site],
    ...data.taskData.flatMap((item): Labelled[] => [[`taskData ${item.id} title`, item.title], [`taskData ${item.id}`, item.text]]),
    ...data.memorySeeds.map((seed): Labelled => [`memory ${seed.key}`, seed.text]),
    ...data.documents.flatMap((doc): Labelled[] => [[`${doc.id} title`, doc.title], [doc.id, doc.text]]),
    ...data.catalog.map((product): Labelled => [`specs ${product.code}`, product.specs]),
    ...Object.entries(data.budgets).map(([cc, budget]): Labelled => [`budget ${cc}`, budget.period]),
    ...Object.entries(data.orders).flatMap(([key, order]): Labelled[] => [
      [`order ${key} status`, order.status],
      [`order ${key} expected`, order.expected],
      [`order ${key} note`, order.note],
    ]),
    ...Object.entries(data.employees).flatMap(([name, employee]): Labelled[] => [
      [`employee ${name} role`, employee.role],
      [`employee ${name} sensitive`, employee.sensitive],
    ]),
    ...Object.entries(data.supplierDelivery).map(([code, date]): Labelled => [`delivery ${code}`, date]),
  ]
}

describe('English scenarios (prompt language en)', () => {
  const translated = SCENARIOS.filter(scenario => scenario.id !== PENDING || scenario.en)

  it('translates every scenario', () => {
    expect(SCENARIOS.filter(scenario => !scenario.en && scenario.id !== PENDING).map(scenario => scenario.id)).toEqual([])
  })

  it.each(translated)('$id has an English request, English task data and English-answer instructions', ({ id }) => {
    const italian = getScenario(id)
    const english = getScenario(id, 'en')
    expect(english.request).not.toBe(italian.request)
    expect(english.request).not.toMatch(/(?:^|\s)(?:il|della|che|per)\s/i)
    expect(english.context.taskData.map(item => item.id)).toEqual(italian.context.taskData.map(item => item.id))
    for (const item of english.context.taskData) {
      expect(`${item.title} ${item.text}`).not.toMatch(ITALIAN_WORDS)
      expect(item.text).not.toMatch(ITALIAN_FORMATS)
    }
    expect(english.context.instructions).not.toMatch(/Italian/)
    // Only the model-facing texts change: memory keys, document ids, UI labels and checkers stay the same.
    expect({ ...english.context, taskData: [], instructions: '' }).toEqual({ ...italian.context, taskData: [], instructions: '' })
    expect(english.title).toBe(italian.title)
    expect(english.checkers).toBe(italian.checkers)
  })

  it('keeps the Italian scenario when the prompt language is Italian', () => {
    for (const scenario of SCENARIOS) expect(getScenario(scenario.id, 'it').request).toBe(scenario.request)
  })
})

describe('English demo data', () => {
  const italian = SCENARIO_DATA
  const english = SCENARIO_DATA_EN

  it('is a standalone translation, not the Italian data', () => {
    expect(english).not.toBe(italian)
    expect(english.documents.some(doc => italian.documents.includes(doc))).toBe(false)
  })

  it('keeps the same ids, codes, keys and numbers', () => {
    const docs = (data: ScenarioData) =>
      data.documents.map(({ id, version, status, category, validFrom }) => ({ id, version, status, category, validFrom }))
    const seeds = (data: ScenarioData) => data.memorySeeds.map(({ scope, kind, key, source }) => ({ scope, kind, key, source }))
    const products = (data: ScenarioData) => data.catalog.map(({ code, name, category, priceEur }) => ({ code, name, category, priceEur }))
    const budgets = (data: ScenarioData) => Object.entries(data.budgets).map(([cc, { residualEur, owner }]) => ({ cc, residualEur, owner }))
    const sites = (data: ScenarioData) => Object.entries(data.employees).map(([name, { site }]) => ({ name, site }))
    expect(docs(english)).toEqual(docs(italian))
    expect({ ...english.user, role: '' }).toEqual({ ...italian.user, role: '' })
    expect(english.taskData.map(item => item.id)).toEqual(italian.taskData.map(item => item.id))
    expect(seeds(english)).toEqual(seeds(italian))
    expect(products(english)).toEqual(products(italian))
    expect(english.stock).toEqual(italian.stock)
    expect(budgets(english)).toEqual(budgets(italian))
    expect(Object.keys(english.orders)).toEqual(Object.keys(italian.orders))
    expect(sites(english)).toEqual(sites(italian))
    expect(english.fx).toEqual(italian.fx)
    expect(Object.keys(english.supplierDelivery)).toEqual(Object.keys(italian.supplierDelivery))
  })

  it('keeps the sections and the fictional-document notice of every document', () => {
    const headings = (text: string) => text.match(/^## /gm)?.length ?? 0
    for (const doc of english.documents) {
      const original = italian.documents.find(item => item.id === doc.id)
      expect(headings(doc.text), doc.id).toBe(headings(original?.text ?? ''))
      expect(doc.text.startsWith('*Fictional document'), doc.id).toBe(true)
    }
  })

  it('writes dates and amounts in the English formats', () => {
    const doc = (id: string) => english.documents.find(item => item.id === id)?.text ?? ''
    expect(english.orders['ORD-2026-1187']?.expected).toBe('16 October 2026')
    expect(english.supplierDelivery['NB-V14P']).toBe('28 October 2026')
    expect(english.taskData[0]?.text).toContain('3 November 2026')
    expect(doc('POL-IT-04')).toContain('€1,250')
    expect(doc('POL-FIN-07')).toContain('€0.42')
    expect(doc('POL-HR-02')).toContain('2 days a week')
  })

  it('has no Italian function words or Italian number and date formats in any model-facing text', () => {
    const texts = modelFacingTexts(english)
    expect(texts.filter(([, text]) => ITALIAN_WORDS.test(text)).map(([label]) => label)).toEqual([])
    expect(texts.filter(([, text]) => ITALIAN_FORMATS.test(text)).map(([label]) => label)).toEqual([])
  })

  it('detects the Italian data as Italian (sanity check of the patterns)', () => {
    const texts = modelFacingTexts(italian)
    expect(texts.some(([, text]) => ITALIAN_WORDS.test(text))).toBe(true)
    expect(texts.some(([, text]) => ITALIAN_FORMATS.test(text))).toBe(true)
  })
})
