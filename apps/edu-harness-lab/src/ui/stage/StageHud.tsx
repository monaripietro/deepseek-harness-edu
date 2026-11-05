import { useMemo } from 'react'
import type { CSSProperties } from 'react'
import { Check, Hand, Repeat, X } from 'lucide-react'
import { COMPONENTS } from '../../harness/levels'
import { useLab } from '../../state/store'
import type { StageState } from './deriveStage'
import { FLOW_STEPS, flowProgress, flowStepsFor, nowText, outcomeOf } from './flowSteps'
import type { FlowStepId } from './flowSteps'
import { narrationLines } from './Narration'
import { useLevelAdds } from './stageUi'
import { capitalize, holdText } from './stepStops'
import styles from './StageChrome.module.css'

type Tone = 'idle' | 'live' | 'good' | 'warn' | 'bad'

const toneVar = (family: string) => (family === 'user' ? 'var(--c-user)' : `var(--c-${family})`)

/** "a, b e c" */
function joinIt(items: string[]): string {
  if (items.length < 2) return items.join('')
  return `${items.slice(0, -1).join(', ')} e ${items.at(-1) ?? ''}`
}

/**
 * The "Adesso" strip above the map and the flow: which step the request is in ("Passo 3 di 6"),
 * the plain-language sentence of the latest harness event, the loop round, and how the run ended.
 * Before the first run it says what to do and what this level adds.
 */
export function StageHud({ stage, onApprovalDetails }: { stage: StageState; onApprovalDetails: () => void }) {
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
  const lines = useMemo(() => narrationLines(events, components), [events, components])
  // One source for the strip, the engine and the narration: the held event when the run is held, else the latest.
  const held = heldEvent ? holdText(heldEvent, components, events) : null
  const heldLine = heldEvent ? lines.find(line => line.id === heldEvent.id) : undefined
  const latest = stage.runId ? (heldLine ?? lines.at(-1)) : undefined
  const outcome = outcomeOf(stage)
  const running = stage.running
  const current = stage.runId ? progress.current : null
  const index = current ? steps.indexOf(current) : -1

  let tone: Tone = 'idle'
  let badge = modelReady ? 'Pronto' : 'Serve un modello'
  let title = 'Pronto a partire'
  let caption: string = modelReady
    ? 'Premi «Avvia la richiesta»: vedrai la domanda attraversare l’harness, una tappa alla volta.'
    : 'Premi «Avvia la richiesta» e scegli un modello: senza un modello reale non parte nulla.'
  if (!stage.runId && adds.length > 0) {
    caption = `Novità di questo livello: ${joinIt(adds.map(c => COMPONENTS[c].label))}. ${caption}`
  }
  let term: string | undefined
  let meta: string | null = null

  if (running) {
    tone = pending ? 'warn' : 'live'
    badge = pending ? 'Tocca a te' : paused ? 'In pausa' : stepMode ? 'Passo-passo' : 'In corso'
    const now = stepMode && held ? capitalize(held.here) : nowText(stage.phase, { streaming, hasOrchestrator: components.orchestrator })
    title = index >= 0 ? `Passo ${index + 1} di ${steps.length} · ${now}` : now
    if (stepMode && held && held.stop > 0) meta = `Tappa ${held.stop}`
    if (pending) {
      caption = `L’agente vuole usare «${pending.toolTitle}». Niente succede finché non decidi tu.`
    } else if (latest) {
      caption = latest.text
      term = latest.term
    }
    if (latest && (latest.tone === 'bad' || latest.tone === 'warn') && !pending) tone = latest.tone === 'bad' ? 'bad' : 'warn'
  } else if (stage.runId) {
    if (outcome) {
      tone = outcome.tone
      badge = outcome.tone === 'good' ? 'Concluso' : stage.stopReason === 'user_stop' ? 'Fermato' : outcome.tone === 'warn' ? 'Concluso' : 'Interrotto'
      title = `Fine · ${outcome.label}`
      caption =
        stage.stopReason === 'final_answer'
          ? 'La risposta è nella scheda «Risposta»; in «Prova e racconto» trovi la conversazione e ogni evento.'
          : (stage.stopMessage ?? latest?.text ?? caption)
    } else {
      tone = status === 'error' ? 'bad' : 'warn'
      badge = status === 'error' ? 'Errore' : 'Interrotto'
      title = status === 'error' ? 'La prova si è interrotta per un errore' : 'La prova si è interrotta'
      caption = 'Premi «Avvia la richiesta» per riprovare, oppure «Ricomincia» per ripartire da zero.'
    }
    const parts = [`${stage.modelCalls} ${stage.modelCalls === 1 ? 'chiamata' : 'chiamate'} al modello`]
    if (components.orchestrator) parts.push(`${stage.toolHistory.length} ${stage.toolHistory.length === 1 ? 'strumento usato' : 'strumenti usati'}`)
    if (components.orchestrator && stage.step > 0) parts.push(`${stage.step} ${stage.step === 1 ? 'giro' : 'giri'}`)
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
  const STATE_TEXT = { current: 'in corso', done: 'fatto', skipped: 'non serviva', todo: 'da fare', stopped: 'interrotto qui' } as const

  return (
    <div className={styles.hud} data-tone={tone} aria-label="Adesso" role="region">
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
            <Hand size={15} aria-hidden /> Decidi
          </button>
        )}
      </div>

      <div className={styles.track}>
        <ol className={styles.steps} aria-label="Le tappe della richiesta">
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
            title="Un giro: il modello legge e decide, l’harness agisce e riporta il risultato. Con il ciclo agentico i giri si ripetono."
          >
            <Repeat size={13} aria-hidden />
            {stage.step > 0 ? (
              <>
                Giro {stage.step}
                {components.agentLoop && components.controls ? <span className={styles.roundMax}>/{maxSteps}</span> : null}
              </>
            ) : !components.agentLoop ? (
              'Un solo giro'
            ) : components.controls ? (
              `Fino a ${maxSteps} giri`
            ) : (
              'Giri senza limite'
            )}
          </span>
        )}
      </div>
    </div>
  )
}
