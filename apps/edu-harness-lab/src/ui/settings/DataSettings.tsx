import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { Brain, Database, FileClock, HardDrive, Settings2, ShieldCheck, Trash2 } from 'lucide-react'
import { useLab } from '../../state/store'
import { deleteModelCache } from '../../persistence/db'
import { Dialog } from '../common/Dialog'
import { formatBytes } from '../common/labels'
import { pick, useT } from '../../i18n'
import type { Bi } from '../../i18n'
import styles from './DataSettings.module.css'

type Pending = 'wipe' | 'model' | null

const ITEMS: { Icon: typeof Brain; title: Bi; text: Bi }[] = [
  { Icon: Brain, title: ['Memoria persistente', 'Persistent memory'], text: ['I ricordi che salvi o che il sistema scrive nel tuo browser (IndexedDB).', 'The memories you save or the system writes in your browser (IndexedDB).'] },
  { Icon: FileClock, title: ['Registrazioni', 'Recordings'], text: ['Le risposte del modello registrate per poterle riprodurre senza ricalcolarle.', 'The model’s answers recorded so they can be replayed without recalculating them.'] },
  { Icon: Database, title: ['Esecuzioni', 'Runs'], text: ['Lo storico dei risultati dei confronti e delle prove.', 'The history of comparison and test results.'] },
  { Icon: Settings2, title: ['Impostazioni', 'Settings'], text: ['Tema, livello raggiunto e preferenze dell’interfaccia.', 'Theme, level reached and interface preferences.'] },
]

export function DataSettings({ onClose }: { onClose: () => void }) {
  const t = useT()
  const wipeData = useLab(s => s.wipeData)
  const [usage, setUsage] = useState<{ usage: number; quota: number } | null>(null)
  const [pending, setPending] = useState<Pending>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState('')

  const refresh = () => {
    const browser: { storage?: Partial<StorageManager> } = navigator
    void browser.storage?.estimate?.()
      .then((e) => { setUsage({ usage: e.usage ?? 0, quota: e.quota ?? 0 }) })
      .catch(() => { setUsage(null) })
  }
  useEffect(() => {
    refresh()
  }, [])

  const confirm = async () => {
    if (!pending) return
    setBusy(true)
    try {
      if (pending === 'wipe') { await wipeData(); setDone(t('Tutti i dati locali sono stati cancellati.', 'All local data has been deleted.')) }
      else { await deleteModelCache(); void useLab.getState().refreshModelCache(); setDone(t('Il modello scaricato è stato eliminato.', 'The downloaded model has been deleted.')) }
    } catch (e) {
      setDone(`${t('Operazione non riuscita', 'Operation failed')}: ${e instanceof Error ? e.message : String(e)}`)
    } finally { setBusy(false); setPending(null); refresh() }
  }

  const pct = usage && usage.quota ? Math.min(100, (usage.usage / usage.quota) * 100) : 0

  return (
    <Dialog label={t('Dati su questo dispositivo', 'Data on this device')} onClose={onClose} width={620}>
      <div className={styles.dialog}>
        <header className={styles.head}>
          <h2 className={styles.title}>{t('Dati su questo dispositivo', 'Data on this device')}</h2>
        </header>
        <p className={styles.lead}>{t('Harness Lab lavora interamente nel tuo browser. Ecco cosa conserva, e solo qui.', 'Harness Lab works entirely in your browser. Here is what it keeps, and only here.')}</p>
        <ul className={styles.items}>
          {ITEMS.map(({ Icon, title, text }) => (
            <li key={title[0]}>
              <Icon size={20} aria-hidden />
              <div><strong>{pick(title)}</strong><div className={styles.muted}>{pick(text)}</div></div>
            </li>
          ))}
        </ul>

        <div className={styles.usage}>
          <HardDrive size={18} aria-hidden />
          {usage ? (
            <div className={styles.usageBody}>
              <span>{t('Spazio usato:', 'Space used:')} <strong>{formatBytes(usage.usage)}</strong> {t('di', 'of')} {formatBytes(usage.quota)} {t('disponibili', 'available')}</span>
              <div className={styles.meter} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label={t('Spazio usato', 'Space used')}>
                <motion.span initial={{ width: 0 }} animate={{ width: `${Math.max(1, pct)}%` }} />
              </div>
            </div>
          ) : <span className={styles.muted}>{t('Stima dello spazio non disponibile in questo browser.', 'Storage estimate not available in this browser.')}</span>}
        </div>

        {done && <p className={styles.done} role="status">{done}</p>}

        {pending ? (
          <div className={styles.confirm} role="alertdialog" aria-label={t('Conferma', 'Confirm')}>
            <p><strong>{pending === 'wipe' ? t('Cancellare tutti i dati locali?', 'Delete all local data?') : t('Eliminare il modello scaricato?', 'Delete the downloaded model?')}</strong> {pending === 'wipe'
              ? t('Memoria, registrazioni, esecuzioni e impostazioni verranno rimosse. Non si può annullare.', 'Memory, recordings, runs and settings will be removed. This cannot be undone.')
              : t('Dovrai scaricarlo di nuovo per usarlo.', 'You will need to download it again to use it.')}</p>
            <div className={styles.actions}>
              <button className={styles.btn} onClick={() =>{  setPending(null) }} disabled={busy}>{t('Annulla', 'Cancel')}</button>
              <button className={`${styles.btn} ${styles.danger}`} onClick={() => void confirm()} disabled={busy}>{busy ? t('Attendi…', 'Please wait…') : t('Sì, conferma', 'Yes, confirm')}</button>
            </div>
          </div>
        ) : (
          <div className={styles.actions}>
            <button className={`${styles.btn} ${styles.danger}`} onClick={() =>{  setPending('wipe') }}><Trash2 size={16} aria-hidden /> {t('Cancella tutti i dati locali', 'Delete all local data')}</button>
            <button className={styles.btn} onClick={() =>{  setPending('model') }}><Trash2 size={16} aria-hidden /> {t('Elimina il modello scaricato', 'Delete the downloaded model')}</button>
          </div>
        )}

        <p className={styles.privacy}>
          <ShieldCheck size={18} aria-hidden /> {t(
            'Nessun dato lascia il browser, salvo il download del modello e i server MCP reali che scegli tu di collegare.',
            'No data leaves the browser, except for the model download and the real MCP servers you choose to connect.',
          )}
        </p>
      </div>
    </Dialog>
  )
}
