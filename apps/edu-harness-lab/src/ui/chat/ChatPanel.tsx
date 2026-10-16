import { useEffect, useMemo, useRef } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { MessageSquareText, Timer } from 'lucide-react'
import { useLab } from '../../state/store'
import type { ChatEntry } from '../../state/store'
import { STOP_LABEL } from '../common/labels'
import { ProvenanceBadge } from '../common/ProvenanceBadge'
import { Chip } from '../common/Chip'
import { Markdown } from '../common/Markdown'
import { ModelActivityNote, ReasoningDisclosure, useLiveReasoning, useStreamedProse } from '../model/ModelActivity'
import { ReflectionTrace } from './ReflectionTrace'
import styles from './ChatPanel.module.css'

const fmtDur = (ms: number) => (ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1).replace('.', ',')} s`)

export function ChatPanel() {
  const chat = useLab(s => s.chat)
  const runs = useLab(s => s.runs)
  const streamingText = useLab(s => s.streamingText)
  const streamedProse = useStreamedProse()
  const reduce = useReducedMotion()
  const endRef = useRef<HTMLDivElement>(null)

  const durations = useMemo(() => new Map(runs.map(r => [r.id, r.durationMs])), [runs])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'end' })
  }, [chat.length, streamingText.length, reduce])

  return (
    <section className={styles.root} aria-label="Conversazione">
      <h2 className={styles.title}>CONVERSAZIONE</h2>
      {chat.length === 0 ? (
        <div className={styles.empty}>
          <MessageSquareText size={36} aria-hidden />
          <p>Nessuna richiesta ancora. Scrivi una domanda qui sotto: la risposta comparirà in questo spazio.</p>
        </div>
      ) : (
        <div className={styles.list} aria-live="polite">
          {chat.map(m => (
            <Entry
              key={m.id}
              m={m}
              streamedProse={streamedProse}
              duration={m.runId ? durations.get(m.runId) : undefined}
              reduce={!!reduce}
            />
          ))}
          <div ref={endRef} />
        </div>
      )}
    </section>
  )
}

function Entry({ m, streamedProse, duration, reduce }: { m: ChatEntry; streamedProse: string; duration?: number; reduce: boolean }) {
  const liveReasoning = useLiveReasoning()
  const anim = {
    initial: reduce ? false : { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.25 },
  } as const

  if (m.role === 'user') {
    return (
      <motion.div className={styles.request} {...anim}>
        <span className={styles.kicker}>LA TUA RICHIESTA</span>
        <p>{m.text}</p>
      </motion.div>
    )
  }
  if (m.role === 'note') {
    return (
      <motion.div className={styles.note} {...anim}>
        {m.text}
      </motion.div>
    )
  }
  const text = m.streaming ? streamedProse : m.text
  return (
    <motion.article className={styles.answer} {...anim} aria-busy={m.streaming}>
      <header className={styles.meta}>
        <span className={styles.kicker}>{m.streaming ? 'ESECUZIONE DEL MODELLO' : 'ESITO DELLA PROVA'}</span>
        {m.configLabel && <Chip color="var(--c-orchestration)">{m.configLabel}</Chip>}
        {m.provenance && <ProvenanceBadge tag={m.provenance} />}
        {m.stopReason && m.stopReason !== 'final_answer' && (
          <Chip color="var(--c-governance)">{STOP_LABEL[m.stopReason]}</Chip>
        )}
        {duration !== undefined && (
          <span className={styles.dur}>
            <Timer size={15} aria-hidden /> {fmtDur(duration)}
          </span>
        )}
      </header>
      <ReasoningDisclosure parts={m.streaming ? liveReasoning : (m.reasoning ?? [])} live={m.streaming} />
      <ReflectionTrace runId={m.runId} live={m.streaming} />
      {m.streaming && !text ? (
        <p className={styles.thinking}>
          <span className={styles.dots} aria-hidden>
            <i />
            <i />
            <i />
          </span>
          <ModelActivityNote fallback="L’agente sta lavorando…" />
        </p>
      ) : (
        <div className={styles.text}>
          {!m.streaming && <h4 className={styles.resultTitle}>{m.stopReason === 'final_answer' ? 'Risposta finale' : 'Esito dell’esecuzione'}</h4>}
          <Markdown>{text}</Markdown>
          {m.streaming && <span className={styles.caret} aria-hidden />}
        </div>
      )}
    </motion.article>
  )
}
