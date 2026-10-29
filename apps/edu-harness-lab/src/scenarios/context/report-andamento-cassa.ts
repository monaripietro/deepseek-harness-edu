import type { ScenarioContext, ScenarioData } from '../../domain/types'

export interface CashFlowReportMonth {
  monthIt: string
  monthEn: string
  inflows: number
  suppliers: number
  payroll: number
  fixedCosts: number
}

export const CASH_FLOW_REPORT_DATA: { openingBalance: number; months: CashFlowReportMonth[] } = {
  openingBalance: 18_000,
  months: [
    { monthIt: 'Gennaio', monthEn: 'January', inflows: 68_000, suppliers: 34_000, payroll: 22_000, fixedCosts: 10_000 },
    { monthIt: 'Febbraio', monthEn: 'February', inflows: 52_000, suppliers: 30_000, payroll: 22_000, fixedCosts: 10_000 },
    { monthIt: 'Marzo', monthEn: 'March', inflows: 74_000, suppliers: 36_000, payroll: 22_000, fixedCosts: 13_000 },
    { monthIt: 'Aprile', monthEn: 'April', inflows: 63_000, suppliers: 37_000, payroll: 22_000, fixedCosts: 10_000 },
    { monthIt: 'Maggio', monthEn: 'May', inflows: 77_000, suppliers: 39_000, payroll: 23_000, fixedCosts: 10_000 },
    { monthIt: 'Giugno', monthEn: 'June', inflows: 58_000, suppliers: 34_000, payroll: 23_000, fixedCosts: 10_000 },
  ],
}

function euro(value: number, lang: 'it' | 'en'): string {
  return new Intl.NumberFormat(lang === 'en' ? 'en-GB' : 'it-IT', {
    style: 'currency',
    currency: 'EUR',
    useGrouping: true,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

export const CASH_FLOW_REPORT_TASK_DATA: ScenarioData['taskData'][number] = {
  id: 'cash-flow-h1-2026',
  title: 'Dati di cassa del primo semestre 2026',
  text: [
    'Officina Lume.',
    `Saldo iniziale al 1 gennaio 2026: ${euro(CASH_FLOW_REPORT_DATA.openingBalance, 'it')}.`,
    'Per ogni mese i valori sono incassi, pagamenti ai fornitori, costo del personale e spese fisse.',
    ...CASH_FLOW_REPORT_DATA.months.map(month =>
      `${month.monthIt}: ${euro(month.inflows, 'it')}, ${euro(month.suppliers, 'it')}, ${euro(month.payroll, 'it')}, ${euro(month.fixedCosts, 'it')}.`,
    ),
  ].join(' '),
}

export const CASH_FLOW_REPORT_TASK_DATA_EN: ScenarioData['taskData'][number] = {
  id: CASH_FLOW_REPORT_TASK_DATA.id,
  title: 'First-half 2026 cash-flow data',
  text: [
    'Officina Lume.',
    `Opening balance on 1 January 2026: ${euro(CASH_FLOW_REPORT_DATA.openingBalance, 'en')}.`,
    'For each month, values are inflows, supplier payments, payroll and fixed costs.',
    ...CASH_FLOW_REPORT_DATA.months.map(month =>
      `${month.monthEn}: ${euro(month.inflows, 'en')}, ${euro(month.suppliers, 'en')}, ${euro(month.payroll, 'en')}, ${euro(month.fixedCosts, 'en')}.`,
    ),
  ].join(' '),
}

/** Model-facing data and instructions for a limited chat-style cash-flow report. */
export const context: ScenarioContext = {
  taskData: [CASH_FLOW_REPORT_TASK_DATA],
  memoryKeys: [],
  documentIds: [],
  replacesGeneralInstructions: true,
  instructions:
    'Answer in Italian. Use only the user message and task data. Do not use memory, company documents, policies, web search or forecasts. ' +
    'Call the `code_interpreter` tool exactly once with an empty argument object. Do not write or pass code; the tool runs its fixed cash-flow script against the supplied task data. ' +
    'Use the result to report the overall cash change, ending balance, month with the lowest closing balance and largest expense category. ' +
    'The tool returns two simulated workbook previews, not a downloadable file. State that they are simulated and not attached. Do not infer reasons for the changes.',
}
