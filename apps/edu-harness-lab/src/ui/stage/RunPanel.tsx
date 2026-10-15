import { useEffect, useId, useRef, useState } from 'react'
import { Cpu, FileText, Play, Square } from 'lucide-react'
import type { ChatEntry, RunStatus } from '../../state/store'
import { useLab } from '../../state/store'
import { SCENARIOS } from '../../scenarios'
import { guideScenario } from '../../scenarios/guide'
import { STOP_LABEL } from '../common/labels'
import { Button } from '../common/Button'
import { Markdown } from '../common/Markdown'
import { ProvenanceBadge } from '../common/ProvenanceBadge'
import styles from './RunPanel.module.css'

/** Sends requests through the selected scenario and renders the store-backed conversation. */
export function RunPanel() {
  const titleId = useId()
  const hintId = useId()
  const conversationId = useId()
  const scenarioId = useLab(s => s.scenarioId)
  const scenario = SCENARIOS.find(item => item.id === scenarioId) ?? guideScenario
  const chat = useLab(s => s.chat)
  const streamingText = useLab(s => s.streamingText)
  const status = useLab(s => s.status)
  const send = useLab(s => s.send)
  const stop = useLab(s => s.stop)
  const modelInfo = useLab(s => s.modelInfo)
  const loadProgress = useLab(s => s.loadProgress)
  const [draft, setDraft] = useState(scenario.request)
  const conversationRef = useRef<HTMLDivElement>(null)

  useEffect(() => setDraft(scenario.request), [scenario.request])
  useEffect(() => {
    const conversation = conversationRef.current
    if (conversation) conversation.scrollTop = conversation.scrollHeight
  }, [chat.length, streamingText.length])

  const running = status === 'running' || status === 'awaitingApproval'
  const modelReady = modelInfo.provenance.provenance === 'real'
  const modelLoading = ['checking', 'downloading', 'initializing'].includes(loadProgress.phase)
  const modelError = loadProgress.phase === 'error' ? loadProgress.message || 'Non è stato possibile caricare il modello.' : null
  const statusLabel =
    status === 'running'
      ? 'In esecuzione'
      : status === 'awaitingApproval'
        ? 'In attesa di approvazione'
        : status === 'error'
          ? 'Errore'
          : status === 'done'
            ? 'Completato'
            : status === 'stopped'
              ? 'Interrotto'
              : modelLoading
                ? 'Modello in caricamento'
                : modelError
                  ? 'Errore modello'
                  : modelReady
                    ? 'Pronto'
                    : 'Modello richiesto'
  const statusTone = running || modelLoading ? styles.statusActive : status === 'error' || modelError ? styles.statusError : modelReady ? styles.statusReady : styles.statusMissing

  function submit() {
    if (running || !draft.trim()) return
    void send(draft)
  }

  return (
    <section className={styles.root} aria-labelledby={titleId}>
      <header className={styles.header}>
        <div className={styles.headText}>
          <h2 id={titleId} className={styles.title}>
            Prova il sistema
          </h2>
          <p className={styles.meta}>
            <span className={styles.metaItem}>
              <Cpu size={14} aria-hidden />
              {modelReady ? `Modello: ${modelInfo.label}` : modelLoading ? 'Il modello si sta caricando…' : 'Nessun modello avviato'}
            </span>
            <span className={styles.metaItem}>
              <FileText size={14} aria-hidden />
              <span className={styles.scenarioLabel}>Scenario</span> <span className={styles.scenarioName}>{scenario.title}</span>
            </span>
          </p>
        </div>
        <span className={`${styles.status} ${statusTone}`} role="status">
          {statusLabel}
        </span>
      </header>

      {modelError ? (
        <p className={`${styles.modelNote} ${styles.modelError}`} role="alert">
          Il modello non si è caricato: {modelError}
        </p>
      ) : (
        !modelReady &&
        !modelLoading && (
          <p className={styles.modelNote}>Per eseguire una richiesta serve un modello reale. Premi Avvia per sceglierne uno.</p>
        )
      )}

      <div className={styles.conversation} ref={conversationRef} aria-labelledby={conversationId}>
        <h3 id={conversationId} className={styles.conversationTitle}>
          Conversazione
        </h3>
        {chat.length === 0 ? (
          <p className={styles.empty}>
            Nessuna prova ancora. Scrivi o modifica la richiesta qui sotto e premi Avvia: la risposta comparirà qui.
          </p>
        ) : (
          <ol className={styles.messages} aria-live="polite" aria-relevant="additions text">
            {chat.map(message => (
              <ConversationEntry key={message.id} message={message} streamingText={streamingText} status={status} />
            ))}
          </ol>
        )}
      </div>

      <form
        className={styles.composer}
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        <label className={styles.inputLabel} htmlFor={`${hintId}-input`}>
          La tua richiesta
        </label>
        <textarea
          id={`${hintId}-input`}
          className={styles.input}
          value={draft}
          disabled={running}
          aria-describedby={hintId}
          placeholder="Scrivi una richiesta…"
          onChange={event => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault()
              submit()
            }
          }}
        />
        <div className={styles.composerFoot}>
          <p className={styles.inputHint} id={hintId}>
            Invio avvia la richiesta · Maiusc+Invio aggiunge una riga.
          </p>
          <div className={styles.actions}>
            {draft !== scenario.request && !running && (
              <Button variant="ghost" size="sm" onClick={() => setDraft(scenario.request)}>
                Domanda dello scenario
              </Button>
            )}
            {running ? (
              <Button variant="danger" onClick={stop} icon={<Square size={15} fill="currentColor" aria-hidden />}>
                Ferma
              </Button>
            ) : (
              <Button type="submit" variant="primary" disabled={!draft.trim()} icon={<Play size={15} fill="currentColor" aria-hidden />}>
                Avvia
              </Button>
            )}
          </div>
        </div>
      </form>
    </section>
  )
}

function ConversationEntry({ message, streamingText, status }: { message: ChatEntry; streamingText: string; status: RunStatus }) {
  if (message.role === 'user') {
    return (
      <li className={styles.request}>
        <span className={styles.kicker}>Richiesta</span>
        <p className={styles.requestText}>{message.text}</p>
      </li>
    )
  }

  if (message.role === 'note') {
    return (
      <li className={styles.note}>{message.text}</li>
    )
  }

  const text = message.streaming ? streamingText : message.text

  return (
    <li className={styles.answer} aria-busy={message.streaming}>
      <div className={styles.answerMeta}>
        <span className={styles.kicker}>Risposta</span>
        {message.configLabel && <span className={styles.configLabel}>{message.configLabel}</span>}
        {message.provenance && <ProvenanceBadge tag={message.provenance} />}
        {message.stopReason && <span className={styles.stopReason}>{STOP_LABEL[message.stopReason]}</span>}
      </div>
      {message.streaming && !text ? (
        <p className={styles.pending}>
          {status === 'awaitingApproval' ? 'In attesa della tua approvazione…' : 'Il sistema sta preparando la risposta…'}
        </p>
      ) : (
        <div className={styles.answerText}>
          <Markdown>{text}</Markdown>
          {message.streaming && <span className={styles.caret} aria-hidden />}
        </div>
      )}
    </li>
  )
}
