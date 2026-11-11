import type { ComponentId, Scenario, ToolDefinition } from './domain/types'
import type { LevelDef } from './harness/levels'
import { COMPONENTS } from './harness/levels'
import { uiLang } from './i18n'

/**
 * Interface texts of the CONTENT (levels, scenarios, components, tools) in the interface language.
 * The Italian lives in the content definitions; the English lives in the maps below, by id.
 * A missing English entry falls back to Italian. Components that call these helpers must subscribe
 * to the language (call `useT()` or `useUiLang(s => s.lang)`) so they re-render on a switch.
 */

export interface LevelCopy {
  title: string
  action: string
  phenomenon: string
  term: string
  message: string
}
export interface ScenarioCopy {
  title: string
  shortTitle: string
  lesson: string
}
export interface ComponentCopy {
  label: string
  short: string
}
export interface ToolCopy {
  title: string
  purpose: string
  output: string
}

/** English copy of the guided levels, by level id (0-based). */
export const LEVEL_EN: Partial<Record<number, Partial<LevelCopy>>> = {
  0: {
    title: 'The model, on its own',
    action: 'Ask the model your question as it is.',
    phenomenon: 'It answers with confidence, but it does not know your company: no policies, no real prices, no possible actions.',
    term: 'Isolated LLM',
    message: 'This is the model. Everything else still has to be built.',
  },
  1: {
    title: 'System instructions',
    action: 'Add role, rules and answer format.',
    phenomenon: 'The instructions define the task, the limits and the answer format.',
    term: 'System prompt',
    message: 'The instructions guide the model without adding company data or tools.',
  },
  2: {
    title: 'Context',
    action: 'Put the task data in front of the model.',
    phenomenon: 'The model receives the facts selected for this request; it does not infer them from data unrelated to the task.',
    term: 'Context window',
    message: 'The model can only use what the system makes available to it.',
  },
  3: {
    title: 'Memory',
    action: 'Add the relevant saved facts to the request.',
    phenomenon: 'Memory can provide relevant facts; the model does not keep them on its own.',
    term: 'Memory (session and persistent)',
    message: 'The system selects the saved facts to include; if none is relevant, it adds no memory.',
  },
  4: {
    title: 'Company knowledge (RAG)',
    action: 'Search the documents for information relevant to the request.',
    phenomenon: 'The retrieved passages add evidence to the context; they do not perform actions.',
    term: 'Retrieval-Augmented Generation',
    message: 'RAG retrieves information. It does not automatically perform an action in the outside world.',
  },
  5: {
    title: 'Loop with tools',
    action: 'Enable the relevant tools and the orchestrator that manages the calls.',
    phenomenon: 'The model can request an enabled tool; the orchestrator runs it and returns the result to the model.',
    term: 'Tool calling and agent loop',
    message: 'The model can only request the tools enabled for the task.',
  },
  6: {
    title: 'Relevant tools',
    action: 'Enable only the tools useful for this scenario.',
    phenomenon: 'The model can choose among the tools configured for the task, not among all those registered.',
    term: 'Tool registry',
    message: 'The registry exposes to the model only the tools enabled for the task.',
  },
  7: {
    title: 'Controls',
    action: 'Limit the attempts and stop loops that make no progress.',
    phenomenon: 'The controls apply limits to the loop and to the actions enabled in this scenario.',
    term: 'Guardrail',
    message: 'The controls govern the attempts and the possible effects of the loop.',
  },
  8: {
    title: 'Human approval',
    action: 'Require approval before performing an action with effects.',
    phenomenon: 'The agent shows the proposed action and waits for a person\'s decision.',
    term: 'Human in the loop',
    message: 'Actions with real effects pass through a person.',
  },
  9: {
    title: 'External tools via MCP',
    action: 'Connect the supplier\'s MCP server.',
    phenomenon: 'The system discovers the tools of the configured MCP server and makes them available to the model.',
    term: 'Model Context Protocol',
    message: 'MCP connects external tools through a shared protocol.',
  },
}
/** English copy of scenario-specific level overrides, by `${scenarioId}:${levelId}`. */
export const LEVEL_OVERRIDE_EN: Partial<Record<string, Partial<LevelCopy>>> = {
  'notebook-nuovi-assunti:6': {
    title: 'Information tools',
    action: 'Add the catalog, warehouse, policy and budget; postpone the purchase request.',
    phenomenon: 'The model checks prices, availability and spending limits; it does not yet create a request.',
  },
  'rimborso-chilometrico:2': {
    phenomenon: 'The request is about a trip with your own car; the rate comes from the company policy.',
  },
  'rimborso-chilometrico:3': {
    action: 'Check whether a saved fact is relevant to the question.',
    phenomenon: 'No personal preference changes the reimbursement: the company policy counts.',
  },
  'rimborso-chilometrico:4': {
    phenomenon: 'Policy POL-FIN-07 gives the rate per kilometer and the source to cite.',
  },
  'lavoro-agile:2': {
    phenomenon: 'The context gives the question about remote-work days; the limit comes from the HR policy.',
  },
  'lavoro-agile:3': {
    action: 'Check whether a saved fact is relevant to the question.',
    phenomenon: 'No format preference changes the number of days allowed.',
  },
  'lavoro-agile:4': {
    phenomenon: 'HR policy POL-HR-02 gives the weekly limit and the source to cite.',
  },
  'margine-commessa:2': {
    phenomenon: 'The context contains the revenue and costs given in the request.',
  },
  'margine-commessa:3': {
    action: 'Check whether a saved fact is relevant to the calculation.',
    phenomenon: 'The margin depends only on the revenue and costs of the task.',
  },
  'margine-commessa:4': {
    phenomenon: 'This calculation does not require retrieving company documents.',
  },
  'margine-commessa:5': {
    title: 'Calculating the margin',
    action: 'Ask the calculator for the percentage margin on revenue.',
    phenomenon: 'The calculator returns the exact margin of 24%.',
  },
  'confronto-notebook:2': {
    phenomenon: 'The context identifies the two notebooks to compare for a field salesperson.',
  },
  'confronto-notebook:3': {
    action: 'Check whether a saved fact is relevant to the choice.',
    phenomenon: 'The request contains no personal preference to retrieve.',
  },
  'confronto-notebook:4': {
    phenomenon: 'The comparison will use the specifications and prices returned by the catalog, not a RAG policy.',
  },
  'confronto-notebook:5': {
    title: 'Search loop',
    action: 'Prepare the loop that can query the catalog at the next level.',
    phenomenon: 'The model does not yet have a catalog tool available.',
  },
  'confronto-notebook:6': {
    title: 'Comparison from the catalog',
    action: 'Retrieve the prices and specifications of the two notebooks from the catalog.',
    phenomenon: 'The comparison uses real catalog data and does not invent specifications.',
  },
  'ordine-in-ritardo:2': {
    phenomenon: 'The context identifies the customer and the order ORD-2026-1187 to check.',
  },
  'ordine-in-ritardo:5': {
    title: 'Work loop',
    action: 'Prepare the loop that will use the order and follow-up tools.',
    phenomenon: 'The model does not yet have active tools for this task.',
  },
  'ordine-in-ritardo:6': {
    title: 'Order check',
    action: 'Read the order status and retrieve the relevant policy.',
    phenomenon: 'The system checks the order and the policy before preparing the follow-up.',
  },
  'ordine-in-ritardo:7': {
    title: 'Loop controls',
    action: 'Limit the search attempts and stop repetitions without progress.',
    phenomenon: 'The loop looks for the status and the policy within defined limits.',
  },
  'ordine-in-ritardo:8': {
    title: 'Supervised follow-up',
    action: 'Prepare the task and ask for approval before creating it.',
    phenomenon: 'The draft uses the verified order data; creation waits for a person.',
  },
  'followup-cliente:2': {
    phenomenon: 'The context contains the customer, the order and the callback deadline.',
  },
  'followup-cliente:4': {
    phenomenon: 'The request already contains the follow-up details; no document search is needed.',
  },
  'followup-cliente:5': {
    title: 'Work loop',
    action: 'Prepare the loop without yet exposing an action with effects.',
    phenomenon: 'The model cannot create the task with the tools currently enabled.',
  },
  'followup-cliente:6': {
    title: 'Action not yet available',
    action: 'Keep task creation disabled until supervision is active.',
    phenomenon: 'At this level it is not possible to create a task or to declare one created.',
  },
  'followup-cliente:7': {
    title: 'Loop within limits',
    action: 'Limit the attempts before enabling the supervised action.',
    phenomenon: 'The controls govern the loop; the task is not yet created.',
  },
  'followup-cliente:8': {
    title: 'Supervised task',
    action: 'Enable task creation and request approval.',
    phenomenon: 'The task is created only after a person approves it.',
  },
  'timeout-magazzino:2': {
    phenomenon: 'The context specifies the Vega 14 Pro model, the code NB-V14P and the quantity requested.',
  },
  'timeout-magazzino:4': {
    phenomenon: 'The documents do not show current availability: the warehouse must be queried.',
  },
  'timeout-magazzino:5': {
    title: 'Verification loop',
    action: 'Prepare the loop that will query the warehouse.',
    phenomenon: 'Without the warehouse tool the model cannot verify the available quantity.',
  },
  'timeout-magazzino:6': {
    title: 'Warehouse check',
    action: 'Query the warehouse availability tool.',
    phenomenon: 'The availability request times out because of the simulated timeout.',
  },
  'timeout-magazzino:7': {
    title: 'Retry within limits',
    action: 'Allow one retry and then stop the loop.',
    phenomenon: 'After the second timeout the system states that the quantity cannot be verified.',
  },
  'sala-senza-data:1': {
    phenomenon: 'Instead of inventing availability or times, the model asks for the missing details needed to book the room.',
  },
  'prezzo-in-dollari:2': {
    phenomenon: 'The context identifies the product and the request to compare the dollar price with the euro price.',
  },
  'prezzo-in-dollari:3': {
    action: 'Check whether a saved fact is relevant to the price comparison.',
    phenomenon: 'The conversion uses the declared teaching rate, not a saved preference.',
  },
  'prezzo-in-dollari:4': {
    phenomenon: 'The price needs the catalog and the conversion needs the declared rate; no RAG search is needed.',
  },
  'prezzo-in-dollari:5': {
    title: 'Search loop',
    action: 'Prepare the loop that will query the catalog and the currency converter.',
    phenomenon: 'No price or exchange tool is yet available to the model.',
  },
  'prezzo-in-dollari:6': {
    title: 'Price and conversion',
    action: 'Retrieve the price from the catalog and convert it at the declared rate.',
    phenomenon: 'The comparison uses the real price and the conversion provided by the tool.',
  },
  'report-andamento-cassa:2': {
    phenomenon: 'Officina Lume’s opening balance and its movements from January to June are given in the task data.',
  },
  'report-andamento-cassa:3': {
    title: 'No memory',
    action: 'Do not add saved preferences or facts to the request.',
    phenomenon: 'The answer uses only the message and the task data.',
  },
  'report-andamento-cassa:4': {
    title: 'No RAG search',
    action: 'Do not search company documents or external sources.',
    phenomenon: 'For this report the model uses only the task data.',
  },
  'report-andamento-cassa:5': {
    title: 'Simulated code interpreter',
    action: 'Run the default cash script on the task data.',
    phenomenon: 'Two sheets summarize six months of cash flows and expenses by category; the workbook cannot be downloaded.',
    term: 'Code Interpreter',
    message: 'The model must not write code: the simulator runs a fixed routine, without evaluating arbitrary code.',
  },
  'ragionamento-iterativo:2': {
    phenomenon: 'The model receives the four names and the three rules to check.',
  },
  'ragionamento-iterativo:3': {
    action: 'Use only the facts in the request and in the loop messages.',
    phenomenon: 'There is no need to retrieve memory from other tasks to solve the order.',
  },
  'ragionamento-iterativo:4': {
    phenomenon: 'The puzzle does not require company documents or RAG.',
  },
  'ragionamento-iterativo:5': {
    title: 'Review loop',
    action: 'Have an order proposed and pass the check feedback back to the model.',
    phenomenon: 'The model reviews its own candidate in the following turns, without tools.',
  },
  'ragionamento-iterativo:6': {
    title: 'Candidate check',
    action: 'Check the proposed order against the three rules.',
    phenomenon: 'The system states which rules are broken; the model receives concrete feedback to correct itself.',
  },
  'ragionamento-iterativo:7': {
    title: 'Verified answer',
    action: 'Accept the final answer only after checking the complete order.',
    phenomenon: 'Drafts stay separate from the final answer, and an invalid order is not published.',
  },
}
/** English copy of the scenarios' interface texts, by scenario id. */
export const SCENARIO_EN: Partial<Record<string, Partial<ScenarioCopy>>> = {
  'notebook-nuovi-assunti': {
    title: 'Notebooks for four new hires',
    shortTitle: 'New hires',
    lesson: 'The same model, the same question: only the harness around it changes, and the answer goes from invented to verified and supervised.',
  },
  'rimborso-chilometrico': {
    title: 'Mileage reimbursement',
    shortTitle: 'Mileage',
    lesson: 'Without information, an isolated model guesses with confidence: the instructions make it cautious, the documents make it precise.',
  },
  'lavoro-agile': {
    title: 'Remote-work days',
    shortTitle: 'Remote work',
    lesson: 'Company knowledge comes from the retrieved documents (RAG), not from the model: the answer cites its source.',
  },
  'margine-commessa': {
    title: 'Margin on a project',
    shortTitle: 'Margin',
    lesson: 'Calculations are not done “in your head”: the model asks the calculator and reports the exact result.',
  },
  'confronto-notebook': {
    title: 'Comparing two notebooks',
    shortTitle: 'Comparison',
    lesson: 'With the catalog as a tool, the comparison uses real prices and specifications, instead of plausible but invented numbers.',
  },
  'ordine-in-ritardo': {
    title: 'Late customer order',
    shortTitle: 'Late order',
    lesson: 'The system reads the order, prepares the draft with real dates and proposes an action: the work passes through a person’s approval.',
  },
  'followup-cliente': {
    title: 'Customer follow-up by Friday',
    shortTitle: 'Follow-up',
    lesson: 'Creating a task has effects: without tools the model cannot do it (and must not say it has), with tools approval is required.',
  },
  'timeout-magazzino': {
    title: 'Warehouse that does not respond',
    shortTitle: 'Timeout',
    lesson: 'When a tool fails, a good system retries once and then honestly says it does not know, without inventing.',
  },
  'sala-senza-data': {
    title: 'Booking a room without a date',
    shortTitle: 'Meeting room',
    lesson: 'With insufficient information, the right answer is a question, not an invented booking.',
  },
  'prezzo-in-dollari': {
    title: 'Price in dollars',
    shortTitle: 'Dollars',
    lesson: 'When several tools are available, the model chooses which to use: the catalog for our price, the converter for the dollar price.',
  },
  'report-andamento-cassa': {
    title: 'Officina Lume: cash under pressure',
    shortTitle: 'Cash under pressure',
    lesson:
      'Inspired by a basic chat, this case shows the drop in cash and the main outflow without RAG or forecasts; the code interpreter is simulated.',
  },
  'ragionamento-iterativo': {
    title: 'Reasoning with the agent loop',
    shortTitle: 'Iterative reasoning',
    lesson:
      'The system prompt guides the model to review and correct the same proposal over several calls, without tools: this is simulated reasoning, not native thinking.',
  },
}
/** English copy of the harness components, by component id. */
export const COMPONENT_EN: Partial<Record<ComponentId, Partial<ComponentCopy>>> = {
  model: { label: 'Language model', short: 'Receives text and produces text. Its weights never change.' },
  instructions: { label: 'System instructions', short: 'Role, goal, tone, rules, format and limits of the answer.' },
  context: { label: 'Task context', short: 'The data relevant to the task, chosen by the system and placed in front of the model.' },
  memory: { label: 'Memory', short: 'Facts and preferences saved by the system and put back into the context when needed.' },
  rag: { label: 'Knowledge (RAG)', short: 'Searches company documents for the relevant passages and adds them to the context.' },
  tools: { label: 'Tools', short: 'Functions the system runs when the model asks for them: calculations, searches, actions.' },
  orchestrator: { label: 'Orchestrator', short: 'Interprets the model\'s request, runs the tool and returns the result to it.' },
  agentLoop: { label: 'Agent loop', short: 'Repeats the cycle model → tool → observation until the goal is reached.' },
  controls: { label: 'Controls', short: 'Limits on steps and time, permissions, loop detection, blocking of unsupervised actions.' },
  approval: { label: 'Human approval', short: 'Actions with effects pass through a person who approves or rejects them.' },
  mcp: { label: 'MCP servers', short: 'Connects external tools with a standard protocol: change the cable, not the brain.' },
}
/** English copy of the tools' people-facing texts, by tool id. */
export const TOOL_EN: Partial<Record<string, Partial<ToolCopy>>> = {
  code_interpreter: {
    title: 'Code Interpreter (simulated)',
    purpose: 'Runs a fixed script on the task data and shows two simulated Excel sheets, without running arbitrary code.',
    output: 'Computed monthly cash-flow and category totals, plus two non-downloadable Excel-style sheet previews.',
  },
  pianifica: {
    title: 'Work plan',
    purpose: 'Creates or updates the plan: use it at the start of tasks with several steps, and again if a step fails or the information changes.',
    output: 'The recorded plan (or the updated one, with its version number): it stays in the context, and only the latest version is kept.',
  },
  calcolatrice: {
    title: 'Calculator',
    purpose: 'Performs exact calculations with a safe parser (no code is run), so the numbers are not “invented” by the model.',
    output: 'The numerical result (2 decimals) and the calculated expression.',
  },
  converti_valuta: {
    title: 'Currency converter',
    purpose: 'Shows a calculation tool that uses a preset, dated table of exchange rates.',
    output: 'Converted amount (2 decimals), the rate used and the date of the rate table.',
  },
  cerca_policy: {
    title: 'Search company policies',
    purpose: 'Uses the same local search engine as the RAG: shows how a tool can retrieve knowledge.',
    output: 'List of passages with the document identifier, title, version and text.',
  },
  cerca_catalogo: {
    title: 'Search the product catalog',
    purpose: 'Queries a fictitious catalog: the prices used in the answers must come from here.',
    output: 'List of products with code, name, category, price excluding VAT and specifications.',
  },
  verifica_disponibilita: {
    title: 'Check warehouse availability',
    purpose: 'Queries a fictitious warehouse; it can be made slow or faulty from the fault panel.',
    output: 'Code, requested and available quantity, whether it is sufficient, and working days for delivery.',
  },
  leggi_budget: {
    title: 'Read cost center budget',
    purpose: 'Shows an authorization check: the tool refuses the cost centers of other departments.',
    output: 'Remaining budget in euros excluding VAT, period and budget owner.',
  },
  leggi_ordine_cliente: {
    title: 'Read customer order',
    purpose: 'Queries a fictitious order management system.',
    output: 'Customer, status, expected delivery date and notes of the order.',
  },
  leggi_scheda_dipendente: {
    title: 'Read employee record (sensitive data)',
    purpose: 'Shows how sensitive data requires dedicated permissions and human supervision.',
    output: 'Role and office of the employee, if the user’s role is authorized.',
  },
  registra_evento: {
    title: 'Record event in the company log',
    purpose: 'Example of a low-risk write: it appears in the log of the simulated company systems.',
    output: 'Simulated event identifier (EVT-SIM-…).',
  },
  crea_attivita: {
    title: 'Create task',
    purpose: 'Example of a write with effects on the simulated company systems.',
    output: 'Simulated task identifier (ATT-SIM-…).',
  },
  crea_richiesta_acquisto: {
    title: 'Create purchase request',
    purpose: 'Example of the final action of the guided task: it produces a simulated purchase request (ID with “SIM”).',
    output: 'Simulated purchase request identifier (RDA-SIM-…) with net amount, VAT and total.',
  },
  richiedi_approvazione: {
    title: 'Request company approval',
    purpose: 'Distinguishes company approval (a simulated action) from the harness’s human supervision gate.',
    output: 'Simulated identifier of the approval workflow (APP-SIM-…).',
  },
  invia_messaggio: {
    title: 'Send message',
    purpose: 'Example of an irreversible action: in this app no message is really sent.',
    output: 'Simulated message identifier (MSG-SIM-…).',
  },
  modifica_dato: {
    title: 'Change company data',
    purpose: 'The tool is in the registry but NOT authorized for the demo user’s role: it shows how permissions block an action.',
    output: 'Result of the change (always refused for this role).',
  },
  'mcp__techsupply__verifica_consegna': {
    title: 'Check supplier delivery',
    purpose: 'Tool exposed by the simulated TechSupply MCP server, discovered with tools/list.',
    output: 'Text returned by the MCP server.',
  },
  'mcp__techsupply__listino': {
    title: 'Supplier price list',
    purpose: 'Tool exposed by the simulated TechSupply MCP server, discovered with tools/list.',
    output: 'Text returned by the MCP server.',
  },
}

const en = () => uiLang() === 'en'

/** Title, action, phenomenon, term and message of a level (scenario overrides already applied). */
export function levelText(level: LevelDef, scenarioId?: string): LevelCopy {
  const { title, action, phenomenon, term, message } = level
  const base: LevelCopy = { title, action, phenomenon, term, message }
  if (!en()) return base
  const override = scenarioId ? LEVEL_OVERRIDE_EN[`${scenarioId}:${level.id}`] : undefined
  return { ...base, ...LEVEL_EN[level.id], ...override }
}

export function scenarioText(s: Pick<Scenario, 'id' | 'title' | 'shortTitle' | 'lesson'>): ScenarioCopy {
  const base: ScenarioCopy = { title: s.title, shortTitle: s.shortTitle, lesson: s.lesson }
  return en() ? { ...base, ...SCENARIO_EN[s.id] } : base
}

export function componentText(id: ComponentId): ComponentCopy {
  const meta = COMPONENTS[id]
  const base: ComponentCopy = { label: meta.label, short: meta.short }
  return en() ? { ...base, ...COMPONENT_EN[id] } : base
}

export function toolText(tool: Pick<ToolDefinition, 'id' | 'title' | 'purpose' | 'output'>): ToolCopy {
  const base: ToolCopy = { title: tool.title, purpose: tool.purpose, output: tool.output }
  return en() ? { ...base, ...TOOL_EN[tool.id] } : base
}

/** Labels of the built-in memory keys (keys are ids shared by both languages). */
const MEMORY_KEY_LABEL: Partial<Record<string, readonly [it: string, en: string]>> = {
  centro_di_costo: ['centro di costo', 'cost centre'],
  sede_consegna: ['sede consegna', 'delivery site'],
  formato: ['formato', 'format'],
}

/** A memory record's key as people read it, in the interface language. */
export function memoryKeyText(key: string): string {
  const pair = MEMORY_KEY_LABEL[key]
  if (pair) return en() ? pair[1] : pair[0]
  return key.replace(/_/g, ' ')
}
