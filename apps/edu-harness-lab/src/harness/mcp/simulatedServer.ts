import type { FaultInjection, JsonRpcMessage, McpToolDescriptor, ScenarioData } from '../../domain/types'
import { formatItMoney } from '../tools/calculator'

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

export interface SimulatedServerDeps {
  data: () => ScenarioData
  faults: () => FaultInjection
  /** Simulated network latency range in ms (tests pass [0, 0]). */
  latencyMs?: [number, number]
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('Chiamata annullata'))
    const onAbort = () => {
      clearTimeout(t)
      reject(new Error('Chiamata annullata'))
    }
    const t = setTimeout(() => {
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

  function callTool(name: string, args: Record<string, unknown>) {
    const data = deps.data()
    const codice = String(args.codice ?? '').trim().toUpperCase()
    if (name === 'verifica_consegna') {
      const quantita = Number(args.quantita)
      const cap = String(args.cap ?? '').trim()
      if (!codice || !Number.isInteger(quantita) || quantita < 1 || !cap) {
        return textResult('Argomenti non validi: servono codice, quantita (intero >= 1) e cap.', true)
      }
      const date = data.supplierDelivery[codice]
      if (!date) return textResult(`Articolo ${codice} non trovato nel catalogo del fornitore (SIMULATO).`, true)
      const city = CITY_BY_CAP_PREFIX[cap.slice(0, 2)] ?? `CAP ${cap}`
      return textResult(`Consegna stimata a ${city}: ${date} (SIMULATO) per ${quantita} × ${codice}.`)
    }
    if (name === 'listino') {
      if (!codice) return textResult('Argomenti non validi: serve il codice articolo.', true)
      const p = data.catalog.find(x => x.code.toUpperCase() === codice)
      if (!p) return textResult(`Articolo ${codice} non trovato nel listino TechSupply (SIMULATO).`, true)
      return textResult(`${p.code} - ${p.name}: listino TechSupply ${formatItMoney(p.priceEur)} € IVA esclusa (SIMULATO).`)
    }
    return null
  }

  return {
    setProtocolVersion() {},
    close() {
      initialized = false
    },
    async send(msg, signal) {
      if (deps.faults().mcpDown) throw new Error(UNREACHABLE_MESSAGE)
      const latency = lo + Math.random() * Math.max(0, hi - lo)
      if (latency > 0) await wait(latency, signal)
      const id = msg.id
      const reply = (result: unknown): JsonRpcMessage => ({ jsonrpc: '2.0', id: id as number | string, result })
      const error = (code: number, message: string): JsonRpcMessage => ({ jsonrpc: '2.0', id: id as number | string, error: { code, message } })

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
          if (!initialized) return error(-32002, 'Server non inizializzato')
          return reply({ tools: SIMULATED_TOOLS })
        case 'tools/call': {
          if (!initialized) return error(-32002, 'Server non inizializzato')
          const params = (msg.params ?? {}) as { name?: string; arguments?: Record<string, unknown> }
          const result = callTool(String(params.name ?? ''), params.arguments ?? {})
          return result ? reply(result) : error(-32602, `Strumento sconosciuto: ${String(params.name)}`)
        }
        case 'ping':
          return reply({})
        default:
          return error(-32601, `Metodo non supportato: ${String(msg.method)}`)
      }
    },
  }
}
