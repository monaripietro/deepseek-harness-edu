import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Clapperboard, Columns3, FlaskConical, GraduationCap, Layers, Microscope, Moon, Presentation, Route, Settings, Sun, X } from 'lucide-react'
import type { Theme, View } from '../../state/store'
import type { PromptLanguage } from '../../domain/types'
import { useLab } from '../../state/store'
import { SCENARIOS } from '../../scenarios'
import { ModelStatusChip } from '../model/ModelStatusChip'
import { Button } from '../common/Button'
import { Segmented } from '../common/Segmented'
import { useDockTab } from '../stage/cards'
import styles from './SideMenu.module.css'

const FOCUSABLE = 'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])'

/** "Creato da … in collaborazione con [E38]": shown in the top bar on wide screens and in the menu footer. */
export function Credits({ className }: { className?: string }) {
  return (
    <div className={className}>
      <span>
        Creato da <a href="https://www.monaripietro.it/" target="_blank" rel="noreferrer">Pietro Monari</a> in collaborazione con
      </span>
      <a className={styles.creditLogoLink} href="https://e38.it/" target="_blank" rel="noreferrer" aria-label="E38 S.r.l.">
        <img className={styles.creditLogo} src="/Logo%20e38_Tavola%20disegno%201%20copia.png" alt="" />
      </a>
    </div>
  )
}

export function SideMenu({
  id,
  onClose,
  onOpenModel,
  onOpenSettings,
}: {
  id: string
  onClose: () => void
  onOpenModel: () => void
  onOpenSettings: () => void
}) {
  const view = useLab(s => s.view)
  const setView = useLab(s => s.setView)
  const scenarioId = useLab(s => s.scenarioId)
  const setScenario = useLab(s => s.setScenario)
  const status = useLab(s => s.status)
  const promptLanguage = useLab(s => s.promptLanguage)
  const setPromptLanguage = useLab(s => s.setPromptLanguage)
  const openLab = useLab(s => s.openLab)
  const teacherOpen = useLab(s => s.teacherOpen)
  const setTeacherOpen = useLab(s => s.setTeacherOpen)
  const theme = useLab(s => s.theme)
  const setTheme = useLab(s => s.setTheme)
  const presentation = useLab(s => s.presentation)
  const setPresentation = useLab(s => s.setPresentation)
  const openDeepDive = useDockTab()
  const running = status === 'running' || status === 'awaitingApproval'
  const ref = useRef<HTMLElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  // Focus trap, Esc to close, focus restored to the opener.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const previous = document.activeElement as HTMLElement | null
    const items = () =>
      Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(n => n.offsetParent !== null || n === document.activeElement)
    items()[0]?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        closeRef.current()
        return
      }
      if (e.key !== 'Tab') return
      const list = items()
      const first = list[0]
      const last = list.at(-1)
      if (!first || !last) return
      const active = document.activeElement
      if (e.shiftKey && (active === first || !el.contains(active))) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (active === last || !el.contains(active))) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      previous?.focus?.()
    }
  }, [])

  const act = (fn: () => void) => () => {
    fn()
    onClose()
  }

  return createPortal(
    <div className={styles.root}>
      <div className={styles.scrim} onPointerDown={onClose} aria-hidden />
      <aside id={id} ref={ref} className={styles.drawer} role="dialog" aria-modal="true" aria-label="Menu" tabIndex={-1}>
        <div className={styles.head}>
          <strong>Menu</strong>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Chiudi il menu" title="Chiudi il menu (Esc)">
            <X size={18} aria-hidden />
          </button>
        </div>

        <div className={styles.body}>
          <section className={styles.section} aria-labelledby={`${id}-view`}>
            <h2 id={`${id}-view`}>Vista</h2>
            <Segmented<View>
              ariaLabel="Vista"
              value={view}
              onChange={setView}
              options={[
                { value: 'guided', label: 'Percorso', icon: <Route size={16} /> },
                { value: 'lab', label: 'Laboratorio', icon: <FlaskConical size={16} /> },
                { value: 'compare', label: 'Confronto', icon: <Columns3 size={16} /> },
              ]}
            />
          </section>

          <section className={styles.section} aria-labelledby={`${id}-scenario`}>
            <h2 id={`${id}-scenario`}>Scenario e lingua</h2>
            <select
              className={styles.select}
              value={scenarioId}
              onChange={(e) => { setScenario(e.target.value) }}
              aria-label="Scenario"
              disabled={running}
            >
              {SCENARIOS.map(s => (
                <option key={s.id} value={s.id}>{s.shortTitle}</option>
              ))}
            </select>
            <Segmented<PromptLanguage>
              ariaLabel="Lingua di ciò che legge il modello"
              value={promptLanguage}
              onChange={setPromptLanguage}
              options={[
                { value: 'it', label: 'Italiano' },
                { value: 'en', label: 'English' },
              ]}
            />
            <p className={styles.note}>
              Richiesta, dati, documenti e risultati degli strumenti nella lingua scelta; anche la risposta.
              L’interfaccia resta in italiano.
            </p>
          </section>

          <section className={styles.section} aria-labelledby={`${id}-model`}>
            <h2 id={`${id}-model`}>Modello</h2>
            <div className={styles.model}>
              <ModelStatusChip onOpen={act(onOpenModel)} />
            </div>
          </section>

          <section className={styles.section} aria-labelledby={`${id}-labs`}>
            <h2 id={`${id}-labs`}>Laboratori</h2>
            <Button
              size="sm"
              variant="ghost"
              className={styles.action}
              icon={<Microscope size={17} />}
              aria-label="Laboratori: strumenti, documenti, MCP, memoria"
              title="Laboratori: strumenti, documenti, MCP, memoria"
              onClick={act(() => { openLab('tools') })}
            >
              Strumenti, documenti, MCP, memoria
            </Button>
          </section>

          <section className={styles.section} aria-labelledby={`${id}-teacher`}>
            <h2 id={`${id}-teacher`}>Docente</h2>
            <Button
              size="sm"
              variant="ghost"
              className={styles.action}
              icon={<Clapperboard size={17} />}
              active={teacherOpen}
              aria-pressed={teacherOpen}
              onClick={act(() => { setTeacherOpen(!teacherOpen) })}
            >
              Regia docente
            </Button>
          </section>

          <section className={styles.section} aria-labelledby={`${id}-look`}>
            <h2 id={`${id}-look`}>Aspetto</h2>
            <div className={styles.iconOnly}>
              <Segmented<Theme>
                ariaLabel="Tema"
                value={theme}
                onChange={setTheme}
                options={[
                  { value: 'light', label: 'Tema chiaro', icon: <Sun size={16} /> },
                  { value: 'dark', label: 'Tema scuro', icon: <Moon size={16} /> },
                  { value: 'aula', label: 'Tema aula (alto contrasto per proiettori)', icon: <GraduationCap size={16} /> },
                ]}
              />
            </div>
            <Button
              size="sm"
              variant="ghost"
              className={styles.action}
              icon={<Presentation size={17} />}
              active={presentation}
              aria-pressed={presentation}
              title="Modalità presentazione"
              onClick={act(() => { setPresentation(!presentation) })}
            >
              Modalità presentazione
            </Button>
          </section>

          <section className={styles.section} aria-labelledby={`${id}-deep`}>
            <h2 id={`${id}-deep`}>Approfondisci</h2>
            <Button
              size="sm"
              variant="ghost"
              className={styles.action}
              icon={<Layers size={17} />}
              title="Cosa riceve il modello, registro degli eventi, conversazione e verifiche"
              onClick={act(() => { openDeepDive('context') })}
            >
              Contesto, eventi e verifiche
            </Button>
          </section>

          <section className={styles.section} aria-labelledby={`${id}-data`}>
            <h2 id={`${id}-data`}>Dati e impostazioni</h2>
            <Button
              size="sm"
              variant="ghost"
              className={styles.action}
              icon={<Settings size={17} />}
              aria-label="Impostazioni e dati locali"
              title="Impostazioni e dati locali"
              onClick={act(onOpenSettings)}
            >
              Impostazioni e dati locali
            </Button>
          </section>
        </div>

        <footer className={styles.footer}>
          <Credits className={styles.credits} />
        </footer>
      </aside>
    </div>,
    document.body,
  )
}
