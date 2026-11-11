import { ModelActivityNote, ReasoningDisclosure, useLiveReasoning, useStreamedProse } from '../model/ModelActivity'
import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'motion/react'
import { Check, ChevronDown, ExternalLink, X } from 'lucide-react'
import type { ComponentFamily, ComponentId, ExclusionReason, LoopLimits, ToolRisk } from '../../domain/types'
import { levelsFor } from '../../harness/levels'
import { INSTRUCTION_SECTIONS } from '../../harness/orchestrator/instructions'
import { SCENARIOS, getScenario, requestFor, scenarioDataFor } from '../../scenarios'
import { guideScenario } from '../../scenarios/guide'
import { mcpHub, memory, registry, retriever, useLab } from '../../state/store'
import { CONTEXT_KIND_LABEL, EXCLUSION_LABEL, FAMILY_LABEL, STOP_LABEL, formatBytes } from '../common/labels'
import { Markdown } from '../common/Markdown'
import { ProvenanceBadge } from '../common/ProvenanceBadge'
import { ReflectionTrace } from '../chat/ReflectionTrace'
import { useDockTab } from './cards'
import type { StageState } from './deriveStage'
import { PHASE_LABEL } from './deriveStage'
import type { StageNodeId, StationId } from './geometry'
import { STATIONS } from './geometry'
import { useStageUi } from './stageUi'
import { useSubscription } from './useSubscription'
import { biRecord, pick, uiLang, useT, type Bi } from '../../i18n'
import { componentText, memoryKeyText, scenarioText, toolText } from '../../i18nContent'
import styles from './NodeDetails.module.css'

const NODE_META: Record<StageNodeId, { title: Bi; family: ComponentFamily | 'user'; component?: ComponentId; lead?: Bi }> = {
  question: {
    title: ['La tua richiesta', 'Your request'],
    family: 'user',
    lead: ['Il punto di partenza: entra nel contesto come messaggio dell’utente.', 'The starting point: it enters the context as the user’s message.'],
  },
  answer: {
    title: ['Risposta', 'Answer'],
    family: 'model',
    lead: ['Ciò che il sistema consegna, con le verifiche automatiche dello scenario.', 'What the system delivers, with the scenario’s automatic checks.'],
  },
  window: {
    title: ['Cosa vede il modello', 'What the model sees'],
    family: 'model',
    lead: [
      'Il modello non vede altro: solo questo testo, ricomposto dal sistema a ogni giro.',
      'The model sees nothing else: only this text, rebuilt by the system at every step.',
    ],
  },
  model: { title: ['Modello linguistico', 'Language model'], family: 'model', component: 'model' },
  orchestrator: { title: ['Ciclo agentico', 'Agent loop'], family: 'orchestration', component: 'orchestrator' },
  instructions: { title: ['Istruzioni', 'Instructions'], family: 'information', component: 'instructions' },
  context: { title: ['Contesto del compito', 'Task context'], family: 'information', component: 'context' },
  memory: { title: ['Memoria', 'Memory'], family: 'information', component: 'memory' },
  rag: { title: ['Documenti · RAG', 'Documents · RAG'], family: 'information', component: 'rag' },
  tools: { title: ['Strumenti', 'Tools'], family: 'action', component: 'tools' },
  controls: { title: ['Controlli', 'Controls'], family: 'governance', component: 'controls' },
  human: { title: ['Supervisione umana', 'Human oversight'], family: 'governance', component: 'approval' },
  mcp: { title: ['Server MCP', 'MCP servers'], family: 'action', component: 'mcp' },
}

const RISK_LABEL = biRecord<ToolRisk>({
  read: ['Solo lettura', 'Read only'],
  write: ['Scrive dati', 'Writes data'],
  irreversible: ['Irreversibile', 'Irreversible'],
})

const STATION_LABEL = biRecord<StationId>({
  read: ['Legge il contesto', 'Reads the context'],
  decide: ['Decide cosa fare', 'Decides what to do'],
  act: ['Agisce con uno strumento', 'Acts with a tool'],
  observe: ['Osserva il risultato', 'Observes the result'],
})

const STATION_TEXT = biRecord<StationId>({
  read: ['Il sistema compone il contesto e il modello lo legge.', 'The system builds the context and the model reads it.'],
  decide: ['Il modello scrive: una risposta oppure la richiesta di uno strumento.', 'The model writes either an answer or a request for a tool.'],
  act: ['L’orchestratore controlla la richiesta ed esegue lo strumento.', 'The orchestrator checks the request and runs the tool.'],
  observe: ['Il risultato torna nel contesto: è il materiale del giro successivo.', 'The result goes back into the context: it is the material for the next step.'],
})

const LIMIT_ROWS: { key: keyof LoopLimits; label: Bi; unit?: 'ms' }[] = [
  { key: 'maxSteps', label: ['Giri massimi', 'Max steps'] },
  { key: 'stepTimeoutMs', label: ['Tempo per giro', 'Time per step'], unit: 'ms' },
  { key: 'turnTimeoutMs', label: ['Tempo totale', 'Total time'], unit: 'ms' },
  { key: 'toolTimeoutMs', label: ['Tempo per strumento', 'Time per tool'], unit: 'ms' },
  { key: 'repeatWarnAt', label: ['Avviso dopo chiamate identiche', 'Warning after identical calls'] },
  { key: 'repeatStopAt', label: ['Stop dopo chiamate identiche', 'Stop after identical calls'] },
  { key: 'maxToolFailures', label: ['Errori di strumento tollerati', 'Tool errors tolerated'] },
  { key: 'maxRepairs', label: ['Correzioni del formato', 'Format corrections'] },
]

const seconds = (ms: number) => `${Math.round(ms / 1000)} s`
/** Number formatting follows the interface language (Italian grouping stays as before). */
const numberLocale = () => (uiLang() === 'en' ? 'en-US' : 'it-IT')

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
  const t = useT()
  const select = useStageUi(s => s.select)
  const panelRef = useRef<HTMLElement | null>(null)
  const headingRef = useRef<HTMLHeadingElement | null>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const titleId = useId()
  const descriptionId = useId()
  const meta = NODE_META[node]
  const component = meta.component
  const scenarioId = useLab(s => s.scenarioId)
  const scenarioLevels = levelsFor(SCENARIOS.find(item => item.id === scenarioId))
  const level = component ? (scenarioLevels.find(item => item.adds.includes(component))?.id ?? 0) : null
  const active = useLab(s => (meta.component ? s.config.components[meta.component] : true))
  const loop = useLab(s => s.config.components.agentLoop)
  const title = node === 'orchestrator' && !loop ? t('Orchestratore', 'Orchestrator') : pick(meta.title)
  const intro = component ? componentText(component).short : meta.lead ? pick(meta.lead) : undefined

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
              {t('Approfondimento', 'Detail')} · {meta.family === 'user' ? t('Tu', 'You') : FAMILY_LABEL[meta.family]}
              {level != null && level > 0 && ` · ${t('livello', 'level')} ${level + 1}`}
            </span>
            <h2 id={titleId} ref={headingRef} tabIndex={-1}>
              {title}
            </h2>
          </div>
          <button type="button" className={styles.close} onClick={() =>{  select(null) }} aria-label={t('Chiudi i dettagli', 'Close details')} aria-keyshortcuts="Escape">
            <X size={16} aria-hidden />
            <span>{t('Chiudi', 'Close')}</span>
            <kbd aria-hidden>Esc</kbd>
          </button>
        </header>
        <div className={styles.body}>
          {intro && (
            <p id={descriptionId} className={styles.lead}>
              {intro}
            </p>
          )}
          {!active && <p className={styles.notYet}>{t(`Non ancora costruito: arriva al livello ${(level ?? 0) + 1}.`, `Not built yet: it arrives at level ${(level ?? 0) + 1}.`)}</p>}
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
  const t = useT()
  const scenarioId = useLab(s => s.scenarioId)
  const promptLanguage = useLab(s => s.promptLanguage)
  const who = scenarioDataFor(promptLanguage)
  const scenario = SCENARIOS.find(s => s.id === scenarioId) ?? guideScenario
  const copy = scenarioText(scenario)
  return (
    <>
      <Section title={t('Scenario', 'Scenario')}>
        <p className={styles.strong}>{copy.title}</p>
        <p>{copy.lesson}</p>
      </Section>
      <Section title={t('Domanda dello scenario', 'Scenario question')}>
        <blockquote className={styles.quote}>{requestFor(scenario.id, promptLanguage) || scenario.request}</blockquote>
      </Section>
      <Section title={t('Chi chiede', 'Who is asking')}>
        <p>
          {who.user.name}, {who.user.role} · {who.company}
        </p>
      </Section>
    </>
  )
}

/** The answer while the run is in progress: the text as it is written, or what the model is doing. */
function RunningAnswer() {
  const t = useT()
  const prose = useStreamedProse()
  const reasoning = useLiveReasoning()
  return (
    <>
      <ReasoningDisclosure parts={reasoning} live />
      <ReflectionTrace live />
      {prose ? (
        <Markdown>{prose}</Markdown>
      ) : (
        <p className={styles.muted}>
          <ModelActivityNote fallback={t('Il sistema sta lavorando…', 'The system is working…')} />
        </p>
      )}
    </>
  )
}

/** Reasoning of the last run, collapsed. */
function LastReasoning() {
  const reasoning = useLiveReasoning()
  return <ReasoningDisclosure parts={reasoning} />
}

function AnswerDetails({ stage }: { stage: StageState }) {
  const t = useT()
  if (!stage.answer && !stage.stopReason) {
    return stage.running ? <RunningAnswer /> : <p className={styles.muted}>{t('Nessuna risposta ancora: premi Avvia.', 'No answer yet: press Run.')}</p>
  }
  return (
    <>
      {stage.answer && (
        <Section title={stage.stopReason === 'final_answer' ? t('Risposta finale', 'Final answer') : t('Esito dell’esecuzione', 'Outcome of the run')}>
          <LastReasoning />
          <ReflectionTrace runId={stage.runId ?? undefined} />
          <div className={styles.answer}>
            <Markdown>{stage.answer}</Markdown>
          </div>
        </Section>
      )}
      {stage.stopReason && (
        <Section title={t('Perché si è fermato', 'Why it stopped')}>
          <p className={styles.strong}>{STOP_LABEL[stage.stopReason]}</p>
          {stage.stopMessage && <p className={styles.muted}>{stage.stopMessage}</p>}
        </Section>
      )}
      {stage.sources.length > 0 && (
        <Section title={t(`Fonti citate · ${stage.sources.length}`, `Sources cited · ${stage.sources.length}`)} collapsible={stage.sources.length > 4}>
          <ul className={styles.list}>
            {stage.sources.map(s => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </Section>
      )}
      {stage.checks.length > 0 && (
        <Section title={t('Verifiche automatiche', 'Automatic checks')}>
          <ul className={styles.checks}>
            {stage.checks.map(ch => (
              <li key={ch.id} className={ch.passed ? styles.pass : styles.fail}>
                {ch.passed ? <Check size={14} aria-label={t('superata', 'passed')} /> : <X size={14} aria-label={t('non superata', 'not passed')} />}
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
  const t = useT()
  const openDock = useDockTab()
  const snap = stage.snapshot
  if (!snap) return <p className={styles.muted}>{t('Si riempie quando premi Avvia.', 'Fills in when you press Run.')}</p>
  const included = snap.items.filter(i => i.status === 'included')
  const excluded = snap.items.filter(i => i.status === 'excluded')
  const used = snap.budget.usedTokens.toLocaleString(numberLocale())
  const max = snap.budget.maxTokens.toLocaleString(numberLocale())
  return (
    <>
      <Section title={t(`Giro ${snap.stepIndex} · ≈ ${used} / ${max} token`, `Step ${snap.stepIndex} · ≈ ${used} / ${max} tokens`)}>
        <div className={styles.meter}>
          <span style={{ width: `${Math.min(100, (snap.budget.usedTokens / snap.budget.maxTokens) * 100)}%` }} />
        </div>
      </Section>
      <Section title={t(`Inclusi · ${included.length}`, `Included · ${included.length}`)} collapsible={included.length > 4}>
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
        <Section title={t(`Lasciati fuori · ${excluded.length}`, `Left out · ${excluded.length}`)} collapsible={excluded.length > 4}>
          <ul className={styles.items}>
            {excluded.map(i => (
              <li key={i.id} className={styles.out}>
                <span className={styles.itemTitle}>{i.title}</span>
                <em>{i.exclusionReason ? EXCLUSION_LABEL[i.exclusionReason] : t('escluso', 'excluded')}</em>
              </li>
            ))}
          </ul>
        </Section>
      )}
      <button type="button" className={styles.action} onClick={() =>{  openDock('context') }}>
        <ExternalLink size={15} aria-hidden /> {t('Apri il prompt esatto', 'Open the exact prompt')}
      </button>
    </>
  )
}

function ModelDetails({ stage }: { stage: StageState }) {
  const t = useT()
  const info = useLab(s => s.modelInfo)
  const backend =
    info.backend === 'webgpu'
      ? 'GPU (WebGPU)'
      : info.backend === 'wasm'
        ? 'CPU (WebAssembly)'
        : info.backend === 'remote'
          ? t('Cloud (OpenRouter): la richiesta esce dal browser', 'Cloud (OpenRouter): the request leaves the browser')
          : t('non caricato', 'not loaded')
  return (
    <>
      <Section title={t('In uso', 'In use')}>
        <dl className={styles.rows}>
          <Row k={t('Modello', 'Model')}>{info.label}</Row>
          {info.id && <Row k={t('Origine', 'Source')}>{info.id}</Row>}
          <Row k={t('Dove gira', 'Where it runs')}>{backend}</Row>
          {info.dtype && <Row k={t('Precisione', 'Precision')}>{info.dtype}</Row>}
          {info.sizeBytes ? <Row k={t('Dimensione', 'Size')}>{formatBytes(info.sizeBytes)}</Row> : null}
          <Row k={t('Impronta dei pesi', 'Weights fingerprint')}>
            <code>{info.fingerprint}</code>
          </Row>
          {info.license && <Row k={t('Licenza', 'License')}>{info.license}</Row>}
          <Row k={t('Strumenti nativi', 'Native tools')}>
            {info.nativeTools ? t('sì: addestrato a chiederli', 'yes: trained to ask for them') : t('no', 'no')}
          </Row>
        </dl>
        <ProvenanceBadge tag={info.provenance} />
      </Section>
      <Section title={t('In questa richiesta', 'In this request')}>
        <dl className={styles.rows}>
          <Row k={t('Chiamate al modello', 'Model calls')}>{stage.modelCalls}</Row>
          {stage.lastResponseMs != null && <Row k={t('Ultima risposta', 'Last response')}>{(stage.lastResponseMs / 1000).toFixed(1)} s</Row>}
          {stage.invalidOutputs > 0 && <Row k={t('Risposte fuori formato', 'Out-of-format responses')}>{stage.invalidOutputs}</Row>}
        </dl>
      </Section>
      <p className={styles.note}>
        {t(
          'I pesi non cambiano mai: l’impronta resta identica a ogni livello. Tutto ciò che migliora sta intorno al modello.',
          'The weights never change: the fingerprint stays the same at every level. Everything that improves sits around the model.',
        )}
      </p>
    </>
  )
}

function LoopDetails({ stage }: { stage: StageState }) {
  const t = useT()
  const c = useLab(s => s.config.components)
  const maxSteps = useLab(s => s.config.limits.maxSteps)
  const plan = stage.plan
  const STATUS = {
    pending: t('da fare', 'to do'),
    active: t('in corso', 'in progress'),
    done: t('fatto', 'done'),
    failed: t('non riuscito', 'failed'),
  }
  return (
    <>
      {c.tools && (
        <Section title={t('Piano del modello', 'Model plan')}>
          <p className={styles.muted}>
            {t(
              'Il modello può scrivere un piano con lo strumento «pianifica» (passi numerati, ciascuno con lo strumento da usare) e aggiornarlo se un passo fallisce o le informazioni cambiano. Poi ogni chiamata spunta il passo a cui corrisponde.',
              'The model can write a plan with the «pianifica» tool (numbered steps, each with the tool to use) and update it if a step fails or the information changes. Then each call ticks off the step it matches.',
            )}
          </p>
          {plan ? (
            <>
              <ol className={styles.history}>
                {plan.steps.map(st => (
                  <li key={st.n} className={st.status === 'done' ? styles.pass : st.status === 'failed' ? styles.fail : ''}>
                    {st.tool && <code>{st.tool === 'answer' ? t('risposta', 'answer') : st.tool}</code>} {st.text} <em>· {STATUS[st.status]}</em>
                  </li>
                ))}
              </ol>
              {plan.offPlan.length > 0 && (
                <p className={styles.note}>
                  {t('Chiamate fuori dal piano', 'Calls outside the plan')}: {plan.offPlan.join(', ')}.
                </p>
              )}
            </>
          ) : (
            <p className={styles.muted}>{t('Nessun piano ancora: compare al primo passo della prossima richiesta.', 'No plan yet: it appears at the first step of the next request.')}</p>
          )}
        </Section>
      )}
      <Section title={t('Le quattro tappe', 'The four stages')}>
        <ol className={styles.stations}>
          {STATIONS.map((s, i) => (
            <li key={s.id}>
              <span className={styles.stationNum}>{i + 1}</span>
              <div>
                <strong>{STATION_LABEL[s.id]}</strong>
                <p>{STATION_TEXT[s.id]}</p>
              </div>
            </li>
          ))}
        </ol>
      </Section>
      <Section title={c.agentLoop ? t('Ciclo agentico attivo', 'Agent loop active') : t('Un solo giro', 'A single step')}>
        <p>
          {c.agentLoop
            ? t(
              `Dopo “Osserva” si torna a “Legge”: il modello rilegge il contesto con il risultato e decide di nuovo, finché ha ciò che serve${c.controls ? ` (al massimo ${maxSteps} giri)` : ''}.`,
              `After “Observe” it goes back to “Read”: the model re-reads the context with the result and decides again, until it has what it needs${c.controls ? ` (at most ${maxSteps} steps)` : ''}.`,
            )
            : `${componentText('agentLoop').short} ${t(
              'Qui non c’è ancora: dopo un giro di strumenti il sistema chiede la risposta finale.',
              'It is not here yet: after a round of tools the system asks for the final answer.',
            )}`}
        </p>
      </Section>
      {stage.runId && (
        <>
          <Section title={t('Questa richiesta', 'This request')}>
            <dl className={styles.rows}>
              <Row k={t('Giro', 'Step')}>{stage.step || '—'}</Row>
              <Row k={t('Fase', 'Phase')}>{PHASE_LABEL[stage.phase]}</Row>
            </dl>
          </Section>
          {stage.toolHistory.length > 0 && (
            <Section title={t(`Cronologia strumenti · ${stage.toolHistory.length}`, `Tool history · ${stage.toolHistory.length}`)} collapsible={stage.toolHistory.length > 3}>
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
  const t = useT()
  const instructions = useLab(s => getScenario(s.scenarioId, s.promptLanguage).context.instructions)
  return (
    <Section title={t('Testo inviato al modello', 'Text sent to the model')} collapsible>
      <dl className={styles.rows}>
        {INSTRUCTION_SECTIONS.map(s => (
          <Row key={s.id} k={t(s.title, s.modelTitle)}>
            {s.text}
          </Row>
        ))}
        <Row k={t('Scenario', 'Scenario')}>{instructions}</Row>
      </dl>
    </Section>
  )
}

function ContextDetails() {
  const t = useT()
  const taskData = useLab(s => getScenario(s.scenarioId, s.promptLanguage).context.taskData)
  return (
    <Section title={t('Dati del compito', 'Task data')} collapsible={taskData.length > 4}>
      {taskData.map(d => (
        <div key={d.id} className={styles.subsection}>
          <h4>{d.title}</h4>
          <p>{d.text}</p>
        </div>
      ))}
    </Section>
  )
}

function MemoryDetails({ stage }: { stage: StageState }) {
  const t = useT()
  useSubscription(memory.subscribe)
  const records = memory.list()
  return (
    <>
      <Section title={t(`${records.length} ricordi salvati`, `${records.length} saved memories`)} collapsible={records.length > 4}>
        <ul className={styles.items}>
          {records.map((r) => {
            const st = stage.memory.find(m => m.key === r.key)?.state
            return (
              <li key={r.id} className={st === 'ignored' ? styles.out : ''}>
                <span className={styles.tag}>{r.scope === 'persistent' ? t('persistente', 'persistent') : t('sessione', 'session')}</span>
                <span className={styles.itemTitle}>
                  <strong>{memoryKeyText(r.key)}</strong> {r.text}
                </span>
                {st === 'injected' && <Check size={14} aria-label={t('inserito nel contesto', 'added to the context')} />}
              </li>
            )
          })}
        </ul>
      </Section>
      {stage.memoryWritten && (
        <Section title={t('Salvato in questa richiesta', 'Saved in this request')}>
          <p>{stage.memoryWritten}</p>
        </Section>
      )}
    </>
  )
}

function RagDetails({ stage }: { stage: StageState }) {
  const t = useT()
  const rag = useLab(s => s.config.rag)
  const docs = retriever.documents()
  return (
    <>
      {stage.ragQuery && (
        <Section title={t(`Frammenti trovati · ${stage.ragHits.length}`, `Passages found · ${stage.ragHits.length}`)} collapsible={stage.ragHits.length > 4}>
          <ul className={styles.items}>
            {stage.ragHits.map(h => (
              <li key={h.chunkId} className={h.status === 'selected' ? '' : styles.out}>
                <span className={styles.itemTitle}>{h.title}</span>
                <em>
                  {h.status === 'selected'
                    ? `${Math.round(h.normalized * 100)}%`
                    : h.reason
                      ? EXCLUSION_LABEL[h.reason as ExclusionReason]
                      : t('escluso', 'excluded')}
                </em>
              </li>
            ))}
          </ul>
        </Section>
      )}
      <Section title={t('Regole di ricerca', 'Search rules')}>
        <dl className={styles.rows}>
          <Row k={t('Frammenti tenuti', 'Passages kept')}>{rag.topK}</Row>
          <Row k={t('Pertinenza minima', 'Minimum relevance')}>{Math.round(rag.minScore * 100)}%</Row>
          <Row k={t('Versioni superate', 'Outdated versions')}>{rag.includeOutdated ? t('incluse', 'included') : t('escluse', 'excluded')}</Row>
        </dl>
      </Section>
      <Section title={t(`${docs.length} documenti`, `${docs.length} documents`)} collapsible={docs.length > 4}>
        <ul className={styles.items}>
          {docs.map(d => (
            <li key={d.id} className={d.status === 'valid' ? '' : styles.out}>
              <span className={styles.tag}>
                {d.status === 'valid' ? `v${d.version}` : d.status === 'outdated' ? t('superato', 'outdated') : t('fuori tema', 'off topic')}
              </span>
              <span className={styles.itemTitle}>{d.title}</span>
            </li>
          ))}
        </ul>
      </Section>
    </>
  )
}

function ToolsDetails({ stage }: { stage: StageState }) {
  const t = useT()
  const enabled = useLab(s => s.config.enabledTools)
  useLab(s => s.customTools)
  const tools = registry.list().filter(tool => enabled.includes(tool.id))
  return (
    <>
      {stage.toolHistory.length > 0 && (
        <Section title={t(`Chiamate in questa richiesta · ${stage.toolHistory.length}`, `Calls in this request · ${stage.toolHistory.length}`)} collapsible={stage.toolHistory.length > 3}>
          <ol className={styles.history}>
            {stage.toolHistory.map((h, i) => (
              <li key={i} className={h.ok ? styles.pass : styles.fail}>
                <code>{h.tool.replace(/^mcp__\w+?__/, 'MCP·')}</code> {h.summary.slice(0, 110)}
              </li>
            ))}
          </ol>
        </Section>
      )}
      <Section
        title={t(`${tools.length} strumenti a disposizione del modello`, `${tools.length} tools available to the model`)}
        collapsible={tools.length > 4}
      >
        <ul className={styles.tools}>
          {tools.map((tool) => {
            const copy = toolText(tool)
            return (
              <li key={tool.id}>
                <div className={styles.toolHead}>
                  <strong>{copy.title}</strong>
                  <span className={`${styles.tag} ${tool.risk !== 'read' ? styles.tagWarn : ''}`}>{RISK_LABEL[tool.risk]}</span>
                  {tool.approval === 'always' && <span className={`${styles.tag} ${styles.tagWarn}`}>{t('approvazione', 'approval')}</span>}
                </div>
                <code>{tool.id}</code>
                <p>{copy.purpose}</p>
              </li>
            )
          })}
        </ul>
      </Section>
    </>
  )
}

function ControlsDetails({ stage }: { stage: StageState }) {
  const t = useT()
  const limits = useLab(s => s.config.limits)
  const backend = useLab(s => s.modelInfo.backend)
  return (
    <>
      <Section title={t('Limiti', 'Limits')}>
        <dl className={styles.rows}>
          {LIMIT_ROWS.map(r => (
            <Row key={r.key} k={pick(r.label)}>
              {r.unit === 'ms' ? seconds(limits[r.key]) : limits[r.key]}
            </Row>
          ))}
        </dl>
        {backend === 'wasm' && (
          <p className={styles.note}>
            {t(
              'Su CPU il modello è più lento: i tempi per giro e totale vengono moltiplicati.',
              'On CPU the model is slower: the time per step and total time are multiplied.',
            )}
          </p>
        )}
      </Section>
      {stage.guardMessage && (
        <Section title={t('Ultimo intervento', 'Last intervention')}>
          <p>{stage.guardMessage}</p>
        </Section>
      )}
    </>
  )
}

function HumanDetails({ stage, onApprovalDetails }: { stage: StageState; onApprovalDetails: () => void }) {
  const t = useT()
  const pending = useLab(s => s.pendingApproval)
  const auto = useLab(s => s.config.autoApprove)
  const enabled = useLab(s => s.config.enabledTools)
  const gated = registry.list().filter(tool => enabled.includes(tool.id) && (tool.approval === 'always' || tool.risk !== 'read'))
  return (
    <>
      {pending && (
        <Section title={t('In attesa di te', 'Waiting for you')}>
          <p className={styles.strong}>{pending.toolTitle}</p>
          <p>{pending.effects}</p>
          <button type="button" className={styles.action} onClick={onApprovalDetails}>
            {t('Vedi tutti i dettagli dell’azione', 'See all the details of the action')}
          </button>
        </Section>
      )}
      <Section title={t('Quando ti chiede il permesso', 'When it asks for your permission')} collapsible={gated.length > 4}>
        {gated.length ? (
          <ul className={styles.list}>
            {gated.map(tool => (
              <li key={tool.id}>
                {toolText(tool).title} <span className={styles.muted}>· {RISK_LABEL[tool.risk].toLowerCase()}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.muted}>{t('Nessuno strumento con effetti è attivo.', 'No tool with side effects is active.')}</p>
        )}
        {auto && <p className={styles.note}>{t('Approvazione automatica attiva (modalità regia).', 'Automatic approval is on (director mode).')}</p>}
      </Section>
      {stage.human.state !== 'idle' && stage.human.state !== 'waiting' && (
        <Section title={t('Ultima decisione', 'Last decision')}>
          <p>
            {stage.human.state === 'allowed-once'
              ? t('Approvato', 'Approved')
              : stage.human.state === 'rejected'
                ? t('Rifiutato', 'Rejected')
                : t('Annullato', 'Cancelled')}
            : {stage.human.title}
          </p>
        </Section>
      )}
    </>
  )
}

function McpDetails({ stage }: { stage: StageState }) {
  const t = useT()
  useSubscription(mcpHub.subscribe)
  const servers = mcpHub.servers()
  const STATE_LABEL = {
    connected: t('collegato', 'connected'),
    connecting: t('in collegamento', 'connecting'),
    error: t('errore', 'error'),
    disconnected: t('non collegato', 'disconnected'),
  }
  return (
    <>
      {servers.map(s => (
        <Section key={s.server.id} title={s.server.label} collapsible={s.tools.length > 4}>
          <dl className={styles.rows}>
            <Row k={t('Tipo', 'Type')}>{s.server.kind === 'real' ? t('reale, su internet', 'real, on the internet') : t('simulato nel browser', 'simulated in the browser')}</Row>
            {s.server.url && (
              <Row k={t('Indirizzo', 'Address')}>
                <code>{s.server.url}</code>
              </Row>
            )}
            <Row k={t('Stato', 'Status')}>{STATE_LABEL[s.state]}</Row>
          </dl>
          {s.error && <p className={styles.fail}>{s.error}</p>}
          {s.tools.length > 0 && (
            <ul className={styles.items}>
              {s.tools.map(tool => (
                <li key={tool.name}>
                  <code className={styles.itemTitle}>{tool.name}</code>
                </li>
              ))}
            </ul>
          )}
        </Section>
      ))}
      {stage.mcpLast && (
        <Section title={t('Ultimo scambio', 'Last exchange')}>
          <p className={styles.mono}>{stage.mcpLast}</p>
        </Section>
      )}
      <p className={styles.note}>
        {t(
          'Nessuna credenziale: le chiamate partono senza cookie, solo verso server in elenco e con la tua approvazione.',
          'No credentials: calls are sent without cookies, only to listed servers and with your approval.',
        )}
      </p>
    </>
  )
}
