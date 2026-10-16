import { Brain } from 'lucide-react'
import type { ThinkingEffort } from '../../domain/types'
import { useLab } from '../../state/store'
import { Segmented } from '../common/Segmented'
import styles from './ModelSetup.module.css'

/** Reasoning effort for models that can think before answering. The reasoning itself is never shown. */
export function ThinkingControl({ note }: { note?: string }) {
  const thinking = useLab(s => s.thinking)
  const setThinking = useLab(s => s.setThinking)
  return (
    <section className={styles.thinking} aria-label="Ragionamento del modello">
      <div className={styles.thinkingHead}>
        <Brain size={16} aria-hidden />
        <strong>Ragionamento</strong>
        <span>il modello pensa prima di rispondere; i suoi pensieri non vengono mostrati</span>
      </div>
      <Segmented<ThinkingEffort>
        ariaLabel="Livello di ragionamento"
        value={thinking}
        onChange={setThinking}
        options={[
          { value: 'off', label: 'Spento' },
          { value: 'low', label: 'Basso' },
          { value: 'medium', label: 'Medio' },
          { value: 'high', label: 'Alto' },
        ]}
      />
      {note && <p className={styles.small}>{note}</p>}
    </section>
  )
}
