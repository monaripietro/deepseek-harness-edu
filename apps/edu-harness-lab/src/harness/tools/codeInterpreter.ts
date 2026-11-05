import type { ToolDefinition, ToolExecContext, ToolOutcome } from '../../domain/types'
import { SIMULATED_LOCAL } from '../../domain/types'
import { CASH_FLOW_REPORT_DATA } from '../../scenarios/context/report-andamento-cassa'
import { t } from './lang'

interface CashFlowRow {
  month: string
  inflows: number
  suppliers: number
  payroll: number
  fixedCosts: number
  totalOutflows: number
  netCashFlow: number
  closingBalance: number
}

const REPORT_FILE = 'report_andamento_cassa_S1_2026.xlsx'

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function money(value: number, lang: ToolExecContext['lang']): string {
  return new Intl.NumberFormat(lang === 'en' ? 'en-GB' : 'it-IT', {
    style: 'currency',
    currency: 'EUR',
    useGrouping: 'always',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

function monthlyRows(lang: ToolExecContext['lang']): CashFlowRow[] {
  let balance = CASH_FLOW_REPORT_DATA.openingBalance
  return CASH_FLOW_REPORT_DATA.months.map((month) => {
    const totalOutflows = round2(month.suppliers + month.payroll + month.fixedCosts)
    const netCashFlow = round2(month.inflows - totalOutflows)
    balance = round2(balance + netCashFlow)
    return {
      month: lang === 'en' ? month.monthEn : month.monthIt,
      inflows: month.inflows,
      suppliers: month.suppliers,
      payroll: month.payroll,
      fixedCosts: month.fixedCosts,
      totalOutflows,
      netCashFlow,
      closingBalance: balance,
    }
  })
}

function scriptPreview(lang: ToolExecContext['lang']): string {
  const rows = CASH_FLOW_REPORT_DATA.months.map((month) => {
    const name = lang === 'en' ? month.monthEn : month.monthIt
    return `    (${JSON.stringify(name)}, ${month.inflows}, ${month.suppliers}, ${month.payroll}, ${month.fixedCosts}),`
  })
  return [
    `opening_balance = ${CASH_FLOW_REPORT_DATA.openingBalance}`,
    'months = [',
    ...rows,
    ']',
    'balance = opening_balance',
    'for month, inflows, suppliers, payroll, fixed_costs in months:',
    '    outflows = suppliers + payroll + fixed_costs',
    '    net = inflows - outflows',
    '    balance = balance + net',
  ].join('\n')
}

function monthlySheet(rows: CashFlowRow[], lang: ToolExecContext['lang']): string {
  const headings = lang === 'en'
    ? ['Month', 'Inflows', 'Suppliers', 'Payroll', 'Fixed costs', 'Outflows', 'Net flow', 'Closing cash']
    : ['Mese', 'Incassi', 'Fornitori', 'Personale', 'Spese fisse', 'Uscite', 'Flusso netto', 'Saldo finale']
  return [
    `| ${headings.join(' | ')} |`,
    `| ${headings.map(() => '---:').join(' | ')} |`,
    ...rows.map(row => `| ${[
      row.month,
      money(row.inflows, lang),
      money(row.suppliers, lang),
      money(row.payroll, lang),
      money(row.fixedCosts, lang),
      money(row.totalOutflows, lang),
      money(row.netCashFlow, lang),
      money(row.closingBalance, lang),
    ].join(' | ')} |`),
  ].join('\n')
}

function expenseSheet(
  totals: { suppliers: number; payroll: number; fixedCosts: number },
  lang: ToolExecContext['lang'],
): string {
  const categories = lang === 'en'
    ? [['Suppliers', totals.suppliers], ['Payroll', totals.payroll], ['Fixed costs', totals.fixedCosts]] as const
    : [['Fornitori', totals.suppliers], ['Personale', totals.payroll], ['Spese fisse', totals.fixedCosts]] as const
  const header = lang === 'en' ? '| Expense category | Total |' : '| Categoria di spesa | Totale |'
  return [header, '| --- | ---: |', ...categories.map(([category, amount]) => `| ${category} | ${money(amount, lang)} |`)].join('\n')
}

/**
 * Runs the preloaded cash-flow report routine without accepting or evaluating model-written code.
 *
 * @param args - Must be empty; the routine reads its fixed task dataset.
 * @param ctx - Tool execution context used to localize the report.
 * @returns Calculated monthly sheets and a non-downloadable workbook preview, or an argument error.
 */
export async function executeCodeInterpreter(
  args: Record<string, unknown>,
  ctx: ToolExecContext,
): Promise<ToolOutcome> {
  if (Object.keys(args).length > 0) {
    return {
      ok: false,
      code: 'INVALID_ARGS',
      message: t(
        ctx.lang,
        'Questo interprete usa i dati del compito: richiamalo senza argomenti né codice.',
        'This interpreter uses the task data: call it without arguments or code.',
      ),
    }
  }

  const rows = monthlyRows(ctx.lang)
  const categoryTotals = {
    suppliers: round2(CASH_FLOW_REPORT_DATA.months.reduce((total, month) => total + month.suppliers, 0)),
    payroll: round2(CASH_FLOW_REPORT_DATA.months.reduce((total, month) => total + month.payroll, 0)),
    fixedCosts: round2(CASH_FLOW_REPORT_DATA.months.reduce((total, month) => total + month.fixedCosts, 0)),
  }
  const totalInflows = round2(CASH_FLOW_REPORT_DATA.months.reduce((total, month) => total + month.inflows, 0))
  const totalOutflows = round2(categoryTotals.suppliers + categoryTotals.payroll + categoryTotals.fixedCosts)
  const netChange = round2(totalInflows - totalOutflows)
  const endingBalance = rows.at(-1)?.closingBalance ?? CASH_FLOW_REPORT_DATA.openingBalance
  const lowestBalanceMonth = rows.reduce((lowest, row) => row.closingBalance < lowest.closingBalance ? row : lowest)
  const lowestNetMonth = rows.reduce((lowest, row) => row.netCashFlow < lowest.netCashFlow ? row : lowest)
  const expenseRows: [keyof typeof categoryTotals, number][] = [
    ['suppliers', categoryTotals.suppliers],
    ['payroll', categoryTotals.payroll],
    ['fixedCosts', categoryTotals.fixedCosts],
  ]
  const largestExpense = expenseRows.reduce((largest, current) => current[1] > largest[1] ? current : largest)
  const categoryNames: Record<keyof typeof categoryTotals, string> = ctx.lang === 'en'
    ? { suppliers: 'suppliers', payroll: 'payroll', fixedCosts: 'fixed costs' }
    : { suppliers: 'fornitori', payroll: 'personale', fixedCosts: 'spese fisse' }
  const metrics = ctx.lang === 'en'
    ? [
      `Opening cash: ${money(CASH_FLOW_REPORT_DATA.openingBalance, ctx.lang)}; total inflows: ${money(totalInflows, ctx.lang)}; total outflows: ${money(totalOutflows, ctx.lang)}.`,
      `Net change: ${money(netChange, ctx.lang)}; closing cash: ${money(endingBalance, ctx.lang)}.`,
      `Lowest closing balance: ${lowestBalanceMonth.month} (${money(lowestBalanceMonth.closingBalance, ctx.lang)}); largest expense category: ${categoryNames[largestExpense[0]]} (${money(largestExpense[1], ctx.lang)}).`,
      `Lowest monthly net flow: ${lowestNetMonth.month} (${money(lowestNetMonth.netCashFlow, ctx.lang)}).`,
    ]
    : [
      `Saldo iniziale: ${money(CASH_FLOW_REPORT_DATA.openingBalance, ctx.lang)}; incassi totali: ${money(totalInflows, ctx.lang)}; uscite totali: ${money(totalOutflows, ctx.lang)}.`,
      `Variazione netta: ${money(netChange, ctx.lang)}; saldo finale: ${money(endingBalance, ctx.lang)}.`,
      `Saldo finale più basso: ${lowestBalanceMonth.month} (${money(lowestBalanceMonth.closingBalance, ctx.lang)}); categoria di spesa maggiore: ${categoryNames[largestExpense[0]]} (${money(largestExpense[1], ctx.lang)}).`,
      `Flusso netto mensile più basso: ${lowestNetMonth.month} (${money(lowestNetMonth.netCashFlow, ctx.lang)}).`,
    ]
  const workbook = ctx.lang === 'en'
    ? `Simulated workbook preview: ${REPORT_FILE}. No downloadable file was created.`
    : `Anteprima workbook simulata: ${REPORT_FILE}. Non è stato creato un file scaricabile.`
  const codeLabel = ctx.lang === 'en' ? 'Fixed Python-like script preview' : 'Anteprima dello script Python-like fisso'
  const monthlyLabel = ctx.lang === 'en' ? 'Sheet 1 — Monthly cash flow' : 'Foglio 1 — Andamento mensile'
  const expenseLabel = ctx.lang === 'en' ? 'Sheet 2 — Expense categories' : 'Foglio 2 — Uscite per categoria'
  const summary = [
    workbook,
    ...metrics,
    '',
    `${codeLabel} (the model does not write or execute code):`,
    scriptPreview(ctx.lang),
    '',
    monthlyLabel,
    monthlySheet(rows, ctx.lang),
    '',
    expenseLabel,
    expenseSheet(categoryTotals, ctx.lang),
  ].join('\n')

  return {
    ok: true,
    data: {
      fileName: REPORT_FILE,
      simulated: true,
      downloadable: false,
      openingBalance: CASH_FLOW_REPORT_DATA.openingBalance,
      totalInflows,
      totalOutflows,
      netChange,
      endingBalance,
      lowestBalanceMonth: lowestBalanceMonth.month,
      lowestNetMonth: lowestNetMonth.month,
      largestExpenseCategory: categoryNames[largestExpense[0]],
      categoryTotals,
      monthlyRows: rows,
    },
    summary,
  }
}

/** A safe, scenario-specific stand-in for a code interpreter that previews a cash-flow workbook. */
export const codeInterpreterTool: ToolDefinition = {
  id: 'code_interpreter',
  source: 'builtin',
  title: 'Code Interpreter (simulato)',
  description:
    'Runs the preloaded cash-flow report script against the task data. Call with an empty argument object; do not write or pass code. ' +
    'The simulator returns monthly and expense-category Excel-style sheets. It does not execute model-written code or create a downloadable file.',
  purpose: 'Esegue uno script fisso sui dati del compito e mostra due fogli Excel simulati, senza eseguire codice arbitrario.',
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
    additionalProperties: false,
  },
  output: 'Computed monthly cash-flow and category totals, plus two non-downloadable Excel-style sheet previews.',
  permissions: [],
  risk: 'read',
  approval: 'never',
  provenance: { ...SIMULATED_LOCAL, note: 'script fisso; non esegue codice arbitrario né crea file scaricabili' },
  errors: [
    { code: 'INVALID_ARGS', message: 'Questo interprete usa i dati del compito e non accetta codice o parametri.' },
    { code: 'TOOL_ERROR', message: 'Errore durante il calcolo del report.' },
  ],
  latencyMs: [150, 300],
  execute: executeCodeInterpreter,
}
