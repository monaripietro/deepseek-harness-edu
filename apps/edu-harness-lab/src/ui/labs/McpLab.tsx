import { useEffect, useRef, useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, Check, CircleDashed, Globe, Loader2, Play, Plug, PlugZap, TriangleAlert } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import type { JSONSchema, McpServerState, McpToolDescriptor } from '../../domain/types'
import { mcpHub, useLab } from '../../state/store'
import { ProvenanceBadge } from '../common/ProvenanceBadge'
import { biRecord, uiLang, useT } from '../../i18n'
import styles from './McpLab.module.css'
import lab from './lab.module.css'

const STATE_LABEL = biRecord<McpServerState['state']>({
  disconnected: ['Scollegato', 'Disconnected'],
  connecting: ['Connessione…', 'Connecting…'],
  connected: ['Connesso', 'Connected'],
  error: ['Errore', 'Error'],
})

const dateLocale = (): string => (uiLang() === 'en' ? 'en-GB' : 'it-IT')

function useServers(): McpServerState[] {
  const [servers, setServers] = useState<McpServerState[]>(() => mcpHub.servers())
  useEffect(() => {
    const d = mcpHub.subscribe(() =>{  setServers([...mcpHub.servers()]) })
    setServers([...mcpHub.servers()])
    return d
  }, [])
  return servers
}

function Timeline({ s }: { s: McpServerState }) {
  const t = useT()
  const wire = s.wire
  const hasInit = wire.some(w => w.msg.method === 'initialize')
  const hasCaps = wire.some(w => w.dir === 'in' && w.msg.result && typeof w.msg.result === 'object' && 'capabilities' in (w.msg.result))
  const hasTools = s.tools.length > 0 || wire.some(w => w.msg.method === 'tools/list')
  const steps = [
    { label: 'initialize', done: hasInit },
    { label: 'capabilities', done: hasCaps || s.state === 'connected' },
    { label: 'tools', done: hasTools && s.state === 'connected' },
  ]
  const activeIdx = s.state === 'connecting' ? steps.findIndex(x => !x.done) : -1
  return (
    <ol className={styles.timeline} aria-label={t('Scoperta del server', 'Server discovery')}>
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
  return Object.entries(props).map(([name, p]) => ({
    name,
    type: typeof p.type === 'string' ? p.type : Array.isArray(p.type) ? p.type.join(',') : 'string',
    description: typeof p.description === 'string' ? p.description : '',
    required: req.includes(name),
  }))
}

function TryTool({ serverId, tool, disabled }: { serverId: string; tool: McpToolDescriptor; disabled: boolean }) {
  const t = useT()
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
    } catch { setErr(t('JSON non valido.', 'Invalid JSON.')); return }
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
          <span><code className={lab.mono}>{p.name}</code> <span className={lab.hint}>{p.type}{p.required ? ` · ${t('obbligatorio', 'required')}` : ''} {p.description}</span></span>
          <input className={lab.input} value={values[p.name] ?? ''} onChange={(e) =>{  setValues({ ...values, [p.name]: e.target.value }) }} />
        </label>
      ))}
      {json && <textarea className={`${lab.textarea} ${lab.mono}`} aria-label={t('Argomenti in JSON', 'Arguments in JSON')} value={raw} onChange={(e) =>{  setRaw(e.target.value) }} />}
      <div className={lab.row}>
        <button className={`${lab.btn} ${lab.primary} ${lab.sm}`} onClick={() => { void run() }} disabled={disabled || busy}>
          {busy ? <Loader2 size={14} className={styles.spin} aria-hidden /> : <Play size={14} aria-hidden />} {t('Prova uno strumento', 'Try a tool')}
        </button>
        {props.length > 0 && <button className={`${lab.btn} ${lab.ghost} ${lab.sm}`} onClick={() =>{  setJson(!json) }}>{json ? t('Usa i campi', 'Use fields') : t('Modifica come JSON', 'Edit as JSON')}</button>}
        {busy && <button className={`${lab.btn} ${lab.sm}`} onClick={() => abort.current?.abort()}>{t('Annulla', 'Cancel')}</button>}
      </div>
      {err && <div className={lab.err} role="alert">{err}</div>}
      {result && <pre className={`${lab.pre} ${result.isError ? styles.resErr : ''}`}>{result.text}</pre>}
    </div>
  )
}

function Wire({ s }: { s: McpServerState }) {
  const t = useT()
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const target: { scrollIntoView?: Element['scrollIntoView'] } | null = endRef.current
    target?.scrollIntoView?.({ block: 'nearest' })
  }, [s.wire.length])
  if (s.wire.length === 0) return <p className={lab.muted}>{t('Nessun messaggio scambiato ancora.', 'No messages exchanged yet.')}</p>
  return (
    <div className={styles.wire} role="log" aria-label={t('Messaggi JSON-RPC', 'JSON-RPC messages')}>
      {s.wire.map((w, i) => {
        const m = w.msg
        const label = m.method ?? (m.error ? `${t('errore', 'error')} ${m.error.code}` : `${t('risposta', 'response')} #${String(m.id ?? '')}`)
        return (
          <details key={i} className={styles.wireRow}>
            <summary>
              {w.dir === 'out' ? <ArrowUpRight size={14} aria-label={t('inviato', 'sent')} /> : <ArrowDownLeft size={14} aria-label={t('ricevuto', 'received')} />}
              <code className={lab.mono}>{label}</code>
              <span className={lab.muted}>{new Date(w.at).toLocaleTimeString(dateLocale())}</span>
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
  const t = useT()
  const config = useLab(x => x.config)
  const updateConfig = useLab(x => x.updateConfig)
  const real = s.server.kind === 'real'
  const [consent, setConsent] = useState(false)
  const reduce = useReducedMotion()
  const id = s.server.id
  const exposed = config.mcpServers.includes(id)
  const connected = s.state === 'connected'
  const busy = s.state === 'connecting'
  const setExposed = (on: boolean) =>{
    updateConfig({ mcpServers: on ? [...config.mcpServers.filter(x => x !== id), id] : config.mcpServers.filter(x => x !== id) }) }

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
              {t(
                'Le richieste partono verso un servizio di terzi (ESTERNO). Sola lettura, nessuna credenziale. Ogni chiamata del modello chiederà la tua approvazione. Se il browser blocca la richiesta (CORS o rete), si torna alla simulazione.',
                'Requests are sent to a third-party service (EXTERNAL). Read only, no credentials. Every call from the model will ask for your approval. If the browser blocks the request (CORS or network), it falls back to the simulation.',
              )}
            </span>
            <label className={lab.check}>
              <input type="checkbox" checked={consent} onChange={(e) =>{  setConsent(e.target.checked) }} disabled={connected || busy} />
              {t('Ho capito e acconsento a contattare questo servizio esterno.', 'I understand and agree to contact this external service.')}
            </label>
          </div>
        </div>
      )}

      <div className={lab.row}>
        {connected || busy ? (
          <button className={lab.btn} onClick={() => void mcpHub.disconnect(id)} disabled={busy}>
            <Plug size={16} aria-hidden /> {t('Disconnetti', 'Disconnect')}
          </button>
        ) : (
          <button className={`${lab.btn} ${lab.primary}`} onClick={() => void mcpHub.connect(id)} disabled={real && !consent}>
            {real ? <Globe size={16} aria-hidden /> : <PlugZap size={16} aria-hidden />} {t('Connetti', 'Connect')}
          </button>
        )}
        <label className={lab.switch}>
          <input type="checkbox" checked={exposed} onChange={(e) =>{  setExposed(e.target.checked) }} />
          {t('Esponi al modello', 'Expose to the model')}
        </label>
      </div>
      {exposed && !config.components.mcp && (
        <span className={lab.hint}>{t('Il componente MCP è spento: il modello non vedrà questi strumenti finché non lo accendi.', 'The MCP component is off: the model will not see these tools until you turn it on.')}</span>
      )}
      {s.error && <div className={lab.err} role="alert">{s.error}</div>}

      <Timeline s={s} />
      {(s.protocolVersion || s.serverInfo) && (
        <dl className={lab.dl}>
          {s.protocolVersion && (<><dt>{t('Versione del protocollo', 'Protocol version')}</dt><dd><code className={lab.mono}>{s.protocolVersion}</code></dd></>)}
          {s.serverInfo && (<><dt>Server</dt><dd>{s.serverInfo.name}{s.serverInfo.version ? ` ${s.serverInfo.version}` : ''}</dd></>)}
        </dl>
      )}

      {s.tools.length > 0 && (
        <div className={lab.stack}>
          <div className={styles.sub}>{t('Strumenti scoperti', 'Tools discovered')} ({s.tools.length})</div>
          {s.tools.map(tool => (
            <details key={tool.name} className={styles.tool}>
              <summary><code className={lab.mono}>{tool.name}</code> <span className={lab.muted}>{tool.description}</span></summary>
              <pre className={lab.pre}>{JSON.stringify(tool.inputSchema, null, 2)}</pre>
              <TryTool serverId={id} tool={tool} disabled={!connected} />
            </details>
          ))}
        </div>
      )}

      <details>
        <summary className={styles.sub}>{t('Messaggi JSON-RPC', 'JSON-RPC messages')} ({s.wire.length})</summary>
        <Wire s={s} />
      </details>
    </motion.article>
  )
}

export function McpLab() {
  const t = useT()
  const servers = useServers()
  const simulated = servers.filter(s => s.server.kind === 'simulated')
  const real = servers.filter(s => s.server.kind === 'real')
  return (
    <div>
      <h2 className={lab.h2}>{t('Server MCP', 'MCP servers')}</h2>
      <p className={lab.intro}>
        {t(
          'MCP è un modo standard per collegare strumenti esterni: cambia il cavo, non il cervello. Il sistema scopre da solo gli strumenti del server e li offre al modello come tutti gli altri.',
          'MCP is a standard way to connect external tools: change the cable, not the brain. The system discovers the server’s tools by itself and offers them to the model like all the others.',
        )}
      </p>
      <section className={lab.section} aria-labelledby="mcp-sim">
        <h3 id="mcp-sim" className={lab.h3}>{t('Simulato', 'Simulated')}</h3>
        <div className={lab.stack}>{simulated.map(s => <ServerCard key={s.server.id} s={s} />)}</div>
      </section>
      <section className={lab.section} aria-labelledby="mcp-real">
        <h3 id="mcp-real" className={lab.h3}>{t('Server reali (ESTERNI) — opt-in', 'Real servers (EXTERNAL) — opt-in')}</h3>
        <div className={lab.stack}>{real.map(s => <ServerCard key={s.server.id} s={s} />)}</div>
      </section>
    </div>
  )
}
