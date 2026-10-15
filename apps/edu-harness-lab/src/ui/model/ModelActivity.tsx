import { useEffect, useState } from 'react'
import { Brain, BookOpen, Wrench } from 'lucide-react'
import { useLab } from '../../state/store'
import styles from './ModelActivity.module.css'

/** Streamed text that is prose for the reader (not a tool call or a JSON decision being written). */
export function proseOf(streaming: string): string {
  return streaming && !/^\s*(\{|<\||<tool_call|\[)/.test(streaming) ? streaming : ''
}

/**
 * Live sign of what the model is doing before any visible text, so a long wait does not look like a freeze:
 * reading the context, reasoning (time and tokens) or writing a tool call.
 */
export function ModelActivityNote({ fallback }: { fallback: string }) {
  const activity = useLab(s => s.modelActivity)
  const writingCall = useLab(s => s.streamingText.length > 0 && !proseOf(s.streamingText))
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!activity) return
    const timer = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(timer)
  }, [activity])
  if (!activity) {
    if (!writingCall) return <>{fallback}</>
    return (
      <span role="status">
        <Wrench size={14} aria-hidden /> Il modello scrive la richiesta a uno strumento…
      </span>
    )
  }
  const secs = Math.max(0, Math.round((now - activity.since) / 1000))
  if (activity.kind === 'reading') {
    return (
      <span role="status">
        <BookOpen size={14} aria-hidden /> Il modello legge il contesto… {secs} s
      </span>
    )
  }
  return (
    <span role="status">
      <Brain size={14} aria-hidden /> Il modello sta ragionando… {secs} s{activity.tokens > 0 ? ` · ${activity.tokens} token` : ''}
      {' '}· si legge in «Ragionamento del modello»
    </span>
  )
}

/** Reasoning of the run in progress (or of the last one): finished calls plus the current one. */
export function useLiveReasoning(): string[] {
  const done = useLab(s => s.runReasoning)
  const current = useLab(s => s.reasoningText)
  return current ? [...done, current] : done
}

/**
 * The model's reasoning, collapsed: readable only when the user expands it, with a warning that it is
 * generated text, not a reliable explanation of how the model decides.
 */
export function ReasoningDisclosure({ parts, live = false }: { parts: string[]; live?: boolean }) {
  const list = parts.filter(p => p.trim())
  if (!list.length) return null
  return (
    <details className={styles.reasoning}>
      <summary className={styles.summary}>
        <Brain size={14} aria-hidden /> Ragionamento del modello
        <span className={styles.count}>
          {list.length === 1 ? '1 chiamata' : `${list.length} chiamate`}
          {live ? ' · in corso' : ''}
        </span>
      </summary>
      <p className={styles.warning}>
        Testo generato dal modello prima di rispondere: non è una spiegazione affidabile di come decide, e può contenere errori.
      </p>
      {list.map((text, i) => (
        <div key={i} className={styles.part}>
          {list.length > 1 && <span className={styles.partLabel}>Chiamata {i + 1}</span>}
          <p className={styles.text}>{text}</p>
        </div>
      ))}
    </details>
  )
}
