import { useMemo, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Ban, FilePlus2, Pin, PinOff, RotateCcw, Search, Trash2, X } from 'lucide-react'
import type { PolicyDoc, RagSettings } from '../../domain/types'
import { retriever, useLab } from '../../state/store'
import { DEFAULT_RAG } from '../../harness/levels'
import { requestFor } from '../../scenarios'
import { EXCLUSION_LABEL } from '../common/labels'
import styles from './RagLab.module.css'
import lab from './lab.module.css'

function docStatus(d: PolicyDoc): { label: string; cls: string } {
  if (d.userAdded) return { label: 'Aggiunto da te', cls: styles.stUser ?? '' }
  if (d.status === 'valid') return { label: 'Valido', cls: styles.stValid ?? '' }
  if (d.status === 'outdated') return { label: 'Superato', cls: styles.stOld ?? '' }
  return { label: 'Irrilevante', cls: styles.stOff ?? '' }
}

function Status({ doc }: { doc: PolicyDoc }) {
  const s = docStatus(doc)
  return <span className={`${styles.status} ${s.cls}`}>{s.label}</span>
}

export function RagLab() {
  const rag = useLab(s => s.config.rag)
  const ragOn = useLab(s => s.config.components.rag)
  const updateConfig = useLab(s => s.updateConfig)
  const scenarioId = useLab(s => s.scenarioId)
  const reduce = useReducedMotion()
  const promptLanguage = useLab(s => s.promptLanguage)
  const scenarioRequest = requestFor(scenarioId, promptLanguage)
  const [query, setQuery] = useState(scenarioRequest)
  const [version, setVersion] = useState(0)
  const [reading, setReading] = useState<PolicyDoc | null>(null)
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')

  const docs = useMemo(() => retriever.documents(), [version])
  const hits = useMemo(() => (query.trim() ? retriever.search(query, rag) : []), [query, rag, version])

  const patch = (p: Partial<RagSettings>) =>{  updateConfig({ rag: { ...rag, ...p } }) }
  const toggleList = (key: 'pinnedChunkIds' | 'excludedChunkIds', other: 'pinnedChunkIds' | 'excludedChunkIds', id: string) => {
    const has = rag[key].includes(id)
    patch({ [key]: has ? rag[key].filter(x => x !== id) : [...rag[key], id], [other]: rag[other].filter(x => x !== id) })
  }

  const addDoc = (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!title.trim() || !text.trim()) return
    const n = docs.filter(d => d.userAdded).length + 1
    let id = `USR-${n}`
    while (docs.some(d => d.id === id)) id = `USR-${Number(id.slice(4)) + 1}`
    retriever.addDocument({ id, title: title.trim(), version: 'utente', status: 'valid', category: 'Utente', text: text.trim(), userAdded: true })
    setTitle(''); setText(''); setVersion(v => v + 1)
  }

  return (
    <div>
      <div className={lab.spread}>
        <h2 className={lab.h2}>Documenti aziendali (RAG)</h2>
        <span className={lab.chip}>Deterministica (BM25) · LOCALE</span>
      </div>
      <p className={lab.intro}>
        Il sistema cerca nei documenti i frammenti più pertinenti alla richiesta e li mette davanti al modello.
        Prova tu: cambia la domanda e le impostazioni e guarda cosa entra e cosa resta fuori.
      </p>
      <div className={lab.callout} style={{ marginBottom: 'var(--sp-6)' }}>
        <Search size={20} aria-hidden />
        <strong>La RAG recupera informazioni. Non compie automaticamente un’azione nel mondo esterno.</strong>
      </div>
      {!ragOn && <div className={`${lab.callout} ${lab.warn}`} style={{ marginBottom: 'var(--sp-5)' }}>Il componente Conoscenza (RAG) è spento: il modello non riceve questi frammenti. Questa ricerca è solo un’anteprima.</div>}

      <section className={lab.section} aria-labelledby="rag-docs">
        <h3 id="rag-docs" className={lab.h3}>Documenti ({docs.length})</h3>
        <div className={lab.cards}>
          {docs.map(d => (
            <button key={d.id} className={`${lab.card} ${lab.cardBtn}`} onClick={() =>{  setReading(d) }} aria-label={`Leggi ${d.title}`}>
              <div className={lab.spread}><code className={lab.mono}>{d.id}</code><Status doc={d} /></div>
              <strong>{d.title}</strong>
              <span className={lab.muted}>{d.category} · versione {d.version}{d.validFrom ? ` · dal ${d.validFrom}` : ''}</span>
            </button>
          ))}
        </div>
      </section>

      <section className={lab.section} aria-labelledby="rag-search">
        <h3 id="rag-search" className={lab.h3}>Ricerca dal vivo</h3>
        <label className={lab.label}>Domanda
          <input className={lab.input} value={query} onChange={(e) =>{  setQuery(e.target.value) }} />
        </label>
        <div className={styles.controls}>
          <label className={lab.label}>Frammenti massimi (topK): {rag.topK}
            <input type="range" min={1} max={8} step={1} value={rag.topK} onChange={(e) =>{  patch({ topK: Number(e.target.value) }) }} />
          </label>
          <label className={lab.label}>Punteggio minimo: {rag.minScore.toFixed(2)}
            <input type="range" min={0} max={1} step={0.05} value={rag.minScore} onChange={(e) =>{  patch({ minScore: Number(e.target.value) }) }} />
          </label>
          <label className={lab.check}><input type="checkbox" checked={rag.includeOutdated} onChange={(e) =>{  patch({ includeOutdated: e.target.checked }) }} />Includi versioni superate</label>
          <label className={lab.check}><input type="checkbox" checked={rag.includeDistractors} onChange={(e) =>{  patch({ includeDistractors: e.target.checked }) }} />Includi documenti irrilevanti</label>
          <button className={`${lab.btn} ${lab.sm}`} onClick={() =>{  patch({ ...DEFAULT_RAG }) }}><RotateCcw size={14} aria-hidden /> Ripristina</button>
        </div>

        <ol className={styles.hits} aria-live="polite">
          <AnimatePresence initial={false}>
            {hits.map((h) => {
              const pinned = rag.pinnedChunkIds.includes(h.chunk.id)
              const excluded = rag.excludedChunkIds.includes(h.chunk.id)
              return (
                <motion.li key={h.chunk.id} layout={!reduce} className={`${styles.hit} ${h.status === 'excluded' ? styles.hitOut : ''}`}
                  initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                  <div className={styles.bar} role="img" aria-label={`Punteggio normalizzato ${(h.normalized * 100).toFixed(0)} su 100`}>
                    <motion.span className={styles.fill} initial={{ width: 0 }} animate={{ width: `${Math.max(2, h.normalized * 100)}%` }} transition={{ duration: reduce ? 0 : 0.5, ease: [0.22, 1, 0.36, 1] }} />
                  </div>
                  <div className={styles.hitBody}>
                    <div className={lab.row}>
                      <strong>{h.chunk.heading || h.doc.title}</strong>
                      <code className={lab.mono}>{h.doc.id}</code>
                      <Status doc={h.doc} />
                      <span className={`${lab.chip} ${h.status === 'selected' ? lab.chipOk : ''}`}>{h.status === 'selected' ? 'Selezionato' : 'Escluso'}</span>
                      <span className={`${lab.mono} ${lab.muted}`}>{h.normalized.toFixed(2)}</span>
                    </div>
                    {h.reason && <div className={lab.muted}>{EXCLUSION_LABEL[h.reason]}</div>}
                    <div className={styles.snippet}>{h.chunk.text}</div>
                  </div>
                  <div className={styles.hitActions}>
                    <button className={`${lab.btn} ${lab.sm} ${pinned ? lab.primary : ''}`} aria-pressed={pinned} onClick={() =>{  toggleList('pinnedChunkIds', 'excludedChunkIds', h.chunk.id) }}>
                      {pinned ? <PinOff size={14} aria-hidden /> : <Pin size={14} aria-hidden />}{pinned ? 'Sblocca' : 'Fissa'}
                    </button>
                    <button className={`${lab.btn} ${lab.sm} ${excluded ? lab.danger : ''}`} aria-pressed={excluded} onClick={() =>{  toggleList('excludedChunkIds', 'pinnedChunkIds', h.chunk.id) }}>
                      <Ban size={14} aria-hidden />{excluded ? 'Riammetti' : 'Escludi'}
                    </button>
                  </div>
                </motion.li>
              )
            })}
          </AnimatePresence>
          {hits.length === 0 && <li className={lab.muted}>Nessun frammento trovato per questa domanda.</li>}
        </ol>
      </section>

      <section className={lab.section} aria-labelledby="rag-add">
        <form className={lab.card} onSubmit={addDoc}>
          <h3 id="rag-add" className={lab.h3}><FilePlus2 size={20} aria-hidden /> Aggiungi un documento</h3>
          <label className={lab.label}>
            Titolo<input className={lab.input} value={title} onChange={(e) => { setTitle(e.target.value) }} />
          </label>
          <label className={lab.label}>Testo
            <textarea className={lab.textarea} value={text} onChange={(e) =>{  setText(e.target.value) }} />
          </label>
          <div className={lab.row}>
            <button className={`${lab.btn} ${lab.primary}`} type="submit" disabled={!title.trim() || !text.trim()}>Aggiungi</button>
            {docs.filter(d => d.userAdded).map(d => (
              <button key={d.id} type="button" className={`${lab.btn} ${lab.danger} ${lab.sm}`} onClick={() => { retriever.removeDocument(d.id); setVersion(v => v + 1) }}>
                <Trash2 size={14} aria-hidden /> Rimuovi {d.id}
              </button>
            ))}
          </div>
        </form>
      </section>

      <AnimatePresence>
        {reading && (
          <motion.div className={styles.reader} data-nested-dialog role="dialog" aria-modal="true" aria-label={reading.title} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setReading(null) } }}>
            <div className={styles.readerCard}>
              <div className={lab.spread}>
                <div className={lab.row}><code className={lab.mono}>{reading.id}</code><Status doc={reading} /></div>
                <button className={lab.btn} autoFocus onClick={() =>{  setReading(null) }} aria-label="Chiudi il documento"><X size={16} aria-hidden /></button>
              </div>
              <h3 className={lab.h2}>{reading.title}</h3>
              <p className={lab.muted}>{reading.category} · versione {reading.version}</p>
              <div className={styles.fullText}>{reading.text}</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
