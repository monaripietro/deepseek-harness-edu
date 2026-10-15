import { useMemo, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ChevronDown, Eye, Info, ScrollText } from 'lucide-react'
import type { ContextItem, ContextKind, ContextSnapshot } from '../../domain/types'
import { useLab } from '../../state/store'
import { CONTEXT_KIND_LABEL, EXCLUSION_LABEL } from '../common/labels'
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

const ROLE_LABEL: Record<string, string> = { system: 'SYSTEM', user: 'UTENTE', assistant: 'ASSISTENTE', tool: 'STRUMENTO' }

export function ContextInspector() {
  const events = useLab(s => s.events)
  const runId = useLab(s => s.currentRunId)
  const reduce = useReducedMotion()
  const [picked, setPicked] = useState<number | null>(null)
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
      <section className={styles.root} aria-label="Cosa riceve il modello">
        <h2 className={styles.title}>COSA RICEVE IL MODELLO</h2>
        <div className={styles.empty}>
          <Eye size={36} aria-hidden />
          <p>Invia una richiesta: qui vedrai, pezzo per pezzo, tutto ciò che l&apos;harness consegna al modello prima di ogni risposta.</p>
        </div>
      </section>
    )
  }

  const included = snap.items.filter(i => i.status === 'included')
  const excluded = snap.items.filter(i => i.status === 'excluded')
  const onlyUser = included.length > 0 && included.every(i => i.kind === 'message')
  const used = snap.budget.usedTokens
  const totalForBar = Math.max(snap.budget.maxTokens, used, 1)

  const tokensOf = (items: ContextItem[]) => items.reduce((a, i) => a + i.tokens, 0)
  const byKind = KIND_ORDER.map(k => ({
    kind: k,
    inc: included.filter(i => i.kind === k),
    exc: excluded.filter(i => i.kind === k),
  })).filter(g => g.inc.length + g.exc.length > 0)

  return (
    <section className={styles.root} aria-label="Cosa riceve il modello">
      <header className={styles.head}>
        <h2 className={styles.title}>COSA RICEVE IL MODELLO</h2>
        {snaps.length > 1 && (
          <div className={styles.steps} role="group" aria-label="Passo">
            {snaps.map((s, i) => (
              <Chip key={s.id} selected={i === idx} color="var(--c-model)" onClick={() => setPicked(i)}>
                Passo {i + 1}
              </Chip>
            ))}
          </div>
        )}
      </header>

      {onlyUser && (
        <div className={styles.callout} role="note">
          <Info size={22} aria-hidden />
          <p>Al livello 0 il modello riceve solo la tua domanda: nient&apos;altro.</p>
        </div>
      )}

      <div className={styles.barBlock}>
        <div className={styles.barTop}>
          <span className={styles.big}>≈ {used.toLocaleString('it-IT')} token</span>
          <span className={styles.muted}>su {snap.budget.maxTokens.toLocaleString('it-IT')} disponibili</span>
        </div>
        <div className={styles.bar} role="img" aria-label={`Circa ${used} token su ${snap.budget.maxTokens}`}>
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
                title={`${CONTEXT_KIND_LABEL[g.kind]}: ${t} token`}
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

      <button type="button" className={styles.toggle} aria-expanded={showPrompt} onClick={() => setShowPrompt(v => !v)}>
        <ScrollText size={20} aria-hidden />
        <span>Il prompt esatto inviato al modello</span>
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
  const [open, setOpen] = useState(false)
  const out = item.status === 'excluded'
  return (
    <article className={`${styles.card} ${out ? styles.out : ''}`} style={{ borderLeftColor: color }}>
      <button type="button" className={styles.cardHead} aria-expanded={open} onClick={() => setOpen(v => !v)}>
        <span className={styles.cardMain}>
          <span className={styles.cardTitle}>{item.title}</span>
          <span className={styles.cardMeta}>
            {item.source} · {item.tokens} token
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
