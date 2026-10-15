import { useEffect, useRef } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'motion/react'
import { X } from 'lucide-react'
import { IconButton } from './Button'
import styles from './Dialog.module.css'

const FOCUSABLE = 'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])'

/**
 * Modal dialog with focus trap, aria-modal and Esc to close (when `onClose` is given).
 * Mark the preferred initial control with `data-autofocus`.
 */
export function Dialog({
  label,
  onClose,
  children,
  width = 760,
  tone,
}: {
  label: string
  onClose?: () => void
  children: ReactNode
  width?: number
  /** CSS colour used for the glow, e.g. var(--c-governance). */
  tone?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const previous = document.activeElement as HTMLElement | null
    const items = () =>
      Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(n => n.offsetParent !== null || n === document.activeElement)
    const raf = requestAnimationFrame(() => {
      const target = el.querySelector<HTMLElement>('[data-autofocus]') ?? items()[0] ?? el
      target.focus()
    })
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && closeRef.current) {
        e.stopPropagation()
        closeRef.current()
        return
      }
      if (e.key !== 'Tab') return
      const list = items()
      const first = list[0]
      const last = list.at(-1)
      if (!first || !last) {
        e.preventDefault()
        return
      }
      const active = document.activeElement
      if (e.shiftKey && (active === first || !el.contains(active))) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (active === last || !el.contains(active))) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('keydown', onKey)
      previous?.focus?.()
    }
  }, [])

  return createPortal(
    <motion.div
      className={styles.overlay}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <motion.div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={styles.card}
        style={{ '--w': `${width}px`, ...(tone ? { '--tone': tone } : {}) } as CSSProperties}
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
      >
        {onClose && <IconButton className={styles.close} label="Chiudi" icon={<X size={20} />} onClick={onClose} />}
        <div className={styles.body}>{children}</div>
      </motion.div>
    </motion.div>,
    document.body,
  )
}
