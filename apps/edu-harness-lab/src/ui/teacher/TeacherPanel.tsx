import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, GraduationCap, GitCompare, Pause, Play, RotateCcw, StepForward, X } from 'lucide-react'
import type { ComponentId } from '../../domain/types'
import { useLab } from '../../state/store'
import { COMPONENTS, COMPONENT_ORDER, lastLevelOf, levelsFor } from '../../harness/levels'
import { getScenario } from '../../scenarios'
import { pick, uiLang, useT } from '../../i18n'
import type { Bi } from '../../i18n'
import { componentText, levelText } from '../../i18nContent'
import styles from './TeacherPanel.module.css'

const FAULT_TOOLS = ['verifica_disponibilita', 'cerca_catalogo', 'leggi_budget']
const FAULT_KINDS: { key: 'timeout' | 'error' | 'empty'; label: Bi }[] = [
  { key: 'timeout', label: ['Timeout', 'Timeout'] },
  { key: 'error', label: ['Errore', 'Error'] },
  { key: 'empty', label: ['Risultato vuoto', 'Empty result'] },
]
const SHORTCUTS: [Bi, Bi][] = [
  [['→', '→'], ['Livello successivo', 'Next level']],
  [['←', '←'], ['Livello precedente', 'Previous level']],
  [['Spazio', 'Space'], ['Pausa / riprendi', 'Pause / resume']],
  [['S', 'S'], ['Un evento avanti (Passo-passo)', 'One event forward (Step by step)']],
  [['Esc', 'Esc'], ['Chiudi pannelli', 'Close panels']],
]

const numberLocale = (): string => (uiLang() === 'en' ? 'en-GB' : 'it-IT')

export function TeacherPanel() {
  const t = useT()
  const s = useLab()
  const [collapsed, setCollapsed] = useState(false)
  if (!s.teacherOpen) return null
  // Only the levels the current scenario needs, as in the level rail.
  const scenario = getScenario(s.scenarioId, s.promptLanguage)

  const toggleFault = (kind: 'timeout' | 'error' | 'empty', tool: string) => {
    const cur = s.faults[kind]
    s.setFaults({ [kind]: cur.includes(tool) ? cur.filter(x => x !== tool) : [...cur, tool] })
  }

  return (
    <AnimatePresence>
      <motion.aside key="teacher" className={styles.panel} role="complementary" aria-label={t('Regia docente', 'Teacher panel')}
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}>
        <header className={styles.head}>
          <h2 className={styles.title}><GraduationCap size={18} aria-hidden /> {t('Regia docente', 'Teacher panel')}</h2>
          <div className={styles.headBtns}>
            <button className={styles.icon} onClick={() =>{  setCollapsed(!collapsed) }} aria-expanded={!collapsed} aria-label={collapsed ? t('Espandi il pannello', 'Expand the panel') : t('Comprimi il pannello', 'Collapse the panel')}>
              {collapsed ? <ChevronUp size={18} aria-hidden /> : <ChevronDown size={18} aria-hidden />}
            </button>
            <button className={styles.icon} onClick={() =>{  s.setTeacherOpen(false) }} aria-label={t('Chiudi la regia docente', 'Close the teacher panel')}><X size={18} aria-hidden /></button>
          </div>
        </header>
        {!collapsed && (
          <div className={styles.body}>
            <section>
              <h3 className={styles.h}>{t('Livello', 'Level')}</h3>
              <div className={styles.row}>
                <button className={styles.btn} onClick={s.prevLevel} disabled={s.level === 0} aria-label={t('Livello precedente', 'Previous level')}><ChevronLeft size={16} aria-hidden /></button>
                <select className={styles.select} value={s.level} aria-label={t('Vai al livello', 'Go to level')} onChange={(e) =>{  s.setLevel(Number(e.target.value) as typeof s.level) }}>
                  {levelsFor(scenario).map(l => <option key={l.id} value={l.id}>{l.id} · {levelText(l, s.scenarioId).title}</option>)}
                </select>
                <button className={styles.btn} onClick={s.nextLevel} disabled={s.level >= lastLevelOf(scenario)} aria-label={t('Livello successivo', 'Next level')}><ChevronRight size={16} aria-hidden /></button>
              </div>
            </section>

            <section>
              <h3 className={styles.h}>{t('Componenti', 'Components')}</h3>
              <div className={styles.chips}>
                {COMPONENT_ORDER.filter(c => c !== 'model').map((c: ComponentId) => (
                  <button key={c} className={`${styles.chip} ${s.config.components[c] ? styles.chipOn : ''}`} aria-pressed={s.config.components[c]}
                    style={{ ['--fam' as string]: `var(--c-${COMPONENTS[c].family})` }} onClick={() =>{  s.toggleComponent(c) }}>
                    {componentText(c).label}
                  </button>
                ))}
              </div>
            </section>

            <section>
              <h3 className={styles.h}>{t('Ritmo', 'Pace')}</h3>
              <label className={styles.label}>{t('Velocità:', 'Speed:')} {s.speed.toLocaleString(numberLocale())}×
                <input type="range" min={0.25} max={2} step={0.25} value={s.speed} onChange={(e) =>{  s.setSpeed(Number(e.target.value)) }} />
              </label>
              <div className={styles.row}>
                <button className={styles.btn} onClick={s.togglePause} aria-pressed={s.paused}>
                  {s.paused ? <><Play size={14} aria-hidden /> {t('Riprendi', 'Resume')}</> : <><Pause size={14} aria-hidden /> {t('Pausa', 'Pause')}</>}
                </button>
                <label className={styles.check}><input type="checkbox" checked={s.stepMode} onChange={(e) =>{  s.setStepMode(e.target.checked) }} />{t('Passo-passo', 'Step by step')}</label>
                <button className={styles.btn} onClick={s.step} disabled={!s.stepMode}><StepForward size={14} aria-hidden /> {t('Avanti', 'Next')}</button>
              </div>
            </section>

            <section>
              <h3 className={styles.h}>{t('Guasti simulati', 'Simulated faults')}</h3>
              <table className={styles.faults}>
                <thead><tr><th scope="col"><span className="visually-hidden">{t('Strumento', 'Tool')}</span></th>{FAULT_KINDS.map(k => <th key={k.key} scope="col">{pick(k.label)}</th>)}</tr></thead>
                <tbody>
                  {FAULT_TOOLS.map(tool => (
                    <tr key={tool}>
                      <th scope="row"><code>{tool}</code></th>
                      {FAULT_KINDS.map(k => (
                        <td key={k.key}><input type="checkbox" aria-label={`${pick(k.label)} ${t('su', 'on')} ${tool}`} checked={s.faults[k.key].includes(tool)} onChange={() =>{  toggleFault(k.key, tool) }} /></td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <label className={styles.check}><input type="checkbox" checked={s.faults.invalidArgsOnce} onChange={(e) =>{  s.setFaults({ invalidArgsOnce: e.target.checked }) }} />{t('Argomenti non validi una volta', 'Invalid arguments once')}</label>
              <label className={styles.check}><input type="checkbox" checked={s.faults.mcpDown} onChange={(e) =>{  s.setFaults({ mcpDown: e.target.checked }) }} />{t('Server MCP irraggiungibile', 'MCP server unreachable')}</label>
            </section>

            <section>
              <h3 className={styles.h}>{t('Approvazione', 'Approval')}</h3>
              <label className={styles.check}><input type="checkbox" checked={s.config.autoApprove} onChange={(e) =>{  s.updateConfig({ autoApprove: e.target.checked }) }} />{t('Approva automaticamente', 'Approve automatically')}</label>
            </section>

            <div className={styles.row}>
              <button className={styles.btn} onClick={s.resetConversation}>
                <RotateCcw size={14} aria-hidden /> {t('Azzera la conversazione', 'Reset the conversation')}
              </button>
              <button className={styles.btn} onClick={() =>{  s.setView('compare') }}><GitCompare size={14} aria-hidden /> {t('Apri il confronto', 'Open the comparison')}</button>
            </div>

            <section>
              <h3 className={styles.h}>{t('Scorciatoie', 'Shortcuts')}</h3>
              <dl className={styles.keys}>
                {SHORTCUTS.map(([k, d]) => (<div key={k[0]}><dt><kbd>{pick(k)}</kbd></dt><dd>{pick(d)}</dd></div>))}
              </dl>
            </section>
          </div>
        )}
      </motion.aside>
    </AnimatePresence>
  )
}
