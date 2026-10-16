import type { McpServerDescriptor } from '../../domain/types'
import { REAL_EXTERNAL, SIMULATED_LOCAL } from '../../domain/types'
import { SIMULATED_MCP_SERVER } from '../levels'

/**
 * The ONLY MCP servers the app can talk to. URLs are hard-wired: there is no user-entered URL,
 * no localhost, no stdio. Real servers are public, read-only, without authentication, and were
 * checked for browser (CORS) access.
 */
export const MCP_SERVERS: McpServerDescriptor[] = [
  {
    id: SIMULATED_MCP_SERVER,
    label: 'TechSupply — fornitore (simulato)',
    kind: 'simulated',
    description:
      'Server MCP fittizio del fornitore TechSupply, eseguito dentro la pagina: mostra il ciclo initialize, tools/list, tools/call senza uscire dal browser.',
    provenance: { ...SIMULATED_LOCAL, note: 'server MCP fittizio nella pagina' },
  },
  {
    id: 'mslearn',
    label: 'Microsoft Learn — documentazione',
    kind: 'real',
    url: 'https://learn.microsoft.com/api/mcp',
    description: 'Server MCP pubblico di Microsoft Learn: cerca e legge documentazione tecnica. Sola lettura, nessuna autenticazione.',
    provenance: { ...REAL_EXTERNAL, note: 'servizio esterno reale: la richiesta esce dal browser' },
  },
  {
    id: 'deepwiki',
    label: 'DeepWiki — documentazione di repository GitHub',
    kind: 'real',
    url: 'https://mcp.deepwiki.com/mcp',
    description: 'Server MCP pubblico di DeepWiki: documentazione generata per repository GitHub pubblici. Sola lettura, nessuna autenticazione.',
    provenance: { ...REAL_EXTERNAL, note: 'servizio esterno reale: la richiesta esce dal browser' },
  },
]

export function getServerDescriptor(id: string): McpServerDescriptor | undefined {
  return MCP_SERVERS.find(s => s.id === id)
}

/** True only for the exact URLs of the real allowlisted servers. */
export function isAllowedUrl(url: string): boolean {
  return MCP_SERVERS.some(s => s.kind === 'real' && s.url === url)
}
