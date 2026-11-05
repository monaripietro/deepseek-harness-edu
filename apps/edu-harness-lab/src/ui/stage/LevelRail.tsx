import { useEffect, useRef } from 'react'
import type { CSSProperties } from 'react'
import { ArrowLeft, ArrowRight, Check, ChevronDown, ListOrdered, Lock } from 'lucide-react'
import type { LevelId } from '../../domain/types'
import { COMPONENTS, LEVELS, configForLevel, levelsFor } from '../../harness/levels'
import { SCENARIOS } from '../../scenarios'
import { useLab } from '../../state/store'
import { isUnlocked, useProgress } from '../shell/progress'
import styles from './LevelRail.module.css'

type StepState = 'current' | 'done' | 'open' | 'locked'

const STEP_LABELS: Record<StepState, string> = {
  current: 'Selezionato',
  done: 'Visitato',
  open: 'Disponibile',
  locked: 'Bloccato',
}

const PRESETS: { label: string; level: LevelId; note: string }[] = [
  { label: 'Solo modello', level: 0, note: 'il punto di partenza' },
  { label: 'Assistente con documenti', level: 4, note: 'istruzioni, contesto, memoria, RAG' },
  { label: 'Agente senza supervisione', level: 7, note: 'strumenti, ciclo e controlli' },
  { label: 'Agente completo', level: 9, note: 'con persona e MCP' },
]

function stepState(id: LevelId, selected: LevelId, highest: number): StepState {
  if (id === selected) return 'current'
  if (id < selected) return 'done'
  return isUnlocked(id, highest) ? 'open' : 'locked'
}

function stepName(id: LevelId, title: string, state: StepState) {
  return `Livello ${id + 1}: ${title} — ${STEP_LABELS[state].toLowerCase()}`
}

/**
 * `stepper` is the inline level control for the top bar, `detail` the one-line "Prova / Aggiunge" strip
 * (and the free-lab presets); the default renders both together.
 */
export function LevelRail({ part = 'all' }: { part?: 'all' | 'stepper' | 'detail' }) {
  const view = useLab(s => s.view)
  const level = useLab(s => s.level)
  const setLevel = useLab(s => s.setLevel)
  const status = useLab(s => s.status)
  const updateConfig = useLab(s => s.updateConfig)
  const highest = useProgress(s => s.highestReached)
  const scenarioId = useLab(s => s.scenarioId)
  // Only the levels that change this scenario's outcome: later layers add nothing to it.
  const levels = levelsFor(SCENARIOS.find(item => item.id === scenarioId))
  const def = levels.find(item => item.id === level) ?? LEVELS[level]
  const running = status === 'running' || status === 'awaitingApproval'
  const allRef = useRef<HTMLDetailsElement>(null)

  // The level list closes on an outside click and on Esc.
  useEffect(() => {
    const close = (e: Event) => {
      const el = allRef.current
      if (!el?.open) return
      if (e instanceof KeyboardEvent) {
        if (e.key !== 'Escape') return
      } else if (e.target instanceof Node && el.contains(e.target)) return
      el.open = false
    }
    document.addEventListener('pointerdown', close, true)
    document.addEventListener('keydown', close, true)
    return () => {
      document.removeEventListener('pointerdown', close, true)
      document.removeEventListener('keydown', close, true)
    }
  }, [])

  if (view === 'lab' && part === 'stepper') return null
  if (view === 'lab') {
    return (
      <section className={styles.rail} aria-label="Laboratorio">
        <div className={styles.labRow}>
          <p className={styles.labHint}>
            <strong>Laboratorio libero.</strong> Accendi e spegni i componenti direttamente nel motore, oppure parti da una
            composizione pronta:
          </p>
          <div className={styles.presets}>
            {PRESETS.map(p => (
              <button
                key={p.label}
                type="button"
                className={styles.preset}
                disabled={running}
                onClick={() => {
                  const cfg = configForLevel(p.level)
                  updateConfig({ components: cfg.components, enabledTools: cfg.enabledTools, mcpServers: cfg.mcpServers })
                }}
              >
                <strong>{p.label}</strong>
                <span>{p.note}</span>
              </button>
            ))}
          </div>
        </div>
      </section>
    )
  }

  const next = levels.find(l => l.id === level + 1)

  const stepper = (
    <div className={styles.guidedTop}>
      <nav className={styles.nav} aria-label="Navigazione livelli">
        <button
          type="button"
          className={styles.navBtn}
          onClick={() => { setLevel((level - 1) as LevelId) }}
          disabled={level === 0 || running}
          aria-label="Livello precedente"
        >
          <ArrowLeft size={16} aria-hidden />
        </button>
      </nav>

      <nav className={styles.progression} aria-label="Avanzamento livelli">
        <ol className={styles.steps}>
          {levels.map((l) => {
            const state = stepState(l.id, level, highest)
            return (
              <li key={l.id}>
                <button
                  type="button"
                  className={`${styles.step} ${styles[state]}`}
                  disabled={state === 'locked' || running}
                  aria-current={l.id === level ? 'step' : undefined}
                  aria-label={stepName(l.id, l.title, state)}
                  onClick={() => { setLevel(l.id) }}
                >
                  {l.id + 1}
                </button>
              </li>
            )
          })}
        </ol>
      </nav>

      <nav className={styles.nav} aria-label="Livello successivo">
        <button
          type="button"
          className={styles.navBtn}
          onClick={() => { setLevel((level + 1) as LevelId) }}
          disabled={!next || running}
          aria-label={next ? `Livello successivo: ${next.title}` : 'Percorso completato'}
        >
          <ArrowRight size={16} aria-hidden />
        </button>
      </nav>

      <details className={styles.allLevels} ref={allRef}>
        <summary className={styles.allLevelsToggle} title="Tutti i livelli">
          <span className={styles.levelTag}>
            Livello {level + 1}/{levels.length}
          </span>
          <span className={styles.levelTitle}>{def?.title}</span>
          <ChevronDown size={16} className={styles.toggleIcon} aria-hidden />
        </summary>
        <div className={styles.levelListViewport}>
          <p className={styles.listTitle}>
            <ListOrdered size={14} aria-hidden /> Tutti i livelli
          </p>
          <ol className={styles.levelList}>
            {levels.map((l) => {
              const state = stepState(l.id, level, highest)
              return (
                <li key={l.id}>
                  <button
                    type="button"
                    className={`${styles.levelChoice} ${styles[state]}`}
                    disabled={state === 'locked' || running}
                    aria-current={l.id === level ? 'step' : undefined}
                    aria-label={stepName(l.id, l.title, state)}
                    onClick={() => { setLevel(l.id); if (allRef.current) allRef.current.open = false }}
                  >
                    <span className={styles.levelMarker} aria-hidden>
                      {state === 'done' ? <Check size={14} /> : state === 'locked' ? <Lock size={12} /> : l.id + 1}
                    </span>
                    <span className={styles.levelChoiceTitle}>{l.title}</span>
                    <span className={styles.levelChoiceStatus}>{STEP_LABELS[state]}</span>
                  </button>
                </li>
              )
            })}
          </ol>
        </div>
      </details>
    </div>
  )

  const detail = (
    <div className={styles.now}>
      <p className={styles.action} title={def?.action}>
        <span className={styles.detailLabel}>Prova</span>
        <span className={styles.actionText}>{def?.action}</span>
      </p>
      {def && def.adds.length > 0 && (
        <div className={styles.adds} aria-label="Componenti aggiunti">
          <span className={styles.detailLabel}>{level === 0 ? 'Base' : 'Aggiunge'}</span>
          <div className={styles.chips}>
            {def.adds.map(c => (
              <span key={c} className={styles.addChip} style={{ '--fam': `var(--c-${COMPONENTS[c].family})` } as CSSProperties}>
                {COMPONENTS[c].label}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )

  if (part === 'stepper') return stepper
  if (part === 'detail') return <section className={styles.detailRow} aria-label="Livello corrente">{detail}</section>
  return (
    <section className={styles.rail} aria-label="Percorso guidato">
      {stepper}
      {detail}
    </section>
  )
}
