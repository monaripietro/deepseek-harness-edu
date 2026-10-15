import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react'
import styles from './Button.module.css'

type Variant = 'secondary' | 'primary' | 'ghost' | 'danger' | 'success'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: 'sm' | 'md' | 'lg'
  icon?: ReactNode
  active?: boolean
  /** Hide the text on narrower viewports, keeping it for assistive technology. */
  collapseLabel?: boolean
  ref?: Ref<HTMLButtonElement>
}

export function Button({ variant = 'secondary', size = 'md', icon, active, collapseLabel, className, children, type = 'button', ...rest }: ButtonProps) {
  const cls = [styles.btn, variant !== 'secondary' && styles[variant], size !== 'md' && styles[size], active && styles.active, collapseLabel && styles.hideLabel, className]
    .filter(Boolean)
    .join(' ')
  const text = typeof children === 'string' ? children : undefined
  return (
    <button type={type} className={cls} aria-label={collapseLabel ? text : undefined} title={collapseLabel ? text : undefined} {...rest}>
      {icon}
      {children != null && <span className={styles.label}>{children}</span>}
    </button>
  )
}

export function IconButton({
  label,
  icon,
  active,
  size = 'md',
  variant = 'ghost',
  className,
  ...rest
}: Omit<ButtonProps, 'children'> & { label: string }) {
  const cls = [styles.btn, styles.icon, variant !== 'secondary' && styles[variant], size !== 'md' && styles[size], active && styles.active, className].filter(Boolean).join(' ')
  return (
    <button type="button" className={cls} aria-label={label} title={label} {...rest}>
      {icon}
    </button>
  )
}
