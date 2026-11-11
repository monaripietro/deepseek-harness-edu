import { useMemo } from 'react'
import type { CSSProperties } from 'react'
import { Check, Hand, Repeat, X } from 'lucide-react'
import { useLab } from '../../state/store'
import { useT, useUiLang } from '../../i18n'
import { componentText } from '../../i18nContent'
import type { StageState } from './deriveStage'
import { FLOW_STEPS, flowProgress, flowStepsFor, nowText, outcomeOf } from './flowSteps'
import type { FlowStepId } from './flowSteps'
import { narrationLines } from './Narration'
import { joinList } from './narrate'
import { useLevelAdds } from './stageUi'
import { capitalize, holdText } from './stepStops'
import styles from './StageChrome.module.css'

type Tone = 'idle' | 'live' | 'good' | 'warn' | 'bad'

const toneVar = (family: string) => (family === 'user' ? 'var(--c-user)' : `var(--c-${family})`)

/**
 * The "Adesso" strip above the map and the flow: which step the request is in ("Passo 3 di 6"),
 * the plain-language sentence of the latest harness event, the loop round, and how the run ended.
 * Before the first run it says what to do and what this level adds.
 */
export function StageHud({ stage, onApprovalDetails }: { stage: StageState; onApprovalDetails: () => void }) {
  const t = useT()
  // The narration lines are rebuilt when the interface language changes.
  const lang = useUiLang(s => s.lang)
  const events = useLab(s => s.events)
  const components = useLab(s => s.config.components)
  const status = useLab(s => s.status)
  const paused = useLab(s => s.paused)
  const stepMode = useLab(s => s.stepMode)
  const heldEvent = useLab(s => s.heldEvent)
  const maxSteps = useLab(s => s.config.limits.maxSteps)
  const pending = useLab(s => s.pendingApproval)
  const modelReady = useLab(s => s.modelInfo.provenance.provenance === 'real')
  const streaming = useLab(s => s.streamingText.length > 0)
  const adds = useLevelAdds()

  const steps = flowStepsFor(components)
  const progress = useMemo(() => flowProgress(events, components.orchestrator), [events, components.orchestrator])
  const lines = useMemo(() => narrationLines(events, components), [events, components, lang])
  // One source for the strip, the engine and the narration: the held event when the run is held, else the latest.
  const held = heldEvent ? holdText(heldEvent, components, events) : null
  const heldLine = heldEvent ? lines.find(line => line.id === heldEvent.id) : undefined
  const latest = stage.runId ? (heldLine ?? lines.at(-1)) : undefined
  const outcome = outcomeOf(stage)
  const running = stage.running
  const current = stage.runId ? progress.current : null
  const index = current ? steps.indexOf(current) : -1

  let tone: Tone = 'idle'
  let badge = modelReady ? t('Pronto', 'Ready') : t('Serve un modello', 'A model is needed')
  let title = t('Pronto a partire', 'Ready to start')
  let caption: string = modelReady
    ? t(
      'Premi «Avvia la richiesta»: vedrai la domanda attraversare l’harness, una tappa alla volta.',
      'Press “Start the request”: you will see the question cross the harness, one stop at a time.',
    )
    : t(
      'Premi «Avvia la richiesta» e scegli un modello: senza un modello reale non parte nulla.',
      'Press “Start the request” and choose a model: nothing starts without a real model.',
    )
  if (!stage.runId && adds.length > 0) {
    caption = t(
      `Novità di questo livello: ${joinList(adds.map(c => componentText(c).label))}. ${caption}`,
      `New in this level: ${joinList(adds.map(c => componentText(c).label))}. ${caption}`,
    )
  }
  let term: string | undefined
  let meta: string | null = null

  if (running) {
    tone = pending ? 'warn' : 'live'
    badge = pending ? t('Tocca a te', 'Your turn') : paused ? t('In pausa', 'Paused') : stepMode ? t('Passo-passo', 'Step by step') : t('In corso', 'Running')
    const now = stepMode && held ? capitalize(held.here) : nowText(stage.phase, { streaming, hasOrchestrator: components.orchestrator })
    title = index >= 0 ? t(`Passo ${index + 1} di ${steps.length} · ${now}`, `Step ${index + 1} of ${steps.length} · ${now}`) : now
    if (stepMode && held && held.stop > 0) meta = t(`Tappa ${held.stop}`, `Stop ${held.stop}`)
    if (pending) {
      caption = t(
        `L’agente vuole usare «${pending.toolTitle}». Niente succede finché non decidi tu.`,
        `The agent wants to use “${pending.toolTitle}”. Nothing happens until you decide.`,
      )
    } else if (latest) {
      caption = latest.text
      term = latest.term
    }
    if (latest && (latest.tone === 'bad' || latest.tone === 'warn') && !pending) tone = latest.tone === 'bad' ? 'bad' : 'warn'
  } else if (stage.runId) {
    if (outcome) {
      tone = outcome.tone
      badge =
        outcome.tone === 'good'
          ? t('Concluso', 'Finished')
          : stage.stopReason === 'user_stop'
            ? t('Fermato', 'Stopped')
            : outcome.tone === 'warn'
              ? t('Concluso', 'Finished')
              : t('Interrotto', 'Interrupted')
      title = t(`Fine · ${outcome.label}`, `End · ${outcome.label}`)
      caption =
        stage.stopReason === 'final_answer'
          ? t(
            'La risposta è nella scheda «Risposta»; in «Prova e racconto» trovi la conversazione e ogni evento.',
            'The answer is in the “Answer” tab; in “Run and story” you find the conversation and every event.',
          )
          : (stage.stopMessage ?? latest?.text ?? caption)
    } else {
      tone = status === 'error' ? 'bad' : 'warn'
      badge = status === 'error' ? t('Errore', 'Error') : t('Interrotto', 'Interrupted')
      title =
        status === 'error'
          ? t('La prova si è interrotta per un errore', 'The run stopped because of an error')
          : t('La prova si è interrotta', 'The run was interrupted')
      caption = t(
        'Premi «Avvia la richiesta» per riprovare, oppure «Ricomincia» per ripartire da zero.',
        'Press “Start the request” to try again, or “Start over” to begin from zero.',
      )
    }
    const calls = stage.modelCalls
    const used = stage.toolHistory.length
    const rounds = stage.step
    const parts = [t(`${calls} ${calls === 1 ? 'chiamata' : 'chiamate'} al modello`, `${calls} model ${calls === 1 ? 'call' : 'calls'}`)]
    if (components.orchestrator) parts.push(t(`${used} ${used === 1 ? 'strumento usato' : 'strumenti usati'}`, `${used} ${used === 1 ? 'tool used' : 'tools used'}`))
    if (components.orchestrator && rounds > 0) parts.push(t(`${rounds} ${rounds === 1 ? 'giro' : 'giri'}`, `${rounds} ${rounds === 1 ? 'round' : 'rounds'}`))
    meta = parts.join(' · ')
  }

  const stepState = (id: FlowStepId, i: number): 'current' | 'done' | 'skipped' | 'todo' | 'stopped' => {
    if (!stage.runId) return 'todo'
    if (id === current) {
      if (running) return 'current'
      return outcome && outcome.tone !== 'good' && id !== 'answer' ? 'stopped' : 'done'
    }
    // While running, the current round; once finished, the whole run.
    if ((running ? progress.visited : progress.seen).has(id)) return 'done'
    // Passed over without happening (e.g. the model answered without asking for a tool).
    return i < index ? 'skipped' : 'todo'
  }
  const STATE_TEXT = {
    current: t('in corso', 'in progress'),
    done: t('fatto', 'done'),
    skipped: t('non serviva', 'not needed'),
    todo: t('da fare', 'to do'),
    stopped: t('interrotto qui', 'stopped here'),
  } as const

  return (
    <div className={styles.hud} data-tone={tone} aria-label={t('Adesso', 'Now')} role="region">
      <div className={styles.now}>
        <span className={styles.badge}>
          <span className={styles.badgeDot} aria-hidden />
          {badge}
        </span>
        <p className={styles.title} role="status">
          {title}
        </p>
        {meta && <span className={styles.meta}>{meta}</span>}
        <p className={styles.caption} title={caption}>
          {caption}
          {term && <em className={styles.term}>{term}</em>}
        </p>
        {pending && running && (
          <button type="button" className={styles.decide} onClick={onApprovalDetails}>
            <Hand size={15} aria-hidden /> {t('Decidi', 'Decide')}
          </button>
        )}
      </div>

      <div className={styles.track}>
        <ol className={styles.steps} aria-label={t('Le tappe della richiesta', 'The steps of the request')}>
          {steps.map((id, i) => {
            const st = stepState(id, i)
            const def = FLOW_STEPS[id]
            return (
              <li
                key={id}
                className={styles.step}
                data-state={st}
                aria-current={st === 'current' ? 'step' : undefined}
                title={`${def.label}: ${def.hint}`}
                style={{ '--step': toneVar(def.family) } as CSSProperties}
              >
                <span className={styles.stepNum} aria-hidden>
                  {st === 'done' ? <Check size={13} strokeWidth={3} /> : st === 'stopped' ? <X size={13} strokeWidth={3} /> : i + 1}
                </span>
                <span className={styles.stepLabel}>{def.label}</span>
                <span className="visually-hidden">: {STATE_TEXT[st]}</span>
              </li>
            )
          })}
        </ol>
        {components.orchestrator && (
          <span
            className={`${styles.round} ${stage.step > 1 ? styles.roundAgain : ''}`}
            title={t(
              'Un giro: il modello legge e decide, l’harness agisce e riporta il risultato. Con il ciclo agentico i giri si ripetono.',
              'One round: the model reads and decides, the harness acts and reports the result. With the agent loop, rounds repeat.',
            )}
          >
            <Repeat size={13} aria-hidden />
            {stage.step > 0 ? (
              <>
                {t('Giro', 'Round')} {stage.step}
                {components.agentLoop && components.controls ? <span className={styles.roundMax}>/{maxSteps}</span> : null}
              </>
            ) : !components.agentLoop ? (
              t('Un solo giro', 'One round only')
            ) : components.controls ? (
              t(`Fino a ${maxSteps} giri`, `Up to ${maxSteps} rounds`)
            ) : (
              t('Giri senza limite', 'Rounds without a limit')
            )}
          </span>
        )}
      </div>
    </div>
  )
}
