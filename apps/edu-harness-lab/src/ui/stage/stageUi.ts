import { useMemo } from 'react'
import { create } from 'zustand'
import type { ComponentId } from '../../domain/types'
import { levelsFor } from '../../harness/levels'
import { SCENARIOS, requestFor } from '../../scenarios'
import { guideScenario } from '../../scenarios/guide'
import { useLab } from '../../state/store'
import type { StageState } from './deriveStage'
import { deriveStage, settleStage } from './deriveStage'
import type { StageNodeId } from './geometry'

/** Which stage element is open in the detail panel (cards stay compact; details on click). */
interface StageUi {
  selected: StageNodeId | null
  select: (id: StageNodeId | null) => void
  toggle: (id: StageNodeId) => void
  /** Edited request text; null means "the scenario's question". */
  draft: string | null
  /** The scenario request the draft was written against: a new scenario or language discards it. */
  draftFor: string | null
  setDraft: (text: string | null, forRequest?: string | null) => void
}

export const useStageUi = create<StageUi>()((set, get) => ({
  selected: null,
  select: (selected) =>{  set({ selected }) },
  toggle: (id) =>{  set({ selected: get().selected === id ? null : id }) },
  draft: null,
  draftFor: null,
  setDraft: (draft, draftFor = null) =>{  set({ draft, draftFor: draft === null ? null : draftFor }) },
}))

/** The scenario's default request in the current prompt language. */
function useScenarioRequest(): string {
  const scenarioId = useLab(s => s.scenarioId)
  const language = useLab(s => s.promptLanguage)
  const scenario = SCENARIOS.find(s => s.id === scenarioId) ?? guideScenario
  return requestFor(scenario.id, language) || scenario.request
}

/**
 * The request text shared by the map card, the "Prova" panel and the stage's run button, so they
 * always send the same thing. A draft written for another scenario or language is ignored.
 */
export function useRequestDraft() {
  const request = useScenarioRequest()
  const draft = useStageUi(s => s.draft)
  const draftFor = useStageUi(s => s.draftFor)
  const setDraft = useStageUi(s => s.setDraft)
  const text = draft !== null && draftFor === request ? draft : request
  return {
    text,
    request,
    edited: text !== request,
    setText: (next: string) =>{  setDraft(next === request ? null : next, request) },
    reset: () =>{  setDraft(null) },
  }
}

/** Components the current guided level adds (empty in the free lab and at the first level). */
export function useLevelAdds(): ComponentId[] {
  const view = useLab(s => s.view)
  const level = useLab(s => s.level)
  const scenarioId = useLab(s => s.scenarioId)
  return useMemo(() => {
    if (view !== 'guided' || level === 0) return []
    return levelsFor(SCENARIOS.find(s => s.id === scenarioId)).find(l => l.id === level)?.adds ?? []
  }, [view, level, scenarioId])
}

/** True while a run is in progress (including a pending approval). */
export function useBusy(): boolean {
  return useLab(s => s.status === 'running' || s.status === 'awaitingApproval')
}

/** The stage derived from the trace, settled when the store is no longer busy. */
export function useStage(): StageState {
  const events = useLab(s => s.events)
  const orchestrator = useLab(s => s.config.components.orchestrator)
  const busy = useBusy()
  return useMemo(() => settleStage(deriveStage(events, orchestrator), busy), [events, orchestrator, busy])
}

/** Clicks on controls inside a card must not toggle its detail panel. */
export const isInteractive = (target: EventTarget | null) =>
  target instanceof Element && target.closest('button, textarea, input, select, a, [data-no-select]') !== null
