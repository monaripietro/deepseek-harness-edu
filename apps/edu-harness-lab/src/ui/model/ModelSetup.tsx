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
import { uiLang, useT } from '../../i18n'
import styles from './ModelSetup.module.css'

const formatModelBytes = (bytes: number) =>
  bytes >= 1_000_000_000
    ? `${(bytes / 1_000_000_000).toLocaleString(uiLang() === 'en' ? 'en-US' : 'it-IT', { maximumFractionDigits: 2 })} GB`
    : `${(bytes / 1_000_000).toLocaleString(uiLang() === 'en' ? 'en-US' : 'it-IT', { maximumFractionDigits: 0 })} MB`

/**
 * Model choice: a small model in the browser (downloaded once, then cached) or a bigger model on
 * OpenRouter with the user's key. The local model list stays available while a model loads; closing
 * the dialog does not cancel an in-progress load.
 *
 * @param props.onClose - Closes the setup dialog.
 * @returns The model setup dialog.
 */
export function ModelSetup({ onClose }: { onClose: () => void }) {
  const t = useT()
  const info = useLab(s => s.modelInfo)
  const [tab, setTab] = useState<'local' | 'remote'>(info.profile === 'openrouter' && info.provenance.provenance === 'real' ? 'remote' : 'local')
  return (
    <Dialog label={t('Scegli il modello', 'Choose the model')} onClose={onClose} width={720}>
      <div className={styles.tabsBar}>
        <Segmented<'local' | 'remote'>
          ariaLabel={t('Dove gira il modello', 'Where the model runs')}
          value={tab}
          onChange={setTab}
          options={[
            { value: 'local', label: t('Nel browser', 'In the browser'), icon: <HardDrive size={15} /> },
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
  const t = useT()
  const caps = useLab(s => s.capabilities)
  const progress = useLab(s => s.loadProgress)
  const info = useLab(s => s.modelInfo)
  const loadingProfileId = useLab(s => s.profile)
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
  const loadingProfile =
    loadingProfileId && loadingProfileId in PROFILES ? PROFILES[loadingProfileId as RealProfileId] : profile
  const variant = resolveVariant(profile, webgpu, f16)
  const pct = progress.totalBytes > 0 ? Math.min(100, Math.round((progress.loadedBytes / progress.totalBytes) * 100)) : 0
  const estimatedBytes = variant?.sizeBytes ?? profile.cpu?.sizeBytes ?? profile.gpu?.sizeBytes ?? 0
  const downloadSize = formatModelBytes(estimatedBytes)
  const cachedSize = cachedModels[choice]
  const isCached = cachedSize !== undefined
  const fromCache = progress.source === 'cache'
  const deviceRequirement = !caps
    ? t('Compatibilità in verifica', 'Compatibility being checked')
    : variant?.device === 'webgpu'
      ? 'GPU · WebGPU'
      : variant?.device === 'wasm'
        ? t('CPU · funziona senza WebGPU', 'CPU · works without WebGPU')
        : t('Richiede WebGPU · Chrome o Edge su desktop', 'Requires WebGPU · Chrome or Edge on desktop')
  const limitation =
    profile.id === 'emma-6'
      ? t(
        'È sperimentale: può essere limitato nel ragionamento complesso e non garantisce la soluzione del rompicapo.',
        'It is experimental: it may be limited in complex reasoning and does not guarantee solving the puzzle.',
      )
      : profile.id === 'lfm-350m'
        ? t('È molto piccolo: può sbagliare più spesso; verifica la qualità dell’italiano.', 'It is very small: it may make more mistakes; check the quality of the Italian.')
        : profile.id === 'qwen3-0.6b' && variant?.device === 'wasm'
          ? t('Sulla CPU può essere lento: ogni risposta può richiedere decine di secondi.', 'On the CPU it can be slow: each answer can take tens of seconds.')
          : profile.id === 'lfm-1.2b'
            ? t('Velocità e stabilità sulle GPU integrate non sono garantite.', 'Speed and stability on integrated GPUs are not guaranteed.')
            : profile.id === 'gemma4-e2b'
              ? t(
                'È grande (circa 3 GB): serve una scheda grafica con memoria sufficiente; il primo download richiede tempo.',
                'It is large (about 3 GB): it needs a graphics card with enough memory; the first download takes time.',
              )
              : t('Le risposte possono contenere errori; verifica i risultati.', 'Answers may contain errors; check the results.')

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <p className={styles.kicker}>{t('Modello locale', 'Local model')}</p>
        <h2 className={styles.title}>{t('Scegli il modello', 'Choose the model')}</h2>
        <p className={styles.lead}>
          {isCached
            ? t(
              'Questo modello è già sul tuo computer: si avvia senza scaricare nulla.',
              'This model is already on your computer: it starts without downloading anything.',
            )
            : t(
              'L’avvio è manuale: scegli un’opzione compatibile e poi conferma il download. Dopo il primo download resta salvato nel browser.',
              'Starting is manual: choose a compatible option, then confirm the download. After the first download it stays saved in the browser.',
            )}
        </p>
      </header>

      <ul className={styles.essentials} aria-label={t('Download, privacy e limiti', 'Download, privacy and limits')}>
        <li>
          {isCached ? <HardDrive size={16} aria-hidden /> : <Download size={16} aria-hidden />}
          <span>
            {isCached ? (
              <>
                <strong>{t('Già scaricato:', 'Already downloaded:')}</strong>{' '}
                {t(
                  `${formatModelBytes(cachedSize || estimatedBytes)} salvati nel browser; nessun download all’avvio. Alla prossima visita si riavvia da solo.`,
                  `${formatModelBytes(cachedSize || estimatedBytes)} saved in the browser; no download at startup. On your next visit it restarts by itself.`,
                )}
              </>
            ) : (
              <>
                <strong>{t('Download da Hugging Face:', 'Download from Hugging Face:')}</strong>{' '}
                {t(
                  `circa ${downloadSize}, una volta sola: poi resta salvato nel browser. Parte solo quando premi «Scarica e avvia».`,
                  `about ${downloadSize}, one time only: then it stays saved in the browser. It starts only when you press “Download and start”.`,
                )}
              </>
            )}
          </span>
        </li>
        <li>
          <ShieldCheck size={16} aria-hidden />
          <span>
            <strong>{t('Uso locale:', 'Local use:')}</strong>{' '}
            {t(
              'il modello elabora le richieste nel browser; il testo non viene inviato al fornitore del modello.',
              'the model processes requests in the browser; the text is not sent to the model provider.',
            )}
          </span>
        </li>
        <li>
          <AlertTriangle size={16} aria-hidden />
          <span>
            <strong>{t('Limite:', 'Limit:')}</strong> {limitation}
          </span>
        </li>
      </ul>

      {busy ? null : ready && (
        <section className={styles.done} role="status" aria-live="polite">
          <span className={styles.doneIcon} aria-hidden>
            <Check size={18} />
          </span>
          <div className={styles.doneText}>
            <span className={styles.stateLabel}>{t('Modello pronto', 'Model ready')}</span>
            <strong>{info.label}</strong>
            <span>{t('Le richieste al modello vengono elaborate nel browser.', 'Requests to the model are processed in the browser.')}</span>
          </div>
          <button type="button" className={styles.primary} onClick={onClose}>
            {t('Vai al motore', 'Go to the engine')} <ArrowRight size={17} aria-hidden />
          </button>
        </section>
      )}
      {busy && (
        <section className={styles.progress} role="status" aria-live="polite">
          <div className={styles.progressHead}>
            <div className={styles.progressTitle}>
              <Loader2 size={18} className={styles.spin} aria-hidden />
              <div>
                <strong>
                  {progress.phase === 'checking'
                    ? t('Verifica del dispositivo', 'Checking the device')
                    : progress.phase === 'downloading'
                      ? fromCache
                        ? t(`Caricamento di ${loadingProfile.label} dal browser`, `Loading ${loadingProfile.label} from the browser`)
                        : t(`Download di ${loadingProfile.label}`, `Downloading ${loadingProfile.label}`)
                      : t(`Avvio di ${loadingProfile.label}`, `Starting ${loadingProfile.label}`)}
                </strong>
                <span>
                  {progress.phase === 'checking'
                    ? t('Controllo compatibilità e cache del browser.', 'Checking compatibility and the browser cache.')
                    : progress.phase === 'downloading'
                      ? fromCache
                        ? t('I file sono già sul computer: nessun download.', 'The files are already on your computer: no download.')
                        : t(
                          'Trasferimento dei pesi da Hugging Face. Resteranno salvati nel browser.',
                          'Transferring the weights from Hugging Face. They will stay saved in the browser.',
                        )
                      : t('Preparazione del modello nel browser.', 'Preparing the model in the browser.')}
                </span>
              </div>
            </div>
            {progress.phase === 'downloading' && progress.totalBytes > 0 && <span className={styles.pct}>{pct}%</span>}
          </div>
          <div
            className={styles.bar}
            role="progressbar"
            aria-label={t('Caricamento del modello', 'Model loading')}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress.phase === 'downloading' && progress.totalBytes > 0 ? pct : undefined}
            aria-valuetext={
              progress.phase === 'downloading' && progress.totalBytes > 0
                ? t(`${pct}% del download`, `${pct}% downloaded`)
                : t('Operazione in corso', 'Operation in progress')
            }
          >
            <motion.span
              animate={progress.phase === 'downloading' ? { scaleX: Math.max(0.02, pct / 100) } : { scaleX: [0.15, 0.85, 0.15] }}
              transition={progress.phase === 'downloading' ? { duration: 0.3 } : { duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
            />
          </div>
          <p className={styles.small}>
            {progress.phase === 'downloading' && progress.totalBytes > 0
              ? t(
                `${formatModelBytes(progress.loadedBytes)} di ${formatModelBytes(progress.totalBytes)}. Puoi chiudere questa finestra: ${fromCache ? 'il caricamento' : 'il download'} continua.`,
                `${formatModelBytes(progress.loadedBytes)} of ${formatModelBytes(progress.totalBytes)}. You can close this window: ${fromCache ? 'loading' : 'the download'} continues.`,
              )
              : t('Puoi chiudere questa finestra: il caricamento continua.', 'You can close this window: loading continues.')}
          </p>
        </section>
      )}
      {!busy && (
        <>
          {progress.phase === 'error' && (
            <section className={styles.error} role="alert">
              <AlertTriangle size={18} aria-hidden />
              <div className={styles.errorText}>
                <strong>{t('Avvio non riuscito', 'Start failed')}</strong>
                <p>
                  {t(
                    'Controlla la connessione, lo spazio disponibile e la compatibilità, poi riprova.',
                    'Check your connection, available space and compatibility, then try again.',
                  )}
                </p>
                {progress.message && (
                  <details className={styles.errorDetails}>
                    <summary>{t('Dettagli dell’errore', 'Error details')}</summary>
                    <p>{progress.message}</p>
                  </details>
                )}
              </div>
            </section>
          )}

          {(!ready || switching) && (
            <section
              className={styles.pick}
              aria-label={switching ? t('Nuovo modello', 'New model') : choice === recommended ? t('Modello consigliato', 'Recommended model') : t('Modello selezionato', 'Selected model')}
            >
              <div className={styles.pickText}>
                <span className={styles.pickLabel}>
                  {switching
                    ? t('Cambia modello', 'Switch model')
                    : choice === recommended
                      ? t('Consigliato per questo dispositivo', 'Recommended for this device')
                      : t('Modello selezionato', 'Selected model')}
                </span>
                <h3 className={styles.pickName}>{profile.label}</h3>
                <p className={styles.tagline}>{profile.tagline}</p>
                <p className={styles.pickMeta}>
                  {isCached ? (
                    <span className={styles.cachedTag}>
                      <HardDrive size={13} aria-hidden /> {t('Già scaricato', 'Already downloaded')} · {formatModelBytes(cachedSize || estimatedBytes)}
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
                    <Trash2 size={13} aria-hidden />{' '}
                    {confirmDelete
                      ? t('Conferma: elimina i file dal browser', 'Confirm: delete the files from the browser')
                      : t('Elimina dal browser', 'Delete from the browser')}
                  </button>
                )}
              </div>
              <button type="button" className={styles.primary} disabled={!variant} onClick={() => void loadModel(choice)}>
                {progress.phase === 'error'
                  ? t('Riprova l’avvio', 'Try starting again')
                  : !variant
                    ? t('WebGPU richiesto', 'WebGPU required')
                    : switching
                      ? isCached
                        ? t(`Passa a ${profile.label}`, `Switch to ${profile.label}`)
                        : t(`Scarica e passa a ${profile.label}`, `Download and switch to ${profile.label}`)
                      : isCached
                        ? t('Avvia', 'Start')
                        : t('Scarica e avvia', 'Download and start')}
                <ArrowRight size={17} aria-hidden />
              </button>
            </section>
          )}

          {profile.thinking && (
            <ThinkingControl
              note={t(
                'Qwen3 e Gemma 4 possono ragionare prima di rispondere: più ragionamento è più lento, soprattutto sulla CPU.',
                'Qwen3 and Gemma 4 can reason before answering: more reasoning is slower, especially on the CPU.',
              )}
            />
          )}
        </>
      )}

      <details className={styles.disclosure} open={busy || ready || undefined}>
        <summary className={styles.summary}>
          {ready ? t('Cambia modello', 'Switch model') : t('Altri modelli', 'Other models')}
          <ChevronDown size={17} aria-hidden />
        </summary>
        <ul className={styles.list} role="radiogroup" aria-label={t('Scegli un modello', 'Choose a model')}>
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
                      {p.id === current && <span className={styles.recommended}>{t('In uso', 'In use')}</span>}
                      {p.id === recommended && p.id !== current && <span className={styles.recommended}>{t('Consigliato', 'Recommended')}</span>}
                      {cachedModels[p.id] !== undefined && <span className={styles.cachedBadge}>{t('Scaricato', 'Downloaded')}</span>}
                    </span>
                    <span className={styles.rowMeta}>
                      {option
                        ? `${cachedModels[p.id] !== undefined ? t('sul computer', 'on this computer') : formatModelBytes(option.sizeBytes)} · ${option.device === 'webgpu' ? 'GPU (WebGPU)' : 'CPU (WASM)'}`
                        : t('Richiede WebGPU · Chrome o Edge su desktop', 'Requires WebGPU · Chrome or Edge on desktop')}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </details>

      {!busy && (
        <details className={styles.disclosure}>
          <summary className={styles.summary}>
            {t('Dettagli tecnici', 'Technical details')}
            <ChevronDown size={17} aria-hidden />
          </summary>
          <div className={styles.detailsContent}>
            <dl className={styles.specs}>
              <div>
                <dt>{t('Parametri', 'Parameters')}</dt>
                <dd>{profile.params}</dd>
              </div>
              <div>
                <dt>{t('Memoria durante l’uso', 'Memory while in use')}</dt>
                <dd>{profile.memoryEstimate}</dd>
              </div>
              <div>
                <dt>{t('Quantizzazione', 'Quantization')}</dt>
                <dd>{variant?.dtype ?? t('Nessuna variante compatibile', 'No compatible variant')}</dd>
              </div>
              {profile.runtime === 'wllama' && (
                <div>
                  <dt>{t('Contesto', 'Context')}</dt>
                  <dd>
                    {t(
                      `${profile.contextLength.toLocaleString('it-IT')} token (4K)`,
                      `${profile.contextLength.toLocaleString('en-US')} tokens (4K)`,
                    )}
                  </dd>
                </div>
              )}
              <div>
                <dt>{t('Lingue', 'Languages')}</dt>
                <dd>{profile.languages}</dd>
              </div>
              {profile.runtime === 'wllama' && (
                <div>
                  <dt>{t('Chiamate agli strumenti', 'Tool calls')}</dt>
                  <dd>{t('Non native; l’harness usa il protocollo testuale.', 'Not native; the harness uses the text protocol.')}</dd>
                </div>
              )}
              <div>
                <dt>{t('Licenza', 'License')}</dt>
                <dd>
                  <a href={profile.licenseUrl} target="_blank" rel="noreferrer">
                    {profile.license} <ExternalLink size={13} aria-hidden />
                  </a>
                </dd>
              </div>
              <div>
                <dt>{t('Modello', 'Model')}</dt>
                <dd>
                  <a href={`https://huggingface.co/${profile.repo}`} target="_blank" rel="noreferrer">
                    {profile.repo} <ExternalLink size={13} aria-hidden />
                  </a>
                </dd>
              </div>
              {caps && (
                <>
                  <div>
                    <dt>{t('Browser', 'Browser')}</dt>
                    <dd>{caps.browser}</dd>
                  </div>
                  <div>
                    <dt>WebGPU</dt>
                    <dd>{caps.webgpu ? caps.adapterInfo?.vendor ?? t('Disponibile', 'Available') : t('Non disponibile', 'Not available')}</dd>
                  </div>
                  {caps.storageQuotaBytes !== undefined && caps.storageUsageBytes !== undefined && (
                    <div>
                      <dt>{t('Spazio libero nel browser', 'Free space in the browser')}</dt>
                      <dd>{formatBytes(Math.max(0, caps.storageQuotaBytes - caps.storageUsageBytes))}</dd>
                    </div>
                  )}
                  {caps.deviceMemoryGb !== undefined && (
                    <div>
                      <dt>{t('Memoria dispositivo', 'Device memory')}</dt>
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
      )}
    </div>
  )
}
