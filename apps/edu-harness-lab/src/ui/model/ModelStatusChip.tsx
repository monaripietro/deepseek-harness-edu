import { AlertTriangle, Cloud, Cpu, Download, Loader2, MonitorSmartphone } from 'lucide-react'
import { useLab } from '../../state/store'
import { ProvenanceBadge } from '../common/ProvenanceBadge'
import { useT } from '../../i18n'
import styles from './ModelStatusChip.module.css'

/**
 * Opens model setup and shows whether the real model is ready, loading, or needs attention.
 *
 * @param props.onOpen - Opens model setup.
 * @returns The model status button.
 */
export function ModelStatusChip({ onOpen }: { onOpen: () => void }) {
  const t = useT()
  const info = useLab(s => s.modelInfo)
  const progress = useLab(s => s.loadProgress)
  const busy = progress.phase === 'checking' || progress.phase === 'downloading' || progress.phase === 'initializing'
  const failed = progress.phase === 'error'
  const loaded = info.provenance.provenance === 'real'
  const pct = progress.totalBytes > 0 ? Math.min(100, Math.round((progress.loadedBytes / progress.totalBytes) * 100)) : 0
  const label = busy
    ? progress.phase === 'checking'
      ? t('Verifica…', 'Checking…')
      : progress.phase === 'downloading'
        ? progress.source === 'cache'
          ? t(`Dal browser ${pct > 0 ? `${pct}%` : '…'}`, `From browser ${pct > 0 ? `${pct}%` : '…'}`)
          : t(`Download ${pct > 0 ? `${pct}%` : '…'}`, `Download ${pct > 0 ? `${pct}%` : '…'}`)
        : t('Avvio…', 'Starting…')
    : failed
      ? t('Errore · riprova', 'Error · retry')
      : loaded
        ? info.label
        : t('Avvia modello', 'Start model')
  const Icon = busy ? Loader2 : failed ? AlertTriangle : loaded ? (info.backend === 'webgpu' ? MonitorSmartphone : info.backend === 'remote' ? Cloud : Cpu) : Download
  const ariaLabel = busy
    ? t(`Caricamento del modello: ${label}. Apri per vedere lo stato.`, `Model loading: ${label}. Open to see the status.`)
    : failed
      ? t('Caricamento non riuscito. Apri per riprovare.', 'Loading failed. Open to try again.')
      : loaded
        ? t(`Modello pronto: ${info.label}. Apri per scegliere un altro modello.`, `Model ready: ${info.label}. Open to choose another model.`)
        : t('Nessun modello avviato. Apri per scegliere e avviare un modello.', 'No model started. Open to choose and start a model.')

  return (
    <button
      type="button"
      className={`${styles.chip} ${!loaded && !busy && !failed ? styles.empty : ''} ${failed ? styles.error : ''}`}
      onClick={onOpen}
      title={t('Apri la scelta del modello', 'Open model choice')}
      aria-label={ariaLabel}
    >
      <Icon size={16} className={busy ? styles.spin : undefined} aria-hidden />
      <span className={styles.label}>{label}</span>
      {loaded && !failed && <ProvenanceBadge tag={info.provenance} compact />}
    </button>
  )
}
