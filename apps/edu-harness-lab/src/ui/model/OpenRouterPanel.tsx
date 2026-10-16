import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowRight, Brain, Check, Cloud, ExternalLink, KeyRound, Loader2, Search, ShieldCheck, Trash2 } from 'lucide-react'
import { useLab } from '../../state/store'
import { fetchOpenRouterModels } from '../../runtime/model/openrouter'
import type { RemoteModel } from '../../runtime/model/openrouter'
import { ThinkingControl } from './ThinkingControl'
import styles from './ModelSetup.module.css'

/** Well-known tool-capable models shown first when they are in the list. */
const SUGGESTED = ['gpt-4o-mini', 'gpt-4.1-mini', 'gemini-2.5-flash', 'claude-sonnet-4', 'claude-3.5-haiku', 'qwen3-32b', 'llama-3.3-70b', 'mistral-small']
const rank = (m: RemoteModel) => {
  const i = SUGGESTED.findIndex(k => m.id.includes(k))
  return i < 0 ? 99 : i
}
const price = (p: number) => (p === 0 ? 'gratis' : `$${p < 1 ? p.toFixed(2) : p.toFixed(1)}`)
const ctx = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n))

/**
 * A bigger model through OpenRouter: the user's key (encrypted on this browser, or only for this tab),
 * a tool-capable model from the public list and, for reasoning models, the reasoning effort.
 */
export function OpenRouterPanel({ onClose }: { onClose: () => void }) {
  const keyState = useLab(s => s.openRouterKey)
  const saveKey = useLab(s => s.saveOpenRouterKey)
  const forgetKey = useLab(s => s.forgetOpenRouterKey)
  const useModel = useLab(s => s.useOpenRouterModel)
  const info = useLab(s => s.modelInfo)
  const progress = useLab(s => s.loadProgress)
  const remote = useLab(s => s.remoteModel)
  const [draft, setDraft] = useState('')
  const [remember, setRemember] = useState(true)
  const [models, setModels] = useState<RemoteModel[] | null>(null)
  const [listError, setListError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<RemoteModel | null>(remote)
  const [confirmForget, setConfirmForget] = useState(false)

  useEffect(() => {
    void useLab.getState().refreshOpenRouterKey()
    const ctrl = new AbortController()
    fetchOpenRouterModels(ctrl.signal)
      .then((ms) =>{  setModels(ms.filter(m => m.tools)) })
      .catch((err: unknown) => {
        if (!ctrl.signal.aborted) setListError(err instanceof Error ? err.message : String(err))
      })
    return () =>{  ctrl.abort() }
  }, [])

  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (models ?? [])
      .filter(m => !q || m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q))
      .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))
      .slice(0, 60)
  }, [models, query])

  const active = info.profile === 'openrouter' && info.provenance.provenance === 'real'
  const busy = progress.phase === 'checking' && !active
  const failed = progress.phase === 'error' && useLab.getState().profile === 'openrouter'

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <p className={styles.kicker}>Modello in cloud</p>
        <h2 className={styles.title}>Usa un modello più grande</h2>
        <p className={styles.lead}>
          Con una chiave OpenRouter provi lo stesso harness con un modello grande. La richiesta esce dal browser: va a OpenRouter e al
          fornitore del modello.
        </p>
      </header>

      <section className={styles.orSection} aria-label="Chiave OpenRouter">
        <h3 className={styles.orTitle}>
          <KeyRound size={16} aria-hidden /> Chiave API
        </h3>
        {keyState.present ? (
          <div className={styles.orKeyRow}>
            <span className={styles.orKeyMasked}>{keyState.masked ?? '••••'}</span>
            <span className={styles.small}>{keyState.remembered ? 'cifrata su questo browser' : 'solo per questa scheda'}</span>
            <button
              type="button"
              className={`${styles.deleteLink} ${confirmForget ? styles.deleteConfirm : ''}`}
              onClick={() => {
                if (!confirmForget) {
                  setConfirmForget(true)
                  return
                }
                setConfirmForget(false)
                void forgetKey()
              }}
              onBlur={() =>{  setConfirmForget(false) }}
            >
              <Trash2 size={13} aria-hidden /> {confirmForget ? 'Conferma: dimentica la chiave' : 'Dimentica la chiave'}
            </button>
          </div>
        ) : (
          <form
            className={styles.orKeyForm}
            onSubmit={(e) => {
              e.preventDefault()
              if (!draft.trim()) return
              void saveKey(draft, remember).then(() =>{  setDraft('') })
            }}
          >
            <input
              className={styles.orInput}
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder="sk-or-v1-…"
              aria-label="Chiave API di OpenRouter"
              value={draft}
              onChange={(e) =>{  setDraft(e.target.value) }}
            />
            <label className={styles.orCheck}>
              <input type="checkbox" checked={remember} onChange={(e) =>{  setRemember(e.target.checked) }} /> Ricorda su questo browser (cifrata)
            </label>
            <button type="submit" className={styles.primary} disabled={!draft.trim()}>
              Salva chiave
            </button>
            <a className={styles.small} href="https://openrouter.ai/keys" target="_blank" rel="noreferrer">
              Crea una chiave su openrouter.ai <ExternalLink size={12} aria-hidden />
            </a>
          </form>
        )}
      </section>

      <section className={styles.orSection} aria-label="Modelli OpenRouter">
        <h3 className={styles.orTitle}>
          <Cloud size={16} aria-hidden /> Modello
          <span className={styles.small}>solo modelli che sanno usare gli strumenti</span>
        </h3>
        <label className={styles.orSearch}>
          <Search size={15} aria-hidden />
          <input placeholder="Cerca per nome (es. gemini, claude, qwen)…" aria-label="Cerca un modello" value={query} onChange={(e) =>{  setQuery(e.target.value) }} />
        </label>
        {listError ? (
          <p className={styles.small} role="alert">
            {listError}
          </p>
        ) : !models ? (
          <p className={styles.small}>
            <Loader2 size={14} className={styles.spin} aria-hidden /> Carico l’elenco dei modelli…
          </p>
        ) : (
          <ul className={styles.orList} role="radiogroup" aria-label="Scegli un modello OpenRouter">
            {list.map(m => (
              <li key={m.id}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={picked?.id === m.id}
                  className={`${styles.row} ${picked?.id === m.id ? styles.rowOn : ''}`}
                  onClick={() =>{  setPicked(m) }}
                >
                  <span className={styles.radio} aria-hidden />
                  <span className={styles.rowBody}>
                    <span className={styles.rowTitle}>
                      {m.name}
                      {rank(m) < 99 && <span className={styles.recommended}>Consigliato</span>}
                      {m.reasoning && (
                        <span className={styles.cachedBadge}>
                          <Brain size={11} aria-hidden /> ragiona
                        </span>
                      )}
                      {active && info.id === m.id && <span className={styles.recommended}>In uso</span>}
                    </span>
                    <span className={styles.rowMeta}>
                      {m.id} · contesto {ctx(m.contextLength)} · {price(m.promptPrice)} / {price(m.completionPrice)} per milione di token
                    </span>
                  </span>
                </button>
              </li>
            ))}
            {list.length === 0 && <li className={styles.small}>Nessun modello trovato.</li>}
          </ul>
        )}
      </section>

      {picked?.reasoning && <ThinkingControl note="Per i modelli che ragionano: più ragionamento costa più token e tempo." />}

      {failed && progress.message && (
        <p className={styles.small} role="alert">
          <AlertTriangle size={14} aria-hidden /> {progress.message}
        </p>
      )}

      <div className={styles.orActions}>
        {active && (
          <span className={styles.small}>
            <Check size={14} aria-hidden /> In uso: {info.label}
          </span>
        )}
        <button
          type="button"
          className={styles.primary}
          disabled={!keyState.present || !picked || busy}
          onClick={() => {
            if (!picked) return
            void useModel(picked).then(() => {
              if (useLab.getState().modelInfo.profile === 'openrouter') onClose()
            })
          }}
        >
          {busy ? 'Collego…' : picked ? `Usa ${picked.name}` : 'Scegli un modello'} <ArrowRight size={17} aria-hidden />
        </button>
      </div>

      <ul className={styles.essentials} aria-label="Privacy e chiave">
        <li>
          <ShieldCheck size={16} aria-hidden />
          <span>
            <strong>Chiave:</strong> cifrata con una chiave del browser non esportabile (non è mai salvata in chiaro e non compare nei
            registri). Come in ogni web app, uno script di questa pagina potrebbe comunque usarla: usa una chiave con un limite di spesa.
          </span>
        </li>
        <li>
          <AlertTriangle size={16} aria-hidden />
          <span>
            <strong>Dati:</strong> le richieste escono dal browser. Non inserire dati personali reali.
          </span>
        </li>
      </ul>
    </div>
  )
}
