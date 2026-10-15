import { Check, CornerDownRight, ListChecks, X } from 'lucide-react'
import { useLab } from '../../state/store'
import type { PlanStep, StageState } from './deriveStage'
import { PLAN_RECT } from './geometry'
import { useStageUi } from './stageUi'
import styles from './stage.module.css'

const STATUS_LABEL: Record<PlanStep['status'], string> = { pending: 'da fare', active: 'in corso', done: 'fatto', failed: 'non riuscito' }

/** Step text without its leading tool name (shown apart as a tag). */
const describe = (st: PlanStep) => (st.tool && st.tool !== 'answer' ? st.text.replace(st.tool, '').replace(/^[\s:—–-]+/, '') : st.text) || st.text

/**
 * The plan the model wrote before acting (forced planning step) and how it is being carried out:
 * each tool call ticks the step it belongs to; calls that match no step are listed as "outside the plan".
 */
export function PlanBoard({ stage }: { stage: StageState }) {
  const c = useLab(s => s.config.components)
  const toggle = useStageUi(s => s.toggle)
  if (!c.orchestrator || !c.tools) return null
  const plan = stage.plan
  const done = plan?.steps.filter(st => st.status === 'done').length ?? 0
  const shown = plan?.steps.slice(0, 5) ?? []

  return (
    <section
      className={`${styles.planBoard} ${plan ? '' : styles.planEmpty}`}
      style={{ left: PLAN_RECT.x, top: PLAN_RECT.y, width: PLAN_RECT.w }}
      data-node="orchestrator"
      tabIndex={0}
      aria-label="Piano del modello: apri i dettagli del ciclo"
      onClick={() => toggle('orchestrator')}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          toggle('orchestrator')
        }
      }}
    >
      <header className={styles.planHead}>
        <ListChecks size={20} aria-hidden />
        <span className={styles.planTitle}>Piano del modello</span>
        {plan && (
          <span className={styles.meta}>
            {done}/{plan.steps.length} passi
          </span>
        )}
      </header>
      {plan ? (
        <ol className={styles.planSteps}>
          {shown.map(st => (
            <li key={st.n} className={styles[`plan_${st.status}`]} title={`${st.text} — ${STATUS_LABEL[st.status]}`}>
              <span className={styles.planMark} aria-label={STATUS_LABEL[st.status]}>
                {st.status === 'done' ? <Check size={14} /> : st.status === 'failed' ? <X size={14} /> : st.n}
              </span>
              {st.tool && <code className={styles.planTool}>{st.tool === 'answer' ? 'risposta' : st.tool}</code>}
              <span className={styles.planText}>{describe(st)}</span>
            </li>
          ))}
          {plan.steps.length > shown.length && <li className={styles.planMore}>+ {plan.steps.length - shown.length} passi</li>}
        </ol>
      ) : (
        <p className={styles.planHint}>
          {stage.running ? 'Il modello sta scrivendo il piano…' : 'Prima di agire, il modello scriverà qui il suo piano: i passi e lo strumento per ciascuno.'}
        </p>
      )}
      {plan && plan.offPlan.length > 0 && (
        <p className={styles.planOff}>
          <CornerDownRight size={14} aria-hidden /> Fuori dal piano: {plan.offPlan.join(', ')}
        </p>
      )}
    </section>
  )
}
