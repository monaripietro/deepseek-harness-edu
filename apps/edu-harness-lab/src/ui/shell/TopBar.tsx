import { useEffect, useId, useRef, useState } from 'react'
import {
  ChevronDown,
  Clapperboard,
  Columns3,
  FlaskConical,
  GraduationCap,
  Layers,
  Microscope,
  Moon,
  Pause,
  Play,
  Presentation,
  Route,
  Settings,
  SkipForward,
  SlidersHorizontal,
  Sun,
} from 'lucide-react'
import type { Theme, View } from '../../state/store'
import { useLab } from '../../state/store'
import { SCENARIOS } from '../../scenarios'
import { ModelStatusChip } from '../model/ModelStatusChip'
import { Button, IconButton } from '../common/Button'
import { Segmented } from '../common/Segmented'
import { useDockTab } from '../stage/cards'
import styles from './TopBar.module.css'

type ThemeOption = { id: Theme; label: string; icon: React.ReactNode }

const THEMES: readonly [ThemeOption, ...ThemeOption[]] = [
  { id: 'light', label: 'Tema chiaro', icon: <Sun size={19} /> },
  { id: 'dark', label: 'Tema scuro', icon: <Moon size={19} /> },
  { id: 'aula', label: 'Tema aula (alto contrasto per proiettori)', icon: <GraduationCap size={19} /> },
]

export function TopBar({ onOpenModel, onOpenSettings }: { onOpenModel: () => void; onOpenSettings: () => void }) {
  const view = useLab(s => s.view)
  const setView = useLab(s => s.setView)
  const scenarioId = useLab(s => s.scenarioId)
  const setScenario = useLab(s => s.setScenario)
  const status = useLab(s => s.status)
  const paused = useLab(s => s.paused)
  const togglePause = useLab(s => s.togglePause)
  const stepMode = useLab(s => s.stepMode)
  const setStepMode = useLab(s => s.setStepMode)
  const step = useLab(s => s.step)
  const speed = useLab(s => s.speed)
  const setSpeed = useLab(s => s.setSpeed)
  const openLab = useLab(s => s.openLab)
  const teacherOpen = useLab(s => s.teacherOpen)
  const setTeacherOpen = useLab(s => s.setTeacherOpen)
  const theme = useLab(s => s.theme)
  const setTheme = useLab(s => s.setTheme)
  const presentation = useLab(s => s.presentation)
  const setPresentation = useLab(s => s.setPresentation)
  const running = status === 'running' || status === 'awaitingApproval'
  const themeIdx = THEMES.findIndex(t => t.id === theme)
  const nextTheme = THEMES[(themeIdx + 1) % THEMES.length] ?? THEMES[0]
  const controlsId = useId()
  const controlsRef = useRef<HTMLDetailsElement>(null)
  const controlsTriggerRef = useRef<HTMLElement>(null)
  const [controlsOpen, setControlsOpen] = useState(false)
  const openDeepDive = useDockTab()

  useEffect(() => {
    if (!controlsOpen) return

    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !controlsRef.current?.contains(event.target)) setControlsOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      setControlsOpen(false)
      controlsTriggerRef.current?.focus()
    }

    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown, true)
    }
  }, [controlsOpen])

  return (
    <header className={styles.bar}>
      <div className={styles.brand}>
        <span className={styles.logo} aria-hidden>
          <span className={styles.logoCore} />
        </span>
        <div className={styles.brandText}>
          <strong>Harness Lab</strong>
          <span>Dal modello all’agente</span>
        </div>
      </div>

      <nav aria-label="Modalità" className={styles.modeNav}>
        <Segmented<View>
          ariaLabel="Vista"
          value={view}
          onChange={setView}
          options={[
            { value: 'guided', label: 'Percorso', icon: <Route size={16} /> },
            { value: 'lab', label: 'Laboratorio', icon: <FlaskConical size={16} /> },
            { value: 'compare', label: 'Confronto', icon: <Columns3 size={16} /> },
          ]}
        />
      </nav>

      <label className={styles.select}>
        <span className={styles.selectLabel}>Scenario</span>
        <select value={scenarioId} onChange={e => setScenario(e.target.value)} aria-label="Scenario" disabled={running}>
          {SCENARIOS.map(s => (
            <option key={s.id} value={s.id}>
              {s.shortTitle}
            </option>
          ))}
        </select>
      </label>

      <div className={styles.model}>
        <ModelStatusChip onOpen={onOpenModel} />
      </div>

      <div className={styles.spacer} aria-hidden />

      <Button
        size="sm"
        variant="ghost"
        className={styles.deep}
        icon={<Layers size={17} />}
        title="Cosa riceve il modello, registro degli eventi, conversazione e verifiche"
        onClick={() => openDeepDive('context')}
      >
        Approfondisci
      </Button>

      <details className={styles.controls} open={controlsOpen} ref={controlsRef}>
        <summary
          className={styles.controlsTrigger}
          aria-controls={controlsId}
          aria-expanded={controlsOpen}
          onClick={(event) => {
            event.preventDefault()
            setControlsOpen(open => !open)
          }}
          ref={controlsTriggerRef}
        >
          <SlidersHorizontal size={17} aria-hidden />
          <span>Controlli</span>
          <ChevronDown size={15} aria-hidden className={styles.chevron} />
        </summary>

        <div id={controlsId} className={styles.controlsPanel}>
          <section className={styles.controlSection} aria-labelledby={`${controlsId}-animation`}>
            <h2 id={`${controlsId}-animation`} className={styles.sectionTitle}>
              Animazioni
            </h2>
            <div className={styles.transport} role="group" aria-label="Riproduzione delle animazioni">
              <IconButton
                label={paused ? 'Riprendi (Spazio)' : 'Pausa (Spazio)'}
                icon={paused ? <Play size={17} /> : <Pause size={17} />}
                onClick={togglePause}
                active={paused}
                size="sm"
              />
              <button
                type="button"
                className={`${styles.stepToggle} ${stepMode ? styles.stepOn : ''}`}
                aria-pressed={stepMode}
                onClick={() => setStepMode(!stepMode)}
                title="Un evento alla volta: avanzi tu con il tasto S"
              >
                Passo-passo
              </button>
              {stepMode && (
                <IconButton
                  label="Avanti di un evento (S)"
                  icon={<SkipForward size={17} />}
                  onClick={step}
                  variant="primary"
                  size="sm"
                />
              )}
            </div>
            <div className={styles.speed}>
              <span className={styles.speedLabel}>Velocità</span>
              <Segmented<number>
                ariaLabel="Velocità delle animazioni"
                value={speed}
                onChange={setSpeed}
                options={[
                  { value: 0.5, label: '0,5×' },
                  { value: 1, label: '1×' },
                  { value: 2, label: '2×' },
                ]}
              />
            </div>
          </section>

          <section className={styles.controlSection} aria-labelledby={`${controlsId}-tools`}>
            <h2 id={`${controlsId}-tools`} className={styles.sectionTitle}>
              Strumenti e aspetto
            </h2>
            <div className={styles.menuActions}>
              <Button
                size="sm"
                variant="ghost"
                className={styles.menuAction}
                icon={<Microscope size={17} />}
                aria-label="Laboratori: strumenti, documenti, MCP, memoria"
                title="Laboratori: strumenti, documenti, MCP, memoria"
                onClick={() => {
                  openLab('tools')
                  setControlsOpen(false)
                }}
              >
                Laboratori
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className={styles.menuAction}
                icon={<Clapperboard size={17} />}
                active={teacherOpen}
                aria-pressed={teacherOpen}
                onClick={() => {
                  setTeacherOpen(!teacherOpen)
                  setControlsOpen(false)
                }}
              >
                Regia docente
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className={styles.menuAction}
                icon={THEMES[themeIdx]?.icon ?? <Moon size={19} />}
                aria-label={`Cambia tema: ${nextTheme.label}`}
                title={`Cambia tema: ${nextTheme.label}`}
                onClick={() => {
                  setTheme(nextTheme.id)
                  setControlsOpen(false)
                }}
              >
                Cambia tema
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className={styles.menuAction}
                icon={<Presentation size={17} />}
                active={presentation}
                aria-pressed={presentation}
                title="Modalità presentazione"
                onClick={() => {
                  setPresentation(!presentation)
                  setControlsOpen(false)
                }}
              >
                Modalità presentazione
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className={`${styles.menuAction} ${styles.settingsAction}`}
                icon={<Settings size={17} />}
                aria-label="Impostazioni e dati locali"
                title="Impostazioni e dati locali"
                onClick={() => {
                  onOpenSettings()
                  setControlsOpen(false)
                }}
              >
                Impostazioni e dati locali
              </Button>
            </div>
          </section>
        </div>
      </details>
    </header>
  )
}
