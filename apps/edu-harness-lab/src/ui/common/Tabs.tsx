import { useId } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { motion } from 'motion/react'
import styles from './Tabs.module.css'

export interface TabDef<T extends string> {
  id: T
  label: string
  icon?: ReactNode
}

export function tabId(base: string, id: string) {
  return `${base}-tab-${id}`
}

type TabsProps<T extends string> = {
  tabs: TabDef<T>[]
  value: T
  onChange: (v: T) => void
  ariaLabel: string
  idBase: string
}

export function Tabs<T extends string>({ tabs, value, onChange, ariaLabel, idBase }: TabsProps<T>) {
  const uid = useId()
  const onKey = (e: KeyboardEvent) => {
    const i = tabs.findIndex(t => t.id === value)
    let n = i
    if (e.key === 'ArrowRight') n = (i + 1) % tabs.length
    else if (e.key === 'ArrowLeft') n = (i - 1 + tabs.length) % tabs.length
    else if (e.key === 'Home') n = 0
    else if (e.key === 'End') n = tabs.length - 1
    else return
    e.preventDefault()
    const next = tabs[n]
    if (next) {
      onChange(next.id)
      requestAnimationFrame(() => document.getElementById(tabId(idBase, next.id))?.focus())
    }
  }
  return (
    <div role="tablist" aria-label={ariaLabel} className={styles.list} onKeyDown={onKey}>
      {tabs.map((t) => {
        const sel = t.id === value
        return (
          <button
            key={t.id}
            id={tabId(idBase, t.id)}
            role="tab"
            type="button"
            aria-selected={sel}
            aria-controls={`${idBase}-panel`}
            tabIndex={sel ? 0 : -1}
            className={`${styles.tab} ${sel ? styles.sel : ''}`}
            onClick={() => onChange(t.id)}
          >
            {sel && <motion.span layoutId={`tabpill-${uid}`} className={styles.pill} transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
            <span className={styles.inner}>
              {t.icon}
              {t.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}
