import { Footprints, Pause, Play, RotateCcw, SkipForward, Square } from 'lucide-react'
import { useLab } from '../../state/store'
import { useT } from '../../i18n'
import { capitalize, holdText } from './stepStops'
import { useBusy, useRequestDraft } from './stageUi'
import styles from './StageChrome.module.css'

/**
 * Playback next to the animation: run / stop, pause, step-by-step, speed and a clean restart.
 * Space pauses and S advances one event (global shortcuts in App).
 * The line above the bar says where the run is held and what «Avanti» does next.
 */
export function StageTransport() {
  const t = useT()
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

  const speeds = [
    { value: 0.5, label: '0,5×', name: t('Velocità: metà', 'Speed: half') },
    { value: 1, label: '1×', name: t('Velocità: normale', 'Speed: normal') },
    { value: 2, label: '2×', name: t('Velocità: doppia', 'Speed: double') },
  ] as const

  const run = () => {
    const s = useLab.getState()
    if (busy) s.stop()
    else void s.send(text)
  }

  const hold = heldEvent ? holdText(heldEvent, components, events) : null
  const guide = describeGuide(t, { busy, paused, stepMode, held: !!heldEvent, hold })

  return (
    <div className={styles.dock}>
      {guide && (
        <p className={`${styles.guide} ${styles[`guide_${guide.tone}`]}`} role="status" aria-live="polite">
          {guide.label && <strong className={styles.guideLabel}>{guide.label}</strong>}
          {guide.text}
        </p>
      )}
      <div className={styles.transport} role="group" aria-label={t('Riproduzione', 'Playback')}>
        <button
          type="button"
          className={`${styles.primary} ${busy ? styles.primaryStop : ''}`}
          onClick={run}
          disabled={!busy && !text.trim()}
          title={busy ? t('Ferma la richiesta in corso', 'Stop the request in progress') : t('Invia la richiesta e guarda l’harness al lavoro', 'Send the request and watch the harness at work')}
        >
          {busy ? <Square size={14} fill="currentColor" aria-hidden /> : <Play size={15} fill="currentColor" aria-hidden />}
          <span>{busy ? t('Ferma', 'Stop') : t('Avvia la richiesta', 'Start the request')}</span>
        </button>

        <span className={styles.sep} aria-hidden />

        <button
          type="button"
          className={`${styles.tbtn} ${paused ? styles.tbtnOn : ''}`}
          aria-pressed={paused}
          onClick={togglePause}
          disabled={!busy && !paused}
          title={
            paused
              ? t('Riprendi l’animazione (Spazio)', 'Resume the animation (Space)')
              : t('Metti in pausa tra un evento e l’altro (Spazio)', 'Pause between one event and the next (Space)')
          }
        >
          {paused ? <Play size={15} aria-hidden /> : <Pause size={15} aria-hidden />}
          <span className={styles.tlabel}>{paused ? t('Riprendi', 'Resume') : t('Pausa', 'Pause')}</span>
        </button>
        <button
          type="button"
          className={`${styles.tbtn} ${stepMode ? styles.tbtnOn : ''}`}
          aria-pressed={stepMode}
          onClick={() => {
            setStepMode(!stepMode)
          }}
          title={t('Un evento alla volta: avanzi tu (tasto S)', 'One event at a time: you move on (S key)')}
        >
          <Footprints size={15} aria-hidden />
          <span className={styles.tlabel}>{t('Passo-passo', 'Step by step')}</span>
        </button>
        {/* Always present (no jump in the bar); enabled only while the run is held on a stop. */}
        <button
          type="button"
          className={`${styles.tbtn} ${stepMode && heldEvent ? styles.tbtnNext : ''}`}
          onClick={step}
          disabled={!stepMode || !heldEvent}
          title={
            !stepMode
              ? t('Attiva «Passo-passo» per avanzare un evento alla volta', 'Turn on «Step by step» to move on one event at a time')
              : heldEvent
                ? t('Avanti alla prossima tappa (S)', 'Next stop (S)')
                : t('Avanti si attiva quando la prova si ferma su una tappa (S)', 'Next becomes available when the run stops at a stop (S)')
          }
        >
          <SkipForward size={15} aria-hidden />
          <span className={styles.tlabel}>{t('Avanti', 'Next')}</span>
        </button>

        <div className={styles.speed} role="radiogroup" aria-label={t('Velocità delle animazioni', 'Animation speed')}>
          {speeds.map(o => (
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
          title={t('Ricomincia da zero: svuota conversazione, eventi e memoria di sessione', 'Start over: empties the conversation, the events and the session memory')}
        >
          <RotateCcw size={15} aria-hidden />
          <span className={styles.tlabel}>{t('Ricomincia', 'Start over')}</span>
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
function describeGuide(
  t: (it: string, en: string) => string,
  { busy, paused, stepMode, held, hold }: GuideInput,
): { tone: 'held' | 'wait' | 'idle' | 'pause'; label?: string; text: string } | null {
  if (stepMode && held && hold) {
    return {
      tone: 'held',
      label: hold.stop > 0 ? t(`Tappa ${hold.stop} · `, `Stop ${hold.stop} · `) : t('Fermo qui · ', 'Stopped here · '),
      text: `${capitalize(hold.here)}.${hold.next ? t(` Avanti: ${hold.next}.`, ` Next: ${hold.next}.`) : ''}`,
    }
  }
  if (stepMode && busy)
    return {
      tone: 'wait',
      text: t('Il modello sta lavorando… Avanti si riattiva alla prossima tappa.', 'The model is working… Next becomes available again at the next stop.'),
    }
  if (stepMode)
    return { tone: 'idle', text: t('Passo-passo attivo: premi Avvia, poi Avanti a ogni tappa.', 'Step by step is on: press Start, then Next at each stop.') }
  if (paused && held)
    return { tone: 'pause', label: t('In pausa · ', 'Paused · '), text: hold ? `${capitalize(hold.here)}.` : '' }
  return null
}
