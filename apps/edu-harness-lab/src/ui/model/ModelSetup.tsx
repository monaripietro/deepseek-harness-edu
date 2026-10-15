import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { AlertTriangle, ArrowRight, Check, ChevronDown, Cloud, Download, ExternalLink, HardDrive, Loader2, ShieldCheck, Trash2 } from 'lucide-react'
import { useLab } from '../../state/store'
import { PROFILE_LIST, PROFILES, resolveVariant } from '../../runtime/model/profiles'
import type { RealProfileId } from '../../runtime/model/profiles'
import { Dialog } from '../common/Dialog'
import { Segmented } from '../common/Segmented'
import { OpenRouterPanel } from './OpenRouterPanel'
import { ThinkingControl } from './ThinkingControl'
import { formatBytes } from '../common/labels'
import styles from './ModelSetup.module.css'

const formatModelBytes = (bytes: number) =>
  bytes >= 1_000_000_000
    ? `${(bytes / 1_000_000_000).toLocaleString('it-IT', { maximumFractionDigits: 2 })} GB`
    : `${(bytes / 1_000_000).toLocaleString('it-IT', { maximumFractionDigits: 0 })} MB`

/**
 * Model choice: a small model in the browser (downloaded once, then cached) or a bigger model on
 * OpenRouter with the user's key. Closing the dialog does not cancel an in-progress load.
 *
 * @param props.onClose - Closes the setup dialog.
 * @returns The model setup dialog.
 */
export function ModelSetup({ onClose }: { onClose: () => void }) {
  const info = useLab(s => s.modelInfo)
  const [tab, setTab] = useState<'local' | 'remote'>(info.profile === 'openrouter' && info.provenance.provenance === 'real' ? 'remote' : 'local')
  return (
    <Dialog label="Scegli il modello" onClose={onClose} width={720}>
      <div className={styles.tabsBar}>
        <Segmented<'local' | 'remote'>
          ariaLabel="Dove gira il modello"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'local', label: 'Nel browser', icon: <HardDrive size={15} /> },
            { value: 'remote', label: 'OpenRouter (cloud)', icon: <Cloud size={15} /> },
          ]}
        />
      </div>
      {tab === 'local' ? <LocalModelPane onClose={onClose} /> : <OpenRouterPanel onClose={onClose} />}
    </Dialog>
  )
}

/** Local models: downloaded once from Hugging Face, then started from the browser cache. */
function LocalModelPane({ onClose }: { onClose: () => void }) {
  const caps = useLab(s => s.capabilities)
  const progress = useLab(s => s.loadProgress)
  const info = useLab(s => s.modelInfo)
  const loadModel = useLab(s => s.loadModel)
  const cachedModels = useLab(s => s.cachedModels)
  const [selected, setSelected] = useState<RealProfileId | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    void useLab.getState().detect()
    void useLab.getState().refreshModelCache()
  }, [])

  const webgpu = !!caps?.webgpu
  const f16 = !!caps?.shaderF16
  const recommended: RealProfileId = caps?.recommended && caps.recommended in PROFILES ? (caps.recommended as RealProfileId) : 'qwen3-0.6b'
  const busy = progress.phase === 'checking' || progress.phase === 'downloading' || progress.phase === 'initializing'
  const anyReady = progress.phase === 'ready' && info.provenance.provenance === 'real'
  const current = anyReady && info.profile in PROFILES ? (info.profile as RealProfileId) : null
  /** A local model is running (a cloud model in use does not count here: this pane must offer to switch). */
  const ready = current !== null
  const cloudActive = anyReady && info.profile === 'openrouter'
  // With a model already running the dialog opens on it, ready to switch to another one.
  const choice = selected ?? current ?? recommended
  const switching = cloudActive || (current !== null && choice !== current)
  const profile = PROFILE_LIST.find(p => p.id === choice) ?? PROFILES[choice]
  const variant = resolveVariant(profile, webgpu, f16)
  const pct = progress.totalBytes > 0 ? Math.min(100, Math.round((progress.loadedBytes / progress.totalBytes) * 100)) : 0
  const estimatedBytes = variant?.sizeBytes ?? profile.cpu?.sizeBytes ?? profile.gpu?.sizeBytes ?? 0
  const downloadSize = formatModelBytes(estimatedBytes)
  const cachedSize = cachedModels[choice]
  const isCached = cachedSize !== undefined
  const fromCache = progress.source === 'cache'
  const deviceRequirement = !caps
    ? 'Compatibilità in verifica'
    : variant?.device === 'webgpu'
      ? 'GPU · WebGPU'
      : variant?.device === 'wasm'
        ? 'CPU · funziona senza WebGPU'
        : 'Richiede WebGPU · Chrome o Edge su desktop'
  const limitation =
    profile.id === 'lfm-350m'
      ? 'È molto piccolo: può sbagliare più spesso; verifica la qualità dell’italiano.'
      : profile.id === 'qwen3-0.6b' && variant?.device === 'wasm'
        ? 'Sulla CPU può essere lento: ogni risposta può richiedere decine di secondi.'
        : profile.id === 'lfm-1.2b'
          ? 'Velocità e stabilità sulle GPU integrate non sono garantite.'
          : profile.id === 'gemma4-e2b'
            ? 'È grande (circa 3 GB): serve una scheda grafica con memoria sufficiente; il primo download richiede tempo.'
            : 'Le risposte possono contenere errori; verifica i risultati.'

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <p className={styles.kicker}>Modello locale</p>
        <h2 className={styles.title}>Scegli il modello</h2>
        <p className={styles.lead}>
          {isCached
            ? 'Questo modello è già sul tuo computer: si avvia senza scaricare nulla.'
            : 'L’avvio è manuale: scegli un’opzione compatibile e poi conferma il download. Dopo il primo download resta salvato nel browser.'}
        </p>
      </header>

      <ul className={styles.essentials} aria-label="Download, privacy e limiti">
        <li>
          {isCached ? <HardDrive size={16} aria-hidden /> : <Download size={16} aria-hidden />}
          <span>
            {isCached ? (
              <>
                <strong>Già scaricato:</strong> {formatModelBytes(cachedSize || estimatedBytes)} salvati nel browser; nessun download
                all’avvio. Alla prossima visita si riavvia da solo.
              </>
            ) : (
              <>
                <strong>Download da Hugging Face:</strong> circa {downloadSize}, una volta sola: poi resta salvato nel browser. Parte solo
                quando premi «Scarica e avvia».
              </>
            )}
          </span>
        </li>
        <li>
          <ShieldCheck size={16} aria-hidden />
          <span>
            <strong>Uso locale:</strong> il modello elabora le richieste nel browser; il testo non viene inviato al fornitore del modello.
          </span>
        </li>
        <li>
          <AlertTriangle size={16} aria-hidden />
          <span>
            <strong>Limite:</strong> {limitation}
          </span>
        </li>
      </ul>

      {busy ? null : ready && (
        <section className={styles.done} role="status" aria-live="polite">
          <span className={styles.doneIcon} aria-hidden>
            <Check size={18} />
          </span>
          <div className={styles.doneText}>
            <span className={styles.stateLabel}>Modello pronto</span>
            <strong>{info.label}</strong>
            <span>Le richieste al modello vengono elaborate nel browser.</span>
          </div>
          <button type="button" className={styles.primary} onClick={onClose}>
            Vai al motore <ArrowRight size={17} aria-hidden />
          </button>
        </section>
      )}
      {busy ? (
        <section className={styles.progress} role="status" aria-live="polite">
          <div className={styles.progressHead}>
            <div className={styles.progressTitle}>
              <Loader2 size={18} className={styles.spin} aria-hidden />
              <div>
                <strong>
                  {progress.phase === 'checking'
                    ? 'Verifica del dispositivo'
                    : progress.phase === 'downloading'
                      ? fromCache
                        ? `Caricamento di ${profile.label} dal browser`
                        : `Download di ${profile.label}`
                      : `Avvio di ${profile.label}`}
                </strong>
                <span>
                  {progress.phase === 'checking'
                    ? 'Controllo compatibilità e cache del browser.'
                    : progress.phase === 'downloading'
                      ? fromCache
                        ? 'I file sono già sul computer: nessun download.'
                        : 'Trasferimento dei pesi da Hugging Face. Resteranno salvati nel browser.'
                      : 'Preparazione del modello nel browser.'}
                </span>
              </div>
            </div>
            {progress.phase === 'downloading' && progress.totalBytes > 0 && <span className={styles.pct}>{pct}%</span>}
          </div>
          <div
            className={styles.bar}
            role="progressbar"
            aria-label="Caricamento del modello"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress.phase === 'downloading' && progress.totalBytes > 0 ? pct : undefined}
            aria-valuetext={progress.phase === 'downloading' && progress.totalBytes > 0 ? `${pct}% del download` : 'Operazione in corso'}
          >
            <motion.span
              animate={progress.phase === 'downloading' ? { scaleX: Math.max(0.02, pct / 100) } : { scaleX: [0.15, 0.85, 0.15] }}
              transition={progress.phase === 'downloading' ? { duration: 0.3 } : { duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
            />
          </div>
          <p className={styles.small}>
            {progress.phase === 'downloading' && progress.totalBytes > 0
              ? `${formatModelBytes(progress.loadedBytes)} di ${formatModelBytes(progress.totalBytes)}. Puoi chiudere questa finestra: ${fromCache ? 'il caricamento' : 'il download'} continua.`
              : 'Puoi chiudere questa finestra: il caricamento continua.'}
          </p>
        </section>
      ) : (
        <>
          {progress.phase === 'error' && (
            <section className={styles.error} role="alert">
              <AlertTriangle size={18} aria-hidden />
              <div className={styles.errorText}>
                <strong>Avvio non riuscito</strong>
                <p>Controlla la connessione, lo spazio disponibile e la compatibilità, poi riprova.</p>
                {progress.message && (
                  <details className={styles.errorDetails}>
                    <summary>Dettagli dell’errore</summary>
                    <p>{progress.message}</p>
                  </details>
                )}
              </div>
            </section>
          )}

          {(!ready || switching) && (
            <section className={styles.pick} aria-label={switching ? 'Nuovo modello' : choice === recommended ? 'Modello consigliato' : 'Modello selezionato'}>
              <div className={styles.pickText}>
                <span className={styles.pickLabel}>
                  {switching ? 'Cambia modello' : choice === recommended ? 'Consigliato per questo dispositivo' : 'Modello selezionato'}
                </span>
                <h3 className={styles.pickName}>{profile.label}</h3>
                <p className={styles.tagline}>{profile.tagline}</p>
                <p className={styles.pickMeta}>
                  {isCached ? (
                    <span className={styles.cachedTag}>
                      <HardDrive size={13} aria-hidden /> Già scaricato · {formatModelBytes(cachedSize || estimatedBytes)}
                    </span>
                  ) : (
                    downloadSize
                  )}{' '}
                  · {deviceRequirement}
                </p>
                {isCached && (
                  <button
                    type="button"
                    className={`${styles.deleteLink} ${confirmDelete ? styles.deleteConfirm : ''}`}
                    onClick={() => {
                      if (!confirmDelete) {
                        setConfirmDelete(true)
                        return
                      }
                      setConfirmDelete(false)
                      void useLab.getState().deleteCachedModel(choice)
                    }}
                    onBlur={() =>{  setConfirmDelete(false) }}
                  >
                    <Trash2 size={13} aria-hidden /> {confirmDelete ? 'Conferma: elimina i file dal browser' : 'Elimina dal browser'}
                  </button>
                )}
              </div>
              <button type="button" className={styles.primary} disabled={!variant} onClick={() => void loadModel(choice)}>
                {progress.phase === 'error'
                  ? 'Riprova l’avvio'
                  : !variant
                    ? 'WebGPU richiesto'
                    : switching
                      ? isCached
                        ? `Passa a ${profile.label}`
                        : `Scarica e passa a ${profile.label}`
                      : isCached
                        ? 'Avvia'
                        : 'Scarica e avvia'}
                <ArrowRight size={17} aria-hidden />
              </button>
            </section>
          )}

          {profile.thinking && <ThinkingControl note="Qwen3 e Gemma 4 possono ragionare prima di rispondere: più ragionamento è più lento, soprattutto sulla CPU." />}

          <details className={styles.disclosure} open={ready || undefined}>
            <summary className={styles.summary}>
              {ready ? 'Cambia modello' : 'Altri modelli'}
              <ChevronDown size={17} aria-hidden />
            </summary>
            <ul className={styles.list} role="radiogroup" aria-label="Scegli un modello">
              {PROFILE_LIST.map((p) => {
                const option = resolveVariant(p, webgpu, f16)
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={choice === p.id}
                      className={`${styles.row} ${choice === p.id ? styles.rowOn : ''}`}
                      disabled={!option}
                      onClick={() =>{  setSelected(p.id) }}
                    >
                      <span className={styles.radio} aria-hidden />
                      <span className={styles.rowBody}>
                        <span className={styles.rowTitle}>
                          {p.label}
                          {p.id === current && <span className={styles.recommended}>In uso</span>}
                          {p.id === recommended && p.id !== current && <span className={styles.recommended}>Consigliato</span>}
                          {cachedModels[p.id] !== undefined && <span className={styles.cachedBadge}>Scaricato</span>}
                        </span>
                        <span className={styles.rowMeta}>
                          {option
                            ? `${cachedModels[p.id] !== undefined ? 'sul computer' : formatModelBytes(option.sizeBytes)} · ${option.device === 'webgpu' ? 'GPU (WebGPU)' : 'CPU (WASM)'}`
                            : 'Richiede WebGPU · Chrome o Edge su desktop'}
                        </span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </details>

          <details className={styles.disclosure}>
            <summary className={styles.summary}>
              Dettagli tecnici
              <ChevronDown size={17} aria-hidden />
            </summary>
            <div className={styles.detailsContent}>
              <dl className={styles.specs}>
                <div>
                  <dt>Parametri</dt>
                  <dd>{profile.params}</dd>
                </div>
                <div>
                  <dt>Memoria durante l’uso</dt>
                  <dd>{profile.memoryEstimate}</dd>
                </div>
                <div>
                  <dt>Quantizzazione</dt>
                  <dd>{variant?.dtype ?? 'Nessuna variante compatibile'}</dd>
                </div>
                <div>
                  <dt>Lingue</dt>
                  <dd>{profile.languages}</dd>
                </div>
                <div>
                  <dt>Licenza</dt>
                  <dd>
                    <a href={profile.licenseUrl} target="_blank" rel="noreferrer">
                      {profile.license} <ExternalLink size={13} aria-hidden />
                    </a>
                  </dd>
                </div>
                <div>
                  <dt>Modello</dt>
                  <dd>
                    <a href={`https://huggingface.co/${profile.repo}`} target="_blank" rel="noreferrer">
                      {profile.repo} <ExternalLink size={13} aria-hidden />
                    </a>
                  </dd>
                </div>
                {caps && (
                  <>
                    <div>
                      <dt>Browser</dt>
                      <dd>{caps.browser}</dd>
                    </div>
                    <div>
                      <dt>WebGPU</dt>
                      <dd>{caps.webgpu ? caps.adapterInfo?.vendor ?? 'Disponibile' : 'Non disponibile'}</dd>
                    </div>
                    {caps.storageQuotaBytes !== undefined && caps.storageUsageBytes !== undefined && (
                      <div>
                        <dt>Spazio libero nel browser</dt>
                        <dd>{formatBytes(Math.max(0, caps.storageQuotaBytes - caps.storageUsageBytes))}</dd>
                      </div>
                    )}
                    {caps.deviceMemoryGb !== undefined && (
                      <div>
                        <dt>Memoria dispositivo</dt>
                        <dd>{caps.deviceMemoryGb} GB</dd>
                      </div>
                    )}
                  </>
                )}
              </dl>
              <ul className={styles.notes}>
                {profile.notes.map(note => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </div>
          </details>
        </>
      )}
    </div>
  )
}
