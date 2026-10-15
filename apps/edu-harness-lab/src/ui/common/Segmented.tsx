import { useId } from 'react'
import type { ReactNode } from 'react'
import { motion } from 'motion/react'
import styles from './Segmented.module.css'

export interface SegOption<T extends string | number> {
  value: T
  label: string
  icon?: ReactNode
}

export function Segmented<T extends string | number>({
  value,
  onChange,
  options,
  ariaLabel,
  collapse,
}: {
  value: T
  onChange: (v: T) => void
  options: SegOption<T>[]
  ariaLabel: string
  /** Hide option text on narrower viewports (icon + aria-label remain). */
  collapse?: boolean
}) {
  const id = useId()
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={`${styles.group} ${collapse ? styles.collapse : ''}`}>
      {options.map((o) => {
        const on = o.value === value
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={o.label}
            title={o.label}
            className={`${styles.opt} ${on ? styles.on : ''}`}
            onClick={() => onChange(o.value)}
          >
            {on && <motion.span layoutId={`pill-${id}`} className={styles.pill} transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
            <span className={styles.inner}>
              {o.icon}
              <span className={styles.text}>{o.label}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}
