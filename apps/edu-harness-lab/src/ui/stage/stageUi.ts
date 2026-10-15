import { create } from 'zustand'
import type { StageNodeId } from './geometry'

/** Which stage element is open in the detail panel (cards stay compact; details on click). */
interface StageUi {
  selected: StageNodeId | null
  select: (id: StageNodeId | null) => void
  toggle: (id: StageNodeId) => void
  /** Edited request text; null means "the scenario's question". */
  draft: string | null
  setDraft: (text: string | null) => void
}

export const useStageUi = create<StageUi>()((set, get) => ({
  selected: null,
  select: (selected) =>{  set({ selected }) },
  toggle: (id) =>{  set({ selected: get().selected === id ? null : id }) },
  draft: null,
  setDraft: (draft) =>{  set({ draft }) },
}))

/** Clicks on these elements must not open the detail panel. */
export const isInteractive = (target: EventTarget | null) =>
  target instanceof Element && target.closest('button, textarea, input, select, a, [data-no-select]') !== null
