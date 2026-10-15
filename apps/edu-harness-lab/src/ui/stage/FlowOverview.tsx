import { useMemo } from 'react'
import type { CSSProperties } from 'react'
import { ArrowDown, ArrowRight, ArrowUp, Cpu, Database, FileSearch, FileText, Globe, Layers, MessageSquare, Repeat, Settings2, ShieldCheck, Sparkles, UserRound, Wrench } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ComponentFamily, ComponentId } from '../../domain/types'
import { COMPONENT_ORDER, COMPONENTS } from '../../harness/levels'
import { useLab } from '../../state/store'
import { Switch } from '../common/Switch'
import { PHASE_LABEL, deriveStage } from './deriveStage'
import type { StageNodeId } from './geometry'
import { NodeDetails } from './NodeDetails'
import { useStageUi } from './stageUi'
import styles from './FlowOverview.module.css'

const SOURCES: { component: ComponentId; node: StageNodeId; label: string; icon: LucideIcon }[] = [
  { component: 'instructions', node: 'instructions', label: 'Istruzioni', icon: FileText },
  { component: 'context', node: 'context', label: 'Dati del compito', icon: Layers },
  { component: 'memory', node: 'memory', label: 'Memoria', icon: Database },
  { component: 'rag', node: 'rag', label: 'Documenti · RAG', icon: FileSearch },
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
}: {
  node: StageNodeId
  title: string
  description?: string
  icon: LucideIcon
  number?: string
  tone?: ComponentFamily
  compact?: boolean
  lit?: boolean
}) {
  const selected = useStageUi(s => s.selected === node)
  const toggle = useStageUi(s => s.toggle)
  return (
    <button
      type="button"
      data-node={node}
      className={[styles.node, compact && styles.compact, node === 'model' && styles.model, selected && styles.selected, lit && styles.lit].filter(Boolean).join(' ')}
      style={{ '--node-color': `var(--c-${tone})`, '--node-tint': `var(--c-${tone}-soft)` } as CSSProperties}
      aria-label={`${title}. Apri i dettagli`}
      aria-pressed={selected}
      onClick={() => toggle(node)}
    >
      <span className={styles.nodeHeading}>
        <span className={styles.nodeIcon} aria-hidden><Icon size={compact ? 17 : 21} /></span>
        {number && <span className={styles.step}>Passo {number}</span>}
      </span>
      <span className={styles.nodeCopy}>
        <span className={styles.nodeTitle}>{title}</span>
        {description && <span className={styles.nodeDescription}>{description}</span>}
      </span>
      {compact && <span className={styles.detailMark} aria-hidden>+</span>}
    </button>
  )
}

/** Shows the active request path at readable text sizes, with node details available on demand.
 * @param onApprovalDetails Opens the current action's approval dialog.
 * @returns The request flow and the active harness components.
 */
export function FlowOverview({ onApprovalDetails }: { onApprovalDetails: () => void }) {
  const config = useLab(s => s.config)
  const events = useLab(s => s.events)
  const modelInfo = useLab(s => s.modelInfo)
  const view = useLab(s => s.view)
  const status = useLab(s => s.status)
  const toggleComponent = useLab(s => s.toggleComponent)
  const selected = useStageUi(s => s.selected)
  const c = config.components
  const stage = useMemo(() => deriveStage(events, c.orchestrator), [events, c.orchestrator])
  const sources = SOURCES.filter(source => c[source.component])
  const additionalCount = Number(c.controls) + Number(c.approval) + Number(c.mcp)
  const busy = status === 'running' || status === 'awaitingApproval'
  const lit = (node: StageNodeId) => stage.lit.includes(node)

  return (
    <div className={styles.overview}>
      <div className={styles.intro}>
        <div>
          <h2>Segui il percorso della richiesta</h2>
          <p>Da sinistra a destra. Seleziona un elemento per approfondire.</p>
        </div>
        <span className={styles.phase} role="status">
          <span className={stage.running ? styles.runningDot : styles.idleDot} aria-hidden />
          {PHASE_LABEL[stage.phase]}
        </span>
      </div>

      <div className={styles.diagram}>
        <ol className={styles.path} aria-label="Flusso principale della richiesta">
          <li>
            <FlowNode node="question" title="La richiesta" description="La domanda che invii al sistema." icon={MessageSquare} number="1" tone="model" lit={lit('question')} />
            <span className={styles.forward} aria-hidden><ArrowRight size={24} /></span>
          </li>
          <li>
            <FlowNode node="window" title="Il contesto" description="Il testo che il modello può leggere." icon={Layers} number="2" lit={lit('window')} />
            <span className={styles.forward} aria-hidden><ArrowRight size={24} /></span>
          </li>
          <li>
            <FlowNode node="model" title="Il modello" description={modelInfo.backend !== 'none' ? modelInfo.label : 'Da caricare per iniziare'} icon={Cpu} number="3" tone="model" lit={lit('model')} />
            <span className={styles.forward} aria-hidden><ArrowRight size={24} /></span>
          </li>
          <li>
            <FlowNode node="answer" title="La risposta" description="Il risultato che ricevi, con le sue fonti." icon={Sparkles} number="4" tone="model" lit={lit('answer')} />
          </li>
        </ol>

        <div className={styles.branches}>
          {sources.length > 0 && (
            <section className={styles.sources} aria-label="Informazioni aggiunte al contesto">
              <span className={styles.sourceLink} aria-hidden><ArrowUp size={24} /></span>
              <h3>Informazioni per il modello</h3>
              <p>L'harness le aggiunge al contesto.</p>
              <div className={styles.sourceList}>
                {sources.map(source => (
                  <FlowNode key={source.node} node={source.node} title={source.label} icon={source.icon} compact lit={lit(source.node)} />
                ))}
              </div>
            </section>
          )}

          {c.orchestrator && (
            <section className={styles.actions} aria-label="Esecuzione delle azioni">
              <span className={styles.actionLink} aria-hidden><ArrowDown size={24} /></span>
              <h3>Se il modello chiede un'azione</h3>
              <p>Il modello la propone. L'harness la esegue.</p>
              <div className={styles.actionRoute}>
                <FlowNode node="orchestrator" title="Orchestratore" icon={Settings2} tone="orchestration" compact lit={lit('orchestrator')} />
                {c.tools && (
                  <>
                    <ArrowRight className={styles.actionArrow} size={22} aria-hidden />
                    <FlowNode node="tools" title="Strumenti" icon={Wrench} tone="action" compact lit={lit('tools')} />
                  </>
                )}
              </div>
              {additionalCount > 0 && (
                <details className={styles.additional}>
                  <summary>Controlli e collegamenti ({additionalCount})</summary>
                  <div className={styles.safeguards}>
                    {c.controls && <FlowNode node="controls" title="Controlli" icon={ShieldCheck} tone="governance" compact lit={lit('controls')} />}
                    {c.approval && <FlowNode node="human" title="Supervisione umana" icon={UserRound} tone="governance" compact lit={lit('human')} />}
                    {c.mcp && <FlowNode node="mcp" title="Server MCP" icon={Globe} tone="action" compact lit={lit('mcp')} />}
                  </div>
                </details>
              )}
              <p className={styles.returnPath}>
                <Repeat size={17} aria-hidden />
                <span>Il risultato rientra nel contesto.{c.agentLoop ? ' Il ciclo si ripete se serve.' : ''}</span>
              </p>
              {c.tools && <p className={styles.simulation}>Calcoli reali; dati e azioni aziendali simulati.</p>}
            </section>
          )}
        </div>
      </div>

      <div className={styles.takeaway}>
        <Cpu size={18} aria-hidden />
        <p>Il modello resta lo stesso. Sono gli strati dell'harness a dargli informazioni e capacità.</p>
      </div>

      {view === 'lab' && (
        <details className={styles.composition}>
          <summary>Personalizza gli strati dell'harness</summary>
          <div className={styles.componentList}>
            {COMPONENT_ORDER.filter(id => id !== 'model').map(id => (
              <div className={styles.componentRow} key={id}>
                <span>{COMPONENTS[id].label}</span>
                <Switch label={COMPONENTS[id].label} checked={c[id]} disabled={busy} onChange={() => toggleComponent(id)} />
              </div>
            ))}
          </div>
        </details>
      )}

      {selected && <NodeDetails node={selected} stage={stage} onApprovalDetails={onApprovalDetails} />}
    </div>
  )
}
