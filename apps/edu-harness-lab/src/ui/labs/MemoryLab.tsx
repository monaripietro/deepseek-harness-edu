import { useEffect, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Brain, Eraser, Plus, Trash2 } from 'lucide-react'
import type { MemoryKind, MemoryRecord, MemoryScope } from '../../domain/types'
import { REAL_LOCAL } from '../../domain/types'
import { memory, useLab } from '../../state/store'
import { ProvenanceBadge } from '../common/ProvenanceBadge'
import { biRecord, uiLang, useT } from '../../i18n'
import styles from './MemoryLab.module.css'
import lab from './lab.module.css'

const KIND_LABEL = biRecord<MemoryKind>({
  preference: ['Preferenza', 'Preference'],
  fact: ['Fatto', 'Fact'],
  taskState: ['Stato del compito', 'Task status'],
  observation: ['Osservazione', 'Observation'],
})
const SCOPE_LABEL = biRecord<MemoryScope>({
  session: ['Sessione', 'Session'],
  persistent: ['Persistente (IndexedDB)', 'Persistent (IndexedDB)'],
})
const SOURCE_LABEL = biRecord<MemoryRecord['source']>({
  seed: ['esempio iniziale', 'starter example'],
  user: ['scritto da te', 'written by you'],
  tool: ['scritto da uno strumento', 'written by a tool'],
  model: ['proposto dal modello', 'proposed by the model'],
})

const dateLocale = (): string => (uiLang() === 'en' ? 'en-GB' : 'it-IT')

export function MemoryLab() {
  const t = useT()
  const memOn = useLab(s => s.config.components.memory)
  const reduce = useReducedMotion()
  const [records, setRecords] = useState<MemoryRecord[]>(() => memory.list())
  const [scope, setScope] = useState<MemoryScope>('persistent')
  const [kind, setKind] = useState<MemoryKind>('preference')
  const [key, setKey] = useState('')
  const [text, setText] = useState('')

  useEffect(() => {
    const d = memory.subscribe(() =>{  setRecords([...memory.list()]) })
    setRecords([...memory.list()])
    return d
  }, [])

  const add = (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!key.trim() || !text.trim()) return
    memory.write({ scope, kind, key: key.trim(), text: text.trim(), source: 'user' })
    setKey(''); setText('')
  }

  return (
    <div>
      <h2 className={lab.h2}>{t('Memoria', 'Memory')}</h2>
      <p className={lab.intro}>
        {t('Il modello non ricorda nulla. La memoria è un archivio del sistema: il sistema ', 'The model remembers nothing. Memory is a store kept by the system: the system ')}
        <strong>{t('scrive', 'writes')}</strong>{t(' i fatti utili, li ', ' the useful facts, ')}
        <strong>{t('rilegge', 'reads them back')}</strong>{t(' quando serve e li ', ' when needed and ')}
        <strong>{t('inserisce', 'inserts them')}</strong>{t(' nel contesto prima di ogni domanda.', ' into the context before every question.')}
      </p>
      {!memOn && <div className={`${lab.callout} ${lab.warn}`} style={{ marginBottom: 'var(--sp-5)' }}>{t('Il componente Memoria è spento: questi ricordi esistono, ma il modello non li riceve.', 'The Memory component is off: these memories exist, but the model does not receive them.')}</div>}

      {(['persistent', 'session'] as MemoryScope[]).map((sc) => {
        const list = records.filter(r => r.scope === sc)
        return (
          <section key={sc} className={lab.section} aria-label={SCOPE_LABEL[sc]}>
            <div className={lab.spread}>
              <h3 className={lab.h3}>{SCOPE_LABEL[sc]}</h3>
              <div className={lab.row}>
                <ProvenanceBadge tag={REAL_LOCAL} />
                {sc === 'session' && <button className={`${lab.btn} ${lab.sm}`} onClick={() =>{  memory.clear('session') }} disabled={list.length === 0}><Eraser size={14} aria-hidden /> {t('Svuota memoria di sessione', 'Clear session memory')}</button>}
              </div>
            </div>
            <p className={lab.muted}>{sc === 'session'
              ? t('Dura finché la conversazione non viene azzerata (anche cambiando scenario, livello o lingua) o chiudi la pagina.', 'Lasts until the conversation is reset (including when you change scenario, level or language) or you close the page.')
              : t('Resta salvata nel tuo browser anche dopo la chiusura.', 'Stays saved in your browser even after you close it.')}</p>
            {list.length === 0 && <p className={lab.muted}>{t('Nessun ricordo.', 'No memories.')}</p>}
            {(Object.keys(KIND_LABEL) as MemoryKind[]).map((k) => {
              const items = list.filter(r => r.kind === k)
              if (!items.length) return null
              return (
                <div key={k} className={styles.group}>
                  <div className={styles.kind}>{KIND_LABEL[k]}</div>
                  <ul className={styles.list}>
                    <AnimatePresence initial={false}>
                      {items.map(r => (
                        <motion.li
                          key={r.id}
                          layout={!reduce}
                          className={styles.item}
                          initial={reduce ? false : { opacity: 0, scale: 0.97 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, height: 0 }}
                        >
                          <div>
                            <code className={lab.mono}>{r.key}</code>
                            <div>{r.text}</div>
                            <div className={lab.hint}>{SOURCE_LABEL[r.source]} · {new Date(r.createdAt).toLocaleString(dateLocale())}</div>
                          </div>
                          <button className={`${lab.btn} ${lab.ghost}`} onClick={() =>{  memory.delete(r.id) }} aria-label={`${t('Elimina il ricordo', 'Delete memory')} ${r.key}`}><Trash2 size={16} aria-hidden /></button>
                        </motion.li>
                      ))}
                    </AnimatePresence>
                  </ul>
                </div>
              )
            })}
          </section>
        )
      })}

      <form className={lab.card} onSubmit={add}>
        <h3 className={lab.h3}><Brain size={20} aria-hidden /> {t('Aggiungi un ricordo', 'Add a memory')}</h3>
        <div className={lab.formGrid}>
          <label className={lab.label}>{t('Dove', 'Where')}
            <select className={lab.select} value={scope} onChange={(e) =>{  setScope(e.target.value as MemoryScope) }}>
              <option value="persistent">{t('Persistente', 'Persistent')}</option><option value="session">{t('Sessione', 'Session')}</option>
            </select>
          </label>
          <label className={lab.label}>{t('Tipo', 'Type')}
            <select className={lab.select} value={kind} onChange={(e) =>{  setKind(e.target.value as MemoryKind) }}>
              {(Object.keys(KIND_LABEL) as MemoryKind[]).map(k => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
            </select>
          </label>
          <label className={lab.label}>{t('Chiave', 'Key')}<input className={lab.input} value={key} onChange={(e) =>{  setKey(e.target.value) }} placeholder={t('sede_consegna', 'delivery_site')} /></label>
        </div>
        <label className={lab.label}>{t('Contenuto', 'Content')}
          <textarea className={lab.textarea} value={text} onChange={(e) =>{  setText(e.target.value) }} />
        </label>
        <div><button className={`${lab.btn} ${lab.primary}`} type="submit" disabled={!key.trim() || !text.trim()}><Plus size={16} aria-hidden /> {t('Salva nella memoria', 'Save to memory')}</button></div>
      </form>
    </div>
  )
}
