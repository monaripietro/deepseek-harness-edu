import type { CSSProperties } from 'react'
import styles from './Switch.module.css'

type SwitchProps = {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  disabled?: boolean
  color?: string
}

export function Switch({ checked, onChange, label, disabled, color }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={label}
      disabled={disabled}
      className={styles.switch}
      style={color ? ({ '--sw': color } as CSSProperties) : undefined}
      onClick={() => onChange(!checked)}
    >
      <span className={styles.knob} />
    </button>
  )
}
