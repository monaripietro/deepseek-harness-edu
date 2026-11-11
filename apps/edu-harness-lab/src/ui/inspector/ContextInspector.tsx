import { useMemo, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ChevronDown, Eye, Info, ScrollText } from 'lucide-react'
import type { ContextItem, ContextKind, ContextSnapshot } from '../../domain/types'
import { useLab } from '../../state/store'
import { useT, biRecord } from '../../i18n'
import { CONTEXT_KIND_LABEL, EXCLUSION_LABEL, numLocale } from '../common/labels'
import { ProvenanceBadge } from '../common/ProvenanceBadge'
import { Chip } from '../common/Chip'
import styles from './ContextInspector.module.css'

const KIND_ORDER: ContextKind[] = ['instruction', 'taskData', 'memory', 'document', 'toolSchema', 'toolResult', 'state', 'message']

/** Colour of each kind: family colour + a mix to tell shades of the same family apart. */
const KIND_COLOR: Record<ContextKind, string> = {
  instruction: 'var(--c-information)',
  taskData: 'color-mix(in srgb, var(--c-information) 72%, var(--text))',
  memory: 'color-mix(in srgb, var(--c-information) 55%, var(--bg))',
  document: 'color-mix(in srgb, var(--c-information) 40%, var(--text))',
  toolSchema: 'var(--c-action)',
  toolResult: 'color-mix(in srgb, var(--c-action) 60%, var(--text))',
  message: 'var(--c-model)',
  state: 'var(--c-orchestration)',
}

const ROLE_LABEL = biRecord<string>({
  system: ['SYSTEM', 'SYSTEM'],
  user: ['UTENTE', 'USER'],
  assistant: ['ASSISTENTE', 'ASSISTANT'],
  tool: ['STRUMENTO', 'TOOL'],
})

export function ContextInspector() {
  const t = useT()
  const events = useLab(s => s.events)
  const runId = useLab(s => s.currentRunId)
  const reduce = useReducedMotion()
  // The chosen step belongs to one run: a new run (or a reset) goes back to the latest step.
  const [pick, setPick] = useState<{ runId: string | null; i: number } | null>(null)
  const picked = pick && pick.runId === runId ? pick.i : null
  const [showPrompt, setShowPrompt] = useState(false)

  const snaps = useMemo(() => {
    const list: ContextSnapshot[] = []
    for (const e of events) if (e.runId === runId && e.type === 'context/assembled') list.push(e.snapshot)
    return list
  }, [events, runId])

  const idx = picked !== null && picked < snaps.length ? picked : snaps.length - 1
  const snap = snaps[idx]

  if (!snap) {
    return (
      <section className={styles.root} aria-label={t('Cosa riceve il modello', 'What the model receives')}>
        <h2 className={styles.title}>{t('COSA RICEVE IL MODELLO', 'WHAT THE MODEL RECEIVES')}</h2>
        <div className={styles.empty}>
          <Eye size={36} aria-hidden />
          <p>{t("Invia una richiesta: qui vedrai, pezzo per pezzo, tutto ciò che l'harness consegna al modello prima di ogni risposta.", 'Send a request: here you will see, piece by piece, everything the harness gives the model before each answer.')}</p>
        </div>
      </section>
    )
  }

  const included = snap.items.filter(i => i.status === 'included')
  const excluded = snap.items.filter(i => i.status === 'excluded')
  const onlyUser = included.length > 0 && included.every(i => i.kind === 'message')
  const used = snap.budget.usedTokens
  const totalForBar = Math.max(snap.budget.maxTokens, used, 1)
  const locale = numLocale()
  const tokenWord = t('token', 'tokens')

  const tokensOf = (items: ContextItem[]) => items.reduce((a, i) => a + i.tokens, 0)
  const byKind = KIND_ORDER.map(k => ({
    kind: k,
    inc: included.filter(i => i.kind === k),
    exc: excluded.filter(i => i.kind === k),
  })).filter(g => g.inc.length + g.exc.length > 0)

  return (
    <section className={styles.root} aria-label={t('Cosa riceve il modello', 'What the model receives')}>
      <header className={styles.head}>
        <h2 className={styles.title}>{t('COSA RICEVE IL MODELLO', 'WHAT THE MODEL RECEIVES')}</h2>
        {snaps.length > 1 && (
          <div className={styles.steps} role="group" aria-label={t('Passi', 'Steps')}>
            {snaps.map((s, i) => (
              <Chip key={s.id} selected={i === idx} color="var(--c-model)" onClick={() =>{  setPick({ runId, i }) }}>
                {t('Passo', 'Step')} {i + 1}
              </Chip>
            ))}
          </div>
        )}
      </header>

      {onlyUser && (
        <div className={styles.callout} role="note">
          <Info size={22} aria-hidden />
          <p>{t("Al livello 0 il modello riceve solo la tua domanda: nient'altro.", 'At level 0 the model receives only your question: nothing else.')}</p>
        </div>
      )}

      <div className={styles.barBlock}>
        <div className={styles.barTop}>
          <span className={styles.big}>≈ {used.toLocaleString(locale)} {tokenWord}</span>
          <span className={styles.muted}>{t('su', 'of')} {snap.budget.maxTokens.toLocaleString(locale)} {t('disponibili', 'available')}</span>
        </div>
        <div className={styles.bar} role="img" aria-label={t(`Circa ${used} token su ${snap.budget.maxTokens}`, `About ${used} tokens of ${snap.budget.maxTokens}`)}>
          {byKind.map((g) => {
            const t = tokensOf(g.inc)
            if (!t) return null
            return (
              <motion.div
                key={g.kind}
                className={styles.seg}
                style={{ background: KIND_COLOR[g.kind] }}
                initial={reduce ? false : { width: 0 }}
                animate={{ width: `${(t / totalForBar) * 100}%` }}
                transition={{ duration: reduce ? 0 : 0.5, ease: [0.22, 1, 0.36, 1] }}
                title={`${CONTEXT_KIND_LABEL[g.kind]}: ${t} ${tokenWord}`}
              />
            )
          })}
        </div>
        <ul className={styles.legend}>
          {byKind
            .filter(g => g.inc.length)
            .map(g => (
              <li key={g.kind}>
                <i style={{ background: KIND_COLOR[g.kind] }} aria-hidden />
                {CONTEXT_KIND_LABEL[g.kind]} <b>{tokensOf(g.inc)}</b>
              </li>
            ))}
        </ul>
      </div>

      <div className={styles.groups}>
        {byKind.map(g => (
          <div key={g.kind} className={styles.group}>
            <h3 className={styles.groupTitle} style={{ color: KIND_COLOR[g.kind] }}>
              {CONTEXT_KIND_LABEL[g.kind].toUpperCase()}
            </h3>
            {[...g.inc, ...g.exc].map(it => (
              <ItemCard key={it.id} item={it} color={KIND_COLOR[it.kind]} />
            ))}
          </div>
        ))}
      </div>

      <button type="button" className={styles.toggle} aria-expanded={showPrompt} onClick={() =>{  setShowPrompt(v => !v) }}>
        <ScrollText size={20} aria-hidden />
        <span>{t('Il prompt esatto inviato al modello', 'The exact prompt sent to the model')}</span>
        <ChevronDown size={20} className={showPrompt ? styles.rot : ''} aria-hidden />
      </button>
      <AnimatePresence initial={false}>
        {showPrompt && (
          <motion.div
            key="prompt"
            className={styles.prompt}
            initial={reduce ? false : { height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.25 }}
          >
            <div className={styles.promptInner}>
              {snap.messages.map((m, i) => (
                <div key={i} className={`${styles.msg} ${styles['role_' + m.role]}`}>
                  <span className={styles.role}>{ROLE_LABEL[m.role] ?? m.role}</span>
                  <pre>{m.content}</pre>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}

function ItemCard({ item, color }: { item: ContextItem; color: string }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const out = item.status === 'excluded'
  return (
    <article className={`${styles.card} ${out ? styles.out : ''}`} style={{ borderLeftColor: color }}>
      <button type="button" className={styles.cardHead} aria-expanded={open} onClick={() =>{  setOpen(v => !v) }}>
        <span className={styles.cardMain}>
          <span className={styles.cardTitle}>{item.title}</span>
          <span className={styles.cardMeta}>
            {item.source} · {item.tokens} {t('token', 'tokens')}
            {out && item.exclusionReason ? <b className={styles.reason}> · {EXCLUSION_LABEL[item.exclusionReason]}</b> : null}
          </span>
        </span>
        <ProvenanceBadge tag={item.provenance} compact />
        <ChevronDown size={18} className={open ? styles.rot : ''} aria-hidden />
      </button>
      {open && <pre className={styles.cardText}>{item.text}</pre>}
    </article>
  )
}
