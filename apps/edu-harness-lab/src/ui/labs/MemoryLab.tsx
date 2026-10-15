import { useEffect, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Brain, Eraser, Plus, Trash2 } from 'lucide-react'
import type { MemoryKind, MemoryRecord, MemoryScope } from '../../domain/types'
import { REAL_LOCAL } from '../../domain/types'
import { memory, useLab } from '../../state/store'
import { ProvenanceBadge } from '../common/ProvenanceBadge'
import styles from './MemoryLab.module.css'
import lab from './lab.module.css'

const KIND_LABEL: Record<MemoryKind, string> = { preference: 'Preferenza', fact: 'Fatto', taskState: 'Stato del compito', observation: 'Osservazione' }
const SCOPE_LABEL: Record<MemoryScope, string> = { session: 'Sessione', persistent: 'Persistente (IndexedDB)' }
const SOURCE_LABEL: Record<MemoryRecord['source'], string> = { seed: 'esempio iniziale', user: 'scritto da te', tool: 'scritto da uno strumento', model: 'proposto dal modello' }

export function MemoryLab() {
  const memOn = useLab(s => s.config.components.memory)
  const reduce = useReducedMotion()
  const [records, setRecords] = useState<MemoryRecord[]>(() => memory.list())
  const [scope, setScope] = useState<MemoryScope>('persistent')
  const [kind, setKind] = useState<MemoryKind>('preference')
  const [key, setKey] = useState('')
  const [text, setText] = useState('')

  useEffect(() => {
    const d = memory.subscribe(() => setRecords([...memory.list()]))
    setRecords([...memory.list()])
    return d
  }, [])

  const add = (e: React.FormEvent) => {
    e.preventDefault()
    if (!key.trim() || !text.trim()) return
    memory.write({ scope, kind, key: key.trim(), text: text.trim(), source: 'user' })
    setKey(''); setText('')
  }

  return (
    <div>
      <h2 className={lab.h2}>Memoria</h2>
      <p className={lab.intro}>
        Il modello non ricorda nulla. La memoria è un archivio del sistema: il sistema <strong>scrive</strong> i fatti utili,
        li <strong>rilegge</strong> quando serve e li <strong>inserisce</strong> nel contesto prima di ogni domanda.
      </p>
      {!memOn && <div className={`${lab.callout} ${lab.warn}`} style={{ marginBottom: 'var(--sp-5)' }}>Il componente Memoria è spento: questi ricordi esistono, ma il modello non li riceve.</div>}

      {(['persistent', 'session'] as MemoryScope[]).map((sc) => {
        const list = records.filter(r => r.scope === sc)
        return (
          <section key={sc} className={lab.section} aria-label={SCOPE_LABEL[sc]}>
            <div className={lab.spread}>
              <h3 className={lab.h3}>{SCOPE_LABEL[sc]}</h3>
              <div className={lab.row}>
                <ProvenanceBadge tag={REAL_LOCAL} />
                {sc === 'session' && <button className={`${lab.btn} ${lab.sm}`} onClick={() => memory.clear('session')} disabled={list.length === 0}><Eraser size={14} aria-hidden /> Svuota memoria di sessione</button>}
              </div>
            </div>
            <p className={lab.muted}>{sc === 'session' ? 'Dura finché non azzeri lo scenario o chiudi la pagina.' : 'Resta salvata nel tuo browser anche dopo la chiusura.'}</p>
            {list.length === 0 && <p className={lab.muted}>Nessun ricordo.</p>}
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
                            <div className={lab.hint}>{SOURCE_LABEL[r.source]} · {new Date(r.createdAt).toLocaleString('it-IT')}</div>
                          </div>
                          <button className={`${lab.btn} ${lab.ghost}`} onClick={() => memory.delete(r.id)} aria-label={`Elimina il ricordo ${r.key}`}><Trash2 size={16} aria-hidden /></button>
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
        <h3 className={lab.h3}><Brain size={20} aria-hidden /> Aggiungi un ricordo</h3>
        <div className={lab.formGrid}>
          <label className={lab.label}>Dove
            <select className={lab.select} value={scope} onChange={e => setScope(e.target.value as MemoryScope)}>
              <option value="persistent">Persistente</option><option value="session">Sessione</option>
            </select>
          </label>
          <label className={lab.label}>Tipo
            <select className={lab.select} value={kind} onChange={e => setKind(e.target.value as MemoryKind)}>
              {(Object.keys(KIND_LABEL) as MemoryKind[]).map(k => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
            </select>
          </label>
          <label className={lab.label}>Chiave<input className={lab.input} value={key} onChange={e => setKey(e.target.value)} placeholder="sede_consegna" /></label>
        </div>
        <label className={lab.label}>Contenuto
          <textarea className={lab.textarea} value={text} onChange={e => setText(e.target.value)} />
        </label>
        <div><button className={`${lab.btn} ${lab.primary}`} type="submit" disabled={!key.trim() || !text.trim()}><Plus size={16} aria-hidden /> Salva nella memoria</button></div>
      </form>
    </div>
  )
}
