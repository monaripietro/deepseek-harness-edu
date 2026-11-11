import { useEffect, useState } from 'react'
import { Activity, Layers, MessagesSquare } from 'lucide-react'
import { AgentTrace } from '../trace/AgentTrace'
import { ChatPanel } from '../chat/ChatPanel'
import { ContextInspector } from '../inspector/ContextInspector'
import { Dialog } from '../common/Dialog'
import { Tabs } from '../common/Tabs'
import type { TabDef } from '../common/Tabs'
import { useT } from '../../i18n'
import { onDockRequest } from './cards'
import styles from './Dock.module.css'

type DockTab = 'context' | 'trace' | 'conversation'

/** Deep-dive panels (the exact prompt, the event log, the answers) in a large modal, so the map keeps the whole screen. */
export function Dock() {
  const t = useT()
  const [tab, setTab] = useState<DockTab>('context')
  const [open, setOpen] = useState(false)

  const tabs: TabDef<DockTab>[] = [
    { id: 'context', label: t('Cosa riceve il modello', 'What the model receives'), icon: <Layers size={16} /> },
    { id: 'trace', label: t('Registro degli eventi', 'Event log'), icon: <Activity size={16} /> },
    { id: 'conversation', label: t('Conversazione e verifiche', 'Conversation and checks'), icon: <MessagesSquare size={16} /> },
  ]

  useEffect(
    () =>
      onDockRequest((requested) => {
        setTab(requested)
        setOpen(true)
      }),
    [],
  )

  if (!open) return null
  return (
    <Dialog label={t('Approfondimenti', 'Deep dive')} onClose={() =>{  setOpen(false) }} width={1180}>
      <section className={styles.dock} aria-label={t('Approfondimenti', 'Deep dive')}>
        <div className={styles.head}>
          <h2 className={styles.title}>{t('Approfondimenti', 'Deep dive')}</h2>
          <div className={styles.tabs}>
            <Tabs<DockTab>
              tabs={tabs}
              value={tab}
              onChange={setTab}
              ariaLabel={t("Scegli l'approfondimento", 'Choose a detail view')}
              idBase="dock"
            />
          </div>
        </div>
        <div id="dock-panel" role="tabpanel" aria-labelledby={`dock-tab-${tab}`} className={styles.body} tabIndex={0}>
          <div className={styles.inner}>{tab === 'context' ? <ContextInspector /> : tab === 'trace' ? <AgentTrace /> : <ChatPanel />}</div>
        </div>
      </section>
    </Dialog>
  )
}
