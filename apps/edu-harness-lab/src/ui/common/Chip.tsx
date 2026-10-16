import type { CSSProperties, ReactNode } from 'react'
import styles from './Chip.module.css'

export function Chip({
  children,
  color,
  icon,
  onClick,
  selected,
  title,
}: {
  children: ReactNode
  /** Any CSS colour, typically a token like var(--c-governance). */
  color?: string
  icon?: ReactNode
  onClick?: () => void
  selected?: boolean
  title?: string
}) {
  const style = color ? ({ '--chip-c': color } as CSSProperties) : undefined
  const cls = `${styles.chip} ${selected ? styles.on : ''}`
  if (onClick) {
    return (
      <button type="button" className={cls} style={style} onClick={onClick} aria-pressed={selected} title={title}>
        {icon}
        {children}
      </button>
    )
  }
  return (
    <span className={cls} style={style} title={title}>
      {icon}
      {children}
    </span>
  )
}
