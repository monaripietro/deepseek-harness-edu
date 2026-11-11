import { ModelActivityNote, ReasoningDisclosure, useLiveReasoning, useStreamedProse } from '../model/ModelActivity'
import { useEffect, useId, useMemo, useRef } from 'react'
import { CornerDownRight, Cpu, FileText, Play, RotateCcw, Square } from 'lucide-react'
import type { ChatEntry, RunStatus } from '../../state/store'
import { useLab } from '../../state/store'
import { SCENARIOS } from '../../scenarios'
import { guideScenario } from '../../scenarios/guide'
import { ReflectionTrace } from '../chat/ReflectionTrace'
import { STOP_LABEL } from '../common/labels'
import { Button } from '../common/Button'
import { Markdown } from '../common/Markdown'
import { ProvenanceBadge } from '../common/ProvenanceBadge'
import { useT } from '../../i18n'
import { sameRequest, sendModeFor } from './flowSteps'
import { useRequestDraft } from './stageUi'
import styles from './RunPanel.module.css'

/** Sends requests through the selected scenario and renders the store-backed conversation. */
export function RunPanel() {
  const t = useT()
  const titleId = useId()
  const hintId = useId()
  const conversationId = useId()
  const scenarioId = useLab(s => s.scenarioId)
  const scenario = SCENARIOS.find(item => item.id === scenarioId) ?? guideScenario
  const config = useLab(s => s.config)
  const setLevel = useLab(s => s.setLevel)
  const chat = useLab(s => s.chat)
  const streamingText = useLab(s => s.streamingText)
  const streamedProse = useStreamedProse()
  const status = useLab(s => s.status)
  const send = useLab(s => s.send)
  const stop = useLab(s => s.stop)
  const modelInfo = useLab(s => s.modelInfo)
  const loadProgress = useLab(s => s.loadProgress)
  const resetConversation = useLab(s => s.resetConversation)
  // Shared with the map's request card and the stage's run button.
  const { text: draft, request, edited, setText: setDraft, reset: resetDraft } = useRequestDraft()
  const conversationRef = useRef<HTMLDivElement>(null)
  const asked = useMemo(() => chat.filter(m => m.role === 'user').map(m => m.text), [chat])
  const mode = sendModeFor(draft, request, asked)

  useEffect(() => {
    const conversation = conversationRef.current
    if (conversation) conversation.scrollTop = conversation.scrollHeight
  }, [chat.length, streamingText.length])

  const running = status === 'running' || status === 'awaitingApproval'
  const reflectionReady = config.components.orchestrator && config.components.agentLoop && config.components.controls
  const modelReady = modelInfo.provenance.provenance === 'real'
  const modelLoading = ['checking', 'downloading', 'initializing'].includes(loadProgress.phase)
  const modelError = loadProgress.phase === 'error' ? loadProgress.message || t('Non è stato possibile caricare il modello.', 'The model could not be loaded.') : null
  const statusLabel =
    status === 'running'
      ? t('In esecuzione', 'Running')
      : status === 'awaitingApproval'
        ? t('In attesa di approvazione', 'Waiting for approval')
        : status === 'error'
          ? t('Errore', 'Error')
          : status === 'done'
            ? t('Completato', 'Completed')
            : status === 'stopped'
              ? t('Interrotto', 'Stopped')
              : modelLoading
                ? t('Modello in caricamento', 'Model loading')
                : modelError
                  ? t('Errore modello', 'Model error')
                  : modelReady
                    ? t('Pronto', 'Ready')
                    : t('Modello richiesto', 'Model needed')
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
            {t('Prova il sistema', 'Try the system')}
          </h2>
          <p className={styles.meta}>
            <span className={styles.metaItem}>
              <Cpu size={14} aria-hidden />
              {modelReady
                ? t(`Modello: ${modelInfo.label}`, `Model: ${modelInfo.label}`)
                : modelLoading
                  ? t('Il modello si sta caricando…', 'The model is loading…')
                  : t('Nessun modello avviato', 'No model started')}
            </span>
            <span className={styles.metaItem}>
              <FileText size={14} aria-hidden />
              <span className={styles.scenarioLabel}>{t('Scenario', 'Scenario')}</span> <span className={styles.scenarioName}>{scenario.title}</span>
            </span>
          </p>
        </div>
        <span className={`${styles.status} ${statusTone}`} role="status">
          {statusLabel}
        </span>
      </header>

      {scenario.reflectionPrompt && (
        <div className={styles.modelNote} aria-label={t('Come provare il ragionamento iterativo', 'How to try iterative reasoning')}>
          <p className={styles.scenarioLesson}>{scenario.lesson}</p>
          {reflectionReady ? (
            <p className={styles.scenarioLesson}>
              {t(
                `Bozza → riesame → correzione → risposta, senza strumenti. Limite configurato: ${config.limits.maxSteps} passi.`,
                `Draft → review → correction → answer, without tools. Configured limit: ${config.limits.maxSteps} steps.`,
              )}
            </p>
          ) : (
            <Button size="sm" variant="secondary" disabled={running} onClick={() =>{  setLevel(scenario.showcaseLevel) }}>
              {t('Attiva ciclo di riflessione e controlli', 'Turn on the reflection loop and controls')}
            </Button>
          )}
        </div>
      )}

      {modelError ? (
        <p className={`${styles.modelNote} ${styles.modelError}`} role="alert">
          {t('Il modello non si è caricato: ', 'The model did not load: ')}
          {modelError}
        </p>
      ) : (
        !modelReady &&
        !modelLoading && (
          <p className={styles.modelNote}>
            {t('Per eseguire una richiesta serve un modello reale. Premi Avvia per sceglierne uno.', 'To run a request you need a real model. Press Start to choose one.')}
          </p>
        )
      )}

      <div className={styles.conversation} ref={conversationRef} aria-labelledby={conversationId}>
        <div className={styles.conversationHead}>
          <h3 id={conversationId} className={styles.conversationTitle}>
            {t('Conversazione', 'Conversation')}
            {asked.length > 0 && (
              <span className={styles.turns}>
                {asked.length} {asked.length === 1 ? t('domanda', 'question') : t('domande', 'questions')}
              </span>
            )}
          </h3>
          {chat.length > 0 && !running && (
            <Button
              size="sm"
              variant="ghost"
              icon={<RotateCcw size={14} aria-hidden />}
              onClick={resetConversation}
              title={t(
                'Svuota conversazione, eventi e memoria di sessione: la prossima richiesta parte da zero',
                'Empties the conversation, the events and the session memory: the next request starts from zero',
              )}
            >
              {t('Nuova conversazione', 'New conversation')}
            </Button>
          )}
        </div>
        {chat.length === 0 ? (
          <p className={styles.empty}>
            {t(
              'Nessuna prova ancora. Scrivi o modifica la richiesta qui sotto e premi Avvia: la risposta comparirà qui.',
              'No run yet. Write or edit the request below and press Start: the answer will appear here.',
            )}
          </p>
        ) : (
          <ol className={styles.messages} aria-live="polite" aria-relevant="additions text">
            {chat.map(message => (
              <ConversationEntry key={message.id} message={message} streamedProse={streamedProse} status={status} />
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
          {t('La tua richiesta', 'Your request')}
        </label>
        <textarea
          id={`${hintId}-input`}
          className={styles.input}
          value={draft}
          disabled={running}
          aria-describedby={hintId}
          placeholder={t('Scrivi una richiesta…', 'Write a request…')}
          onChange={(event) =>{  setDraft(event.target.value) }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault()
              submit()
            }
          }}
        />
        <div className={styles.composerFoot}>
          <p className={styles.inputHint} id={hintId} data-mode={mode}>
            {mode === 'restart' ? (
              <span className={styles.modeLine}>
                <RotateCcw size={13} aria-hidden />
                {sameRequest(draft, request)
                  ? t('Domanda dello scenario', 'Scenario question')
                  : t('Domanda già fatta', 'Question already asked')}
                {t(': si riparte da zero, senza la conversazione precedente.', ': starts again from zero, without the previous conversation.')}
              </span>
            ) : mode === 'followup' ? (
              <span className={styles.modeLine}>
                <CornerDownRight size={13} aria-hidden />
                {config.components.memory
                  ? t(
                    'Domanda nuova: continua la conversazione e il modello rivede gli scambi precedenti.',
                    'New question: it continues the conversation and the model reviews the previous exchanges.',
                  )
                  : t(
                    'Domanda nuova nella stessa conversazione. Senza memoria il modello non vede gli scambi precedenti.',
                    'New question in the same conversation. Without memory the model does not see the previous exchanges.',
                  )}
              </span>
            ) : null}
            <span>{t('Invio avvia la richiesta · Maiusc+Invio aggiunge una riga.', 'Enter starts the request · Shift+Enter adds a line.')}</span>
          </p>
          <div className={styles.actions}>
            {edited && !running && (
              <Button variant="ghost" size="sm" onClick={resetDraft}>
                {t('Domanda dello scenario', 'Scenario question')}
              </Button>
            )}
            {running ? (
              <Button variant="danger" onClick={stop} icon={<Square size={15} fill="currentColor" aria-hidden />}>
                {t('Ferma', 'Stop')}
              </Button>
            ) : (
              <Button type="submit" variant="primary" disabled={!draft.trim()} icon={<Play size={15} fill="currentColor" aria-hidden />}>
                {t('Avvia', 'Start')}
              </Button>
            )}
          </div>
        </div>
      </form>
    </section>
  )
}

function ConversationEntry({ message, streamedProse, status }: { message: ChatEntry; streamedProse: string; status: RunStatus }) {
  const t = useT()
  const live = useLiveReasoning()
  if (message.role === 'user') {
    return (
      <li className={styles.request}>
        <span className={styles.kicker}>{t('Richiesta', 'Request')}</span>
        <p className={styles.requestText}>{message.text}</p>
      </li>
    )
  }

  if (message.role === 'note') {
    return (
      <li className={styles.note}>{message.text}</li>
    )
  }

  const text = message.streaming ? streamedProse : message.text

  return (
    <li className={styles.answer} aria-busy={message.streaming}>
      <div className={styles.answerMeta}>
        <span className={styles.kicker}>{message.streaming ? t('Esecuzione del modello', 'Model at work') : t('Esito della prova', 'Run result')}</span>
        {message.configLabel && <span className={styles.configLabel}>{message.configLabel}</span>}
        {message.provenance && <ProvenanceBadge tag={message.provenance} />}
        {message.stopReason && message.stopReason !== 'final_answer' && <span className={styles.stopReason}>{STOP_LABEL[message.stopReason]}</span>}
      </div>
      <ReasoningDisclosure parts={message.streaming ? live : (message.reasoning ?? [])} live={message.streaming} />
      <ReflectionTrace runId={message.runId} live={message.streaming} />
      {message.streaming && !text ? (
        <p className={styles.pending}>
          {status === 'awaitingApproval' ? (
            t('In attesa della tua approvazione…', 'Waiting for your approval…')
          ) : (
            <ModelActivityNote fallback={t('Il sistema sta preparando la risposta…', 'The system is preparing the answer…')} />
          )}
        </p>
      ) : (
        <div className={styles.answerText}>
          {!message.streaming && <h4 className={styles.resultTitle}>
            {message.stopReason === 'final_answer'
              ? t('Risposta finale', 'Final answer')
              : message.stopReason === 'needs_user_input'
                ? t('Chiarimento richiesto', 'Clarification requested')
                : t('Esito senza risposta finale', 'Outcome without a final answer')}
          </h4>}
          <Markdown>{text}</Markdown>
          {message.streaming && <span className={styles.caret} aria-hidden />}
        </div>
      )}
    </li>
  )
}
