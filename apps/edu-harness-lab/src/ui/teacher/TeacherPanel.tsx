import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, GraduationCap, GitCompare, Pause, Play, RotateCcw, StepForward, X } from 'lucide-react'
import type { ComponentId, FaultInjection } from '../../domain/types'
import { useLab } from '../../state/store'
import { COMPONENTS, COMPONENT_ORDER, LEVELS } from '../../harness/levels'
import styles from './TeacherPanel.module.css'

const FAULT_TOOLS = ['verifica_disponibilita', 'cerca_catalogo', 'leggi_budget']
const FAULT_KINDS: { key: 'timeout' | 'error' | 'empty'; label: string }[] = [
  { key: 'timeout', label: 'Timeout' },
  { key: 'error', label: 'Errore' },
  { key: 'empty', label: 'Risultato vuoto' },
]
const SHORTCUTS: [string, string][] = [['→', 'Livello successivo'], ['←', 'Livello precedente'], ['Spazio', 'Pausa / riprendi'], ['S', 'Un passo (modalità passo)'], ['Esc', 'Chiudi pannelli']]

export function TeacherPanel() {
  const s = useLab()
  const [collapsed, setCollapsed] = useState(false)
  if (!s.teacherOpen) return null

  const toggleFault = (kind: 'timeout' | 'error' | 'empty', tool: string) => {
    const cur = s.faults[kind]
    s.setFaults({ [kind]: cur.includes(tool) ? cur.filter(t => t !== tool) : [...cur, tool] } as Partial<FaultInjection>)
  }

  return (
    <AnimatePresence>
      <motion.aside key="teacher" className={styles.panel} role="complementary" aria-label="Regia docente"
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}>
        <header className={styles.head}>
          <h2 className={styles.title}><GraduationCap size={18} aria-hidden /> Regia docente</h2>
          <div className={styles.headBtns}>
            <button className={styles.icon} onClick={() => setCollapsed(!collapsed)} aria-expanded={!collapsed} aria-label={collapsed ? 'Espandi il pannello' : 'Comprimi il pannello'}>
              {collapsed ? <ChevronUp size={18} aria-hidden /> : <ChevronDown size={18} aria-hidden />}
            </button>
            <button className={styles.icon} onClick={() => s.setTeacherOpen(false)} aria-label="Chiudi la regia docente"><X size={18} aria-hidden /></button>
          </div>
        </header>
        {!collapsed && (
          <div className={styles.body}>
            <section>
              <h3 className={styles.h}>Livello</h3>
              <div className={styles.row}>
                <button className={styles.btn} onClick={s.prevLevel} disabled={s.level === 0} aria-label="Livello precedente"><ChevronLeft size={16} aria-hidden /></button>
                <select className={styles.select} value={s.level} aria-label="Vai al livello" onChange={e => s.setLevel(Number(e.target.value) as typeof s.level)}>
                  {LEVELS.map(l => <option key={l.id} value={l.id}>{l.id} · {l.title}</option>)}
                </select>
                <button className={styles.btn} onClick={s.nextLevel} disabled={s.level === 9} aria-label="Livello successivo"><ChevronRight size={16} aria-hidden /></button>
              </div>
            </section>

            <section>
              <h3 className={styles.h}>Componenti</h3>
              <div className={styles.chips}>
                {COMPONENT_ORDER.filter(c => c !== 'model').map((c: ComponentId) => (
                  <button key={c} className={`${styles.chip} ${s.config.components[c] ? styles.chipOn : ''}`} aria-pressed={s.config.components[c]}
                    style={{ ['--fam' as string]: `var(--c-${COMPONENTS[c].family})` }} onClick={() => s.toggleComponent(c)}>
                    {COMPONENTS[c].label}
                  </button>
                ))}
              </div>
            </section>

            <section>
              <h3 className={styles.h}>Ritmo</h3>
              <label className={styles.label}>Velocità: {s.speed.toLocaleString('it-IT')}×
                <input type="range" min={0.25} max={2} step={0.25} value={s.speed} onChange={e => s.setSpeed(Number(e.target.value))} />
              </label>
              <div className={styles.row}>
                <button className={styles.btn} onClick={s.togglePause} aria-pressed={s.paused}>
                  {s.paused ? <><Play size={14} aria-hidden /> Riprendi</> : <><Pause size={14} aria-hidden /> Pausa</>}
                </button>
                <label className={styles.check}><input type="checkbox" checked={s.stepMode} onChange={e => s.setStepMode(e.target.checked)} />Passo-passo</label>
                <button className={styles.btn} onClick={s.step} disabled={!s.stepMode}><StepForward size={14} aria-hidden /> Passo</button>
              </div>
            </section>

            <section>
              <h3 className={styles.h}>Guasti simulati</h3>
              <table className={styles.faults}>
                <thead><tr><th scope="col"><span className="visually-hidden">Strumento</span></th>{FAULT_KINDS.map(k => <th key={k.key} scope="col">{k.label}</th>)}</tr></thead>
                <tbody>
                  {FAULT_TOOLS.map(t => (
                    <tr key={t}>
                      <th scope="row"><code>{t}</code></th>
                      {FAULT_KINDS.map(k => (
                        <td key={k.key}><input type="checkbox" aria-label={`${k.label} su ${t}`} checked={s.faults[k.key].includes(t)} onChange={() => toggleFault(k.key, t)} /></td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <label className={styles.check}><input type="checkbox" checked={s.faults.invalidArgsOnce} onChange={e => s.setFaults({ invalidArgsOnce: e.target.checked })} />Argomenti non validi una volta</label>
              <label className={styles.check}><input type="checkbox" checked={s.faults.mcpDown} onChange={e => s.setFaults({ mcpDown: e.target.checked })} />Server MCP irraggiungibile</label>
            </section>

            <section>
              <h3 className={styles.h}>Approvazione</h3>
              <label className={styles.check}><input type="checkbox" checked={s.config.autoApprove} onChange={e => s.updateConfig({ autoApprove: e.target.checked })} />Approva automaticamente</label>
            </section>

            <div className={styles.row}>
              <button className={styles.btn} onClick={s.resetConversation}><RotateCcw size={14} aria-hidden /> Azzera lo scenario</button>
              <button className={styles.btn} onClick={() => s.setView('compare')}><GitCompare size={14} aria-hidden /> Apri il confronto</button>
            </div>

            <section>
              <h3 className={styles.h}>Scorciatoie</h3>
              <dl className={styles.keys}>
                {SHORTCUTS.map(([k, d]) => (<div key={k}><dt><kbd>{k}</kbd></dt><dd>{d}</dd></div>))}
              </dl>
            </section>
          </div>
        )}
      </motion.aside>
    </AnimatePresence>
  )
}
