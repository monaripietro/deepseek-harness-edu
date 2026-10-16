import type { FaultInjection, JsonRpcMessage, McpToolDescriptor, PromptLanguage, ScenarioData } from '../../domain/types'
import { LocalizedError, formatEnDate, formatEur, t } from '../tools/lang'

/** A way to exchange JSON-RPC messages with an MCP server (HTTP for real ones, in-page for the simulated one). */
export interface McpTransport {
  /** Send a request (returns the response) or a notification (returns null). */
  send(msg: JsonRpcMessage, signal?: AbortSignal): Promise<JsonRpcMessage | null>
  /** Set the negotiated protocol version, sent as a header by the HTTP transport. */
  setProtocolVersion(version: string): void
  /** Forget in-memory session state. Never sends anything over the network. */
  close(): void
}

export const SIMULATED_PROTOCOL_VERSION = '2025-06-18'
export const UNREACHABLE_MESSAGE = 'Server MCP non raggiungibile (guasto simulato)'
export const UNREACHABLE_MESSAGE_EN = 'MCP server unreachable (simulated fault)'

export const SIMULATED_TOOLS: McpToolDescriptor[] = [
  {
    name: 'verifica_consegna',
    title: 'Verifica consegna fornitore',
    description: 'Estimates when the supplier TechSupply can deliver a product (code), for a quantity, to a postal code. Use it to check the goods arrive in time.',
    inputSchema: {
      type: 'object',
      properties: {
        codice: { type: 'string', description: 'Product code from the catalog (format "NB-...").' },
        quantita: { type: 'integer', minimum: 1, description: 'Number of units, an integer.' },
        cap: { type: 'string', description: 'Italian postal code of the delivery site: Bologna is "40128".' },
      },
      required: ['codice', 'quantita', 'cap'],
      additionalProperties: false,
    },
  },
  {
    name: 'listino',
    title: 'Listino fornitore',
    description: 'Returns the TechSupply list price (EUR, VAT excluded) of a product code.',
    inputSchema: {
      type: 'object',
      properties: { codice: { type: 'string', description: 'Product code (format "NB-...").' } },
      required: ['codice'],
      additionalProperties: false,
    },
  },
]

const CITY_BY_CAP_PREFIX: Record<string, string> = { '40': 'Bologna', '20': 'Milano', '00': 'Roma', '10': 'Torino', '50': 'Firenze', '80': 'Napoli' }

const CITY_EN: Record<string, string> = { Milano: 'Milan', Roma: 'Rome', Torino: 'Turin', Firenze: 'Florence', Napoli: 'Naples' }

export interface SimulatedServerDeps {
  data: () => ScenarioData
  faults: () => FaultInjection
  /** Language of the texts the server returns, read by the model (default 'it'). */
  lang?: () => PromptLanguage
  /** Simulated network latency range in ms (tests pass [0, 0]). */
  latencyMs?: [number, number]
}

function cancelled(): LocalizedError {
  return new LocalizedError('Chiamata annullata', 'Call cancelled')
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {  reject(cancelled()); return }
    const onAbort = () => {
      clearTimeout(timer)
      reject(cancelled())
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

function textResult(text: string, isError = false) {
  return { content: [{ type: 'text', text }], isError }
}

/** In-page JSON-RPC server that behaves like a remote MCP server (initialize, tools/list, tools/call). */
export function createSimulatedMcpTransport(deps: SimulatedServerDeps): McpTransport {
  const [lo, hi] = deps.latencyMs ?? [80, 220]
  let initialized = false
  /** The Italian or the English text, in the language the server is set to (default Italian). */
  const say = (it: string, en: string): string => t(deps.lang?.(), it, en)

  function callTool(name: string, args: Record<string, unknown>) {
    const data = deps.data()
    const lang = deps.lang?.()
    const codice = typeof args.codice === 'string' ? args.codice.trim().toUpperCase() : ''
    if (name === 'verifica_consegna') {
      const quantita = Number(args.quantita)
      const cap = typeof args.cap === 'string' ? args.cap.trim() : ''
      if (!codice || !Number.isInteger(quantita) || quantita < 1 || !cap) {
        const it = 'Argomenti non validi: servono codice, quantita (intero >= 1) e cap.'
        return textResult(say(it, 'Invalid arguments: codice, quantita (integer >= 1) and cap are required.'), true)
      }
      const date = data.supplierDelivery[codice]
      if (!date) {
        const it = `Articolo ${codice} non trovato nel catalogo del fornitore (SIMULATO).`
        return textResult(say(it, `Product ${codice} not found in the supplier catalog (SIMULATED).`), true)
      }
      const city = CITY_BY_CAP_PREFIX[cap.slice(0, 2)]
      if (lang === 'en') {
        const place = city ? CITY_EN[city] ?? city : `postal code ${cap}`
        return textResult(`Estimated delivery to ${place}: ${formatEnDate(date)} (SIMULATED) for ${quantita} × ${codice}.`)
      }
      return textResult(`Consegna stimata a ${city ?? `CAP ${cap}`}: ${date} (SIMULATO) per ${quantita} × ${codice}.`)
    }
    if (name === 'listino') {
      if (!codice) {
        return textResult(say('Argomenti non validi: serve il codice articolo.', 'Invalid arguments: the product code is required.'), true)
      }
      const p = data.catalog.find(x => x.code.toUpperCase() === codice)
      if (!p) {
        const it = `Articolo ${codice} non trovato nel listino TechSupply (SIMULATO).`
        return textResult(say(it, `Product ${codice} not found in the TechSupply price list (SIMULATED).`), true)
      }
      const price = formatEur(p.priceEur, lang)
      const it = `${p.code} - ${p.name}: listino TechSupply ${price} IVA esclusa (SIMULATO).`
      return textResult(say(it, `${p.code} - ${p.name}: TechSupply list price ${price} excl. VAT (SIMULATED).`))
    }
    return null
  }

  return {
    setProtocolVersion() {},
    close() {
      initialized = false
    },
    async send(msg, signal) {
      // Network-level error, reported by the client: Italian for the app, with an English version for the model.
      if (deps.faults().mcpDown) throw new LocalizedError(UNREACHABLE_MESSAGE, UNREACHABLE_MESSAGE_EN)
      const latency = lo + Math.random() * Math.max(0, hi - lo)
      if (latency > 0) await wait(latency, signal)
      const id = msg.id
      const reply = (result: unknown): JsonRpcMessage => ({ jsonrpc: '2.0', id: id, result })
      const error = (code: number, message: string): JsonRpcMessage => ({ jsonrpc: '2.0', id: id, error: { code, message } })

      if (id === undefined) return null // notifications (e.g. notifications/initialized) get no response
      switch (msg.method) {
        case 'initialize':
          initialized = true
          return reply({
            protocolVersion: SIMULATED_PROTOCOL_VERSION,
            capabilities: { tools: { listChanged: false } },
            serverInfo: { name: 'TechSupply MCP (simulato)', version: '1.0.0' },
          })
        case 'tools/list':
          if (!initialized) return error(-32002, say('Server non inizializzato', 'Server not initialized'))
          return reply({ tools: SIMULATED_TOOLS })
        case 'tools/call': {
          if (!initialized) return error(-32002, say('Server non inizializzato', 'Server not initialized'))
          const params = (msg.params ?? {}) as { name?: string; arguments?: Record<string, unknown> }
          const result = callTool(params.name ?? '', params.arguments ?? {})
          const name = String(params.name)
          return result ? reply(result) : error(-32602, say(`Strumento sconosciuto: ${name}`, `Unknown tool: ${name}`))
        }
        case 'ping':
          return reply({})
        default: {
          const method = String(msg.method)
          return error(-32601, say(`Metodo non supportato: ${method}`, `Unsupported method: ${method}`))
        }
      }
    },
  }
}
