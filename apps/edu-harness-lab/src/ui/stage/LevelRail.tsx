import { useEffect, useRef } from 'react'
import type { CSSProperties } from 'react'
import { ArrowLeft, ArrowRight, Check, ChevronDown, ListOrdered, Lock } from 'lucide-react'
import type { LevelId } from '../../domain/types'
import { COMPONENTS, LEVELS, configForLevel, levelsFor } from '../../harness/levels'
import { SCENARIOS } from '../../scenarios'
import { useLab } from '../../state/store'
import { biRecord, useT } from '../../i18n'
import type { Bi } from '../../i18n'
import { componentText, levelText } from '../../i18nContent'
import { isUnlocked, useProgress } from '../shell/progress'
import styles from './LevelRail.module.css'

type StepState = 'current' | 'done' | 'open' | 'locked'
type Translate = ReturnType<typeof useT>

const STEP_LABELS = biRecord<StepState>({
  current: ['Selezionato', 'Selected'],
  done: ['Visitato', 'Visited'],
  open: ['Disponibile', 'Available'],
  locked: ['Bloccato', 'Locked'],
})

const PRESETS: { label: Bi; level: LevelId; note: Bi }[] = [
  { label: ['Solo modello', 'Model only'], level: 0, note: ['il punto di partenza', 'the starting point'] },
  {
    label: ['Assistente con documenti', 'Assistant with documents'],
    level: 4,
    note: ['istruzioni, contesto, memoria, RAG', 'instructions, context, memory, RAG'],
  },
  {
    label: ['Agente senza supervisione', 'Agent without supervision'],
    level: 7,
    note: ['strumenti, ciclo e controlli', 'tools, loop and controls'],
  },
  { label: ['Agente completo', 'Full agent'], level: 9, note: ['con persona e MCP', 'with persona and MCP'] },
]

function stepState(id: LevelId, selected: LevelId, highest: number): StepState {
  if (id === selected) return 'current'
  if (id < selected) return 'done'
  return isUnlocked(id, highest) ? 'open' : 'locked'
}

function stepName(id: LevelId, title: string, state: StepState, t: Translate) {
  return `${t('Livello', 'Level')} ${id + 1}: ${title} — ${STEP_LABELS[state].toLowerCase()}`
}

/**
 * `stepper` is the inline level control for the top bar, `detail` the one-line "Prova / Aggiunge" strip
 * (and the free-lab presets); the default renders both together.
 */
export function LevelRail({ part = 'all' }: { part?: 'all' | 'stepper' | 'detail' }) {
  const t = useT()
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
  const defText = def ? levelText(def, scenarioId) : undefined
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
      <section className={styles.rail} aria-label={t('Laboratorio', 'Lab')}>
        <div className={styles.labRow}>
          <p className={styles.labHint}>
            <strong>{t('Laboratorio libero.', 'Free lab.')}</strong>{' '}
            {t(
              'Accendi e spegni i componenti direttamente nel motore, oppure parti da una composizione pronta:',
              'Switch components on and off directly in the engine, or start from a ready-made setup:',
            )}
          </p>
          <div className={styles.presets}>
            {PRESETS.map(p => (
              <button
                key={p.label[0]}
                type="button"
                className={styles.preset}
                disabled={running}
                onClick={() => {
                  const cfg = configForLevel(p.level)
                  updateConfig({ components: cfg.components, enabledTools: cfg.enabledTools, mcpServers: cfg.mcpServers })
                }}
              >
                <strong>{t(p.label[0], p.label[1])}</strong>
                <span>{t(p.note[0], p.note[1])}</span>
              </button>
            ))}
          </div>
        </div>
      </section>
    )
  }

  const next = levels.find(l => l.id === level + 1)
  const nextText = next ? levelText(next, scenarioId) : undefined

  const stepper = (
    <div className={styles.guidedTop}>
      <nav className={styles.nav} aria-label={t('Navigazione livelli', 'Level navigation')}>
        <button
          type="button"
          className={styles.navBtn}
          onClick={() => { setLevel((level - 1) as LevelId) }}
          disabled={level === 0 || running}
          aria-label={t('Livello precedente', 'Previous level')}
        >
          <ArrowLeft size={16} aria-hidden />
        </button>
      </nav>

      <nav className={styles.progression} aria-label={t('Avanzamento livelli', 'Level progress')}>
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
                  aria-label={stepName(l.id, levelText(l, scenarioId).title, state, t)}
                  onClick={() => { setLevel(l.id) }}
                >
                  {l.id + 1}
                </button>
              </li>
            )
          })}
        </ol>
      </nav>

      <nav className={styles.nav} aria-label={t('Livello successivo', 'Next level')}>
        <button
          type="button"
          className={styles.navBtn}
          onClick={() => { setLevel((level + 1) as LevelId) }}
          disabled={!next || running}
          aria-label={
            nextText
              ? `${t('Livello successivo', 'Next level')}: ${nextText.title}`
              : t('Percorso completato', 'Path completed')
          }
        >
          <ArrowRight size={16} aria-hidden />
        </button>
      </nav>

      <details className={styles.allLevels} ref={allRef}>
        <summary className={styles.allLevelsToggle} title={t('Tutti i livelli', 'All levels')}>
          <span className={styles.levelTag}>
            {t('Livello', 'Level')} {level + 1}/{levels.length}
          </span>
          <span className={styles.levelTitle}>{defText?.title}</span>
          <ChevronDown size={16} className={styles.toggleIcon} aria-hidden />
        </summary>
        <div className={styles.levelListViewport}>
          <p className={styles.listTitle}>
            <ListOrdered size={14} aria-hidden /> {t('Tutti i livelli', 'All levels')}
          </p>
          <ol className={styles.levelList}>
            {levels.map((l) => {
              const state = stepState(l.id, level, highest)
              const copy = levelText(l, scenarioId)
              return (
                <li key={l.id}>
                  <button
                    type="button"
                    className={`${styles.levelChoice} ${styles[state]}`}
                    disabled={state === 'locked' || running}
                    aria-current={l.id === level ? 'step' : undefined}
                    aria-label={stepName(l.id, copy.title, state, t)}
                    onClick={() => { setLevel(l.id); if (allRef.current) allRef.current.open = false }}
                  >
                    <span className={styles.levelMarker} aria-hidden>
                      {state === 'done' ? <Check size={14} /> : state === 'locked' ? <Lock size={12} /> : l.id + 1}
                    </span>
                    <span className={styles.levelChoiceTitle}>{copy.title}</span>
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
      <p className={styles.action} title={defText?.action}>
        <span className={styles.detailLabel}>{t('Prova', 'Try')}</span>
        <span className={styles.actionText}>{defText?.action}</span>
      </p>
      {def && def.adds.length > 0 && (
        <div className={styles.adds} aria-label={t('Componenti aggiunti', 'Added components')}>
          <span className={styles.detailLabel}>{level === 0 ? t('Base', 'Base') : t('Aggiunge', 'Adds')}</span>
          <div className={styles.chips}>
            {def.adds.map(c => (
              <span key={c} className={styles.addChip} style={{ '--fam': `var(--c-${COMPONENTS[c].family})` } as CSSProperties}>
                {componentText(c).label}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )

  if (part === 'stepper') return stepper
  if (part === 'detail') {
    return <section className={styles.detailRow} aria-label={t('Livello corrente', 'Current level')}>{detail}</section>
  }
  return (
    <section className={styles.rail} aria-label={t('Percorso guidato', 'Guided path')}>
      {stepper}
      {detail}
    </section>
  )
}
