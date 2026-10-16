import { CircleCheck, CloudOff, Globe, HardDrive, Play, Sparkles } from 'lucide-react'
import type { ProvenanceTag } from '../../domain/types'
import { LOCALITY_HELP, LOCALITY_LABEL, PROVENANCE_HELP, PROVENANCE_LABEL } from './labels'
import styles from './ProvenanceBadge.module.css'

const ICON = {
  real: CircleCheck,
  simulated: Sparkles,
  prerecorded: Play,
  unavailable: CloudOff,
} as const

/**
 * The two-axis provenance badge (REALE/SIMULATO/PRECONFIGURATO/NON DISPONIBILE + LOCALE/ESTERNO).
 * Never colour-only: icon + text + border style differ per kind.
 */
export function ProvenanceBadge({ tag, compact = false }: { tag: ProvenanceTag; compact?: boolean }) {
  const Icon = ICON[tag.provenance]
  const LocIcon = tag.locality === 'local' ? HardDrive : Globe
  const title = [PROVENANCE_HELP[tag.provenance], LOCALITY_HELP[tag.locality], tag.note, tag.recordedAt ? `Registrato il ${tag.recordedAt}` : '']
    .filter(Boolean)
    .join(' ')
  return (
    <span className={styles.wrap} title={title} aria-label={`${PROVENANCE_LABEL[tag.provenance]}, ${LOCALITY_LABEL[tag.locality]}. ${title}`}>
      <span className={`${styles.badge} ${styles[tag.provenance]}`}>
        <Icon size={13} aria-hidden />
        {PROVENANCE_LABEL[tag.provenance]}
      </span>
      {!compact && (
        <span className={`${styles.badge} ${styles[tag.locality]}`}>
          <LocIcon size={13} aria-hidden />
          {LOCALITY_LABEL[tag.locality]}
        </span>
      )}
    </span>
  )
}
