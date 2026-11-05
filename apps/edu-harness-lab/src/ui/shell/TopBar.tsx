import { useId, useState } from 'react'
import { Menu } from 'lucide-react'
import { useLab } from '../../state/store'
import { SCENARIOS } from '../../scenarios'
import { ModelStatusChip } from '../model/ModelStatusChip'
import { LevelRail } from '../stage/LevelRail'
import { Credits, SideMenu } from './SideMenu'
import styles from './TopBar.module.css'

/** One slim bar: menu, brand, level stepper, scenario, model and credits. Everything else lives in the side menu. */
export function TopBar({ onOpenModel, onOpenSettings }: { onOpenModel: () => void; onOpenSettings: () => void }) {
  const view = useLab(s => s.view)
  const scenarioId = useLab(s => s.scenarioId)
  const setScenario = useLab(s => s.setScenario)
  const status = useLab(s => s.status)
  const running = status === 'running' || status === 'awaitingApproval'
  const menuId = useId()
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <header className={styles.bar}>
      <button
        type="button"
        className={styles.menuBtn}
        aria-label="Menu"
        title="Menu"
        aria-expanded={menuOpen}
        aria-controls={menuId}
        aria-haspopup="dialog"
        onClick={() => { setMenuOpen(open => !open) }}
      >
        <Menu size={20} aria-hidden />
      </button>

      <div className={styles.brand}>
        <span className={styles.logo} aria-hidden>
          <span className={styles.logoCore} />
        </span>
        <strong className={styles.brandName} title="Harness Lab · Dal modello all’agente">Harness Lab</strong>
      </div>

      {view === 'guided' && <LevelRail part="stepper" />}

      <div className={styles.spacer} aria-hidden />

      <label className={styles.select}>
        <span className={styles.selectLabel}>Scenario</span>
        <select value={scenarioId} onChange={(e) => { setScenario(e.target.value) }} aria-label="Scenario" disabled={running}>
          {SCENARIOS.map(s => (
            <option key={s.id} value={s.id}>
              {s.shortTitle}
            </option>
          ))}
        </select>
      </label>

      <div className={styles.model}>
        <ModelStatusChip onOpen={onOpenModel} />
      </div>

      <Credits className={styles.credits} />

      {menuOpen && (
        <SideMenu
          id={menuId}
          onClose={() => { setMenuOpen(false) }}
          onOpenModel={onOpenModel}
          onOpenSettings={onOpenSettings}
        />
      )}
    </header>
  )
}
