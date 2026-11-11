import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { AlertTriangle, Code2, Eye, FlaskConical, Plus, ShieldAlert, ShieldCheck, Trash2, Wand2 } from 'lucide-react'
import type { ApprovalPolicy, CustomToolSpec, Permission, ToolDefinition, ToolRisk } from '../../domain/types'
import { registry, useLab } from '../../state/store'
import { ProvenanceBadge } from '../common/ProvenanceBadge'
import { TOOL_ERROR_LABEL } from '../common/labels'
import { biRecord, useT } from '../../i18n'
import { toolText } from '../../i18nContent'
import styles from './ToolLab.module.css'
import lab from './lab.module.css'

const RISK_ICON = {
  read: { Icon: Eye, cls: lab.chipOk },
  write: { Icon: ShieldAlert, cls: lab.chipWarn },
  irreversible: { Icon: AlertTriangle, cls: lab.chipDanger },
} as const

const RISK_LABEL = biRecord<ToolRisk>({
  read: ['Sola lettura', 'Read only'],
  write: ['Scrive dati', 'Writes data'],
  irreversible: ['Irreversibile', 'Irreversible'],
})

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
  const t = useT()
  const [schema, setSchema] = useState(false)
  const risk = RISK_ICON[tool.risk]
  const text = toolText(tool)
  const params = paramsOf(tool.inputSchema)
  return (
    <motion.article layout className={lab.card} aria-label={text.title}>
      <div className={lab.spread}>
        <code className={styles.name}>{tool.id}</code>
        <ProvenanceBadge tag={tool.provenance} compact />
      </div>
      <h3 className={styles.title}>{text.title}</h3>
      <p className={lab.muted}><strong>{t('Come la legge il modello:', 'How the model reads it:')}</strong> {tool.description}</p>
      <p className={lab.muted}><strong>{t('A cosa serve:', 'What it is for:')}</strong> {text.purpose}</p>
      <div>
        <div className={styles.sub}>{t('Parametri', 'Parameters')}</div>
        {params.length === 0 ? <span className={lab.muted}>{t('Nessun parametro.', 'No parameters.')}</span> : (
          <ul className={lab.paramList}>
            {params.map(p => (
              <li key={p.name}>
                <code className={lab.mono}>{p.name}</code> <span className={lab.muted}>· {p.type} · {p.required ? t('obbligatorio', 'required') : t('facoltativo', 'optional')}</span>
                {p.description && <div className={lab.muted}>{p.description}</div>}
              </li>
            ))}
          </ul>
        )}
        <button className={`${lab.btn} ${lab.ghost} ${lab.sm}`} onClick={() =>{  setSchema(v => !v) }} aria-expanded={schema}>
          <Code2 size={14} aria-hidden /> {schema ? t('Nascondi schema JSON', 'Hide JSON schema') : t('Mostra schema JSON', 'Show JSON schema')}
        </button>
        {schema && <pre className={lab.pre}>{JSON.stringify(tool.inputSchema, null, 2)}</pre>}
      </div>
      <p className={lab.muted}><strong>{t('Restituisce:', 'Returns:')}</strong> {text.output}</p>
      <div className={lab.row}>
        <span className={`${lab.chip} ${risk.cls}`}><risk.Icon size={13} aria-hidden /> {RISK_LABEL[tool.risk]}</span>
        <span className={lab.chip}>{tool.approval === 'always' ? <ShieldCheck size={13} aria-hidden /> : null}{t('Approvazione:', 'Approval:')} {tool.approval === 'always' ? t('sempre', 'always') : t('non richiesta', 'not required')}</span>
        {tool.permissions.map(p => <span key={p} className={`${lab.chip} ${lab.mono}`}>{p}</span>)}
      </div>
      {tool.errors.length > 0 && (
        <details>
          <summary className={lab.muted}>{t('Errori possibili', 'Possible errors')} ({tool.errors.length})</summary>
          <ul className={lab.paramList}>
            {tool.errors.map((e, i) => <li key={i} className={lab.muted}><strong>{TOOL_ERROR_LABEL[e.code]}</strong>: {e.message}</li>)}
          </ul>
        </details>
      )}
      <div className={lab.spread}>
        <label className={lab.switch}>
          <input type="checkbox" checked={enabled} onChange={(e) =>{  onToggle(e.target.checked) }} />
          {t('Disponibile per il modello', 'Available to the model')}
        </label>
        {onRemove && <button className={`${lab.btn} ${lab.danger} ${lab.sm}`} onClick={onRemove}><Trash2 size={14} aria-hidden /> {t('Rimuovi', 'Remove')}</button>}
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
  const t = useT()
  const addCustomTool = useLab(s => s.addCustomTool)
  const existing = useLab(s => s.customTools)
  const [id, setId] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [purpose, setPurpose] = useState('')
  const [params, setParams] = useState<CustomToolSpec['params']>([])
  const [tpl, setTpl] = useState(() => t('Operazione simulata completata.', 'Simulated operation completed.'))
  const [errorRate, setErrorRate] = useState(0)
  const [errorMessage, setErrorMessage] = useState(() => t('Servizio simulato momentaneamente non disponibile.', 'Simulated service temporarily unavailable.'))
  const [lmin, setLmin] = useState(200)
  const [lmax, setLmax] = useState(600)
  const [perms, setPerms] = useState<Permission[]>([])
  const [risk, setRisk] = useState<ToolRisk>('read')
  const [approval, setApproval] = useState<ApprovalPolicy>('never')

  const idOk = /^[a-z][a-z0-9_]{2,39}$/.test(id)
  const idTaken = registry.get(id) !== undefined && !existing.some(x => x.id === id)
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
    setId(''); setTitle(''); setDescription(''); setPurpose(''); setParams([]); setTpl(t('Operazione simulata completata.', 'Simulated operation completed.'))
  }

  return (
    <form className={lab.card} onSubmit={submit} aria-labelledby="custom-tool-h">
      <h3 id="custom-tool-h" className={lab.h3}><Wand2 size={20} aria-hidden /> {t('Crea uno strumento simulato', 'Create a simulated tool')}</h3>
      <div className={`${lab.callout} ${lab.warn}`}>
        <FlaskConical size={20} aria-hidden />
        <span>
          {t('Uno strumento creato qui è', 'A tool created here is')} <strong>{t('SIMULATO', 'SIMULATED')}</strong>: {t('nessun codice viene eseguito,', 'no code is run;')}
          {' '}{t('il sistema compila soltanto il modello di risposta con i valori ricevuti.', 'the system only fills in the response template with the values it receives.')}
        </span>
      </div>
      <div className={lab.formGrid}>
        <label className={lab.label}>{t('Identificativo (snake_case)', 'Identifier (snake_case)')}
          <input className={lab.input} value={id} onChange={(e) =>{  setId(e.target.value) }} placeholder={t('stato_spedizione', 'shipping_status')} aria-invalid={id !== '' && (!idOk || idTaken)} />
          {id !== '' && !idOk && <span className={lab.err}>{t('Usa minuscole, numeri e _ (3–40 caratteri, inizia con una lettera).', 'Use lowercase letters, numbers and _ (3–40 characters, starting with a letter).')}</span>}
          {idTaken && <span className={lab.err}>{t('Esiste già uno strumento con questo nome.', 'A tool with this name already exists.')}</span>}
        </label>
        <label className={lab.label}>{t('Titolo', 'Title')}
          <input className={lab.input} value={title} onChange={(e) =>{  setTitle(e.target.value) }} placeholder={t('Stato della spedizione', 'Shipping status')} />
        </label>
      </div>
      <label className={lab.label}>
        {t('Descrizione per il modello', 'Description for the model')} <span className={lab.hint}>{t('Il modello sceglie lo strumento leggendo solo questa frase.', 'The model chooses the tool by reading only this sentence.')}</span>
        <textarea className={lab.textarea} value={description} onChange={(e) =>{  setDescription(e.target.value) }} />
      </label>
      <label className={lab.label}>{t('Scopo per le persone', 'Purpose for people')}
        <input className={lab.input} value={purpose} onChange={(e) =>{  setPurpose(e.target.value) }} />
      </label>

      <fieldset className={styles.fieldset}>
        <legend>{t('Parametri', 'Parameters')}</legend>
        {params.map((p, i) => (
          <div key={i} className={styles.paramRow}>
            <input className={lab.input} aria-label={t('Nome parametro', 'Parameter name')} placeholder={t('nome', 'name')} value={p.name} onChange={(e) =>{  setParam(i, { name: e.target.value }) }} />
            <select className={lab.select} aria-label={t('Tipo', 'Type')} value={p.type} onChange={(e) =>{  setParam(i, { type: e.target.value as CustomToolSpec['params'][number]['type'] }) }}>
              <option value="string">{t('testo', 'text')}</option><option value="number">{t('numero', 'number')}</option><option value="integer">{t('intero', 'integer')}</option><option value="boolean">{t('sì/no', 'yes/no')}</option>
            </select>
            <label className={lab.check}><input type="checkbox" checked={p.required} onChange={(e) =>{  setParam(i, { required: e.target.checked }) }} />{t('obbligatorio', 'required')}</label>
            <input className={lab.input} aria-label={t('Descrizione parametro', 'Parameter description')} placeholder={t('descrizione', 'description')} value={p.description} onChange={(e) =>{  setParam(i, { description: e.target.value }) }} />
            <button type="button" className={`${lab.btn} ${lab.ghost}`} aria-label={t('Rimuovi parametro', 'Remove parameter')} onClick={() =>{  setParams(params.filter((_, j) => j !== i)) }}><Trash2 size={16} aria-hidden /></button>
          </div>
        ))}
        {!paramsOk && <span className={lab.err}>{t('I nomi dei parametri devono essere unici, in minuscolo e con _.', 'Parameter names must be unique, in lowercase, and may use _.')}</span>}
        <div><button type="button" className={`${lab.btn} ${lab.sm}`} onClick={() =>{  setParams([...params, { name: '', type: 'string', description: '', required: true }]) }}><Plus size={14} aria-hidden /> {t('Aggiungi parametro', 'Add parameter')}</button></div>
      </fieldset>

      <label className={lab.label}>{t('Risposta (usa {{nome_parametro}})', 'Response (use {{parameter_name}})')}
        <textarea className={lab.textarea} value={tpl} onChange={(e) =>{  setTpl(e.target.value) }} />
      </label>
      <div>
        <div className={styles.sub}>{t('Anteprima con valori di esempio', 'Preview with sample values')}</div>
        <pre className={lab.pre} aria-live="polite">{preview}</pre>
      </div>

      <div className={lab.formGrid}>
        <label className={lab.label}>{t('Probabilità di errore:', 'Error probability:')} {errorRate}%
          <input type="range" min={0} max={100} step={5} value={errorRate} onChange={(e) =>{  setErrorRate(Number(e.target.value)) }} />
        </label>
        <label className={lab.label}>{t('Messaggio di errore', 'Error message')}
          <input className={lab.input} value={errorMessage} onChange={(e) =>{  setErrorMessage(e.target.value) }} />
        </label>
        <label className={lab.label}>{t('Latenza minima (ms)', 'Minimum latency (ms)')}
          <input className={lab.input} type="number" min={0} value={lmin} onChange={(e) =>{  setLmin(Number(e.target.value)) }} />
        </label>
        <label className={lab.label}>{t('Latenza massima (ms)', 'Maximum latency (ms)')}
          <input className={lab.input} type="number" min={0} value={lmax} onChange={(e) =>{  setLmax(Number(e.target.value)) }} />
        </label>
        <label className={lab.label}>{t('Rischio', 'Risk')}
          <select className={lab.select} value={risk} onChange={(e) =>{  setRisk(e.target.value as ToolRisk) }}>
            <option value="read">{RISK_LABEL.read}</option><option value="write">{RISK_LABEL.write}</option><option value="irreversible">{RISK_LABEL.irreversible}</option>
          </select>
        </label>
        <label className={lab.label}>{t('Approvazione', 'Approval')}
          <select className={lab.select} value={approval} onChange={(e) =>{  setApproval(e.target.value as ApprovalPolicy) }}>
            <option value="never">{t('Non richiesta', 'Not required')}</option><option value="always">{t('Sempre richiesta', 'Always required')}</option>
          </select>
        </label>
      </div>
      <fieldset className={styles.fieldset}>
        <legend>{t('Permessi richiesti', 'Required permissions')}</legend>
        <div className={lab.row}>
          {PERMISSIONS.map(p => (
            <label key={p} className={`${lab.chip} ${styles.permChip}`}>
              <input type="checkbox" checked={perms.includes(p)} onChange={(e) =>{  setPerms(e.target.checked ? [...perms, p] : perms.filter(x => x !== p)) }} />
              <span className={lab.mono}>{p}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div><button type="submit" className={`${lab.btn} ${lab.primary}`} disabled={!valid}><Plus size={16} aria-hidden /> {t('Aggiungi lo strumento', 'Add the tool')}</button></div>
    </form>
  )
}

export function ToolLab() {
  const t = useT()
  const config = useLab(s => s.config)
  const customTools = useLab(s => s.customTools)
  const updateConfig = useLab(s => s.updateConfig)
  const removeCustomTool = useLab(s => s.removeCustomTool)
  const tools = useMemo(() => registry.list().filter(tool => tool.source !== 'mcp'), [customTools])
  const toolsOn = config.components.tools

  const toggle = (id: string, on: boolean) =>{
    updateConfig({ enabledTools: on ? [...config.enabledTools.filter(x => x !== id), id] : config.enabledTools.filter(x => x !== id) }) }

  return (
    <div>
      <h2 className={lab.h2}>{t('Strumenti', 'Tools')}</h2>
      <p className={lab.intro}>
        {t(
          'Uno strumento è una funzione che il sistema esegue quando il modello la chiede. Il modello vede solo nome, descrizione e parametri: leggi qui la scheda esatta che riceve.',
          'A tool is a function the system runs when the model asks for it. The model only sees the name, description and parameters: read here the exact card it receives.',
        )}
      </p>
      {!toolsOn && (
        <div className={`${lab.callout} ${lab.warn}`} style={{ marginBottom: 'var(--sp-5)' }}>
          <AlertTriangle size={20} aria-hidden />
          <span>
            {t('Il componente', 'The')} <strong>{t('Strumenti', 'Tools')}</strong> {t('è spento: il modello non vede nessuno strumento,', 'component is off: the model sees no tools,')}
            {' '}{t('anche se qui risultano disponibili.', 'even though they are listed here as available.')}
          </span>
        </div>
      )}
      <div className={lab.cards}>
        <AnimatePresence initial={false}>
          {tools.map(tool => (
            <ToolCard key={tool.id} tool={tool} enabled={config.enabledTools.includes(tool.id)} onToggle={(on) =>{  toggle(tool.id, on) }}
              onRemove={tool.source === 'custom' ? () =>{  removeCustomTool(tool.id) } : undefined} />
          ))}
        </AnimatePresence>
      </div>
      <div className={styles.formWrap}><CustomToolForm /></div>
    </div>
  )
}
