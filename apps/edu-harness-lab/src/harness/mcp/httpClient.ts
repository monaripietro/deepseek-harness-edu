import type { JsonRpcMessage } from '../../domain/types'
import type { McpTransport } from './simulatedServer'

export const HTTP_TIMEOUT_MS = 15_000

/**
 * Parse a Streamable HTTP SSE body: collect `data:` lines per event, parse JSON objects,
 * return the one whose id matches (or the first response-like message when no id is given).
 */
export function parseSse(body: string, id?: number | string): JsonRpcMessage | null {
  const messages: JsonRpcMessage[] = []
  const events = body.split(/\r?\n\r?\n/)
  for (const ev of events) {
    const dataLines: string[] = []
    for (const line of ev.split(/\r?\n/)) {
      if (line.startsWith('data:')) dataLines.push(line.slice(5).replace(/^ /, ''))
    }
    if (!dataLines.length) continue
    try {
      const parsed: unknown = JSON.parse(dataLines.join('\n'))
      const list = Array.isArray(parsed) ? parsed : [parsed]
      for (const m of list) if (m && typeof m === 'object') messages.push(m as JsonRpcMessage)
    } catch {
      /* ignore non-JSON events (comments, pings) */
    }
  }
  if (id !== undefined) return messages.find(m => m.id === id) ?? null
  return messages.find(m => m.result !== undefined || m.error !== undefined) ?? null
}

/** Parse a response body that is either plain JSON or an SSE stream. */
export function parseMcpBody(contentType: string, body: string, id?: number | string): JsonRpcMessage | null {
  if (contentType.includes('text/event-stream')) return parseSse(body, id)
  const trimmed = body.trim()
  if (!trimmed) return null
  const parsed: unknown = JSON.parse(trimmed)
  if (Array.isArray(parsed)) {
    const list = parsed as JsonRpcMessage[]
    return (id !== undefined ? list.find(m => m.id === id) : list[0]) ?? null
  }
  return parsed as JsonRpcMessage
}

export function describeNetworkError(err: unknown, timedOut: boolean, callerAborted: boolean): Error {
  if (callerAborted) return new Error('Chiamata annullata.')
  if (timedOut) return new Error(`Il server MCP non ha risposto entro ${HTTP_TIMEOUT_MS / 1000} s.`)
  if (err instanceof TypeError) {
    return new Error(
      'Impossibile contattare il server MCP: il browser potrebbe aver bloccato la richiesta (CORS) oppure la rete non è disponibile.',
    )
  }
  return new Error(`Errore di comunicazione con il server MCP: ${err instanceof Error ? err.message : String(err)}`)
}

/**
 * Minimal Streamable HTTP client: POST only (never DELETE, never an open GET stream),
 * no cookies/credentials. The session id, if any, lives only in memory.
 */
export function createHttpTransport(url: string, fetchImpl: typeof fetch = (...a) => fetch(...a)): McpTransport {
  let sessionId: string | undefined
  let protocolVersion: string | undefined

  return {
    setProtocolVersion(v) {
      protocolVersion = v
    },
    close() {
      sessionId = undefined
      protocolVersion = undefined
    },
    async send(msg, signal) {
      const controller = new AbortController()
      let timedOut = false
      const timer = setTimeout(() => {
        timedOut = true
        controller.abort()
      }, HTTP_TIMEOUT_MS)
      const onAbort = () => controller.abort()
      if (signal?.aborted) controller.abort()
      signal?.addEventListener('abort', onAbort, { once: true })

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      }
      if (protocolVersion) headers['MCP-Protocol-Version'] = protocolVersion
      if (sessionId) headers['Mcp-Session-Id'] = sessionId

      try {
        const res = await fetchImpl(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(msg),
          credentials: 'omit',
          signal: controller.signal,
        })
        const sid = res.headers.get('mcp-session-id')
        if (sid) sessionId = sid
        if (msg.id === undefined) {
          // Notification: the server answers 202 Accepted with no body.
          if (!res.ok && res.status !== 202) throw new Error(`Il server MCP ha risposto con errore HTTP ${res.status}.`)
          return null
        }
        const text = await res.text()
        if (!res.ok) {
          let detail = ''
          try {
            const m = parseMcpBody(res.headers.get('content-type') ?? '', text, msg.id)
            detail = m?.error?.message ? `: ${m.error.message}` : ''
          } catch {
            /* body is not JSON */
          }
          throw new Error(`Il server MCP ha risposto con errore HTTP ${res.status}${detail}.`)
        }
        const parsed = parseMcpBody(res.headers.get('content-type') ?? '', text, msg.id)
        if (!parsed) throw new Error('Il server MCP non ha restituito una risposta JSON-RPC valida.')
        return parsed
      } catch (err) {
        if (err instanceof Error && err.message.startsWith('Il server MCP')) throw err
        throw describeNetworkError(err, timedOut, signal?.aborted === true)
      } finally {
        clearTimeout(timer)
        signal?.removeEventListener('abort', onAbort)
      }
    },
  }
}
