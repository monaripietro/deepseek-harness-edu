import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Clapperboard, Columns3, FlaskConical, GraduationCap, Layers, Microscope, Moon, Presentation, Route, Settings, Sun, X } from 'lucide-react'
import type { Theme, View } from '../../state/store'
import type { PromptLanguage } from '../../domain/types'
import { useLab } from '../../state/store'
import { SCENARIOS } from '../../scenarios'
import { useT } from '../../i18n'
import { scenarioText } from '../../i18nContent'
import { ModelStatusChip } from '../model/ModelStatusChip'
import { Button } from '../common/Button'
import { Segmented } from '../common/Segmented'
import { useDockTab } from '../stage/cards'
import { LangToggle } from './LangToggle'
import styles from './SideMenu.module.css'

const FOCUSABLE = 'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])'

/** "Creato da … in collaborazione con [E38]": shown in the top bar on wide screens and in the menu footer. */
export function Credits({ className }: { className?: string }) {
  const t = useT()
  return (
    <div className={className}>
      <span>
        {t('Creato da', 'Created by')} <a href="https://www.monaripietro.it/" target="_blank" rel="noreferrer">Pietro Monari</a>{' '}
        {t('in collaborazione con', 'in collaboration with')}
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
  const t = useT()
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
      <aside id={id} ref={ref} className={styles.drawer} role="dialog" aria-modal="true" aria-label={t('Menu', 'Menu')} tabIndex={-1}>
        <div className={styles.head}>
          <strong>{t('Menu', 'Menu')}</strong>
          <button
            type="button"
            className={styles.close}
            onClick={onClose}
            aria-label={t('Chiudi il menu', 'Close menu')}
            title={t('Chiudi il menu (Esc)', 'Close menu (Esc)')}
          >
            <X size={18} aria-hidden />
          </button>
        </div>

        <div className={styles.body}>
          <section className={styles.section} aria-labelledby={`${id}-lang`}>
            <h2 id={`${id}-lang`}>Lingua / Language</h2>
            <LangToggle className={styles.lang} />
          </section>

          <section className={styles.section} aria-labelledby={`${id}-view`}>
            <h2 id={`${id}-view`}>{t('Vista', 'View')}</h2>
            <Segmented<View>
              ariaLabel={t('Vista', 'View')}
              value={view}
              onChange={setView}
              options={[
                { value: 'guided', label: t('Percorso', 'Guided path'), icon: <Route size={16} /> },
                { value: 'lab', label: t('Laboratorio', 'Lab'), icon: <FlaskConical size={16} /> },
                { value: 'compare', label: t('Confronto', 'Compare'), icon: <Columns3 size={16} /> },
              ]}
            />
          </section>

          <section className={styles.section} aria-labelledby={`${id}-scenario`}>
            <h2 id={`${id}-scenario`}>{t('Scenario e lingua del modello', 'Scenario and model language')}</h2>
            <select
              className={styles.select}
              value={scenarioId}
              onChange={(e) => { setScenario(e.target.value) }}
              aria-label={t('Scenario', 'Scenario')}
              disabled={running}
            >
              {SCENARIOS.map(s => (
                <option key={s.id} value={s.id}>{scenarioText(s).shortTitle}</option>
              ))}
            </select>
            <Segmented<PromptLanguage>
              ariaLabel={t('Lingua del modello', 'Model language')}
              value={promptLanguage}
              onChange={setPromptLanguage}
              options={[
                { value: 'it', label: 'Italiano' },
                { value: 'en', label: 'English' },
              ]}
            />
            <p className={styles.note}>
              {t(
                'Richiesta, dati, documenti e risultati degli strumenti nella lingua scelta; anche la risposta. Può essere diversa dalla lingua dell’interfaccia.',
                'Request, data, documents and tool results in the chosen language; the answer too. It can differ from the interface language.',
              )}
            </p>
          </section>

          <section className={styles.section} aria-labelledby={`${id}-model`}>
            <h2 id={`${id}-model`}>{t('Modello', 'Model')}</h2>
            <div className={styles.model}>
              <ModelStatusChip onOpen={act(onOpenModel)} />
            </div>
          </section>

          <section className={styles.section} aria-labelledby={`${id}-labs`}>
            <h2 id={`${id}-labs`}>{t('Laboratori', 'Labs')}</h2>
            <Button
              size="sm"
              variant="ghost"
              className={styles.action}
              icon={<Microscope size={17} />}
              aria-label={t('Laboratori: strumenti, documenti, MCP, memoria', 'Labs: tools, documents, MCP, memory')}
              title={t('Laboratori: strumenti, documenti, MCP, memoria', 'Labs: tools, documents, MCP, memory')}
              onClick={act(() => { openLab('tools') })}
            >
              {t('Strumenti, documenti, MCP, memoria', 'Tools, documents, MCP, memory')}
            </Button>
          </section>

          <section className={styles.section} aria-labelledby={`${id}-teacher`}>
            <h2 id={`${id}-teacher`}>{t('Docente', 'Teacher')}</h2>
            <Button
              size="sm"
              variant="ghost"
              className={styles.action}
              icon={<Clapperboard size={17} />}
              active={teacherOpen}
              aria-pressed={teacherOpen}
              onClick={act(() => { setTeacherOpen(!teacherOpen) })}
            >
              {t('Regia docente', 'Teacher panel')}
            </Button>
          </section>

          <section className={styles.section} aria-labelledby={`${id}-look`}>
            <h2 id={`${id}-look`}>{t('Aspetto', 'Appearance')}</h2>
            <div className={styles.iconOnly}>
              <Segmented<Theme>
                ariaLabel={t('Tema', 'Theme')}
                value={theme}
                onChange={setTheme}
                options={[
                  { value: 'light', label: t('Tema chiaro', 'Light theme'), icon: <Sun size={16} /> },
                  { value: 'dark', label: t('Tema scuro', 'Dark theme'), icon: <Moon size={16} /> },
                  {
                    value: 'aula',
                    label: t('Tema aula (alto contrasto per proiettori)', 'Classroom theme (high contrast for projectors)'),
                    icon: <GraduationCap size={16} />,
                  },
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
              title={t('Modalità presentazione', 'Presentation mode')}
              onClick={act(() => { setPresentation(!presentation) })}
            >
              {t('Modalità presentazione', 'Presentation mode')}
            </Button>
          </section>

          <section className={styles.section} aria-labelledby={`${id}-deep`}>
            <h2 id={`${id}-deep`}>{t('Approfondisci', 'Go deeper')}</h2>
            <Button
              size="sm"
              variant="ghost"
              className={styles.action}
              icon={<Layers size={17} />}
              title={t(
                'Cosa riceve il modello, registro degli eventi, conversazione e verifiche',
                'What the model receives, event log, conversation and checks',
              )}
              onClick={act(() => { openDeepDive('context') })}
            >
              {t('Contesto, eventi e verifiche', 'Context, events and checks')}
            </Button>
          </section>

          <section className={styles.section} aria-labelledby={`${id}-data`}>
            <h2 id={`${id}-data`}>{t('Dati e impostazioni', 'Data and settings')}</h2>
            <Button
              size="sm"
              variant="ghost"
              className={styles.action}
              icon={<Settings size={17} />}
              aria-label={t('Impostazioni e dati locali', 'Settings and local data')}
              title={t('Impostazioni e dati locali', 'Settings and local data')}
              onClick={act(onOpenSettings)}
            >
              {t('Impostazioni e dati locali', 'Settings and local data')}
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
