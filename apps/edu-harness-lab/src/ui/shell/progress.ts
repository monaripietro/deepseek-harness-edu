import { create } from 'zustand'
import type { LevelId } from '../../domain/types'
import { useLab } from '../../state/store'

interface Progress {
  /** Highest guided level visited so far. You may enter any level up to highestReached + 1. */
  highestReached: number
  /** Levels at which at least one run has completed (unlocks the "termine tecnico" reveal). */
  completed: Record<number, boolean>
}

export const useProgress = create<Progress>()(() => ({ highestReached: 0, completed: {} }))

export const isUnlocked = (level: number, highest: number) => level <= highest + 1

let prevRuns = useLab.getState().runs.length
useLab.subscribe((s) => {
  const p = useProgress.getState()
  const patch: Partial<Progress> = {}
  if (s.level > p.highestReached) patch.highestReached = s.level
  if (s.runs.length > prevRuns) patch.completed = { ...p.completed, [s.level as LevelId]: true }
  if (s.runs.length === 0 && prevRuns > 0) patch.completed = {}
  prevRuns = s.runs.length
  if (Object.keys(patch).length) useProgress.setState(patch)
})
