import { Footprints, Pause, Play, RotateCcw, SkipForward, Square } from 'lucide-react'
import { useLab } from '../../state/store'
import { capitalize, holdText } from './stepStops'
import { useBusy, useRequestDraft } from './stageUi'
import styles from './StageChrome.module.css'

const SPEEDS = [
  { value: 0.5, label: '0,5×', name: 'Velocità: metà' },
  { value: 1, label: '1×', name: 'Velocità: normale' },
  { value: 2, label: '2×', name: 'Velocità: doppia' },
] as const

/**
 * Playback next to the animation: run / stop, pause, step-by-step, speed and a clean restart.
 * Space pauses and S advances one event (global shortcuts in App).
 * The line above the bar says where the run is held and what «Avanti» does next.
 */
export function StageTransport() {
  const busy = useBusy()
  const paused = useLab(s => s.paused)
  const stepMode = useLab(s => s.stepMode)
  const speed = useLab(s => s.speed)
  const heldEvent = useLab(s => s.heldEvent)
  const events = useLab(s => s.events)
  const components = useLab(s => s.config.components)
  const togglePause = useLab(s => s.togglePause)
  const setStepMode = useLab(s => s.setStepMode)
  const step = useLab(s => s.step)
  const setSpeed = useLab(s => s.setSpeed)
  const hasConversation = useLab(s => s.chat.length > 0 || s.events.some(e => e.type === 'run/start'))
  const { text } = useRequestDraft()

  const run = () => {
    const s = useLab.getState()
    if (busy) s.stop()
    else void s.send(text)
  }

  const hold = heldEvent ? holdText(heldEvent, components, events) : null
  const guide = describeGuide({ busy, paused, stepMode, held: !!heldEvent, hold })

  return (
    <div className={styles.dock}>
      {guide && (
        <p className={`${styles.guide} ${styles[`guide_${guide.tone}`]}`} role="status" aria-live="polite">
          {guide.label && <strong className={styles.guideLabel}>{guide.label}</strong>}
          {guide.text}
        </p>
      )}
      <div className={styles.transport} role="group" aria-label="Riproduzione">
        <button
          type="button"
          className={`${styles.primary} ${busy ? styles.primaryStop : ''}`}
          onClick={run}
          disabled={!busy && !text.trim()}
          title={busy ? 'Ferma la richiesta in corso' : 'Invia la richiesta e guarda l’harness al lavoro'}
        >
          {busy ? <Square size={14} fill="currentColor" aria-hidden /> : <Play size={15} fill="currentColor" aria-hidden />}
          <span>{busy ? 'Ferma' : 'Avvia la richiesta'}</span>
        </button>

        <span className={styles.sep} aria-hidden />

        <button
          type="button"
          className={`${styles.tbtn} ${paused ? styles.tbtnOn : ''}`}
          aria-pressed={paused}
          onClick={togglePause}
          disabled={!busy && !paused}
          title={paused ? 'Riprendi l’animazione (Spazio)' : 'Metti in pausa tra un evento e l’altro (Spazio)'}
        >
          {paused ? <Play size={15} aria-hidden /> : <Pause size={15} aria-hidden />}
          <span className={styles.tlabel}>{paused ? 'Riprendi' : 'Pausa'}</span>
        </button>
        <button
          type="button"
          className={`${styles.tbtn} ${stepMode ? styles.tbtnOn : ''}`}
          aria-pressed={stepMode}
          onClick={() => {
            setStepMode(!stepMode)
          }}
          title="Un evento alla volta: avanzi tu (tasto S)"
        >
          <Footprints size={15} aria-hidden />
          <span className={styles.tlabel}>Passo-passo</span>
        </button>
        {/* Always present (no jump in the bar); enabled only while the run is held on a stop. */}
        <button
          type="button"
          className={`${styles.tbtn} ${stepMode && heldEvent ? styles.tbtnNext : ''}`}
          onClick={step}
          disabled={!stepMode || !heldEvent}
          title={
            !stepMode
              ? 'Attiva «Passo-passo» per avanzare un evento alla volta'
              : heldEvent
                ? 'Avanti alla prossima tappa (S)'
                : 'Avanti si attiva quando la prova si ferma su una tappa (S)'
          }
        >
          <SkipForward size={15} aria-hidden />
          <span className={styles.tlabel}>Avanti</span>
        </button>

        <div className={styles.speed} role="radiogroup" aria-label="Velocità delle animazioni">
          {SPEEDS.map(o => (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={speed === o.value}
              aria-label={o.name}
              title={o.name}
              className={speed === o.value ? styles.speedOn : undefined}
              onClick={() => {
                setSpeed(o.value)
              }}
            >
              {o.label}
            </button>
          ))}
        </div>

        <span className={styles.sep} aria-hidden />

        <button
          type="button"
          className={styles.tbtn}
          onClick={() => {
            useLab.getState().resetConversation()
          }}
          disabled={!hasConversation}
          title="Ricomincia da zero: svuota conversazione, eventi e memoria di sessione"
        >
          <RotateCcw size={15} aria-hidden />
          <span className={styles.tlabel}>Ricomincia</span>
        </button>
      </div>
    </div>
  )
}

interface GuideInput {
  busy: boolean
  paused: boolean
  stepMode: boolean
  held: boolean
  hold: ReturnType<typeof holdText> | null
}

/** The one sentence the bar shows about the run's state; null when there is nothing to say. */
function describeGuide({ busy, paused, stepMode, held, hold }: GuideInput): { tone: 'held' | 'wait' | 'idle' | 'pause'; label?: string; text: string } | null {
  if (stepMode && held && hold) {
    return {
      tone: 'held',
      label: hold.stop > 0 ? `Tappa ${hold.stop} · ` : 'Fermo qui · ',
      text: `${capitalize(hold.here)}.${hold.next ? ` Avanti: ${hold.next}.` : ''}`,
    }
  }
  if (stepMode && busy) return { tone: 'wait', text: 'Il modello sta lavorando… Avanti si riattiva alla prossima tappa.' }
  if (stepMode) return { tone: 'idle', text: 'Passo-passo attivo: premi Avvia, poi Avanti a ogni tappa.' }
  if (paused && held) return { tone: 'pause', label: 'In pausa · ', text: hold ? `${capitalize(hold.here)}.` : '' }
  return null
}
