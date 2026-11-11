import { useId, useState } from 'react'
import { Menu } from 'lucide-react'
import { useLab } from '../../state/store'
import { SCENARIOS } from '../../scenarios'
import { useT } from '../../i18n'
import { scenarioText } from '../../i18nContent'
import { ModelStatusChip } from '../model/ModelStatusChip'
import { LevelRail } from '../stage/LevelRail'
import { Credits, SideMenu } from './SideMenu'
import { LangToggle } from './LangToggle'
import styles from './TopBar.module.css'

/** One slim bar: menu, brand, level stepper, scenario, model, language and credits. Everything else lives in the side menu. */
export function TopBar({ onOpenModel, onOpenSettings }: { onOpenModel: () => void; onOpenSettings: () => void }) {
  const t = useT()
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
        aria-label={t('Menu', 'Menu')}
        title={t('Menu', 'Menu')}
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
        <strong className={styles.brandName} title={t('Harness Lab · Dal modello all’agente', 'Harness Lab · From the model to the agent')}>
          Harness Lab
        </strong>
      </div>

      {view === 'guided' && <LevelRail part="stepper" />}

      <div className={styles.spacer} aria-hidden />

      <label className={styles.select}>
        <span className={styles.selectLabel}>{t('Scenario', 'Scenario')}</span>
        <select
          value={scenarioId}
          onChange={(e) => { setScenario(e.target.value) }}
          aria-label={t('Scenario', 'Scenario')}
          disabled={running}
        >
          {SCENARIOS.map(s => (
            <option key={s.id} value={s.id}>
              {scenarioText(s).shortTitle}
            </option>
          ))}
        </select>
      </label>

      <div className={styles.model}>
        <ModelStatusChip onOpen={onOpenModel} />
      </div>

      <LangToggle className={styles.lang} />

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
