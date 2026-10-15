import type { CSSProperties } from 'react'
import { ArrowLeft, ArrowRight, Check, ChevronDown, ListOrdered, Lock } from 'lucide-react'
import type { LevelId } from '../../domain/types'
import { COMPONENTS, LEVELS, configForLevel } from '../../harness/levels'
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

export function LevelRail() {
  const view = useLab(s => s.view)
  const level = useLab(s => s.level)
  const setLevel = useLab(s => s.setLevel)
  const status = useLab(s => s.status)
  const updateConfig = useLab(s => s.updateConfig)
  const highest = useProgress(s => s.highestReached)
  const def = LEVELS[level]
  const running = status === 'running' || status === 'awaitingApproval'

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

  const next = LEVELS[level + 1]

  return (
    <section className={styles.rail} aria-label="Percorso guidato">
      <div className={styles.guidedTop}>
        <nav className={styles.progression} aria-label="Avanzamento livelli">
          <ol className={styles.steps}>
            {LEVELS.map((l) => {
              const state = stepState(l.id, level, highest)
              return (
                <li key={l.id}>
                  <button
                    type="button"
                    className={`${styles.step} ${styles[state]}`}
                    disabled={state === 'locked' || running}
                    aria-current={l.id === level ? 'step' : undefined}
                    aria-label={stepName(l.id, l.title, state)}
                    onClick={() => setLevel(l.id)}
                  >
                    {l.id + 1}
                  </button>
                </li>
              )
            })}
          </ol>
        </nav>

        <details className={styles.allLevels}>
          <summary className={styles.allLevelsToggle}>
            <ListOrdered size={16} aria-hidden />
            <span>Tutti i livelli</span>
            <ChevronDown size={16} className={styles.toggleIcon} aria-hidden />
          </summary>
          <div className={styles.levelListViewport}>
            <ol className={styles.levelList}>
              {LEVELS.map((l) => {
                const state = stepState(l.id, level, highest)
                return (
                  <li key={l.id}>
                    <button
                      type="button"
                      className={`${styles.levelChoice} ${styles[state]}`}
                      disabled={state === 'locked' || running}
                      aria-current={l.id === level ? 'step' : undefined}
                      aria-label={stepName(l.id, l.title, state)}
                      onClick={() => setLevel(l.id)}
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

        <nav className={styles.nav} aria-label="Navigazione livelli">
          <button
            type="button"
            className={styles.navBtn}
            onClick={() => setLevel((level - 1) as LevelId)}
            disabled={level === 0 || running}
            aria-label="Livello precedente"
          >
            <ArrowLeft size={16} aria-hidden />
          </button>
          <button
            type="button"
            className={styles.nextBtn}
            onClick={() => setLevel((level + 1) as LevelId)}
            disabled={level === LEVELS.length - 1 || running}
            aria-label={next ? `Livello successivo: ${next.title}` : 'Percorso completato'}
          >
            <span>{next ? 'Successivo' : 'Completato'}</span>
            {next && <ArrowRight size={16} aria-hidden />}
          </button>
        </nav>
      </div>

      <div className={styles.now}>
        <div className={styles.levelHeading}>
          <p className={styles.levelTag}>
            Livello {level + 1}/{LEVELS.length}
          </p>
          <h2 className={styles.levelTitle}>{def?.title}</h2>
        </div>
        <div className={styles.levelDetails}>
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
      </div>
    </section>
  )
}
