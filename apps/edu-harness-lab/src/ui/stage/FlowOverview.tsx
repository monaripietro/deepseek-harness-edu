import type { CSSProperties } from 'react'
import { ArrowDown, ArrowRight, ArrowUp, Cpu, Database, FileSearch, FileText, Globe, Layers, MessageSquare, Repeat, Settings2, ShieldCheck, Sparkles, UserRound, Wrench } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ComponentFamily, ComponentId } from '../../domain/types'
import { COMPONENT_ORDER } from '../../harness/levels'
import { tr, useT } from '../../i18n'
import { componentText } from '../../i18nContent'
import { useLab } from '../../state/store'
import { Switch } from '../common/Switch'
import type { FlowStepId } from './flowSteps'
import { flowStepsFor } from './flowSteps'
import type { StageNodeId } from './geometry'
import { NodeDetails } from './NodeDetails'
import { useLevelAdds, useStage, useStageUi } from './stageUi'
import styles from './FlowOverview.module.css'

const SOURCES: { component: ComponentId; node: StageNodeId; readonly label: string; icon: LucideIcon }[] = [
  { component: 'instructions', node: 'instructions', get label() { return tr('Istruzioni', 'Instructions') }, icon: FileText },
  { component: 'context', node: 'context', get label() { return tr('Dati del compito', 'Task data') }, icon: Layers },
  { component: 'memory', node: 'memory', get label() { return tr('Memoria', 'Memory') }, icon: Database },
  { component: 'rag', node: 'rag', get label() { return tr('Documenti · RAG', 'Documents · RAG') }, icon: FileSearch },
]

function FlowNode({
  node,
  title,
  description,
  icon: Icon,
  number,
  tone = 'information',
  compact = false,
  lit = false,
  isNew = false,
}: {
  node: StageNodeId
  title: string
  description?: string
  icon: LucideIcon
  number?: string
  tone?: ComponentFamily
  compact?: boolean
  lit?: boolean
  /** Added by the current level. */
  isNew?: boolean
}) {
  const t = useT()
  const selected = useStageUi(s => s.selected === node)
  const toggle = useStageUi(s => s.toggle)
  const tags = (
    <>
      {isNew && <span className={styles.newTag}>{t('Nuovo', 'New')}</span>}
      {lit && (
        <span className={styles.nowTag} aria-hidden>
          {t('adesso', 'now')}
        </span>
      )}
    </>
  )
  return (
    <button
      type="button"
      data-node={node}
      className={[styles.node, compact && styles.compact, node === 'model' && styles.model, selected && styles.selected, lit && styles.lit].filter(Boolean).join(' ')}
      style={{ '--node-color': `var(--c-${tone})`, '--node-tint': `var(--c-${tone}-soft)` } as CSSProperties}
      aria-label={`${title}. ${t('Apri i dettagli', 'Open details')}`}
      aria-pressed={selected}
      onClick={() =>{  toggle(node) }}
    >
      <span className={styles.nodeHeading}>
        <span className={styles.nodeIcon} aria-hidden><Icon size={compact ? 17 : 21} /></span>
        {number && !compact && <span className={styles.step}>{t('Passo', 'Step')} {number}</span>}
        {!compact && tags}
      </span>
      <span className={styles.nodeCopy}>
        <span className={styles.nodeTitle}>{title}</span>
        {description && <span className={styles.nodeDescription}>{description}</span>}
      </span>
      {compact && (
        <span className={styles.compactMeta}>
          {tags}
          {number ? (
            <span className={styles.stepNum} title={`${t('Tappa', 'Step')} ${number}`}>
              {number}
            </span>
          ) : (
            <span className={styles.detailMark} aria-hidden>+</span>
          )}
        </span>
      )}
    </button>
  )
}

/** Shows the active request path at readable text sizes, with node details available on demand.
 * @param onApprovalDetails Opens the current action's approval dialog.
 * @returns The request flow and the active harness components.
 */
export function FlowOverview({ onApprovalDetails }: { onApprovalDetails: () => void }) {
  const t = useT()
  const config = useLab(s => s.config)
  const modelInfo = useLab(s => s.modelInfo)
  const view = useLab(s => s.view)
  const status = useLab(s => s.status)
  const toggleComponent = useLab(s => s.toggleComponent)
  const selected = useStageUi(s => s.selected)
  const adds = useLevelAdds()
  const c = config.components
  const stage = useStage()
  const sources = SOURCES.filter(source => c[source.component])
  const additionalCount = Number(c.controls) + Number(c.approval) + Number(c.mcp)
  const busy = status === 'running' || status === 'awaitingApproval'
  // The "adesso" tag shows only while a run is in progress (.spotlight); the final answer stays marked.
  const lit = (node: StageNodeId) => stage.lit.includes(node)
  const isNew = (component: ComponentId) => adds.includes(component)
  // Step numbers shared with the "Adesso" strip above the diagram.
  const steps = flowStepsFor(c)
  const num = (id: FlowStepId) => {
    const i = steps.indexOf(id)
    return i >= 0 ? String(i + 1) : undefined
  }

  return (
    <div className={`${styles.overview} ${stage.running ? styles.spotlight : ''}`}>
      <div className={styles.intro}>
        <h2>{t('Segui il percorso della richiesta', 'Follow the path of the request')}</h2>
        <p>{t('Da sinistra a destra; i numeri sono le tappe indicate in alto. Seleziona un elemento per approfondire.', 'From left to right; the numbers are the steps shown at the top. Select an element to learn more.')}</p>
      </div>

      <div className={styles.diagram}>
        <ol className={styles.path} aria-label={t('Flusso principale della richiesta', 'Main flow of the request')}>
          <li>
            <FlowNode node="question" title={t('La richiesta', 'The request')} description={t('La domanda che invii al sistema.', 'The question you send to the system.')} icon={MessageSquare} number={num('request')} tone="model" lit={lit('question')} />
            <span className={styles.forward} aria-hidden><ArrowRight size={24} /></span>
          </li>
          <li>
            <FlowNode node="window" title={t('Il contesto', 'The context')} description={t('Il testo che il modello può leggere.', 'The text the model can read.')} icon={Layers} number={num('context')} lit={lit('window')} />
            <span className={styles.forward} aria-hidden><ArrowRight size={24} /></span>
          </li>
          <li>
            <FlowNode node="model" title={t('Il modello', 'The model')} description={modelInfo.backend !== 'none' ? modelInfo.label : t('Da caricare per iniziare', 'Load to start')} icon={Cpu} number={num('model')} tone="model" lit={lit('model')} />
            <span className={styles.forward} aria-hidden><ArrowRight size={24} /></span>
          </li>
          <li>
            <FlowNode node="answer" title={t('La risposta', 'The answer')} description={t('Il risultato che ricevi, con le sue fonti.', 'The result you receive, with its sources.')} icon={Sparkles} number={num('answer')} tone="model" lit={lit('answer')} />
          </li>
        </ol>

        <div className={styles.branches}>
          {sources.length > 0 && (
            <section className={styles.sources} aria-label={t('Informazioni aggiunte al contesto', 'Information added to the context')}>
              <span className={styles.sourceLink} aria-hidden><ArrowUp size={24} /></span>
              <h3>{t('Informazioni per il modello', 'Information for the model')}</h3>
              <p>{t("L'harness le aggiunge al contesto.", 'The harness adds it to the context.')}</p>
              <div className={styles.sourceList}>
                {sources.map(source => (
                  <FlowNode
                    key={source.node}
                    node={source.node}
                    title={source.label}
                    icon={source.icon}
                    compact
                    lit={lit(source.node)}
                    isNew={isNew(source.component)}
                  />
                ))}
              </div>
            </section>
          )}

          {c.orchestrator && (
            <section className={styles.actions} aria-label={t('Esecuzione delle azioni', 'Running the actions')}>
              <span className={styles.actionLink} aria-hidden><ArrowDown size={24} /></span>
              <h3>{t("Se il modello chiede un'azione", 'If the model asks for an action')}</h3>
              <p>{t("Il modello la propone. L'harness la esegue.", 'The model proposes it. The harness runs it.')}</p>
              <div className={styles.actionRoute}>
                <FlowNode node="orchestrator" title={componentText('orchestrator').label} icon={Settings2} tone="orchestration" compact number={num('decision')} lit={lit('orchestrator')} isNew={isNew('orchestrator')} />
                {c.tools && (
                  <>
                    <ArrowRight className={styles.actionArrow} size={22} aria-hidden />
                    <FlowNode node="tools" title={componentText('tools').label} icon={Wrench} tone="action" compact number={num('action')} lit={lit('tools')} isNew={isNew('tools')} />
                  </>
                )}
              </div>
              {additionalCount > 0 && (
                <details className={styles.additional}>
                  <summary>{t('Controlli e collegamenti', 'Controls and connections')} ({additionalCount})</summary>
                  <div className={styles.safeguards}>
                    {c.controls && <FlowNode node="controls" title={componentText('controls').label} icon={ShieldCheck} tone="governance" compact lit={lit('controls')} isNew={isNew('controls')} />}
                    {c.approval && <FlowNode node="human" title={componentText('approval').label} icon={UserRound} tone="governance" compact lit={lit('human')} isNew={isNew('approval')} />}
                    {c.mcp && <FlowNode node="mcp" title={componentText('mcp').label} icon={Globe} tone="action" compact lit={lit('mcp')} isNew={isNew('mcp')} />}
                  </div>
                </details>
              )}
              <p className={styles.returnPath}>
                <Repeat size={17} aria-hidden />
                <span>{t('Il risultato rientra nel contesto.', 'The result goes back into the context.')}{c.agentLoop ? t(' Il ciclo si ripete se serve.', ' The loop repeats if needed.') : ''}</span>
              </p>
              {c.tools && <p className={styles.simulation}>{t('Calcoli reali; dati e azioni aziendali simulati.', 'Real calculations; company data and actions are simulated.')}</p>}
            </section>
          )}
        </div>
      </div>

      <div className={styles.takeaway}>
        <Cpu size={18} aria-hidden />
        <p>{t("Il modello resta lo stesso. Sono gli strati dell'harness a dargli informazioni e capacità.", 'The model stays the same. The harness layers give it information and abilities.')}</p>
      </div>

      {view === 'lab' && (
        <details className={styles.composition}>
          <summary>{t("Personalizza gli strati dell'harness", 'Customize the harness layers')}</summary>
          <div className={styles.componentList}>
            {COMPONENT_ORDER.filter(id => id !== 'model').map(id => (
              <div className={styles.componentRow} key={id}>
                <span>{componentText(id).label}</span>
                <Switch label={componentText(id).label} checked={c[id]} disabled={busy} onChange={() =>{  toggleComponent(id) }} />
              </div>
            ))}
          </div>
        </details>
      )}

      {selected && <NodeDetails node={selected} stage={stage} onApprovalDetails={onApprovalDetails} />}
    </div>
  )
}
