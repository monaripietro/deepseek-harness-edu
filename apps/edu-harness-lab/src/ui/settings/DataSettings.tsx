import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { Brain, Database, FileClock, HardDrive, Settings2, ShieldCheck, Trash2, X } from 'lucide-react'
import { useLab } from '../../state/store'
import { deleteModelCache } from '../../persistence/db'
import { formatBytes } from '../common/labels'
import styles from './DataSettings.module.css'

type Pending = 'wipe' | 'model' | null

const ITEMS = [
  { Icon: Brain, title: 'Memoria persistente', text: 'I ricordi che salvi o che il sistema scrive nel tuo browser (IndexedDB).' },
  { Icon: FileClock, title: 'Registrazioni', text: 'Le risposte del modello registrate per poterle riprodurre senza ricalcolarle.' },
  { Icon: Database, title: 'Esecuzioni', text: 'Lo storico dei risultati dei confronti e delle prove.' },
  { Icon: Settings2, title: 'Impostazioni', text: 'Tema, livello raggiunto e preferenze dell’interfaccia.' },
]

export function DataSettings({ onClose }: { onClose: () => void }) {
  const wipeData = useLab(s => s.wipeData)
  const [usage, setUsage] = useState<{ usage: number; quota: number } | null>(null)
  const [pending, setPending] = useState<Pending>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  const refresh = () => {
    const browser: { storage?: Partial<StorageManager> } = navigator
    void browser.storage?.estimate?.()
      .then((e) => { setUsage({ usage: e.usage ?? 0, quota: e.quota ?? 0 }) })
      .catch(() => { setUsage(null) })
  }
  useEffect(() => {
    refresh()
    const prev: (Element & Partial<Pick<HTMLElement, 'focus'>>) | null = document.activeElement
    ref.current?.querySelector<HTMLElement>('button')?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose() }
      if (e.key === 'Tab' && ref.current) {
        const f = ref.current.querySelectorAll<HTMLElement>('button:not([disabled])')
        const first = f[0], last = f[f.length - 1]
        if (!first || !last) return
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      prev?.focus?.()
    }
  }, [])

  const confirm = async () => {
    if (!pending) return
    setBusy(true)
    try {
      if (pending === 'wipe') { await wipeData(); setDone('Tutti i dati locali sono stati cancellati.') }
      else { await deleteModelCache(); void useLab.getState().refreshModelCache(); setDone('Il modello scaricato è stato eliminato.') }
    } catch (e) {
      setDone(`Operazione non riuscita: ${e instanceof Error ? e.message : String(e)}`)
    } finally { setBusy(false); setPending(null); refresh() }
  }

  const pct = usage && usage.quota ? Math.min(100, (usage.usage / usage.quota) * 100) : 0

  return (
    <div className={styles.scrim} onClick={onClose}>
      <motion.div ref={ref} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="ds-title" onClick={(e) =>{  e.stopPropagation() }}
        initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.25 }}>
        <header className={styles.head}>
          <h2 id="ds-title" className={styles.title}>Dati su questo dispositivo</h2>
          <button className={styles.close} onClick={onClose} aria-label="Chiudi"><X size={20} aria-hidden /></button>
        </header>
        <p className={styles.lead}>Harness Lab lavora interamente nel tuo browser. Ecco cosa conserva, e solo qui.</p>
        <ul className={styles.items}>
          {ITEMS.map(({ Icon, title, text }) => (
            <li key={title}><Icon size={20} aria-hidden /><div><strong>{title}</strong><div className={styles.muted}>{text}</div></div></li>
          ))}
        </ul>

        <div className={styles.usage}>
          <HardDrive size={18} aria-hidden />
          {usage ? (
            <div className={styles.usageBody}>
              <span>Spazio usato: <strong>{formatBytes(usage.usage)}</strong> di {formatBytes(usage.quota)} disponibili</span>
              <div className={styles.meter} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label="Spazio usato">
                <motion.span initial={{ width: 0 }} animate={{ width: `${Math.max(1, pct)}%` }} />
              </div>
            </div>
          ) : <span className={styles.muted}>Stima dello spazio non disponibile in questo browser.</span>}
        </div>

        {done && <p className={styles.done} role="status">{done}</p>}

        {pending ? (
          <div className={styles.confirm} role="alertdialog" aria-label="Conferma">
            <p><strong>{pending === 'wipe' ? 'Cancellare tutti i dati locali?' : 'Eliminare il modello scaricato?'}</strong> {pending === 'wipe' ? 'Memoria, registrazioni, esecuzioni e impostazioni verranno rimosse. Non si può annullare.' : 'Dovrai scaricarlo di nuovo per usarlo.'}</p>
            <div className={styles.actions}>
              <button className={styles.btn} onClick={() =>{  setPending(null) }} disabled={busy}>Annulla</button>
              <button className={`${styles.btn} ${styles.danger}`} onClick={() => void confirm()} disabled={busy}>{busy ? 'Attendi…' : 'Sì, conferma'}</button>
            </div>
          </div>
        ) : (
          <div className={styles.actions}>
            <button className={`${styles.btn} ${styles.danger}`} onClick={() =>{  setPending('wipe') }}><Trash2 size={16} aria-hidden /> Cancella tutti i dati locali</button>
            <button className={styles.btn} onClick={() =>{  setPending('model') }}><Trash2 size={16} aria-hidden /> Elimina il modello scaricato</button>
          </div>
        )}

        <p className={styles.privacy}>
          <ShieldCheck size={18} aria-hidden /> Nessun dato lascia il browser, salvo il download del modello e i server MCP reali
          che scegli tu di collegare.
        </p>
      </motion.div>
    </div>
  )
}
