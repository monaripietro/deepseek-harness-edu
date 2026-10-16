import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { AlertTriangle, Code2, Eye, FlaskConical, Plus, ShieldAlert, ShieldCheck, Trash2, Wand2 } from 'lucide-react'
import type { ApprovalPolicy, CustomToolSpec, Permission, ToolDefinition, ToolRisk } from '../../domain/types'
import { registry, useLab } from '../../state/store'
import { ProvenanceBadge } from '../common/ProvenanceBadge'
import { TOOL_ERROR_LABEL } from '../common/labels'
import styles from './ToolLab.module.css'
import lab from './lab.module.css'

const RISK = {
  read: { label: 'Sola lettura', Icon: Eye, cls: lab.chipOk },
  write: { label: 'Scrive dati', Icon: ShieldAlert, cls: lab.chipWarn },
  irreversible: { label: 'Irreversibile', Icon: AlertTriangle, cls: lab.chipDanger },
} as const

const PERMISSIONS: Permission[] = [
  'read:policies', 'read:catalog', 'read:inventory', 'read:budget', 'read:customers',
  'write:tasks', 'write:requests', 'write:data', 'send:messages', 'use:sensitive', 'network:mcp',
]

interface ParamRow { name: string; type: string; required: boolean; description: string }

function paramsOf(schema: Record<string, unknown>): ParamRow[] {
  const props = (schema.properties ?? {}) as Record<string, Record<string, unknown>>
  const req = Array.isArray(schema.required) ? (schema.required as string[]) : []
  return Object.entries(props).map(([name, p]) => ({
    name,
    type: (typeof p.type === 'string' ? p.type : Array.isArray(p.type) ? p.type.join(',') : 'any') +
      (p.enum ? ` (${(p.enum as unknown[]).join(' | ')})` : ''),
    required: req.includes(name),
    description: typeof p.description === 'string' ? p.description : '',
  }))
}

interface ToolCardProps { tool: ToolDefinition; enabled: boolean; onToggle: (on: boolean) => void; onRemove?: () => void }

function ToolCard({ tool, enabled, onToggle, onRemove }: ToolCardProps) {
  const [schema, setSchema] = useState(false)
  const risk = RISK[tool.risk]
  const params = paramsOf(tool.inputSchema)
  return (
    <motion.article layout className={lab.card} aria-label={tool.title}>
      <div className={lab.spread}>
        <code className={styles.name}>{tool.id}</code>
        <ProvenanceBadge tag={tool.provenance} compact />
      </div>
      <h3 className={styles.title}>{tool.title}</h3>
      <p className={lab.muted}><strong>Come la legge il modello:</strong> {tool.description}</p>
      <p className={lab.muted}><strong>A cosa serve:</strong> {tool.purpose}</p>
      <div>
        <div className={styles.sub}>Parametri</div>
        {params.length === 0 ? <span className={lab.muted}>Nessun parametro.</span> : (
          <ul className={lab.paramList}>
            {params.map(p => (
              <li key={p.name}>
                <code className={lab.mono}>{p.name}</code> <span className={lab.muted}>· {p.type} · {p.required ? 'obbligatorio' : 'facoltativo'}</span>
                {p.description && <div className={lab.muted}>{p.description}</div>}
              </li>
            ))}
          </ul>
        )}
        <button className={`${lab.btn} ${lab.ghost} ${lab.sm}`} onClick={() =>{  setSchema(v => !v) }} aria-expanded={schema}>
          <Code2 size={14} aria-hidden /> {schema ? 'Nascondi schema JSON' : 'Mostra schema JSON'}
        </button>
        {schema && <pre className={lab.pre}>{JSON.stringify(tool.inputSchema, null, 2)}</pre>}
      </div>
      <p className={lab.muted}><strong>Restituisce:</strong> {tool.output}</p>
      <div className={lab.row}>
        <span className={`${lab.chip} ${risk.cls}`}><risk.Icon size={13} aria-hidden /> {risk.label}</span>
        <span className={lab.chip}>{tool.approval === 'always' ? <ShieldCheck size={13} aria-hidden /> : null}Approvazione: {tool.approval === 'always' ? 'sempre' : 'non richiesta'}</span>
        {tool.permissions.map(p => <span key={p} className={`${lab.chip} ${lab.mono}`}>{p}</span>)}
      </div>
      {tool.errors.length > 0 && (
        <details>
          <summary className={lab.muted}>Errori possibili ({tool.errors.length})</summary>
          <ul className={lab.paramList}>
            {tool.errors.map((e, i) => <li key={i} className={lab.muted}><strong>{TOOL_ERROR_LABEL[e.code]}</strong>: {e.message}</li>)}
          </ul>
        </details>
      )}
      <div className={lab.spread}>
        <label className={lab.switch}>
          <input type="checkbox" checked={enabled} onChange={(e) =>{  onToggle(e.target.checked) }} />
          Disponibile per il modello
        </label>
        {onRemove && <button className={`${lab.btn} ${lab.danger} ${lab.sm}`} onClick={onRemove}><Trash2 size={14} aria-hidden /> Rimuovi</button>}
      </div>
    </motion.article>
  )
}

const SAMPLE = { string: 'esempio', number: '42.5', integer: '3', boolean: 'true' } as const

function renderTemplate(tpl: string, params: CustomToolSpec['params']): string {
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, n: string) => {
    const p = params.find(x => x.name === n)
    return p ? SAMPLE[p.type] : `⟨${n}?⟩`
  })
}

function CustomToolForm() {
  const addCustomTool = useLab(s => s.addCustomTool)
  const existing = useLab(s => s.customTools)
  const [id, setId] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [purpose, setPurpose] = useState('')
  const [params, setParams] = useState<CustomToolSpec['params']>([])
  const [tpl, setTpl] = useState('Operazione simulata completata.')
  const [errorRate, setErrorRate] = useState(0)
  const [errorMessage, setErrorMessage] = useState('Servizio simulato momentaneamente non disponibile.')
  const [lmin, setLmin] = useState(200)
  const [lmax, setLmax] = useState(600)
  const [perms, setPerms] = useState<Permission[]>([])
  const [risk, setRisk] = useState<ToolRisk>('read')
  const [approval, setApproval] = useState<ApprovalPolicy>('never')

  const idOk = /^[a-z][a-z0-9_]{2,39}$/.test(id)
  const idTaken = registry.get(id) !== undefined && !existing.some(t => t.id === id)
  const names = params.map(p => p.name)
  const paramsOk = params.every((p, i) => /^[a-z][a-z0-9_]*$/.test(p.name) && names.indexOf(p.name) === i)
  const valid = idOk && !idTaken && title.trim() !== '' && description.trim() !== '' && paramsOk && lmin <= lmax
  const preview = useMemo(() => renderTemplate(tpl, params), [tpl, params])

  const setParam = (i: number, patch: Partial<CustomToolSpec['params'][number]>) =>{  setParams(params.map((p, j) => (j === i ? { ...p, ...patch } : p))) }

  const submit = (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!valid) return
    addCustomTool({
      id, title: title.trim(), description: description.trim(), purpose: purpose.trim() || description.trim(), params,
      outputTemplate: tpl, errorRate: errorRate / 100, errorMessage, latencyMs: [lmin, lmax], permissions: perms, risk, approval,
    })
    setId(''); setTitle(''); setDescription(''); setPurpose(''); setParams([]); setTpl('Operazione simulata completata.')
  }

  return (
    <form className={lab.card} onSubmit={submit} aria-labelledby="custom-tool-h">
      <h3 id="custom-tool-h" className={lab.h3}><Wand2 size={20} aria-hidden /> Crea uno strumento simulato</h3>
      <div className={`${lab.callout} ${lab.warn}`}>
        <FlaskConical size={20} aria-hidden />
        <span>
          Uno strumento creato qui è <strong>SIMULATO</strong>: nessun codice viene eseguito,
          il sistema compila soltanto il modello di risposta con i valori ricevuti.
        </span>
      </div>
      <div className={lab.formGrid}>
        <label className={lab.label}>Identificativo (snake_case)
          <input className={lab.input} value={id} onChange={(e) =>{  setId(e.target.value) }} placeholder="stato_spedizione" aria-invalid={id !== '' && (!idOk || idTaken)} />
          {id !== '' && !idOk && <span className={lab.err}>Usa minuscole, numeri e _ (3–40 caratteri, inizia con una lettera).</span>}
          {idTaken && <span className={lab.err}>Esiste già uno strumento con questo nome.</span>}
        </label>
        <label className={lab.label}>Titolo
          <input className={lab.input} value={title} onChange={(e) =>{  setTitle(e.target.value) }} placeholder="Stato della spedizione" />
        </label>
      </div>
      <label className={lab.label}>
        Descrizione per il modello <span className={lab.hint}>Il modello sceglie lo strumento leggendo solo questa frase.</span>
        <textarea className={lab.textarea} value={description} onChange={(e) =>{  setDescription(e.target.value) }} />
      </label>
      <label className={lab.label}>Scopo per le persone
        <input className={lab.input} value={purpose} onChange={(e) =>{  setPurpose(e.target.value) }} />
      </label>

      <fieldset className={styles.fieldset}>
        <legend>Parametri</legend>
        {params.map((p, i) => (
          <div key={i} className={styles.paramRow}>
            <input className={lab.input} aria-label="Nome parametro" placeholder="nome" value={p.name} onChange={(e) =>{  setParam(i, { name: e.target.value }) }} />
            <select className={lab.select} aria-label="Tipo" value={p.type} onChange={(e) =>{  setParam(i, { type: e.target.value as CustomToolSpec['params'][number]['type'] }) }}>
              <option value="string">testo</option><option value="number">numero</option><option value="integer">intero</option><option value="boolean">sì/no</option>
            </select>
            <label className={lab.check}><input type="checkbox" checked={p.required} onChange={(e) =>{  setParam(i, { required: e.target.checked }) }} />obbligatorio</label>
            <input className={lab.input} aria-label="Descrizione parametro" placeholder="descrizione" value={p.description} onChange={(e) =>{  setParam(i, { description: e.target.value }) }} />
            <button type="button" className={`${lab.btn} ${lab.ghost}`} aria-label="Rimuovi parametro" onClick={() =>{  setParams(params.filter((_, j) => j !== i)) }}><Trash2 size={16} aria-hidden /></button>
          </div>
        ))}
        {!paramsOk && <span className={lab.err}>I nomi dei parametri devono essere unici, in minuscolo e con _.</span>}
        <div><button type="button" className={`${lab.btn} ${lab.sm}`} onClick={() =>{  setParams([...params, { name: '', type: 'string', description: '', required: true }]) }}><Plus size={14} aria-hidden /> Aggiungi parametro</button></div>
      </fieldset>

      <label className={lab.label}>Risposta (usa {'{{nome_parametro}}'})
        <textarea className={lab.textarea} value={tpl} onChange={(e) =>{  setTpl(e.target.value) }} />
      </label>
      <div>
        <div className={styles.sub}>Anteprima con valori di esempio</div>
        <pre className={lab.pre} aria-live="polite">{preview}</pre>
      </div>

      <div className={lab.formGrid}>
        <label className={lab.label}>Probabilità di errore: {errorRate}%
          <input type="range" min={0} max={100} step={5} value={errorRate} onChange={(e) =>{  setErrorRate(Number(e.target.value)) }} />
        </label>
        <label className={lab.label}>Messaggio di errore
          <input className={lab.input} value={errorMessage} onChange={(e) =>{  setErrorMessage(e.target.value) }} />
        </label>
        <label className={lab.label}>Latenza minima (ms)
          <input className={lab.input} type="number" min={0} value={lmin} onChange={(e) =>{  setLmin(Number(e.target.value)) }} />
        </label>
        <label className={lab.label}>Latenza massima (ms)
          <input className={lab.input} type="number" min={0} value={lmax} onChange={(e) =>{  setLmax(Number(e.target.value)) }} />
        </label>
        <label className={lab.label}>Rischio
          <select className={lab.select} value={risk} onChange={(e) =>{  setRisk(e.target.value as ToolRisk) }}>
            <option value="read">Sola lettura</option><option value="write">Scrive dati</option><option value="irreversible">Irreversibile</option>
          </select>
        </label>
        <label className={lab.label}>Approvazione
          <select className={lab.select} value={approval} onChange={(e) =>{  setApproval(e.target.value as ApprovalPolicy) }}>
            <option value="never">Non richiesta</option><option value="always">Sempre richiesta</option>
          </select>
        </label>
      </div>
      <fieldset className={styles.fieldset}>
        <legend>Permessi richiesti</legend>
        <div className={lab.row}>
          {PERMISSIONS.map(p => (
            <label key={p} className={`${lab.chip} ${styles.permChip}`}>
              <input type="checkbox" checked={perms.includes(p)} onChange={(e) =>{  setPerms(e.target.checked ? [...perms, p] : perms.filter(x => x !== p)) }} />
              <span className={lab.mono}>{p}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div><button type="submit" className={`${lab.btn} ${lab.primary}`} disabled={!valid}><Plus size={16} aria-hidden /> Aggiungi lo strumento</button></div>
    </form>
  )
}

export function ToolLab() {
  const config = useLab(s => s.config)
  const customTools = useLab(s => s.customTools)
  const updateConfig = useLab(s => s.updateConfig)
  const removeCustomTool = useLab(s => s.removeCustomTool)
  const tools = useMemo(() => registry.list().filter(t => t.source !== 'mcp'), [customTools])
  const toolsOn = config.components.tools

  const toggle = (id: string, on: boolean) =>{
    updateConfig({ enabledTools: on ? [...config.enabledTools.filter(t => t !== id), id] : config.enabledTools.filter(t => t !== id) }) }

  return (
    <div>
      <h2 className={lab.h2}>Strumenti</h2>
      <p className={lab.intro}>
        Uno strumento è una funzione che il sistema esegue quando il modello la chiede.
        Il modello vede solo nome, descrizione e parametri: leggi qui la scheda esatta che riceve.
      </p>
      {!toolsOn && (
        <div className={`${lab.callout} ${lab.warn}`} style={{ marginBottom: 'var(--sp-5)' }}>
          <AlertTriangle size={20} aria-hidden />
          <span>
            Il componente <strong>Strumenti</strong> è spento: il modello non vede nessuno strumento,
            anche se qui risultano disponibili.
          </span>
        </div>
      )}
      <div className={lab.cards}>
        <AnimatePresence initial={false}>
          {tools.map(t => (
            <ToolCard key={t.id} tool={t} enabled={config.enabledTools.includes(t.id)} onToggle={(on) =>{  toggle(t.id, on) }}
              onRemove={t.source === 'custom' ? () =>{  removeCustomTool(t.id) } : undefined} />
          ))}
        </AnimatePresence>
      </div>
      <div className={styles.formWrap}><CustomToolForm /></div>
    </div>
  )
}
