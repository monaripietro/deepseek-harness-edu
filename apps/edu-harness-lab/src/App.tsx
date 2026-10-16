import { useEffect, useRef, useState } from 'react'
import { MotionConfig } from 'motion/react'
import { useLab } from './state/store'
import type { LevelId } from './domain/types'
import { TopBar } from './ui/shell/TopBar'
import { EngineStage } from './ui/stage/EngineStage'
import { Narration } from './ui/stage/Narration'
import { LevelRail } from './ui/stage/LevelRail'
import { Dock } from './ui/stage/Dock'
import { Welcome } from './ui/welcome/Welcome'
import { ModelSetup } from './ui/model/ModelSetup'
import { LabsDrawer } from './ui/labs/LabsDrawer'
import { ComparisonView } from './ui/compare/ComparisonView'
import { TeacherPanel } from './ui/teacher/TeacherPanel'
import { DataSettings } from './ui/settings/DataSettings'
import { ApprovalDialog } from './ui/approval/ApprovalDialog'
import { Maximize, MessageSquare, Minimize, PanelRightClose, PanelRightOpen, Play, Radio, Square, X } from 'lucide-react'
import { SCENARIOS } from './scenarios'
import { lastLevelOf } from './harness/levels'
import { Tabs, tabId } from './ui/common/Tabs'
import { RunPanel } from './ui/stage/RunPanel'
import { useStageUi } from './ui/stage/stageUi'
import styles from './App.module.css'

const DRAWER_KEY = 'harness-lab:drawer-width'
const DRAWER_DEFAULT = 480
const DRAWER_MIN = 340
const drawerMax = () => Math.max(DRAWER_MIN, Math.min(1100, Math.round(window.innerWidth * 0.7)))
const clampDrawer = (w: number) => Math.round(Math.min(drawerMax(), Math.max(DRAWER_MIN, w)))
function savedDrawerWidth() {
  try {
    const v = Number(localStorage.getItem(DRAWER_KEY))
    return v > 0 ? clampDrawer(v) : DRAWER_DEFAULT
  } catch {
    return DRAWER_DEFAULT
  }
}

function isShortcutControl(target: EventTarget | null) {
  return target instanceof HTMLElement && (target.isContentEditable || !!target.closest('input, textarea, select, button, a, [role="dialog"]'))
}

export function App() {
  const theme = useLab(s => s.theme)
  const presentation = useLab(s => s.presentation)
  const welcomeDone = useLab(s => s.welcomeDone)
  const finishWelcome = useLab(s => s.finishWelcome)
  const view = useLab(s => s.view)
  const pendingApproval = useLab(s => s.pendingApproval)
  const needsModel = useLab(s => s.needsModel)
  const [modelOpen, setModelOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [approvalDetails, setApprovalDetails] = useState(false)
  const [asideTab, setAsideTab] = useState<'run' | 'narration'>('run')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerW, setDrawerW] = useState(savedDrawerWidth)
  const [resizing, setResizing] = useState(false)
  const resizeFrom = useRef<{ x: number; w: number } | null>(null)
  const commitDrawer = (w: number) => {
    const next = clampDrawer(w)
    setDrawerW(next)
    try {
      localStorage.setItem(DRAWER_KEY, String(next))
    } catch {
      /* storage unavailable */
    }
  }
  const [focus, setFocus] = useState(false)
  const status = useLab(s => s.status)
  const draft = useStageUi(s => s.draft)
  const running = status === 'running' || status === 'awaitingApproval'
  const runRequest = () => {
    const s = useLab.getState()
    if (running) s.stop()
    else void s.send(draft ?? undefined)
  }

  // Full-screen map: hides the header and asks the browser for full screen when it can.
  const toggleFocus = () => {
    const next = !focus
    setFocus(next)
    try {
      if (next && document.fullscreenEnabled && !document.fullscreenElement) {
        void document.documentElement.requestFullscreen().catch(() => {})
      } else if (!next && document.fullscreenElement) {
        void document.exitFullscreen().catch(() => {})
      }
    } catch {
      // Full screen is optional: the header is hidden anyway.
    }
  }
  useEffect(() => {
    if (!focus) return
    const onFullscreen = () => {
      if (!document.fullscreenElement) setFocus(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || document.fullscreenElement || document.querySelector('[role="dialog"]')) return
      setFocus(false)
    }
    document.addEventListener('fullscreenchange', onFullscreen)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreen)
      window.removeEventListener('keydown', onKey)
    }
  }, [focus])

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'light') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', theme)
    root.setAttribute('data-presentation', String(presentation))
  }, [theme, presentation])

  useEffect(() => {
    setApprovalDetails(!!pendingApproval)
  }, [pendingApproval])

  // Nothing runs without a real model: a run attempt opens the model setup.
  useEffect(() => {
    if (needsModel) {
      setModelOpen(true)
      useLab.getState().dismissNeedsModel()
    }
  }, [needsModel])

  // Deep links for lessons: ?livello=5&vista=lab&tema=aula&avvia=1&regia=1&approva=auto
  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    if (![...q.keys()].length) return
    const s = useLab.getState()
    s.finishWelcome()
    const lingua = q.get('lingua')
    if (lingua === 'it' || lingua === 'en') s.setPromptLanguage(lingua)
    const scenario = q.get('scenario')
    if (scenario && SCENARIOS.some(item => item.id === scenario)) s.setScenario(scenario)
    const lvl = Number(q.get('livello'))
    if (Number.isInteger(lvl) && lvl >= 0 && lvl <= 9) s.setLevel(lvl as LevelId)
    const vista = q.get('vista')
    if (vista === 'lab' || vista === 'guided' || vista === 'compare') s.setView(vista)
    const tema = q.get('tema')
    if (tema === 'light' || tema === 'dark' || tema === 'aula') s.setTheme(tema)
    if (q.get('regia') === '1') s.setTeacherOpen(true)
    if (q.get('approva') === 'auto') s.updateConfig({ autoApprove: true })
    const vel = Number(q.get('velocita'))
    if (vel === 0.5 || vel === 1 || vel === 2 || vel === 4) s.setSpeed(vel)
    const lab = q.get('lab')
    if (lab === 'tools' || lab === 'rag' || lab === 'mcp' || lab === 'memory') s.openLab(lab)
    // ?modello=lfm-350m|qwen3-0.6b|lfm-1.2b|gemma4-e2b: the teacher's link is the explicit consent to download that model.
    const modello = q.get('modello')
    if (modello === 'scegli') setModelOpen(true)
    const loading =
      modello === 'lfm-350m' || modello === 'qwen3-0.6b' || modello === 'lfm-1.2b' || modello === 'gemma4-e2b' ? useLab.getState().loadModel(modello) : Promise.resolve()
    void loading.then(() => {
      if (q.get('esperimento') === '1') void useLab.getState().runExperiment()
      else if (q.get('avvia') === '1') void useLab.getState().send()
    })
  }, [])

  // Returning visitors: the model used last time restarts from the browser cache, without downloading anything.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('modello')) return
    void useLab.getState().resumeLastModel()
  }, [])

  // Global shortcuts: → / ← levels, Space pause, S step.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || isShortcutControl(e.target) || e.metaKey || e.ctrlKey || e.altKey) return
      const s = useLab.getState()
      const busy = s.status === 'running' || s.status === 'awaitingApproval'
      // The guided path of each scenario ends at its last useful level.
      const last = lastLevelOf(SCENARIOS.find(x => x.id === s.scenarioId))
      if (e.key === 'ArrowRight' && s.view === 'guided' && !busy && s.level < last) s.setLevel((s.level + 1) as LevelId)
      else if (e.key === 'ArrowLeft' && s.view === 'guided' && !busy && s.level > 0) s.setLevel((s.level - 1) as LevelId)
      else if (e.key === ' ' && busy) s.togglePause()
      else if ((e.key === 's' || e.key === 'S') && s.stepMode) s.step()
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () =>{  window.removeEventListener('keydown', onKey) }
  }, [])

  const showApprovalDialog = !!pendingApproval && (approvalDetails || view === 'compare')

  return (
    <MotionConfig reducedMotion="user">
      {!welcomeDone ? (
        <Welcome
          onStart={finishWelcome}
          onConfigureModel={() => {
            finishWelcome()
            setModelOpen(true)
          }}
        />
      ) : (
        <div className={styles.app}>
          {view === 'compare' ? (
            <>
              <TopBar onOpenModel={() =>{  setModelOpen(true) }} onOpenSettings={() =>{  setSettingsOpen(true) }} />
              <main className={styles.compare}>
                <ComparisonView />
              </main>
            </>
          ) : (
            <>
              <div className={`${styles.screen} ${presentation ? styles.presentationScreen : ''}`}>
                {!focus && <TopBar onOpenModel={() =>{  setModelOpen(true) }} onOpenSettings={() =>{  setSettingsOpen(true) }} />}
                {!focus && <LevelRail />}
                <main
                  className={[styles.engine, drawerOpen && styles.engineWithDrawer, resizing && styles.resizing, presentation && styles.presenting].filter(Boolean).join(' ')}
                  style={{ '--drawer-w': `${drawerW}px` } as React.CSSProperties}
                >
                  <div className={styles.stageWrap}>
                    <EngineStage onApprovalDetails={() =>{  setApprovalDetails(true) }} />
                    <div className={styles.stageActions}>
                      <button type="button" className={`${styles.stageAction} ${running ? styles.stopAction : styles.runAction}`} onClick={runRequest}>
                        {running ? <Square size={14} fill="currentColor" aria-hidden /> : <Play size={15} fill="currentColor" aria-hidden />}
                        <span>{running ? 'Ferma' : 'Avvia la richiesta'}</span>
                      </button>
                      <button
                        type="button"
                        className={`${styles.stageAction} ${focus ? styles.stageActionOn : ''}`}
                        aria-pressed={focus}
                        onClick={toggleFocus}
                        title={focus ? 'Esci dallo schermo intero (Esc)' : 'Mappa a schermo intero'}
                      >
                        {focus ? <Minimize size={16} aria-hidden /> : <Maximize size={16} aria-hidden />}
                        <span>{focus ? 'Esci' : 'Schermo intero'}</span>
                      </button>
                      <button
                        type="button"
                        className={`${styles.stageAction} ${drawerOpen ? styles.stageActionOn : ''}`}
                        aria-expanded={drawerOpen}
                        aria-controls="workspace-drawer"
                        onClick={() =>{  setDrawerOpen(open => !open) }}
                      >
                        {drawerOpen ? <PanelRightClose size={16} aria-hidden /> : <PanelRightOpen size={16} aria-hidden />}
                        <span>{drawerOpen ? 'Chiudi pannello' : 'Prova e racconto'}</span>
                      </button>
                    </div>
                  </div>
                  <aside id="workspace-drawer" className={styles.narrationWrap} aria-label="Prova e spiegazione" hidden={!drawerOpen}>
                    <div
                      className={styles.resizer}
                      role="separator"
                      aria-orientation="vertical"
                      aria-label="Larghezza del pannello: trascina o usa le frecce"
                      aria-valuemin={DRAWER_MIN}
                      aria-valuemax={drawerMax()}
                      aria-valuenow={drawerW}
                      tabIndex={0}
                      title="Trascina per allargare o restringere · doppio clic: larghezza iniziale"
                      onPointerDown={(e) => {
                        if (e.button !== 0) return
                        e.preventDefault()
                        e.currentTarget.setPointerCapture(e.pointerId)
                        resizeFrom.current = { x: e.clientX, w: drawerW }
                        setResizing(true)
                      }}
                      onPointerMove={(e) => {
                        const from = resizeFrom.current
                        if (from) setDrawerW(clampDrawer(from.w + (from.x - e.clientX)))
                      }}
                      onPointerUp={(e) => {
                        const from = resizeFrom.current
                        if (!from) return
                        resizeFrom.current = null
                        setResizing(false)
                        commitDrawer(from.w + (from.x - e.clientX))
                      }}
                      onPointerCancel={() => {
                        resizeFrom.current = null
                        setResizing(false)
                      }}
                      onDoubleClick={() =>{  commitDrawer(DRAWER_DEFAULT) }}
                      onKeyDown={(e) => {
                        const step = e.shiftKey ? 120 : 40
                        if (e.key === 'ArrowLeft') commitDrawer(drawerW + step)
                        else if (e.key === 'ArrowRight') commitDrawer(drawerW - step)
                        else if (e.key === 'Home') commitDrawer(drawerMax())
                        else if (e.key === 'End') commitDrawer(DRAWER_MIN)
                        else return
                        e.preventDefault()
                        e.stopPropagation()
                      }}
                    >
                      <span className={styles.resizerGrip} aria-hidden />
                    </div>
                    <div className={styles.sideTabs}>
                      <Tabs
                        tabs={[
                          { id: 'run', label: 'Prova', icon: <MessageSquare size={16} aria-hidden /> },
                          { id: 'narration', label: 'Cosa succede', icon: <Radio size={16} aria-hidden /> },
                        ]}
                        value={asideTab}
                        onChange={setAsideTab}
                        ariaLabel="Pannello del laboratorio"
                        idBase="workspace"
                      />
                      <button type="button" className={styles.drawerClose} onClick={() =>{  setDrawerOpen(false) }} aria-label="Chiudi il pannello" title="Chiudi il pannello">
                        <X size={18} aria-hidden />
                      </button>
                    </div>
                    <div id="workspace-panel" role="tabpanel" aria-labelledby={tabId('workspace', asideTab)} className={styles.sideBody}>
                      <div hidden={asideTab !== 'run'} className={styles.sidePane}><RunPanel /></div>
                      <div hidden={asideTab !== 'narration'} className={styles.sidePane}><Narration collapsed={false} /></div>
                    </div>
                  </aside>
                </main>
                <Dock />
              </div>
            </>
          )}
          <LabsDrawer />
          <TeacherPanel />
        </div>
      )}
      {modelOpen && <ModelSetup onClose={() =>{  setModelOpen(false) }} />}
      {settingsOpen && <DataSettings onClose={() =>{  setSettingsOpen(false) }} />}
      {showApprovalDialog && <ApprovalDialog />}
    </MotionConfig>
  )
}
