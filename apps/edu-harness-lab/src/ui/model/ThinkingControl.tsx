import { Brain } from 'lucide-react'
import type { ThinkingEffort } from '../../domain/types'
import { useLab } from '../../state/store'
import { Segmented } from '../common/Segmented'
import { useT } from '../../i18n'
import styles from './ModelSetup.module.css'

/** Reasoning effort for models that can think before answering. The reasoning itself is never shown. */
export function ThinkingControl({ note }: { note?: string }) {
  const t = useT()
  const thinking = useLab(s => s.thinking)
  const setThinking = useLab(s => s.setThinking)
  return (
    <section className={styles.thinking} aria-label={t('Ragionamento del modello', 'Model reasoning')}>
      <div className={styles.thinkingHead}>
        <Brain size={16} aria-hidden />
        <strong>{t('Ragionamento', 'Reasoning')}</strong>
        <span>{t('il modello pensa prima di rispondere; i suoi pensieri non vengono mostrati', 'the model thinks before answering; its thoughts are not shown')}</span>
      </div>
      <Segmented<ThinkingEffort>
        ariaLabel={t('Livello di ragionamento', 'Reasoning level')}
        value={thinking}
        onChange={setThinking}
        options={[
          { value: 'off', label: t('Spento', 'Off') },
          { value: 'low', label: t('Basso', 'Low') },
          { value: 'medium', label: t('Medio', 'Medium') },
          { value: 'high', label: t('Alto', 'High') },
        ]}
      />
      {note && <p className={styles.small}>{note}</p>}
    </section>
  )
}
