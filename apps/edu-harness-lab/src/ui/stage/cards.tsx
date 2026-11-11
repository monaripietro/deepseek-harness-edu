import { ModelActivityNote, useStreamedProse } from '../model/ModelActivity'
import { useCallback, useEffect } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Check, ClipboardList, Database, Hand, Library, MessageSquare, Play, Plug, ScrollText, Search, ShieldCheck, Sparkles, Square, UserCheck, Wrench, X } from 'lucide-react'
import type { ContextKind } from '../../domain/types'
import { INSTRUCTION_SECTIONS } from '../../harness/orchestrator/instructions'
import { SCENARIOS, getScenario, requestFor } from '../../scenarios'
import { guideScenario } from '../../scenarios/guide'
import { mcpHub, memory, registry, retriever, useLab } from '../../state/store'
import { CONTEXT_KIND_LABEL, STOP_LABEL } from '../common/labels'
import { Markdown } from '../common/Markdown'
import { ProvenanceBadge } from '../common/ProvenanceBadge'
import { useT } from '../../i18n'
import { componentText, memoryKeyText, toolText } from '../../i18nContent'
import type { StageState } from './deriveStage'
import { argsInline } from './deriveStage'
import { RECTS } from './geometry'
import { Led, StageCard } from './StageCard'
import { useStageUi } from './stageUi'
import { useSubscription } from './useSubscription'
import styles from './stage.module.css'

// Deep-dive selection is shared through a tiny event so cards, details and the header can open it.
type DockTab = 'context' | 'trace' | 'conversation'
const dockListeners = new Set<(t: DockTab) => void>()
export function onDockRequest(cb: (t: DockTab) => void) {
  dockListeners.add(cb)
  return () => {
    dockListeners.delete(cb)
  }
}
export function useDockTab() {
  return useCallback((t: DockTab) =>{  dockListeners.forEach((cb) =>{  cb(t) }) }, [])
}

const toolName = (id: string) => id.replace(/^mcp__\w+?__/, 'MCP·')

// ───────────────────────── Question ─────────────────────────

export function QuestionCard({ lit }: { lit: boolean }) {
  const t = useT()
  const scenarioId = useLab(s => s.scenarioId)
  const status = useLab(s => s.status)
  const send = useLab(s => s.send)
  const stop = useLab(s => s.stop)
  const scenario = SCENARIOS.find(s => s.id === scenarioId) ?? guideScenario
  const draft = useStageUi(s => s.draft)
  const promptLanguage = useLab(s => s.promptLanguage)
  const request = requestFor(scenario.id, promptLanguage) || scenario.request
  const setText = useStageUi(s => s.setDraft)
  const text = draft ?? request
  useEffect(() =>{  setText(null) }, [request, setText])
  const running = status === 'running' || status === 'awaitingApproval'

  const action = running ? (
    <button type="button" className={`${styles.bigBtn} ${styles.stopBtn}`} onClick={stop}>
      <Square size={14} fill="currentColor" aria-hidden /> {t('Ferma', 'Stop')}
    </button>
  ) : (
    <button type="button" className={styles.bigBtn} onClick={() => void send(text)} disabled={!text.trim()}>
      <Play size={15} fill="currentColor" aria-hidden /> {t('Avvia', 'Run')}
    </button>
  )

  return (
    <StageCard
      node="question"
      rect={RECTS.question}
      tone="user"
      title={t('La tua richiesta', 'Your request')}
      kicker={t('Tu · modificabile', 'You · editable')}
      icon={<MessageSquare size={17} />}
      active
      lit={lit}
      tall
      previewWidth={480}
      summary={
        <>
          <p className={styles.clamp2}>{text}</p>
          <div className={styles.questionActions}>{action}</div>
        </>
      }
    >
      <label className="visually-hidden" htmlFor="stage-question">
        {t('Richiesta da inviare al sistema', 'Request to send to the system')}
      </label>
      <textarea
        id="stage-question"
        className={styles.question}
        value={text}
        disabled={running}
        onChange={(e) =>{  setText(e.target.value) }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !running) {
            e.preventDefault()
            void send(text)
          }
        }}
      />
      <div className={styles.questionActions}>
        {action}
        {text !== request && !running && (
          <button type="button" className={styles.linkBtn} onClick={() =>{  setText(null) }}>
            {t('Domanda dello scenario', 'Scenario question')}
          </button>
        )}
      </div>
    </StageCard>
  )
}

// ───────────────────────── Answer ─────────────────────────

export function AnswerCard({ stage, lit }: { stage: StageState; lit: boolean }) {
  const t = useT()
  const status = useLab(s => s.status)
  const prose = useStreamedProse()
  const running = status === 'running' || status === 'awaitingApproval'
  const passed = stage.checks.filter(c => c.passed).length
  const plain = stage.answer?.replace(/[#*_`>|-]+/g, ' ').replace(/\s+/g, ' ').trim()

  return (
    <StageCard
      node="answer"
      rect={RECTS.answer}
      tone="model"
      title={t('Risposta', 'Answer')}
      kicker={t('Ciò che ricevi', 'What you get')}
      icon={<Sparkles size={17} />}
      active
      lit={lit}
      tall
      previewWidth={560}
      status={stage.checks.length > 0 ? <span className={styles.meta}>{passed}/{stage.checks.length} {t('verifiche', 'checks')}</span> : undefined}
      summary={
        plain ? (
          <p className={styles.clamp3}>{plain}</p>
        ) : running ? (
          <p className={`${styles.clamp3} ${styles.waiting}`}>{prose ? prose.slice(-160) : <ModelActivityNote fallback={t('Il sistema sta lavorando…', 'The system is working…')} />}</p>
        ) : (
          <p className={styles.placeholder}>{t('La risposta comparirà qui.', 'The answer will appear here.')}</p>
        )
      }
    >
      <div className={styles.answerScroll}>
        {stage.answer ? (
          <Markdown>{stage.answer}</Markdown>
        ) : running ? (
          <p className={styles.waiting}>{prose ? <span className={styles.streamText}>{prose.slice(-480)}</span> : t('Il sistema sta lavorando…', 'The system is working…')}</p>
        ) : (
          <p className={styles.placeholder}>
            {t('Premi', 'Press')} <strong>{t('Avvia', 'Run')}</strong>{t(': la risposta comparirà qui.', ': the answer will appear here.')}
          </p>
        )}
      </div>
      {stage.stopReason && (
        <div className={styles.answerFoot}>
          <span className={`${styles.stopChip} ${stage.stopReason === 'final_answer' ? styles.good : stage.stopReason === 'needs_user_input' ? styles.warn : styles.bad}`}>
            {STOP_LABEL[stage.stopReason]}
          </span>
          {stage.record && <ProvenanceBadge tag={stage.record.modelProvenance} compact />}
        </div>
      )}
    </StageCard>
  )
}

// ───────────────────────── Instructions / context / memory / RAG ─────────────────────────

export function InstructionsCard({ active, lit }: { active: boolean; lit: boolean }) {
  const t = useT()
  const instructions = useLab(s => getScenario(s.scenarioId, s.promptLanguage).context.instructions)
  return (
    <StageCard
      node="instructions"
      rect={RECTS.instructions}
      tone="information"
      title={t('Istruzioni', 'Instructions')}
      kicker={t('Cosa legge', 'What it reads')}
      icon={<ScrollText size={17} />}
      component="instructions"
      active={active}
      lit={lit}
      summary={<p className={styles.oneLine}>{INSTRUCTION_SECTIONS.map(s => t(s.title, s.modelTitle).toLowerCase()).join(' · ')}</p>}
    >
      <dl className={styles.defs}>
        {INSTRUCTION_SECTIONS.map(s => (
          <div key={s.id}>
            <dt>{t(s.title, s.modelTitle)}</dt>
            <dd>{s.text}</dd>
          </div>
        ))}
        <div>
          <dt>{t('Scenario', 'Scenario')}</dt>
          <dd>{instructions}</dd>
        </div>
      </dl>
    </StageCard>
  )
}

export function ContextCard({ active, lit }: { active: boolean; lit: boolean }) {
  const t = useT()
  const td = useLab(s => getScenario(s.scenarioId, s.promptLanguage).context.taskData)
  return (
    <StageCard
      node="context"
      rect={RECTS.context}
      tone="information"
      title={t('Dati del compito', 'Task data')}
      kicker={t('Cosa legge', 'What it reads')}
      icon={<ClipboardList size={17} />}
      component="context"
      active={active}
      lit={lit}
      summary={<p className={styles.oneLine}>{td[0]?.title ?? t('Dati del compito', 'Task data')}</p>}
    >
      {td.map(t => (
        <div key={t.id} className={styles.previewBlock}>
          <strong>{t.title}</strong>
          <p>{t.text.length > 260 ? `${t.text.slice(0, 259)}…` : t.text}</p>
        </div>
      ))}
    </StageCard>
  )
}

export function MemoryCard({ stage, active, lit }: { stage: StageState; active: boolean; lit: boolean }) {
  const t = useT()
  useSubscription(memory.subscribe)
  const records = memory.list()
  const injected = stage.memory.filter(m => m.state === 'injected').length
  return (
    <StageCard
      node="memory"
      rect={RECTS.memory}
      tone="information"
      title={componentText('memory').label}
      kicker={t('Cosa legge', 'What it reads')}
      icon={<Database size={17} />}
      component="memory"
      active={active}
      lit={lit}
      status={<span className={styles.meta}>{records.length}</span>}
      summary={
        <p className={styles.oneLine}>
          {stage.runId
            ? `${injected} ${injected === 1 ? t('ricordo', 'memory') : t('ricordi', 'memories')} ${t('nel contesto', 'in the context')}`
            : records.map(r => memoryKeyText(r.key)).join(' · ') || t('Nessun ricordo', 'No memories')}
        </p>
      }
    >
      <ul className={styles.memList}>
        {records.map((r) => {
          const st = stage.memory.find(m => m.key === r.key)?.state
          return (
            <li key={r.id} className={st === 'injected' ? styles.memIn : st === 'ignored' ? styles.memOut : ''}>
              <span className={styles.memText}>
                <strong>{memoryKeyText(r.key)}</strong> {r.text}
              </span>
              {st === 'injected' && <Check size={14} aria-label={t('inserito nel contesto', 'added to the context')} />}
            </li>
          )
        })}
      </ul>
      {stage.runId && <p className={styles.hint}>{t(`${injected} nel contesto di questa richiesta`, `${injected} in the context of this request`)}</p>}
    </StageCard>
  )
}

export function RagCard({ stage, active, lit }: { stage: StageState; active: boolean; lit: boolean }) {
  const t = useT()
  const docs = retriever.documents()
  const hits = stage.ragHits.slice(0, 5)
  const top = stage.ragHits.find(h => h.status === 'selected')
  const kept = stage.ragHits.filter(h => h.status === 'selected').length
  return (
    <StageCard
      node="rag"
      rect={RECTS.rag}
      tone="information"
      title={t('Documenti · RAG', 'Documents · RAG')}
      kicker={t('Cosa legge', 'What it reads')}
      icon={<Library size={17} />}
      component="rag"
      active={active}
      lit={lit}
      status={<span className={styles.meta}>{docs.length}</span>}
      summary={
        <p className={styles.oneLine}>
          {stage.ragQuery
            ? `${kept} ${t('frammenti scelti', 'fragments chosen')}${top ? ` · ${top.docId} ${Math.round(top.normalized * 100)}%` : ''}`
            : `${docs.length} ${t('documenti aziendali', 'company documents')}`}
        </p>
      }
    >
      {stage.ragQuery ? (
        <>
          <p className={styles.ragQuery}>
            <Search size={12} aria-hidden /> {t('frammenti più pertinenti', 'most relevant fragments')}
          </p>
          <ul className={styles.hits}>
            {hits.map((h, i) => (
              <motion.li
                key={h.chunkId}
                className={h.status === 'selected' ? styles.hitIn : styles.hitOut}
                initial={{ x: -10 }}
                animate={{ x: 0 }}
                transition={{ delay: i * 0.06 }}
              >
                <span className={styles.hitDoc}>{h.docId}</span>
                <span className={styles.hitBar}>
                  <motion.span
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: Math.max(0.04, h.normalized) }}
                    transition={{ delay: 0.1 + i * 0.06, duration: 0.5 }}
                  />
                </span>
                <span className={styles.hitScore}>{Math.round(h.normalized * 100)}%</span>
              </motion.li>
            ))}
          </ul>
        </>
      ) : (
        <p className={styles.previewLead}>
          {docs.length} {t('documenti aziendali. Quando arriva una domanda, cerca i frammenti più pertinenti e li aggiunge al contesto.', 'company documents. When a question arrives, it searches for the most relevant fragments and adds them to the context.')}
        </p>
      )}
    </StageCard>
  )
}

// ───────────────────────── Context window ─────────────────────────

const KIND_TONE: Record<ContextKind, string> = {
  instruction: 'var(--c-information)',
  taskData: 'color-mix(in srgb, var(--c-information) 60%, var(--c-orchestration))',
  memory: 'color-mix(in srgb, var(--c-information) 45%, var(--text-faint))',
  document: 'color-mix(in srgb, var(--c-information) 80%, var(--text))',
  toolSchema: 'var(--c-action)',
  toolResult: 'var(--c-action-fill)',
  state: 'var(--c-governance)',
  message: 'var(--c-orchestration)',
}

export function WindowCard({ stage, lit }: { stage: StageState; lit: boolean }) {
  const t = useT()
  const loc = t('it-IT', 'en-US')
  const snap = stage.snapshot
  const included = snap ? snap.items.filter(i => i.status === 'included') : []
  const byKind = new Map<ContextKind, number>()
  for (const it of included) byKind.set(it.kind, (byKind.get(it.kind) ?? 0) + it.tokens)
  const total = snap?.budget.usedTokens ?? 0
  const order: ContextKind[] = ['instruction', 'toolSchema', 'taskData', 'memory', 'document', 'message', 'toolResult', 'state']
  const segs = order.flatMap((k) => {
    const tokens = byKind.get(k)
    return tokens === undefined ? [] : [{ kind: k, tokens }]
  })
  const bar = (
    <div className={styles.bar} role="img" aria-label={`${t('Contesto', 'Context')}: ${segs.map(s => `${CONTEXT_KIND_LABEL[s.kind]} ${s.tokens} token`).join(', ')}`}>
      {segs.map(s => (
        <motion.span
          key={s.kind}
          layout
          className={styles.barSeg}
          style={{ flexGrow: s.tokens, '--seg': KIND_TONE[s.kind] } as React.CSSProperties}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        />
      ))}
    </div>
  )

  return (
    <StageCard
      node="window"
      rect={RECTS.window}
      tone="model"
      title={t('Cosa vede il modello', 'What the model sees')}
      kicker={t('Finestra di contesto', 'Context window')}
      icon={<ScrollText size={17} />}
      active
      lit={lit}
      tall
      summary={
        snap ? (
          <>
            {bar}
            <p className={styles.oneLine}>
              ≈ {total.toLocaleString(loc)} token · {t('giro', 'round')} {snap.stepIndex}
            </p>
          </>
        ) : (
          <p className={styles.placeholder}>{t('Si riempie quando premi Avvia.', 'It fills up when you press Run.')}</p>
        )
      }
    >
      {snap ? (
        <>
          <p className={styles.hint}>
            ≈ {total.toLocaleString(loc)} token · {t('ricomposto al giro', 'reassembled at round')} {snap.stepIndex}
          </p>
          {bar}
          <ul className={styles.legend}>
            {segs.map(s => (
              <li key={s.kind} style={{ '--seg': KIND_TONE[s.kind] } as React.CSSProperties}>
                <span>{CONTEXT_KIND_LABEL[s.kind]}</span>
                <em>{s.tokens.toLocaleString(loc)}</em>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className={styles.previewLead}>{t('Tutto ciò che arriva al modello, pezzo per pezzo: il modello non vede nient’altro.', 'Everything that reaches the model, piece by piece: the model sees nothing else.')}</p>
      )}
    </StageCard>
  )
}

// ───────────────────────── Tools / controls / human / MCP ─────────────────────────

export function ToolsCard({ stage, active, lit }: { stage: StageState; active: boolean; lit: boolean }) {
  const t = useT()
  const enabled = useLab(s => s.config.enabledTools)
  useLab(s => s.customTools)
  const tools = registry.list().filter(tool => enabled.includes(tool.id))
  const cur = stage.tool
  const curLabel = cur
    ? cur.state === 'executing'
      ? t('In esecuzione', 'Running')
      : cur.state === 'done'
        ? t('Risultato', 'Result')
        : cur.state === 'requested' || cur.state === 'validated'
          ? t('Richiesto dal modello', 'Requested by the model')
          : t('Problema', 'Problem')
    : ''
  return (
    <StageCard
      node="tools"
      rect={RECTS.tools}
      tone="action"
      title={componentText('tools').label}
      kicker={t('Cosa può fare', 'What it can do')}
      icon={<Wrench size={17} />}
      component="tools"
      active={active}
      lit={lit}
      status={<span className={styles.meta}>{tools.length}</span>}
      summary={
        cur ? (
          <p className={`${styles.oneLine} ${styles.mono} ${cur.state === 'done' ? styles.okText : cur.state === 'executing' || cur.state === 'requested' || cur.state === 'validated' ? '' : styles.badText}`}>
            ▸ {toolName(cur.tool)}({argsInline(cur.args, 2)})
          </p>
        ) : (
          <p className={styles.oneLine}>{stage.toolHistory.length ? `${stage.toolHistory.length} ${t('chiamate fatte', 'calls made')}` : t('Nessuno in uso', 'None in use')}</p>
        )
      }
    >
      <AnimatePresence mode="wait">
        {cur && (
          <motion.div key={cur.callId + cur.state} className={styles.toolNow} initial={{ y: 6 }} animate={{ y: 0 }} exit={{ opacity: 0 }}>
            <span className={styles.toolNowLabel}>{curLabel}</span>
            <code>
              {toolName(cur.tool)}({argsInline(cur.args, 3)})
            </code>
            {cur.summary && <span className={cur.state === 'done' ? styles.okText : styles.badText}>{cur.summary.slice(0, 120)}</span>}
          </motion.div>
        )}
      </AnimatePresence>
      <ul className={styles.toolList}>
        {tools.map(tool => (
          <li key={tool.id}>
            <span>{toolText(tool).title}</span>
            {tool.risk !== 'read' && <em>{tool.approval === 'always' ? t('con approvazione', 'with approval') : t('scrive', 'writes')}</em>}
          </li>
        ))}
      </ul>
    </StageCard>
  )
}

export function ControlsCard({ stage, active, lit }: { stage: StageState; active: boolean; lit: boolean }) {
  const t = useT()
  const limits = useLab(s => s.config.limits)
  const approval = useLab(s => s.config.components.approval)
  const g = stage.gates
  const rows: { key: keyof StageState['gates']; label: string; detail?: string }[] = [
    { key: 'validation', label: t('Argomenti', 'Arguments') },
    { key: 'permissions', label: t('Permessi', 'Permissions') },
    { key: 'steps', label: t('Passi', 'Steps'), detail: `${stage.step}/${limits.maxSteps}` },
    { key: 'repeat', label: t('Cicli ripetuti', 'Repeated loops') },
    { key: 'time', label: t('Tempo', 'Time') },
    { key: 'supervision', label: approval ? t('Supervisione', 'Supervision') : t('Azioni', 'Actions'), detail: approval ? undefined : t('bloccate', 'blocked') },
  ]
  return (
    <StageCard
      node="controls"
      rect={RECTS.controls}
      tone="governance"
      title={componentText('controls').label}
      kicker={t('Chi governa', 'Who governs')}
      icon={<ShieldCheck size={17} />}
      component="controls"
      active={active}
      lit={lit}
      status={
        <span className={styles.meta}>
          {stage.step}/{limits.maxSteps}
        </span>
      }
      summary={
        <div className={styles.ledRow}>
          {rows.map(r => (
            <Led key={r.key} state={g[r.key]} label={r.label} />
          ))}
          {stage.guardMessage && <span className={styles.ledAlert}>{t('intervenuto', 'intervened')}</span>}
        </div>
      }
    >
      <ul className={styles.gates}>
        {rows.map(r => (
          <li key={r.key}>
            <Led state={g[r.key]} label={r.label} />
            <span>{r.label}</span>
            {r.detail && <em>{r.detail}</em>}
          </li>
        ))}
      </ul>
      {stage.guardMessage && <p className={styles.guardMsg}>{stage.guardMessage.slice(0, 140)}</p>}
    </StageCard>
  )
}

export function HumanCard({ stage, active, lit }: { stage: StageState; active: boolean; lit: boolean }) {
  const t = useT()
  const pending = useLab(s => s.pendingApproval)
  const decide = useLab(s => s.decideApproval)
  const auto = useLab(s => s.config.autoApprove)
  const h = stage.human
  const stateText =
    h.state === 'allowed-once'
      ? `${t('Approvato', 'Approved')}: ${h.title ?? ''}`
      : h.state === 'rejected'
        ? `${t('Rifiutato', 'Rejected')}: ${h.title ?? ''}`
        : h.state === 'cancelled'
          ? t('Richiesta annullata', 'Request cancelled')
          : auto
            ? t('Approvazione automatica (regia)', 'Automatic approval (director)')
            : t('Nulla da approvare', 'Nothing to approve')
  return (
    <StageCard
      node="human"
      rect={RECTS.human}
      tone="governance"
      title={componentText('approval').label}
      kicker={t('Chi governa', 'Who governs')}
      icon={<UserCheck size={17} />}
      component="approval"
      active={active}
      lit={lit || !!pending}
      alarm={!!pending}
      summary={<p className={`${styles.oneLine} ${pending ? styles.badText : ''}`}>{pending ? `${t('Serve il tuo permesso', 'Your permission is needed')}: ${pending.toolTitle}` : stateText}</p>}
    >
      {pending ? (
        <div className={styles.approvalBox}>
          <p className={styles.approvalTitle}>
            <Hand size={15} aria-hidden /> {t('Serve il tuo permesso', 'Your permission is needed')}
          </p>
          <p className={styles.approvalAction}>{pending.toolTitle}</p>
          <p className={styles.approvalEffects}>{pending.effects}</p>
          <div className={styles.approvalBtns}>
            <button type="button" className={styles.approve} onClick={() =>{  decide('allowed-once') }}>
              <Check size={15} aria-hidden /> {t('Approva', 'Approve')}
            </button>
            <button type="button" className={styles.reject} onClick={() =>{  decide('rejected') }}>
              <X size={15} aria-hidden /> {t('Rifiuta', 'Reject')}
            </button>
          </div>
        </div>
      ) : (
        <div className={styles.human}>
          <span className={`${styles.avatar} ${h.state === 'allowed-once' ? styles.good : h.state === 'rejected' ? styles.bad : ''}`} aria-hidden>
            {t('TU', 'YOU')}
          </span>
          <p className={styles.humanState}>{stateText}</p>
        </div>
      )}
    </StageCard>
  )
}

export function McpCard({ stage, active, lit }: { stage: StageState; active: boolean; lit: boolean }) {
  const t = useT()
  useSubscription(mcpHub.subscribe)
  const exposed = useLab(s => s.config.mcpServers)
  const servers = mcpHub.servers().filter(s => exposed.includes(s.server.id) || s.state === 'connected')
  const connected = servers.filter(s => s.state === 'connected').length
  return (
    <StageCard
      node="mcp"
      rect={RECTS.mcp}
      tone="action"
      title={componentText('mcp').label}
      kicker={t('Fuori dal browser', 'Outside the browser')}
      icon={<Plug size={17} />}
      component="mcp"
      active={active}
      lit={lit}
      className={styles.external}
      summary={<p className={styles.oneLine}>{stage.mcpLast ? `↳ ${stage.mcpLast}` : servers.length ? `${servers.length} server · ${connected} ${t('collegati', 'connected')}` : t('Si collega al primo uso', 'Connects on first use')}</p>}
    >
      {servers.length === 0 && <p className={styles.hint}>{t('Si collega al primo uso.', 'Connects on first use.')}</p>}
      {servers.map(s => (
        <p key={s.server.id} className={styles.mcpName}>
          <Led state={s.state === 'connected' ? 'ok' : s.state === 'error' ? 'fail' : s.state === 'connecting' ? 'warn' : 'idle'} label={s.server.label} />
          {s.server.label.replace(/\s*\(simulato\)/i, '')}
          {s.tools.length > 0 && <em className={styles.meta}>{s.tools.length} {t('strumenti', 'tools')}</em>}
        </p>
      ))}
      {stage.mcpLast && <p className={styles.mcpLast}>↳ {stage.mcpLast.slice(0, 140)}</p>}
    </StageCard>
  )
}
