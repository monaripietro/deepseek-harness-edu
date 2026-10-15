import { AlertTriangle, Cloud, Cpu, Download, Loader2, MonitorSmartphone } from 'lucide-react'
import { useLab } from '../../state/store'
import { ProvenanceBadge } from '../common/ProvenanceBadge'
import styles from './ModelStatusChip.module.css'

/**
 * Opens model setup and shows whether the real model is ready, loading, or needs attention.
 *
 * @param props.onOpen - Opens model setup.
 * @returns The model status button.
 */
export function ModelStatusChip({ onOpen }: { onOpen: () => void }) {
  const info = useLab(s => s.modelInfo)
  const progress = useLab(s => s.loadProgress)
  const busy = progress.phase === 'checking' || progress.phase === 'downloading' || progress.phase === 'initializing'
  const failed = progress.phase === 'error'
  const loaded = info.provenance.provenance === 'real'
  const pct = progress.totalBytes > 0 ? Math.min(100, Math.round((progress.loadedBytes / progress.totalBytes) * 100)) : 0
  const label = busy
    ? progress.phase === 'checking'
      ? 'Verifica…'
      : progress.phase === 'downloading'
        ? progress.source === 'cache'
          ? `Dal browser ${pct > 0 ? `${pct}%` : '…'}`
          : `Download ${pct > 0 ? `${pct}%` : '…'}`
        : 'Avvio…'
    : failed
      ? 'Errore · riprova'
      : loaded
        ? info.label
        : 'Avvia modello'
  const Icon = busy ? Loader2 : failed ? AlertTriangle : loaded ? (info.backend === 'webgpu' ? MonitorSmartphone : info.backend === 'remote' ? Cloud : Cpu) : Download
  const ariaLabel = busy
    ? `Caricamento del modello: ${label}. Apri per vedere lo stato.`
    : failed
      ? 'Caricamento non riuscito. Apri per riprovare.'
      : loaded
        ? `Modello pronto: ${info.label}. Apri per scegliere un altro modello.`
        : 'Nessun modello avviato. Apri per scegliere e avviare un modello.'

  return (
    <button
      type="button"
      className={`${styles.chip} ${!loaded && !busy && !failed ? styles.empty : ''} ${failed ? styles.error : ''}`}
      onClick={onOpen}
      title="Apri la scelta del modello"
      aria-label={ariaLabel}
    >
      <Icon size={16} className={busy ? styles.spin : undefined} aria-hidden />
      <span className={styles.label}>{label}</span>
      {loaded && !failed && <ProvenanceBadge tag={info.provenance} compact />}
    </button>
  )
}
