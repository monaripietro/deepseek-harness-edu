import type { JSONSchema, ModelDecision, ModelToolSpec, ToolDefinition } from '../../domain/types'

// ───────────── Prompt block describing the decision protocol ─────────────

function typeOf(p: Record<string, unknown>): string {
  if (Array.isArray(p.enum)) return (p.enum as unknown[]).map(v => JSON.stringify(v)).join('|')
  const t = p.type
  if (Array.isArray(t)) return t.join('|')
  return typeof t === 'string' ? t : 'any'
}

/** Compact, human-readable argument list: name*: type (* = required). */
export function compactArgs(schema: JSONSchema): string {
  const props = (schema.properties ?? {}) as Record<string, Record<string, unknown>>
  const required = new Set(Array.isArray(schema.required) ? (schema.required as string[]) : [])
  const parts = Object.entries(props).map(([name, p]) => `${name}${required.has(name) ? '*' : ''}: ${typeOf(p ?? {})}`)
  return parts.length ? parts.join(', ') : '(no arguments)'
}

export function renderToolProtocol(tools: ToolDefinition[], mustAnswer: boolean): string {
  const lines: string[] = []
  lines.push('## How to reply')
  lines.push('ALWAYS reply with ONE JSON object only, no text before or after it, in one of these forms:')
  if (!mustAnswer) {
    lines.push('1) Use a tool: {"azione":"usa_strumento","strumento":"tool_name","argomenti":{...},"motivazione":"one short sentence"}')
  }
  lines.push(`${mustAnswer ? '1' : '2'}) Final answer (in Italian): {"azione":"rispondi","testo":"...","fonti":["POL-IT-04"]}`)
  lines.push(`${mustAnswer ? '2' : '3'}) Ask the user one question (in Italian), only for a detail that only the user knows: {"azione":"chiedi","domanda":"..."}`)
  if (mustAnswer) {
    lines.push('IMPORTANT: you cannot use tools anymore. Reply now with {"azione":"rispondi",...} using only the results you already have.')
    return lines.join('\n')
  }
  lines.push('After each tool you get a message "[RESULT of <tool>]" or "[ERROR from <tool>]". Read it, then choose the next step.')
  lines.push('')
  lines.push('## Tools')
  for (const t of tools) {
    lines.push(`- ${t.id}: ${t.description}`)
    lines.push(`  arguments (* = required): ${compactArgs(t.inputSchema)}`)
  }
  return lines.join('\n')
}

export function serializeDecision(d: ModelDecision): string {
  switch (d.type) {
    case 'tool':
      return JSON.stringify({ azione: 'usa_strumento', strumento: d.tool, argomenti: d.args, ...(d.rationale ? { motivazione: d.rationale } : {}) })
    case 'answer':
      return JSON.stringify({ azione: 'rispondi', testo: d.text, ...(d.sources?.length ? { fonti: d.sources } : {}) })
    case 'ask':
      return JSON.stringify({ azione: 'chiedi', domanda: d.question })
  }
}

export const REPAIR_INSTRUCTION =
  'Your last message was not valid. Reply with ONE JSON object only, no other text, in one of these forms: ' +
  '{"azione":"usa_strumento","strumento":"tool_name","argomenti":{...},"motivazione":"one sentence"} or ' +
  '{"azione":"rispondi","testo":"...","fonti":["POL-IT-04"]} or {"azione":"chiedi","domanda":"..."}.'

// ───────────── Robust parsing ─────────────

export type ParseResult = { ok: true; decision: ModelDecision } | { ok: false; error: string }

function stripFences(raw: string): string {
  return raw.replace(/```[a-zA-Z]*\s*/g, '').replace(/```/g, '')
}

/** Finds the end index of the balanced {...} starting at `start` (string-aware), or -1. */
function balancedEnd(s: string, start: number): number {
  let depth = 0
  let inStr = false
  let esc = false
  for (let i = start; i < s.length; i++) {
    const c = s[i]
    if (inStr) {
      if (esc) esc = false
      else if (c === '\\') esc = true
      else if (c === '"') inStr = false
      continue
    }
    if (c === '"') inStr = true
    else if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

/** First parsable JSON object in the text, tolerating fences and trailing prose. */
export function extractJsonObject(raw: string): Record<string, unknown> | null {
  const s = stripFences(raw)
  let from = s.indexOf('{')
  while (from !== -1) {
    const end = balancedEnd(s, from)
    if (end !== -1) {
      try {
        const v: unknown = JSON.parse(s.slice(from, end + 1))
        if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>
      } catch {
        /* try the next brace */
      }
    }
    from = s.indexOf('{', from + 1)
  }
  return null
}

function pick(o: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) if (k in o && o[k] !== undefined && o[k] !== null) return o[k]
  return undefined
}

function toArgs(v: unknown): Record<string, unknown> | null {
  if (v === undefined) return {}
  if (typeof v === 'string') {
    try {
      const p: unknown = JSON.parse(v)
      return p && typeof p === 'object' && !Array.isArray(p) ? (p as Record<string, unknown>) : null
    } catch {
      return null
    }
  }
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

function toSources(v: unknown): string[] | undefined {
  if (typeof v === 'string') return v.trim() ? [v.trim()] : undefined
  if (Array.isArray(v)) {
    const out = v.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map(x => x.trim())
    return out.length ? out : undefined
  }
  return undefined
}

const TOOL_ACTIONS = new Set(['usa_strumento', 'usa', 'strumento', 'tool', 'tool_call', 'use_tool', 'call_tool', 'call', 'function_call'])
const ANSWER_ACTIONS = new Set(['rispondi', 'risposta', 'risposta_finale', 'answer', 'respond', 'reply', 'final', 'final_answer'])
const ASK_ACTIONS = new Set(['chiedi', 'domanda', 'ask', 'clarify', 'ask_user', 'question'])

export function parseDecision(raw: string): ParseResult {
  const obj = extractJsonObject(raw)
  if (!obj) return { ok: false, error: 'Nessun oggetto JSON trovato nella risposta del modello.' }

  // OpenAI-like nesting: {"function":{"name":..,"arguments":..}} / {"tool_call":{...}}
  const nested = pick(obj, ['function', 'tool_call'])
  const o: Record<string, unknown> =
    nested && typeof nested === 'object' && !Array.isArray(nested) && !('azione' in obj) && !('action' in obj)
      ? { ...obj, ...(nested as Record<string, unknown>) }
      : obj

  const actionRaw = pick(o, ['azione', 'action'])
  const action = typeof actionRaw === 'string' ? actionRaw.trim().toLowerCase().replace(/[\s-]+/g, '_') : undefined
  const toolName = pick(o, ['strumento', 'tool', 'tool_name', 'name', 'function'])
  const text = pick(o, ['testo', 'text', 'answer', 'risposta', 'response'])
  const question = pick(o, ['domanda', 'question'])

  let kind: 'tool' | 'answer' | 'ask' | null = null
  if (action) {
    if (TOOL_ACTIONS.has(action)) kind = 'tool'
    else if (ANSWER_ACTIONS.has(action)) kind = 'answer'
    else if (ASK_ACTIONS.has(action)) kind = 'ask'
    else return { ok: false, error: `Azione «${String(actionRaw)}» non riconosciuta: usa "usa_strumento", "rispondi" oppure "chiedi".` }
  } else if (typeof toolName === 'string') kind = 'tool'
  else if (typeof text === 'string') kind = 'answer'
  else if (typeof question === 'string') kind = 'ask'
  if (!kind) return { ok: false, error: 'Manca il campo "azione": usa "usa_strumento", "rispondi" oppure "chiedi".' }

  if (kind === 'tool') {
    if (typeof toolName !== 'string' || !toolName.trim()) return { ok: false, error: 'Manca il nome dello strumento (campo "strumento").' }
    const args = toArgs(pick(o, ['argomenti', 'arguments', 'args', 'parameters', 'params', 'input']))
    if (!args) return { ok: false, error: 'Il campo "argomenti" deve essere un oggetto JSON.' }
    const rationale = pick(o, ['motivazione', 'rationale', 'reason'])
    return {
      ok: true,
      decision: { type: 'tool', tool: toolName.trim(), args, ...(typeof rationale === 'string' && rationale.trim() ? { rationale: rationale.trim() } : {}) },
    }
  }
  if (kind === 'answer') {
    if (typeof text !== 'string' || !text.trim()) return { ok: false, error: 'Manca il testo della risposta (campo "testo").' }
    const sources = toSources(pick(o, ['fonti', 'sources', 'citazioni']))
    return { ok: true, decision: { type: 'answer', text: text.trim(), ...(sources ? { sources } : {}) } }
  }
  if (typeof question !== 'string' || !question.trim()) return { ok: false, error: 'Manca la domanda (campo "domanda").' }
  return { ok: true, decision: { type: 'ask', question: question.trim() } }
}

// ───────────── Native tool calling (chat-template tools) ─────────────

/** General rules for models with native tool calling (the tool list itself comes from the chat template). */
export const NATIVE_GUIDANCE =
  'How to work:\n' +
  '1. Need a company fact, a rule, a price, stock, a budget or a calculation? Call ONE tool and wait for its result.\n' +
  '2. Read the result. Then call the next tool, or write the final answer.\n' +
  '3. Copy codes, prices and dates exactly from tool results. Do not repeat a call that already worked.\n' +
  '4. When you have everything, write the final answer in Italian, without calling tools.'

const CALCULATOR_RULE = '5. Use calcolatrice for EVERY calculation (totals, VAT 22%, percentages). Never calculate in your head.'

const hasTool = (ids: Set<string>, id: string) => ids.has(id) || [...ids].some(t => t.endsWith(`__${id}`))

/**
 * Step-by-step procedures for the tasks of this app, listing only the tools that are available:
 * tiny models follow an explicit recipe much better than a general goal.
 */
export function nativeProcedures(toolIds: string[]): string {
  const ids = new Set(toolIds)
  const out: string[] = []
  if (hasTool(ids, 'cerca_catalogo')) {
    const steps = [
      'read which category (A, B or C) the policy allows for that role and its price limit: use COMPANY DOCUMENTS if they are above' +
        (hasTool(ids, 'cerca_policy') ? ', otherwise cerca_policy' : ''),
    ]
    steps.push('list the products of that category: cerca_catalogo with only {"categoria": "<letter>"}')
    if (hasTool(ids, 'verifica_disponibilita')) steps.push('check stock of the cheapest product for the needed quantity (verifica_disponibilita); if stock is NOT enough, check the next product')
    if (hasTool(ids, 'verifica_consegna')) steps.push('check the supplier delivery date (verifica_consegna; Bologna CAP is 40128)')
    if (hasTool(ids, 'leggi_budget')) steps.push('read the budget of the user cost center (leggi_budget)')
    if (hasTool(ids, 'calcolatrice')) steps.push('total with VAT = quantity * unit price * 1.22 (calcolatrice)')
    if (hasTool(ids, 'crea_richiesta_acquisto')) steps.push('create the purchase request with the chosen code and its catalog price (crea_richiesta_acquisto)')
    out.push(`Buying equipment: ${steps.map((t, i) => `${i + 1}) ${t}`).join('; ')}.`)
  } else if (hasTool(ids, 'calcolatrice')) {
    out.push(
      'Buying equipment without a catalog tool: product codes and prices are not available here. ' +
        'Use calcolatrice for the maximum spend the policy allows (quantity * price limit per unit, then * 1.22 for VAT), ' +
        'then say that choosing the exact model needs the catalog.',
    )
  }
  if (hasTool(ids, 'converti_valuta') && hasTool(ids, 'cerca_catalogo')) {
    out.push('Price in another currency: get our catalog price (cerca_catalogo), convert the other price to EUR (converti_valuta), then compare the two EUR prices.')
  }
  if (hasTool(ids, 'leggi_ordine_cliente')) {
    out.push(
      'Customer order: read it with leggi_ordine_cliente, then use its exact status and dates.' +
        (hasTool(ids, 'crea_attivita') ? ' For a follow-up, create a task with crea_attivita (scadenza as YYYY-MM-DD).' : ''),
    )
  } else if (hasTool(ids, 'crea_attivita')) {
    out.push('Follow-up or reminder: create a task with crea_attivita (scadenza as YYYY-MM-DD).')
  }
  if (hasTool(ids, 'cerca_policy')) out.push('Company rule questions: search with cerca_policy using Italian keywords, then cite the document ID.')
  out.push(
    'Details only the user knows (date, time...) and not written above: ask ONE short question instead of guessing. ' +
      'Data that no tool here can give (prices, stock, budget...): do everything else, then say it is not available in this system. Never ask the user to send it.',
  )
  return `Procedures:\n- ${out.join('\n- ')}`
}

/** Full guidance block for native tool calling: rules + procedures for the tools at hand. Stable across steps (KV reuse). */
export function nativeGuidance(toolIds: string[]): string {
  const rules = toolIds.includes('calcolatrice') ? `${NATIVE_GUIDANCE}\n${CALCULATOR_RULE}` : NATIVE_GUIDANCE
  return `${rules}\n${nativeProcedures(toolIds)}`
}

export const NATIVE_MUST_ANSWER =
  'You cannot call tools anymore. Write the final answer for the user now, in Italian, using only the information above. If some data is missing, say what is missing; do not ask the user to send it.'
export const NATIVE_REPAIR =
  'Your last tool call was not valid. To use a tool, call it with its exact name and valid arguments. Otherwise write the final answer in Italian.'

/** Tool specs for the chat template: full short description and per-argument descriptions (with format hints). */
export function toModelTools(tools: ToolDefinition[]): ModelToolSpec[] {
  return tools.map((t) => {
    const schema = (t.inputSchema ?? {}) as { properties?: Record<string, Record<string, unknown>>; required?: string[] }
    const properties: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(schema.properties ?? {})) {
      const { minLength: _a, pattern: _b, exclusiveMinimum: _c, ...rest } = v
      void _a
      void _b
      void _c
      properties[k] = rest
    }
    const description = t.description.length > 300 ? `${t.description.slice(0, 299)}…` : t.description
    return {
      type: 'function' as const,
      function: { name: t.id, description, parameters: { type: 'object', properties, required: schema.required ?? [] } },
    }
  })
}

/**
 * Last resort for a guided call the model did not close (e.g. `[calcolatrice(espressione="48000-36480` or
 * `{"name": "calcolatrice", "arguments": {"espressione": "48000-36480`): one readable argument is enough.
 */
function looseSingleArgCall(body: string): { name: string; args: Record<string, unknown> } | null {
  const py = /^\s*\[?\s*([A-Za-z_][\w.]*)\s*\(\s*(\w+)\s*=\s*["']([^"'\n]+)/.exec(body)
  if (py) {
    const [, name = '', key = '', value = ''] = py
    return { name, args: { [key]: value.trim() } }
  }
  const js = /"name"\s*:\s*"([^"]+)"[\s\S]*?"arguments"\s*:\s*\{\s*"(\w+)"\s*:\s*"([^"\n]+)/.exec(body)
  if (js) {
    const [, name = '', key = '', value = ''] = js
    return { name, args: { [key]: value.trim() } }
  }
  return null
}

/** Remove reasoning segments some templates emit (never shown, never used). */
export function stripThinking(raw: string): string {
  return raw
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .replace(/<think>[\s\S]*$/, '')
    // Gemma 4: thought channel and turn/end markers
    .replace(/<\|channel>[\s\S]*?<channel\|>/g, '')
    .replace(/<\|channel>[\s\S]*$/, '')
    .replace(/<turn\|>|<\|turn>(?:model|user|system)?|<eos>|<end_of_turn>/g, '')
    .trim()
}

/**
 * Gemma 4 call arguments: `{key:<|"|>text<|"|>,n:4,flag:true,list:[...]}` (bare keys, strings
 * between <|"|> markers) → a plain object, or null when unreadable.
 */
export function parseGemmaArgs(body: string): Record<string, unknown> | null {
  const strings: string[] = []
  let s = body.replace(/<\|"\|>([\s\S]*?)<\|"\|>/g, (_m, text: string) => {
    strings.push(text)
    return `\u0000${strings.length - 1}\u0000`
  })
  s = s.replace(/([{,]\s*)([A-Za-z_][\w-]*)\s*:/g, '$1"$2":')
  s = s.replace(/\u0000(\d+)\u0000/g, (_m, i: string) => JSON.stringify(strings[Number(i)]))
  try {
    const v = JSON.parse(s) as unknown
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
  } catch {
    return null
  }
}

// ───────────── Pythonic tool calls (LFM2: [fn(a="b", n=4)]) ─────────────

/** Split on top-level commas, respecting quotes and brackets. */
function splitTopLevel(src: string): string[] {
  const out: string[] = []
  let depth = 0
  let quote: string | null = null
  let cur = ''
  for (let i = 0; i < src.length; i++) {
    const ch = src.charAt(i)
    if (quote) {
      cur += ch
      if (ch === '\\') {
        cur += src[++i] ?? ''
        continue
      }
      if (ch === quote) quote = null
      continue
    }
    if (ch === '"' || ch === "'") quote = ch
    else if (ch === '(' || ch === '[' || ch === '{') depth++
    else if (ch === ')' || ch === ']' || ch === '}') depth--
    if (ch === ',' && depth === 0) {
      out.push(cur)
      cur = ''
      continue
    }
    cur += ch
  }
  if (cur.trim()) out.push(cur)
  return out
}

/** Python-ish literal -> JS value (strings, numbers, booleans, None, JSON-like lists/dicts). */
function pyValue(raw: string): unknown {
  const v = raw.trim()
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v
      .slice(1, -1)
      .replace(/\\n/g, '\n')
      .replace(/\\(["'\\])/g, '$1')
  }
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v)
  if (v === 'True' || v === 'true') return true
  if (v === 'False' || v === 'false') return false
  if (v === 'None' || v === 'null') return null
  try {
    return JSON.parse(v.replace(/'/g, '"').replace(/\bTrue\b/g, 'true').replace(/\bFalse\b/g, 'false').replace(/\bNone\b/g, 'null'))
  } catch {
    return v
  }
}

/** `[name(k=v, ...)]` or `name(k=v)` -> { name, arguments } (first call only). */
export function parsePythonicCall(body: string): { name: string; arguments: Record<string, unknown> } | null {
  let b = body.trim()
  if (b.startsWith('[') && b.endsWith(']')) b = b.slice(1, -1).trim()
  const m = /^([A-Za-z_][\w.]*)\s*\(([\s\S]*)\)\s*(?:,[\s\S]*)?$/.exec(b)
  if (!m) return null
  const name = m[1] ?? ''
  let argsSrc = m[2] ?? ''
  // Only the first call when several are listed: cut at the matching parenthesis.
  let depth = 0
  let quote: string | null = null
  for (let i = 0; i < argsSrc.length; i++) {
    const ch = argsSrc.charAt(i)
    if (quote) {
      if (ch === '\\') i++
      else if (ch === quote) quote = null
      continue
    }
    if (ch === '"' || ch === "'") quote = ch
    else if (ch === '(') depth++
    else if (ch === ')') {
      if (depth === 0) {
        argsSrc = argsSrc.slice(0, i)
        break
      }
      depth--
    }
  }
  const args: Record<string, unknown> = {}
  for (const part of splitTopLevel(argsSrc)) {
    const eq = part.indexOf('=')
    if (eq < 0) continue
    const key = part.slice(0, eq).trim()
    if (/^[A-Za-z_]\w*$/.test(key)) args[key] = pyValue(part.slice(eq + 1))
  }
  return { name, arguments: args }
}

const LFM_CALL = /<\|tool_call_start\|>([\s\S]*?)(?:<\|tool_call_end\|>|$)/
const GEMMA_CALL = /<\|tool_call>\s*call:\s*([A-Za-z_][\w.-]*)\s*(\{[\s\S]*?\})?\s*(?:<tool_call\|>|$)/
const QWEN_CALL = /<tool_call>([\s\S]*?)(?:<\/tool_call>|$)/
const BARE_PYTHONIC = /^\s*\[\s*[A-Za-z_][\w.]*\s*\(/

/**
 * Parse the output of a model using native tool calling — Qwen-style
 * `<tool_call>{"name":…,"arguments":…}</tool_call>`, LFM-style `<|tool_call_start|>[fn(a="b")]<|tool_call_end|>`
 * (Pythonic or JSON) — or plain text, which is the answer. Text next to a call becomes the observable rationale.
 */
export function parseNative(raw: string): ParseResult {
  const clean = stripThinking(raw)
  const gemma = GEMMA_CALL.exec(clean)
  if (gemma) {
    // An unclosed call (the model stopped right after the value) still carries a readable single argument.
    const open = gemma[2] ? null : /call:\s*[\w.-]+\s*\{\s*(\w+)\s*:\s*<\|"\|>([^<\n]+)/.exec(clean)
    const args = gemma[2] ? parseGemmaArgs(gemma[2]) : open ? { [open[1] ?? '']: (open[2] ?? '').trim() } : {}
    if (!args) return { ok: false, error: 'Gli argomenti della chiamata allo strumento non sono leggibili.' }
    const outsideText = clean.replace(gemma[0], '').trim()
    return {
      ok: true,
      decision: { type: 'tool', tool: gemma[1] ?? '', args, ...(outsideText ? { rationale: outsideText.slice(0, 220) } : {}) },
    }
  }
  const tagged = LFM_CALL.exec(clean) ?? QWEN_CALL.exec(clean)
  const bare = !tagged && BARE_PYTHONIC.test(clean) ? clean.trim() : null
  const body = tagged ? (tagged[1] ?? '') : (bare ?? clean)
  const outside = (tagged ? clean.replace(tagged[0], '') : '').replace(/<\/?tool_call>|<\|tool_call_(start|end)\|>/g, '').trim()
  const withRationale = (r: ParseResult): ParseResult =>
    r.ok && r.decision.type === 'tool' && outside && !r.decision.rationale ? { ok: true, decision: { ...r.decision, rationale: outside.slice(0, 220) } } : r

  if (tagged || bare) {
    const obj = extractJsonObject(body)
    if (obj) return withRationale(parseDecision(JSON.stringify(obj)))
    const py = parsePythonicCall(body)
    if (py) return withRationale({ ok: true, decision: { type: 'tool', tool: py.name, args: py.arguments } })
    const loose = looseSingleArgCall(body)
    if (loose) return withRationale({ ok: true, decision: { type: 'tool', tool: loose.name, args: loose.args } })
    return { ok: false, error: 'La chiamata allo strumento non è leggibile (né JSON né forma nome(argomento=valore)).' }
  }
  const obj = extractJsonObject(clean)
  if (obj) {
    const parsed = parseDecision(JSON.stringify(obj))
    if (parsed.ok) return parsed
    if (clean.replace(JSON.stringify(obj), '').trim().length > 40) return { ok: true, decision: { type: 'answer', text: clean } }
    return parsed
  }
  const text = clean.trim()
  if (!text) return { ok: false, error: 'Il modello non ha prodotto né una chiamata a strumento né una risposta.' }
  return { ok: true, decision: { type: 'answer', text } }
}
