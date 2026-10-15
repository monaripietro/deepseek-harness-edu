import { useEffect, useRef, useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, Check, CircleDashed, Globe, Loader2, Play, Plug, PlugZap, TriangleAlert } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import type { JSONSchema, McpServerState, McpToolDescriptor } from '../../domain/types'
import { mcpHub, useLab } from '../../state/store'
import { ProvenanceBadge } from '../common/ProvenanceBadge'
import styles from './McpLab.module.css'
import lab from './lab.module.css'

const STATE_LABEL = { disconnected: 'Scollegato', connecting: 'Connessione…', connected: 'Connesso', error: 'Errore' } as const

function useServers(): McpServerState[] {
  const [servers, setServers] = useState<McpServerState[]>(() => mcpHub.servers())
  useEffect(() => {
    const d = mcpHub.subscribe(() => setServers([...mcpHub.servers()]))
    setServers([...mcpHub.servers()])
    return d
  }, [])
  return servers
}

function Timeline({ s }: { s: McpServerState }) {
  const wire = s.wire
  const hasInit = wire.some(w => w.msg.method === 'initialize')
  const hasCaps = wire.some(w => w.dir === 'in' && w.msg.result && typeof w.msg.result === 'object' && 'capabilities' in (w.msg.result as object))
  const hasTools = s.tools.length > 0 || wire.some(w => w.msg.method === 'tools/list')
  const steps = [
    { label: 'initialize', done: hasInit },
    { label: 'capabilities', done: hasCaps || s.state === 'connected' },
    { label: 'tools', done: hasTools && s.state === 'connected' },
  ]
  const activeIdx = s.state === 'connecting' ? steps.findIndex(x => !x.done) : -1
  return (
    <ol className={styles.timeline} aria-label="Scoperta del server">
      {steps.map((st, i) => (
        <li key={st.label} className={`${styles.step} ${st.done ? styles.stepDone : ''}`}>
          <span className={styles.dot}>
            {st.done
              ? <Check size={14} aria-hidden />
              : i === activeIdx
                ? <Loader2 size={14} className={styles.spin} aria-hidden />
                : <CircleDashed size={14} aria-hidden />}
          </span>
          <code className={lab.mono}>{st.label}</code>
        </li>
      ))}
    </ol>
  )
}

function schemaProps(schema: JSONSchema): { name: string; type: string; description: string; required: boolean }[] {
  const props = (schema.properties ?? {}) as Record<string, Record<string, unknown>>
  const req = Array.isArray(schema.required) ? (schema.required as string[]) : []
  return Object.entries(props).map(([name, p]) => ({ name, type: String(p.type ?? 'string'), description: String(p.description ?? ''), required: req.includes(name) }))
}

function TryTool({ serverId, tool, disabled }: { serverId: string; tool: McpToolDescriptor; disabled: boolean }) {
  const props = schemaProps(tool.inputSchema)
  const [values, setValues] = useState<Record<string, string>>({})
  const [raw, setRaw] = useState('{}')
  const [json, setJson] = useState(props.length === 0)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ text: string; isError: boolean } | null>(null)
  const [err, setErr] = useState('')
  const abort = useRef<AbortController | null>(null)

  const run = async () => {
    setErr(''); setResult(null)
    let args: Record<string, unknown> = {}
    try {
      if (json) args = JSON.parse(raw) as Record<string, unknown>
      else for (const p of props) {
        const v = values[p.name]
        if (v === undefined || v === '') continue
        args[p.name] = p.type === 'number' || p.type === 'integer' ? Number(v) : p.type === 'boolean' ? v === 'true' : v
      }
    } catch { setErr('JSON non valido.'); return }
    abort.current = new AbortController()
    setBusy(true)
    try { setResult(await mcpHub.callTool(serverId, tool.name, args, abort.current.signal)) }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(false) }
  }

  return (
    <div className={styles.try}>
      {!json && props.map(p => (
        <label key={p.name} className={lab.label}>
          <span><code className={lab.mono}>{p.name}</code> <span className={lab.hint}>{p.type}{p.required ? ' · obbligatorio' : ''} {p.description}</span></span>
          <input className={lab.input} value={values[p.name] ?? ''} onChange={e => setValues({ ...values, [p.name]: e.target.value })} />
        </label>
      ))}
      {json && <textarea className={`${lab.textarea} ${lab.mono}`} aria-label="Argomenti in JSON" value={raw} onChange={e => setRaw(e.target.value)} />}
      <div className={lab.row}>
        <button className={`${lab.btn} ${lab.primary} ${lab.sm}`} onClick={run} disabled={disabled || busy}>
          {busy ? <Loader2 size={14} className={styles.spin} aria-hidden /> : <Play size={14} aria-hidden />} Prova uno strumento
        </button>
        {props.length > 0 && <button className={`${lab.btn} ${lab.ghost} ${lab.sm}`} onClick={() => setJson(!json)}>{json ? 'Usa i campi' : 'Modifica come JSON'}</button>}
        {busy && <button className={`${lab.btn} ${lab.sm}`} onClick={() => abort.current?.abort()}>Annulla</button>}
      </div>
      {err && <div className={lab.err} role="alert">{err}</div>}
      {result && <pre className={`${lab.pre} ${result.isError ? styles.resErr : ''}`}>{result.text}</pre>}
    </div>
  )
}

function Wire({ s }: { s: McpServerState }) {
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => { endRef.current?.scrollIntoView?.({ block: 'nearest' }) }, [s.wire.length])
  if (s.wire.length === 0) return <p className={lab.muted}>Nessun messaggio scambiato ancora.</p>
  return (
    <div className={styles.wire} role="log" aria-label="Messaggi JSON-RPC">
      {s.wire.map((w, i) => {
        const m = w.msg
        const label = m.method ?? (m.error ? `errore ${m.error.code}` : `risposta #${String(m.id ?? '')}`)
        return (
          <details key={i} className={styles.wireRow}>
            <summary>
              {w.dir === 'out' ? <ArrowUpRight size={14} aria-label="inviato" /> : <ArrowDownLeft size={14} aria-label="ricevuto" />}
              <code className={lab.mono}>{label}</code>
              <span className={lab.muted}>{new Date(w.at).toLocaleTimeString('it-IT')}</span>
            </summary>
            <pre className={lab.pre}>{JSON.stringify(m, null, 2)}</pre>
          </details>
        )
      })}
      <div ref={endRef} />
    </div>
  )
}

function ServerCard({ s }: { s: McpServerState }) {
  const config = useLab(x => x.config)
  const updateConfig = useLab(x => x.updateConfig)
  const real = s.server.kind === 'real'
  const [consent, setConsent] = useState(false)
  const reduce = useReducedMotion()
  const id = s.server.id
  const exposed = config.mcpServers.includes(id)
  const connected = s.state === 'connected'
  const busy = s.state === 'connecting'
  const setExposed = (on: boolean) =>
    updateConfig({ mcpServers: on ? [...config.mcpServers.filter(x => x !== id), id] : config.mcpServers.filter(x => x !== id) })

  return (
    <motion.article layout={!reduce} className={`${lab.card} ${real ? styles.realCard : ''}`} aria-label={s.server.label}>
      <div className={lab.spread}>
        <h3 className={lab.h3} style={{ margin: 0 }}>{s.server.label}</h3>
        <div className={lab.row}>
          <ProvenanceBadge tag={s.server.provenance} />
          <span className={`${lab.chip} ${connected ? lab.chipOk : s.state === 'error' ? lab.chipDanger : ''}`} role="status">
            {busy ? <Loader2 size={13} className={styles.spin} aria-hidden /> : null}{STATE_LABEL[s.state]}
          </span>
        </div>
      </div>
      <p className={lab.muted}>{s.server.description}</p>
      {s.server.url && <code className={lab.mono}>{s.server.url}</code>}

      {real && (
        <div className={`${lab.callout} ${lab.warn}`}>
          <TriangleAlert size={20} aria-hidden />
          <div className={lab.stack}>
            <span>
              Le richieste partono verso un servizio di terzi (ESTERNO). Sola lettura, nessuna credenziale.
              Ogni chiamata del modello chiederà la tua approvazione.
              Se il browser blocca la richiesta (CORS o rete), si torna alla simulazione.
            </span>
            <label className={lab.check}>
              <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} disabled={connected || busy} />
              Ho capito e acconsento a contattare questo servizio esterno.
            </label>
          </div>
        </div>
      )}

      <div className={lab.row}>
        {connected || busy ? (
          <button className={lab.btn} onClick={() => void mcpHub.disconnect(id)} disabled={busy}>
            <Plug size={16} aria-hidden /> Disconnetti
          </button>
        ) : (
          <button className={`${lab.btn} ${lab.primary}`} onClick={() => void mcpHub.connect(id)} disabled={real && !consent}>
            {real ? <Globe size={16} aria-hidden /> : <PlugZap size={16} aria-hidden />} Connetti
          </button>
        )}
        <label className={lab.switch}>
          <input type="checkbox" checked={exposed} onChange={e => setExposed(e.target.checked)} />
          Esponi al modello
        </label>
      </div>
      {exposed && !config.components.mcp && (
        <span className={lab.hint}>Il componente MCP è spento: il modello non vedrà questi strumenti finché non lo accendi.</span>
      )}
      {s.error && <div className={lab.err} role="alert">{s.error}</div>}

      <Timeline s={s} />
      {(s.protocolVersion || s.serverInfo) && (
        <dl className={lab.dl}>
          {s.protocolVersion && (<><dt>Versione del protocollo</dt><dd><code className={lab.mono}>{s.protocolVersion}</code></dd></>)}
          {s.serverInfo && (<><dt>Server</dt><dd>{s.serverInfo.name}{s.serverInfo.version ? ` ${s.serverInfo.version}` : ''}</dd></>)}
        </dl>
      )}

      {s.tools.length > 0 && (
        <div className={lab.stack}>
          <div className={styles.sub}>Strumenti scoperti ({s.tools.length})</div>
          {s.tools.map(t => (
            <details key={t.name} className={styles.tool}>
              <summary><code className={lab.mono}>{t.name}</code> <span className={lab.muted}>{t.description}</span></summary>
              <pre className={lab.pre}>{JSON.stringify(t.inputSchema, null, 2)}</pre>
              <TryTool serverId={id} tool={t} disabled={!connected} />
            </details>
          ))}
        </div>
      )}

      <details>
        <summary className={styles.sub}>Messaggi JSON-RPC ({s.wire.length})</summary>
        <Wire s={s} />
      </details>
    </motion.article>
  )
}

export function McpLab() {
  const servers = useServers()
  const simulated = servers.filter(s => s.server.kind === 'simulated')
  const real = servers.filter(s => s.server.kind === 'real')
  return (
    <div>
      <h2 className={lab.h2}>Server MCP</h2>
      <p className={lab.intro}>
        MCP è un modo standard per collegare strumenti esterni: cambia il cavo, non il cervello.
        Il sistema scopre da solo gli strumenti del server e li offre al modello come tutti gli altri.
      </p>
      <section className={lab.section} aria-labelledby="mcp-sim">
        <h3 id="mcp-sim" className={lab.h3}>Simulato</h3>
        <div className={lab.stack}>{simulated.map(s => <ServerCard key={s.server.id} s={s} />)}</div>
      </section>
      <section className={lab.section} aria-labelledby="mcp-real">
        <h3 id="mcp-real" className={lab.h3}>Server reali (ESTERNI) — opt-in</h3>
        <div className={lab.stack}>{real.map(s => <ServerCard key={s.server.id} s={s} />)}</div>
      </section>
    </div>
  )
}
