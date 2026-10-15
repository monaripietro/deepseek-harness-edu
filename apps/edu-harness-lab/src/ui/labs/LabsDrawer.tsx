import { useEffect, useRef } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { BookOpen, Brain, Plug, Wrench, X } from 'lucide-react'
import { useLab } from '../../state/store'
import type { LabId } from '../../state/store'
import { ToolLab } from './ToolLab'
import { RagLab } from './RagLab'
import { McpLab } from './McpLab'
import { MemoryLab } from './MemoryLab'
import styles from './LabsDrawer.module.css'

const TABS: { id: LabId; label: string; icon: typeof Wrench }[] = [
  { id: 'tools', label: 'Strumenti', icon: Wrench },
  { id: 'rag', label: 'Documenti RAG', icon: BookOpen },
  { id: 'mcp', label: 'Server MCP', icon: Plug },
  { id: 'memory', label: 'Memoria', icon: Brain },
]

const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([type="hidden"]):not([disabled]), select:not([disabled]), summary, [contenteditable]:not([contenteditable="false"]), [tabindex]:not([tabindex^="-"])'

export function LabsDrawer() {
  const lab = useLab(s => s.lab)
  const openLab = useLab(s => s.openLab)
  const reduce = useReducedMotion()
  const isOpen = lab !== null
  const panelRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!isOpen) return
    const previous = document.activeElement as HTMLElement | null
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      const panel = panelRef.current
      if (!panel) return
      const nested = panel.querySelector<HTMLElement>('[data-nested-dialog][aria-modal="true"]')
      if (e.key === 'Escape') {
        if (nested?.contains(document.activeElement)) return
        e.stopPropagation()
        openLab(null)
        return
      }
      if (e.key !== 'Tab') return
      const scope = nested ?? panel
      const f = Array.from(scope.querySelectorAll<HTMLElement>(FOCUSABLE))
        .filter((element) => {
          if (element.closest('[hidden], [inert], [aria-hidden="true"]')) return false
          const closedDetails = element.closest('details:not([open])')
          return !closedDetails || element.closest('summary') !== null
        })
      const first = f[0]
      const last = f[f.length - 1]
      if (!first || !last) return
      if (e.shiftKey && (document.activeElement === first || !scope.contains(document.activeElement))) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (document.activeElement === last || !scope.contains(document.activeElement))) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      previous?.focus?.()
    }
  }, [isOpen, openLab])

  useEffect(() => {
    if (lab && bodyRef.current) bodyRef.current.scrollTop = 0
  }, [lab])

  const onTabKey = (e: React.KeyboardEvent, i: number) => {
    let nextIndex: number
    if (e.key === 'ArrowRight') nextIndex = (i + 1) % TABS.length
    else if (e.key === 'ArrowLeft') nextIndex = (i + TABS.length - 1) % TABS.length
    else if (e.key === 'Home') nextIndex = 0
    else if (e.key === 'End') nextIndex = TABS.length - 1
    else return
    e.preventDefault()
    e.stopPropagation()
    const next = TABS[nextIndex]
    if (!next) return
    openLab(next.id)
    document.getElementById(`labtab-${next.id}`)?.focus()
  }

  return (
    <AnimatePresence>
      {lab && (
        <div className={styles.root}>
          <motion.div className={styles.scrim} aria-hidden="true" onClick={() => openLab(null)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
          <motion.div
            ref={panelRef}
            className={styles.drawer}
            role="dialog"
            aria-modal="true"
            aria-labelledby="labs-title"
            initial={reduce ? { opacity: 0 } : { x: '100%' }}
            animate={reduce ? { opacity: 1 } : { x: 0 }}
            exit={reduce ? { opacity: 0 } : { x: '100%' }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          >
            <header className={styles.head}>
              <div className={styles.headTop}>
                <div className={styles.heading}>
                  <h2 id="labs-title" className={styles.title}>Harness Lab</h2>
                  <p className={styles.subtitle}>Esplora e configura i componenti dell’agente.</p>
                </div>
                <button ref={closeRef} type="button" className={styles.close} onClick={() => openLab(null)} aria-label="Chiudi Harness Lab">
                  <X size={22} aria-hidden />
                </button>
              </div>
              <div role="tablist" aria-label="Sezioni del laboratorio" aria-orientation="horizontal" className={styles.tabs}>
                {TABS.map((t, i) => {
                  const Icon = t.icon
                  const active = lab === t.id
                  return (
                    <button
                      key={t.id}
                      id={`labtab-${t.id}`}
                      role="tab"
                      aria-selected={active}
                      aria-controls="labpanel"
                      tabIndex={active ? 0 : -1}
                      className={`${styles.tab} ${active ? styles.tabActive : ''}`}
                      onClick={() => openLab(t.id)}
                      onKeyDown={e => onTabKey(e, i)}
                    >
                      <Icon size={18} aria-hidden />
                      {t.label}
                      {active && <motion.span layoutId="labtab-ink" className={styles.ink} />}
                    </button>
                  )
                })}
              </div>
            </header>
            <div ref={bodyRef} id="labpanel" role="tabpanel" aria-labelledby={`labtab-${lab}`} tabIndex={0} className={styles.body}>
              {lab === 'tools' && <ToolLab />}
              {lab === 'rag' && <RagLab />}
              {lab === 'mcp' && <McpLab />}
              {lab === 'memory' && <MemoryLab />}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
