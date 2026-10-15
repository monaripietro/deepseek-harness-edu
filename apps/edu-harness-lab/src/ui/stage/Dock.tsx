import { useEffect, useState } from 'react'
import { Activity, Layers, MessagesSquare } from 'lucide-react'
import { AgentTrace } from '../trace/AgentTrace'
import { ChatPanel } from '../chat/ChatPanel'
import { ContextInspector } from '../inspector/ContextInspector'
import { Dialog } from '../common/Dialog'
import { Tabs } from '../common/Tabs'
import type { TabDef } from '../common/Tabs'
import { onDockRequest } from './cards'
import styles from './Dock.module.css'

type DockTab = 'context' | 'trace' | 'conversation'

const TABS: TabDef<DockTab>[] = [
  { id: 'context', label: 'Cosa riceve il modello', icon: <Layers size={16} /> },
  { id: 'trace', label: 'Registro degli eventi', icon: <Activity size={16} /> },
  { id: 'conversation', label: 'Conversazione e verifiche', icon: <MessagesSquare size={16} /> },
]

/** Deep-dive panels (the exact prompt, the event log, the answers) in a large modal, so the map keeps the whole screen. */
export function Dock() {
  const [tab, setTab] = useState<DockTab>('context')
  const [open, setOpen] = useState(false)

  useEffect(
    () =>
      onDockRequest((t) => {
        setTab(t)
        setOpen(true)
      }),
    [],
  )

  if (!open) return null
  return (
    <Dialog label="Approfondimenti" onClose={() => setOpen(false)} width={1180}>
      <section className={styles.dock} aria-label="Approfondimenti">
        <div className={styles.head}>
          <h2 className={styles.title}>Approfondimenti</h2>
          <div className={styles.tabs}>
            <Tabs<DockTab> tabs={TABS} value={tab} onChange={setTab} ariaLabel="Scegli l'approfondimento" idBase="dock" />
          </div>
        </div>
        <div id="dock-panel" role="tabpanel" aria-labelledby={`dock-tab-${tab}`} className={styles.body} tabIndex={0}>
          <div className={styles.inner}>{tab === 'context' ? <ContextInspector /> : tab === 'trace' ? <AgentTrace /> : <ChatPanel />}</div>
        </div>
      </section>
    </Dialog>
  )
}
