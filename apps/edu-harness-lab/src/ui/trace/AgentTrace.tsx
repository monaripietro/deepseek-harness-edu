import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import {
  Brain,
  Calculator,
  ChevronDown,
  Database,
  FileSearch,
  Flag,
  Info,
  Plug,
  PlayCircle,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Wrench,
  XCircle,
  Zap,
} from 'lucide-react'
import type { ComponentFamily, ToolOutcome, TraceEvent } from '../../domain/types'
import { useLab } from '../../state/store'
import { biRecord, useT } from '../../i18n'
import { EVENT_LABEL, STOP_LABEL, TOOL_ERROR_LABEL } from '../common/labels'
import { ProvenanceBadge } from '../common/ProvenanceBadge'
import { Chip } from '../common/Chip'
import { componentText } from '../../i18nContent'
import styles from './AgentTrace.module.css'

type Filter = 'all' | 'model' | 'tools' | 'controls' | 'info'
const FILTERS: Filter[] = ['all', 'model', 'tools', 'controls', 'info']
const FILTER_LABEL = biRecord<Filter>({
  all: ['Tutto', 'All'],
  model: ['Modello', 'Model'],
  tools: ['Strumenti', 'Tools'],
  controls: ['Controlli', 'Controls'],
  info: ['Memoria e documenti', 'Memory and documents'],
})

function familyOf(e: TraceEvent): ComponentFamily {
  const t = e.type
  if (t.startsWith('model/') || t.startsWith('decision/') || t === 'answer') return 'model'
  if (t.startsWith('rag/') || t.startsWith('memory/') || t === 'context/assembled') return 'information'
  if (t.startsWith('tool/') || t.startsWith('mcp/')) return 'action'
  if (t.startsWith('approval/') || t.startsWith('guard/') || t === 'stop') return 'governance'
  return 'orchestration'
}

function filterOf(e: TraceEvent): Filter {
  const t = e.type
  if (t.startsWith('model/') || t.startsWith('decision/') || t === 'answer') return 'model'
  if (t.startsWith('tool/') || t.startsWith('mcp/')) return 'tools'
  if (t.startsWith('approval/') || t.startsWith('guard/') || t === 'stop') return 'controls'
  if (t.startsWith('rag/') || t.startsWith('memory/') || t === 'context/assembled') return 'info'
  return 'all'
}

const ICONS: Partial<Record<string, typeof Brain>> = {
  'run/start': PlayCircle,
  'run/end': Flag,
  'rag/query': FileSearch,
  'rag/results': FileSearch,
  'context/assembled': Sparkles,
  'tool/validation': ShieldCheck,
  'tool/result': Calculator,
  'tool/error': XCircle,
  'approval/asked': ShieldAlert,
  'approval/decided': ShieldCheck,
  'guard/triggered': ShieldAlert,
  stop: Flag,
  answer: Brain,
}

function iconFor(e: TraceEvent) {
  const direct = ICONS[e.type]
  if (direct) return direct
  const fam = familyOf(e)
  if (e.type.startsWith('mcp/')) return Plug
  if (fam === 'information') return Database
  if (fam === 'action') return Wrench
  if (fam === 'model') return Brain
  if (fam === 'governance') return ShieldCheck
  return Zap
}

const compactArgs = (args: Record<string, unknown>) => {
  const s = Object.entries(args)
    .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
    .join(', ')
  return s.length > 90 ? s.slice(0, 89) + '…' : s
}

const clip = (s: string, n = 110) => (s.length > n ? s.slice(0, n - 1) + '…' : s)

function outcomeText(o: ToolOutcome) {
  return o.ok ? clip(o.summary) : `${TOOL_ERROR_LABEL[o.code]}: ${clip(o.message, 90)}`
}

function summarize(e: TraceEvent, t: (it: string, en: string) => string): ReactNode {
  switch (e.type) {
    case 'run/start':
      return `«${clip(e.input, 100)}» · ${e.configLabel}`
    case 'run/end':
      return t(
        `${e.record.steps} ${e.record.steps === 1 ? 'passo' : 'passi'} · ${e.record.toolCalls.length} chiamate a strumenti${e.record.reflections?.length ? ` · ${e.record.reflections.length} riflessioni` : ''}`,
        `${e.record.steps} ${e.record.steps === 1 ? 'step' : 'steps'} · ${e.record.toolCalls.length} tool calls${e.record.reflections?.length ? ` · ${e.record.reflections.length} reflections` : ''}`,
      )
    case 'harness/plugin-mounted':
    case 'harness/plugin-unmounted':
      return componentText(e.component).label
    case 'rag/query':
      return `«${clip(e.query, 90)}»`
    case 'rag/results': {
      const sel = e.hits.filter(h => h.status === 'selected').length
      return t(`${sel} selezionati su ${e.hits.length}`, `${sel} selected of ${e.hits.length}`)
    }
    case 'memory/read':
      return t(`${e.count} ricordi letti`, `${e.count} memories read`)
    case 'memory/select':
    case 'memory/inject':
      return t(`${e.ids.length} ricordi`, `${e.ids.length} memories`)
    case 'memory/ignore':
      return t(`${e.ids.length} ricordi ignorati: ${clip(e.reason, 70)}`, `${e.ids.length} memories ignored: ${clip(e.reason, 70)}`)
    case 'memory/write':
      return `${e.record.key}: ${clip(e.record.text, 80)}`
    case 'memory/delete':
      return e.id
    case 'context/assembled':
      return t(
        `≈ ${e.snapshot.budget.usedTokens} token · ${e.snapshot.items.filter(i => i.status === 'included').length} elementi inclusi`,
        `≈ ${e.snapshot.budget.usedTokens} tokens · ${e.snapshot.items.filter(i => i.status === 'included').length} items included`,
      )
    case 'model/request':
      return t(
        `≈ ${e.tokensIn} token in ingresso · formato ${e.protocol === 'json' ? 'strutturato' : 'testo'}${e.mustAnswer ? ' · deve rispondere' : ''}`,
        `≈ ${e.tokensIn} tokens in input · ${e.protocol === 'json' ? 'structured' : 'text'} format${e.mustAnswer ? ' · must answer' : ''}`,
      )
    case 'model/response':
      return `${(e.durationMs / 1000).toFixed(1)} s${e.tokensOut ? ` · ${e.tokensOut} ${t('token', 'tokens')}` : ''} · ${e.finishReason}`
    case 'decision/parsed': {
      const d = e.decision
      return d.type === 'tool'
        ? t(`Vuole usare ${d.tool}`, `Wants to use ${d.tool}`)
        : d.type === 'answer'
          ? t('Vuole rispondere', 'Wants to answer')
          : d.type === 'reflect'
            ? t(`Riesamina la proposta: ${clip(d.text, 80)}`, `Reviews the proposal: ${clip(d.text, 80)}`)
            : t(`Chiede: ${clip(d.question, 80)}`, `Asks: ${clip(d.question, 80)}`)
    }
    case 'decision/invalid':
      return t(`Tentativo ${e.attempt}: ${clip(e.error, 90)}`, `Attempt ${e.attempt}: ${clip(e.error, 90)}`)
    case 'decision/repair':
      return t(`Tentativo ${e.attempt}`, `Attempt ${e.attempt}`)
    case 'tool/call':
    case 'mcp/call':
      return (
        <>
          <b>{e.tool}</b>({compactArgs(e.args)})
        </>
      )
    case 'tool/validation':
      return e.ok ? t(`${e.tool}: argomenti validi`, `${e.tool}: valid arguments`) : `${e.tool}: ${clip((e.errors ?? []).join('; '), 90)}`
    case 'tool/execute':
      return e.viaMcp ? `${e.tool} via MCP (${e.viaMcp})` : e.tool
    case 'tool/result':
      return outcomeText(e.outcome)
    case 'tool/error':
      return `${TOOL_ERROR_LABEL[e.code]}: ${clip(e.message, 90)}`
    case 'approval/asked':
      return `${e.request.toolTitle} (${e.request.toolId})`
    case 'approval/decided':
    {
      const verb = e.outcome === 'allowed-once' ? t('Approvata', 'Approved') : e.outcome === 'rejected' ? t('Rifiutata', 'Rejected') : t('Annullata', 'Cancelled')
      const who = e.by === 'human' ? t('una persona', 'a person') : t("l'insegnante", 'the teacher')
      return t(`${verb} da ${who}`, `${verb} by ${who}`)
    }
    case 'mcp/discover':
    case 'mcp/disconnect':
      return e.serverId
    case 'mcp/connect':
      return `${e.serverId}${e.protocolVersion ? ` · ${t('protocollo', 'protocol')} ${e.protocolVersion}` : ''}`
    case 'mcp/list-tools':
      return `${e.serverId}: ${e.tools.length} ${t('strumenti', 'tools')}`
    case 'mcp/result':
      return `${e.isError ? t('Errore: ', 'Error: ') : ''}${clip(e.text)}`
    case 'mcp/error':
      return `${e.serverId}: ${clip(e.message)}`
    case 'guard/triggered':
      return e.message
    case 'answer':
      return clip(e.text)
    case 'stop':
      return <span className={styles.stop}>{STOP_LABEL[e.reason]}</span>
    default:
      return null
  }
}

const fmtOffset = (ms: number) => `+${(Math.max(ms, 0) / 1000).toFixed(2)} s`

export function AgentTrace() {
  const t = useT()
  const events = useLab(s => s.events)
  const runId = useLab(s => s.currentRunId)
  const reduce = useReducedMotion()
  const [filter, setFilter] = useState<Filter>('all')
  const scroller = useRef<HTMLDivElement>(null)
  const stick = useRef(true)

  const { rows, count } = useMemo(() => {
    const runEvents = events.filter(e => e.runId === runId)
    const first = runEvents[0]
    const t0 = first?.at ?? 0
    const out: ({ kind: 'sep'; e: TraceEvent } | { kind: 'step'; n: number } | { kind: 'ev'; e: TraceEvent; off: number })[] = []
    // Separators: harness events since the previous run ended, up to the end.
    const startSeq = first?.seq ?? -1
    const prev = events.filter(e => e.runId !== runId && e.runId !== 'harness' && e.runId !== 'lab' && e.seq < startSeq)
    const lastPrevSeq = prev.at(-1)?.seq ?? -1
    for (const e of events) {
      if (e.type === 'harness/plugin-mounted' || e.type === 'harness/plugin-unmounted') {
        if (e.seq > lastPrevSeq) out.push({ kind: 'sep', e })
        continue
      }
      if (e.runId !== runId) continue
      if (e.type === 'step/start') {
        out.push({ kind: 'step', n: e.stepIndex + 1 })
        continue
      }
      if (e.type === 'step/end') continue
      if (filter !== 'all' && filterOf(e) !== filter && e.type !== 'run/start') continue
      out.push({ kind: 'ev', e, off: e.at - t0 })
    }
    return { rows: out, count: runEvents.length }
  }, [events, runId, filter])

  // A new run or a reset starts a fresh list: follow it from the top again.
  useEffect(() => {
    stick.current = true
  }, [runId])

  useEffect(() => {
    const el = scroller.current
    if (el && stick.current) el.scrollTo({ top: el.scrollHeight, behavior: reduce ? 'auto' : 'smooth' })
  }, [rows.length, reduce])

  const onScroll = () => {
    const el = scroller.current
    if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48
  }

  return (
    <section className={styles.root} aria-label={t('Registro degli eventi', 'Event log')}>
      <header className={styles.head}>
        <h2 className={styles.title}>{t('REGISTRO DEGLI EVENTI', 'EVENT LOG')}</h2>
        <div className={styles.filters} role="group" aria-label={t('Filtra eventi', 'Filter events')}>
          {FILTERS.map(f => (
            <Chip key={f} selected={filter === f} color="var(--c-model)" onClick={() =>{  setFilter(f) }}>
              {FILTER_LABEL[f]}
            </Chip>
          ))}
        </div>
      </header>
      <p className={styles.banner}>
        <Info size={18} aria-hidden />
        {t('Solo eventi osservabili: nessun ragionamento interno del modello.', 'Observable events only: no internal reasoning from the model.')}
      </p>

      <div className={styles.scroll} ref={scroller} onScroll={onScroll}>
        {count === 0 ? (
          <div className={styles.empty}>{t('Nessun evento ancora. Invia una richiesta per vedere cosa succede, passo dopo passo.', 'No events yet. Send a request to see what happens, step by step.')}</div>
        ) : (
          <ol className={styles.list}>
            {rows.map((r, i) => {
              if (r.kind === 'step')
                return (
                  <li key={`s${r.n}-${i}`} className={styles.step}>
                    {t('PASSO', 'STEP')} {r.n}
                  </li>
                )
              if (r.kind === 'sep')
                return (
                  <li key={r.e.id} className={styles.sep}>
                    {r.e.type === 'harness/plugin-mounted' ? '+' : '−'} {componentText((r.e as Extract<TraceEvent, { type: 'harness/plugin-mounted' }>).component).label}
                  </li>
                )
              return <EventRow key={r.e.id} e={r.e} off={r.off} reduce={!!reduce} />
            })}
          </ol>
        )}
      </div>
    </section>
  )
}

function EventRow({ e, off, reduce }: { e: TraceEvent; off: number; reduce: boolean }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const fam = familyOf(e)
  const Icon = iconFor(e)
  const showProv = e.type.startsWith('model/') || e.type.startsWith('tool/') || e.type.startsWith('mcp/')
  const isStop = e.type === 'stop'
  return (
    <motion.li
      className={`${styles.row} ${isStop ? styles.stopRow : ''}`}
      style={{ '--fam': `var(--c-${fam})`, '--fam-soft': `var(--c-${fam}-soft)` } as React.CSSProperties}
      initial={reduce ? false : { opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.22 }}
    >
      <span className={styles.icon} aria-hidden>
        <Icon size={20} />
      </span>
      <div className={styles.body}>
        <button type="button" className={styles.line} aria-expanded={open} onClick={() =>{  setOpen(v => !v) }}>
          <span className={styles.top}>
            <span className={styles.label}>{EVENT_LABEL[e.type]}</span>
            <span className={styles.time}>{fmtOffset(off)}</span>
            {showProv && <ProvenanceBadge tag={e.provenance} compact />}
            <ChevronDown size={16} className={open ? styles.rot : ''} aria-hidden />
          </span>
          <span className={styles.summary}>{summarize(e, t)}</span>
        </button>
        {open && <pre className={styles.json}>{JSON.stringify(e, null, 2)}</pre>}
      </div>
    </motion.li>
  )
}
