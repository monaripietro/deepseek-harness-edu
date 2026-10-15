import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'motion/react'
import { Check, ChevronDown, ExternalLink, X } from 'lucide-react'
import type { ComponentFamily, ComponentId, ExclusionReason, LoopLimits, ToolRisk } from '../../domain/types'
import { COMPONENTS, LEVELS } from '../../harness/levels'
import { INSTRUCTION_SECTIONS } from '../../harness/orchestrator/instructions'
import { SCENARIO_DATA, SCENARIOS } from '../../scenarios'
import { guideScenario } from '../../scenarios/guide'
import { mcpHub, memory, registry, retriever, useLab } from '../../state/store'
import { CONTEXT_KIND_LABEL, EXCLUSION_LABEL, FAMILY_LABEL, STOP_LABEL, formatBytes } from '../common/labels'
import { Markdown } from '../common/Markdown'
import { ProvenanceBadge } from '../common/ProvenanceBadge'
import { useDockTab } from './cards'
import type { StageState } from './deriveStage'
import { PHASE_LABEL } from './deriveStage'
import type { StageNodeId } from './geometry'
import { STATIONS } from './geometry'
import { useStageUi } from './stageUi'
import { useSubscription } from './useSubscription'
import styles from './NodeDetails.module.css'

const NODE_META: Record<StageNodeId, { title: string; family: ComponentFamily | 'user'; component?: ComponentId; lead?: string }> = {
  question: { title: 'La tua richiesta', family: 'user', lead: 'Il punto di partenza: entra nel contesto come messaggio dell’utente.' },
  answer: { title: 'Risposta', family: 'model', lead: 'Ciò che il sistema consegna, con le verifiche automatiche dello scenario.' },
  window: { title: 'Cosa vede il modello', family: 'model', lead: 'Il modello non vede altro: solo questo testo, ricomposto dal sistema a ogni giro.' },
  model: { title: 'Modello linguistico', family: 'model', component: 'model' },
  orchestrator: { title: 'Ciclo agentico', family: 'orchestration', component: 'orchestrator' },
  instructions: { title: 'Istruzioni', family: 'information', component: 'instructions' },
  context: { title: 'Contesto del compito', family: 'information', component: 'context' },
  memory: { title: 'Memoria', family: 'information', component: 'memory' },
  rag: { title: 'Documenti · RAG', family: 'information', component: 'rag' },
  tools: { title: 'Strumenti', family: 'action', component: 'tools' },
  controls: { title: 'Controlli', family: 'governance', component: 'controls' },
  human: { title: 'Supervisione umana', family: 'governance', component: 'approval' },
  mcp: { title: 'Server MCP', family: 'action', component: 'mcp' },
}

const RISK_LABEL: Record<ToolRisk, string> = { read: 'Solo lettura', write: 'Scrive dati', irreversible: 'Irreversibile' }

const STATION_TEXT: Record<(typeof STATIONS)[number]['id'], string> = {
  read: 'Il sistema compone il contesto e il modello lo legge.',
  decide: 'Il modello scrive: una risposta oppure la richiesta di uno strumento.',
  act: 'L’orchestratore controlla la richiesta ed esegue lo strumento.',
  observe: 'Il risultato torna nel contesto: è il materiale del giro successivo.',
}

const LIMIT_ROWS: { key: keyof LoopLimits; label: string; unit?: 'ms' }[] = [
  { key: 'maxSteps', label: 'Giri massimi' },
  { key: 'stepTimeoutMs', label: 'Tempo per giro', unit: 'ms' },
  { key: 'turnTimeoutMs', label: 'Tempo totale', unit: 'ms' },
  { key: 'toolTimeoutMs', label: 'Tempo per strumento', unit: 'ms' },
  { key: 'repeatWarnAt', label: 'Avviso dopo chiamate identiche' },
  { key: 'repeatStopAt', label: 'Stop dopo chiamate identiche' },
  { key: 'maxToolFailures', label: 'Errori di strumento tollerati' },
  { key: 'maxRepairs', label: 'Correzioni del formato' },
]

const seconds = (ms: number) => `${Math.round(ms / 1000)} s`

function Section({ title, children, collapsible = false }: { title: string; children: ReactNode; collapsible?: boolean }) {
  if (collapsible) {
    return (
      <details className={`${styles.section} ${styles.disclosure} ${styles.wide}`} open>
        <summary className={styles.summary}>
          <span className={styles.sectionTitle} role="heading" aria-level={3}>
            {title}
          </span>
          <ChevronDown size={16} aria-hidden className={styles.chevron} />
        </summary>
        <div className={styles.disclosureContent}>{children}</div>
      </details>
    )
  }

  return (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>{title}</h3>
      {children}
    </section>
  )
}

function Row({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className={styles.row}>
      <dt>{k}</dt>
      <dd>{children}</dd>
    </div>
  )
}

/** Non-modal stage details dialog; Escape closes it and returns focus to its stage element. */
export function NodeDetails({ node, stage, onApprovalDetails }: { node: StageNodeId; stage: StageState; onApprovalDetails: () => void }) {
  const select = useStageUi(s => s.select)
  const panelRef = useRef<HTMLElement | null>(null)
  const headingRef = useRef<HTMLHeadingElement | null>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const titleId = useId()
  const descriptionId = useId()
  const meta = NODE_META[node]
  const comp = meta.component ? COMPONENTS[meta.component] : null
  const component = meta.component
  const level = component ? (LEVELS.find(l => l.adds.includes(component))?.id ?? 0) : null
  const active = useLab(s => (meta.component ? s.config.components[meta.component] : true))
  const loop = useLab(s => s.config.components.agentLoop)
  const title = node === 'orchestrator' && !loop ? 'Orchestratore' : meta.title
  const intro = comp?.short ?? meta.lead

  useEffect(() => {
    const panel = panelRef.current
    const activeElement = document.activeElement
    const triggers = Array.from(document.querySelectorAll<HTMLElement>('[data-node]')).filter(element => element.dataset.node === node)
    const trigger =
      activeElement instanceof HTMLElement && activeElement.dataset.node === node
        ? activeElement
        : triggers.find(element => element.getClientRects().length > 0) ?? triggers[0]
    returnFocusRef.current = trigger ?? (activeElement instanceof HTMLElement && activeElement !== document.body ? activeElement : null)
    headingRef.current?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (!(e.target instanceof Node) || !panel?.contains(e.target)) return
      if (e.key === 'Tab') {
        const items = Array.from(panel.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),textarea,input,select,summary,[tabindex]:not([tabindex="-1"])'))
        const first = items[0]
        const last = items[items.length - 1]
        if (!first || !last) return
        if (e.shiftKey && (document.activeElement === first || document.activeElement === headingRef.current)) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
        return
      }
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      select(null)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      if (useStageUi.getState().selected !== null) return
      const focused = document.activeElement
      if (focused === document.body || panel?.contains(focused)) {
        const triggerToFocus = returnFocusRef.current
        if (triggerToFocus?.isConnected) triggerToFocus.focus()
      }
    }
  }, [node, select])

  const tone = meta.family === 'user' ? 'var(--c-user)' : `var(--c-${meta.family})`
  return createPortal(
    <div
      className={styles.backdrop}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) select(null)
      }}
    >
      <motion.aside
        ref={panelRef}
        data-panel
        className={styles.panel}
        style={{ '--tone': tone } as React.CSSProperties}
        initial={{ y: 18, scale: 0.98 }}
        animate={{ y: 0, scale: 1 }}
        exit={{ y: 12, opacity: 0 }}
        transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={intro ? descriptionId : undefined}
        tabIndex={-1}
      >
        <header className={styles.head}>
          <div className={styles.titleBlock}>
            <span className={styles.kicker}>
              Approfondimento · {meta.family === 'user' ? 'Tu' : FAMILY_LABEL[meta.family]}
              {level != null && level > 0 && ` · livello ${level + 1}`}
            </span>
            <h2 id={titleId} ref={headingRef} tabIndex={-1}>
              {title}
            </h2>
          </div>
          <button type="button" className={styles.close} onClick={() => select(null)} aria-label="Chiudi i dettagli" aria-keyshortcuts="Escape">
            <X size={16} aria-hidden />
            <span>Chiudi</span>
            <kbd aria-hidden>Esc</kbd>
          </button>
        </header>
        <div className={styles.body}>
          {intro && (
            <p id={descriptionId} className={styles.lead}>
              {intro}
            </p>
          )}
          {!active && <p className={styles.notYet}>Non ancora costruito: arriva al livello {(level ?? 0) + 1}.</p>}
          {node === 'question' && <QuestionDetails />}
          {node === 'answer' && <AnswerDetails stage={stage} />}
          {node === 'window' && <WindowDetails stage={stage} />}
          {node === 'model' && <ModelDetails stage={stage} />}
          {node === 'orchestrator' && <LoopDetails stage={stage} />}
          {node === 'instructions' && <InstructionsDetails />}
          {node === 'context' && <ContextDetails />}
          {node === 'memory' && <MemoryDetails stage={stage} />}
          {node === 'rag' && <RagDetails stage={stage} />}
          {node === 'tools' && <ToolsDetails stage={stage} />}
          {node === 'controls' && <ControlsDetails stage={stage} />}
          {node === 'human' && <HumanDetails stage={stage} onApprovalDetails={onApprovalDetails} />}
          {node === 'mcp' && <McpDetails stage={stage} />}
        </div>
      </motion.aside>
    </div>,
    document.body,
  )
}

function QuestionDetails() {
  const scenarioId = useLab(s => s.scenarioId)
  const scenario = SCENARIOS.find(s => s.id === scenarioId) ?? guideScenario
  return (
    <>
      <Section title="Scenario">
        <p className={styles.strong}>{scenario.title}</p>
        <p>{scenario.lesson}</p>
      </Section>
      <Section title="Domanda dello scenario">
        <blockquote className={styles.quote}>{scenario.request}</blockquote>
      </Section>
      <Section title="Chi chiede">
        <p>
          {SCENARIO_DATA.user.name}, {SCENARIO_DATA.user.role} · {SCENARIO_DATA.company}
        </p>
      </Section>
    </>
  )
}

function AnswerDetails({ stage }: { stage: StageState }) {
  if (!stage.answer && !stage.stopReason) return <p className={styles.muted}>Nessuna risposta ancora: premi Avvia.</p>
  return (
    <>
      {stage.answer && (
        <Section title="Testo completo">
          <div className={styles.answer}>
            <Markdown>{stage.answer}</Markdown>
          </div>
        </Section>
      )}
      {stage.stopReason && (
        <Section title="Perché si è fermato">
          <p className={styles.strong}>{STOP_LABEL[stage.stopReason]}</p>
          {stage.stopMessage && <p className={styles.muted}>{stage.stopMessage}</p>}
        </Section>
      )}
      {stage.sources.length > 0 && (
        <Section title={`Fonti citate · ${stage.sources.length}`} collapsible={stage.sources.length > 4}>
          <ul className={styles.list}>
            {stage.sources.map(s => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </Section>
      )}
      {stage.checks.length > 0 && (
        <Section title="Verifiche automatiche">
          <ul className={styles.checks}>
            {stage.checks.map(ch => (
              <li key={ch.id} className={ch.passed ? styles.pass : styles.fail}>
                {ch.passed ? <Check size={14} aria-label="superata" /> : <X size={14} aria-label="non superata" />}
                {ch.label}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </>
  )
}

function WindowDetails({ stage }: { stage: StageState }) {
  const openDock = useDockTab()
  const snap = stage.snapshot
  if (!snap) return <p className={styles.muted}>Si riempie quando premi Avvia.</p>
  const included = snap.items.filter(i => i.status === 'included')
  const excluded = snap.items.filter(i => i.status === 'excluded')
  return (
    <>
      <Section title={`Giro ${snap.stepIndex} · ≈ ${snap.budget.usedTokens.toLocaleString('it-IT')} / ${snap.budget.maxTokens.toLocaleString('it-IT')} token`}>
        <div className={styles.meter}>
          <span style={{ width: `${Math.min(100, (snap.budget.usedTokens / snap.budget.maxTokens) * 100)}%` }} />
        </div>
      </Section>
      <Section title={`Inclusi · ${included.length}`} collapsible={included.length > 4}>
        <ul className={styles.items}>
          {included.map(i => (
            <li key={i.id}>
              <span className={styles.tag}>{CONTEXT_KIND_LABEL[i.kind]}</span>
              <span className={styles.itemTitle}>{i.title}</span>
              <em>{i.tokens}</em>
            </li>
          ))}
        </ul>
      </Section>
      {excluded.length > 0 && (
        <Section title={`Lasciati fuori · ${excluded.length}`} collapsible={excluded.length > 4}>
          <ul className={styles.items}>
            {excluded.map(i => (
              <li key={i.id} className={styles.out}>
                <span className={styles.itemTitle}>{i.title}</span>
                <em>{i.exclusionReason ? EXCLUSION_LABEL[i.exclusionReason] : 'escluso'}</em>
              </li>
            ))}
          </ul>
        </Section>
      )}
      <button type="button" className={styles.action} onClick={() => openDock('context')}>
        <ExternalLink size={15} aria-hidden /> Apri il prompt esatto
      </button>
    </>
  )
}

function ModelDetails({ stage }: { stage: StageState }) {
  const info = useLab(s => s.modelInfo)
  const backend =
    info.backend === 'webgpu'
      ? 'GPU (WebGPU)'
      : info.backend === 'wasm'
        ? 'CPU (WebAssembly)'
        : info.backend === 'remote'
          ? 'Cloud (OpenRouter): la richiesta esce dal browser'
          : 'non caricato'
  return (
    <>
      <Section title="In uso">
        <dl className={styles.rows}>
          <Row k="Modello">{info.label}</Row>
          {info.id && <Row k="Origine">{info.id}</Row>}
          <Row k="Dove gira">{backend}</Row>
          {info.dtype && <Row k="Precisione">{info.dtype}</Row>}
          {info.sizeBytes ? <Row k="Dimensione">{formatBytes(info.sizeBytes)}</Row> : null}
          <Row k="Impronta dei pesi">
            <code>{info.fingerprint}</code>
          </Row>
          {info.license && <Row k="Licenza">{info.license}</Row>}
          <Row k="Strumenti nativi">{info.nativeTools ? 'sì: addestrato a chiederli' : 'no'}</Row>
        </dl>
        <ProvenanceBadge tag={info.provenance} />
      </Section>
      <Section title="In questa richiesta">
        <dl className={styles.rows}>
          <Row k="Chiamate al modello">{stage.modelCalls}</Row>
          {stage.lastResponseMs != null && <Row k="Ultima risposta">{(stage.lastResponseMs / 1000).toFixed(1)} s</Row>}
          {stage.invalidOutputs > 0 && <Row k="Risposte fuori formato">{stage.invalidOutputs}</Row>}
        </dl>
      </Section>
      <p className={styles.note}>
        I pesi non cambiano mai: l’impronta resta identica a ogni livello. Tutto ciò che migliora sta intorno al modello.
      </p>
    </>
  )
}

function LoopDetails({ stage }: { stage: StageState }) {
  const c = useLab(s => s.config.components)
  const maxSteps = useLab(s => s.config.limits.maxSteps)
  const plan = stage.plan
  const STATUS = { pending: 'da fare', active: 'in corso', done: 'fatto', failed: 'non riuscito' } as const
  return (
    <>
      {c.tools && (
        <Section title="Piano del modello">
          <p className={styles.muted}>
            Prima di agire l’orchestratore obbliga il modello a scrivere un piano: passi numerati, ciascuno con lo strumento da usare.
            Poi ogni chiamata spunta il passo a cui corrisponde.
          </p>
          {plan ? (
            <>
              <ol className={styles.history}>
                {plan.steps.map(st => (
                  <li key={st.n} className={st.status === 'done' ? styles.pass : st.status === 'failed' ? styles.fail : ''}>
                    {st.tool && <code>{st.tool === 'answer' ? 'risposta' : st.tool}</code>} {st.text} <em>· {STATUS[st.status]}</em>
                  </li>
                ))}
              </ol>
              {plan.offPlan.length > 0 && <p className={styles.note}>Chiamate fuori dal piano: {plan.offPlan.join(', ')}.</p>}
            </>
          ) : (
            <p className={styles.muted}>Nessun piano ancora: compare al primo passo della prossima richiesta.</p>
          )}
        </Section>
      )}
      <Section title="Le quattro tappe">
        <ol className={styles.stations}>
          {STATIONS.map((s, i) => (
            <li key={s.id}>
              <span className={styles.stationNum}>{i + 1}</span>
              <div>
                <strong>{s.label}</strong>
                <p>{STATION_TEXT[s.id]}</p>
              </div>
            </li>
          ))}
        </ol>
      </Section>
      <Section title={c.agentLoop ? 'Ciclo agentico attivo' : 'Un solo giro'}>
        <p>
          {c.agentLoop
            ? `Dopo “Osserva” si torna a “Legge”: il modello rilegge il contesto con il risultato e decide di nuovo, finché ha ciò che serve${c.controls ? ` (al massimo ${maxSteps} giri)` : ''}.`
            : COMPONENTS.agentLoop.short + ' Qui non c’è ancora: dopo un giro di strumenti il sistema chiede la risposta finale.'}
        </p>
      </Section>
      {stage.runId && (
        <>
          <Section title="Questa richiesta">
            <dl className={styles.rows}>
              <Row k="Giro">{stage.step || '—'}</Row>
              <Row k="Fase">{PHASE_LABEL[stage.phase]}</Row>
            </dl>
          </Section>
          {stage.toolHistory.length > 0 && (
            <Section title={`Cronologia strumenti · ${stage.toolHistory.length}`} collapsible={stage.toolHistory.length > 3}>
              <ol className={styles.history}>
                {stage.toolHistory.map((h, i) => (
                  <li key={i} className={h.ok ? styles.pass : styles.fail}>
                    <code>{h.tool.replace(/^mcp__\w+?__/, 'MCP·')}</code> {h.summary.slice(0, 90)}
                  </li>
                ))}
              </ol>
            </Section>
          )}
        </>
      )}
    </>
  )
}

function InstructionsDetails() {
  return (
    <Section title="Testo inviato al modello" collapsible>
      <dl className={styles.rows}>
        {INSTRUCTION_SECTIONS.map(s => (
          <Row key={s.id} k={s.title}>
            {s.text}
          </Row>
        ))}
      </dl>
    </Section>
  )
}

function ContextDetails() {
  return (
    <Section title="Dati del compito" collapsible={SCENARIO_DATA.taskData.length > 4}>
      {SCENARIO_DATA.taskData.map(t => (
        <div key={t.id} className={styles.subsection}>
          <h4>{t.title}</h4>
          <p>{t.text}</p>
        </div>
      ))}
    </Section>
  )
}

function MemoryDetails({ stage }: { stage: StageState }) {
  useSubscription(memory.subscribe)
  const records = memory.list()
  return (
    <>
      <Section title={`${records.length} ricordi salvati`} collapsible={records.length > 4}>
        <ul className={styles.items}>
          {records.map((r) => {
            const st = stage.memory.find(m => m.key === r.key)?.state
            return (
              <li key={r.id} className={st === 'ignored' ? styles.out : ''}>
                <span className={styles.tag}>{r.scope === 'persistent' ? 'persistente' : 'sessione'}</span>
                <span className={styles.itemTitle}>
                  <strong>{r.key.replace(/_/g, ' ')}</strong> {r.text}
                </span>
                {st === 'injected' && <Check size={14} aria-label="inserito nel contesto" />}
              </li>
            )
          })}
        </ul>
      </Section>
      {stage.memoryWritten && (
        <Section title="Salvato in questa richiesta">
          <p>{stage.memoryWritten}</p>
        </Section>
      )}
    </>
  )
}

function RagDetails({ stage }: { stage: StageState }) {
  const rag = useLab(s => s.config.rag)
  const docs = retriever.documents()
  return (
    <>
      {stage.ragQuery && (
        <Section title={`Frammenti trovati · ${stage.ragHits.length}`} collapsible={stage.ragHits.length > 4}>
          <ul className={styles.items}>
            {stage.ragHits.map(h => (
              <li key={h.chunkId} className={h.status === 'selected' ? '' : styles.out}>
                <span className={styles.itemTitle}>{h.title}</span>
                <em>{h.status === 'selected' ? `${Math.round(h.normalized * 100)}%` : h.reason ? EXCLUSION_LABEL[h.reason as ExclusionReason] : 'escluso'}</em>
              </li>
            ))}
          </ul>
        </Section>
      )}
      <Section title="Regole di ricerca">
        <dl className={styles.rows}>
          <Row k="Frammenti tenuti">{rag.topK}</Row>
          <Row k="Pertinenza minima">{Math.round(rag.minScore * 100)}%</Row>
          <Row k="Versioni superate">{rag.includeOutdated ? 'incluse' : 'escluse'}</Row>
        </dl>
      </Section>
      <Section title={`${docs.length} documenti`} collapsible={docs.length > 4}>
        <ul className={styles.items}>
          {docs.map(d => (
            <li key={d.id} className={d.status === 'valid' ? '' : styles.out}>
              <span className={styles.tag}>{d.status === 'valid' ? `v${d.version}` : d.status === 'outdated' ? 'superato' : 'fuori tema'}</span>
              <span className={styles.itemTitle}>{d.title}</span>
            </li>
          ))}
        </ul>
      </Section>
    </>
  )
}

function ToolsDetails({ stage }: { stage: StageState }) {
  const enabled = useLab(s => s.config.enabledTools)
  useLab(s => s.customTools)
  const tools = registry.list().filter(t => enabled.includes(t.id))
  return (
    <>
      {stage.toolHistory.length > 0 && (
        <Section title={`Chiamate in questa richiesta · ${stage.toolHistory.length}`} collapsible={stage.toolHistory.length > 3}>
          <ol className={styles.history}>
            {stage.toolHistory.map((h, i) => (
              <li key={i} className={h.ok ? styles.pass : styles.fail}>
                <code>{h.tool.replace(/^mcp__\w+?__/, 'MCP·')}</code> {h.summary.slice(0, 110)}
              </li>
            ))}
          </ol>
        </Section>
      )}
      <Section title={`${tools.length} strumenti a disposizione del modello`} collapsible={tools.length > 4}>
        <ul className={styles.tools}>
          {tools.map(t => (
            <li key={t.id}>
              <div className={styles.toolHead}>
                <strong>{t.title}</strong>
                <span className={`${styles.tag} ${t.risk !== 'read' ? styles.tagWarn : ''}`}>{RISK_LABEL[t.risk]}</span>
                {t.approval === 'always' && <span className={`${styles.tag} ${styles.tagWarn}`}>approvazione</span>}
              </div>
              <code>{t.id}</code>
              <p>{t.purpose}</p>
            </li>
          ))}
        </ul>
      </Section>
    </>
  )
}

function ControlsDetails({ stage }: { stage: StageState }) {
  const limits = useLab(s => s.config.limits)
  const backend = useLab(s => s.modelInfo.backend)
  return (
    <>
      <Section title="Limiti">
        <dl className={styles.rows}>
          {LIMIT_ROWS.map(r => (
            <Row key={r.key} k={r.label}>
              {r.unit === 'ms' ? seconds(limits[r.key]) : limits[r.key]}
            </Row>
          ))}
        </dl>
        {backend === 'wasm' && <p className={styles.note}>Su CPU il modello è più lento: i tempi per giro e totale vengono moltiplicati.</p>}
      </Section>
      {stage.guardMessage && (
        <Section title="Ultimo intervento">
          <p>{stage.guardMessage}</p>
        </Section>
      )}
    </>
  )
}

function HumanDetails({ stage, onApprovalDetails }: { stage: StageState; onApprovalDetails: () => void }) {
  const pending = useLab(s => s.pendingApproval)
  const auto = useLab(s => s.config.autoApprove)
  const enabled = useLab(s => s.config.enabledTools)
  const gated = registry.list().filter(t => enabled.includes(t.id) && (t.approval === 'always' || t.risk !== 'read'))
  return (
    <>
      {pending && (
        <Section title="In attesa di te">
          <p className={styles.strong}>{pending.toolTitle}</p>
          <p>{pending.effects}</p>
          <button type="button" className={styles.action} onClick={onApprovalDetails}>
            Vedi tutti i dettagli dell’azione
          </button>
        </Section>
      )}
      <Section title="Quando ti chiede il permesso" collapsible={gated.length > 4}>
        {gated.length ? (
          <ul className={styles.list}>
            {gated.map(t => (
              <li key={t.id}>
                {t.title} <span className={styles.muted}>· {RISK_LABEL[t.risk].toLowerCase()}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.muted}>Nessuno strumento con effetti è attivo.</p>
        )}
        {auto && <p className={styles.note}>Approvazione automatica attiva (modalità regia).</p>}
      </Section>
      {stage.human.state !== 'idle' && stage.human.state !== 'waiting' && (
        <Section title="Ultima decisione">
          <p>
            {stage.human.state === 'allowed-once' ? 'Approvato' : stage.human.state === 'rejected' ? 'Rifiutato' : 'Annullato'}: {stage.human.title}
          </p>
        </Section>
      )}
    </>
  )
}

function McpDetails({ stage }: { stage: StageState }) {
  useSubscription(mcpHub.subscribe)
  const servers = mcpHub.servers()
  return (
    <>
      {servers.map(s => (
        <Section key={s.server.id} title={s.server.label} collapsible={s.tools.length > 4}>
          <dl className={styles.rows}>
            <Row k="Tipo">{s.server.kind === 'real' ? 'reale, su internet' : 'simulato nel browser'}</Row>
            {s.server.url && (
              <Row k="Indirizzo">
                <code>{s.server.url}</code>
              </Row>
            )}
            <Row k="Stato">{{ connected: 'collegato', connecting: 'in collegamento', error: 'errore', disconnected: 'non collegato' }[s.state]}</Row>
          </dl>
          {s.error && <p className={styles.fail}>{s.error}</p>}
          {s.tools.length > 0 && (
            <ul className={styles.items}>
              {s.tools.map(t => (
                <li key={t.name}>
                  <code className={styles.itemTitle}>{t.name}</code>
                </li>
              ))}
            </ul>
          )}
        </Section>
      ))}
      {stage.mcpLast && (
        <Section title="Ultimo scambio">
          <p className={styles.mono}>{stage.mcpLast}</p>
        </Section>
      )}
      <p className={styles.note}>
        Nessuna credenziale: le chiamate partono senza cookie, solo verso server in elenco e con la tua approvazione.
      </p>
    </>
  )
}
