import type { LoggedSession } from '../types'

export interface WeightPR {
  name: string
  weightKg: number
  reps: number
  date: string
}

export interface CardioPR {
  label: string
  time: string
  seconds: number
  date: string
}

/** Parse a "m:ss", "mm:ss" or "h:mm:ss" duration string into seconds. */
export function parseTimeToSeconds(t: string): number | null {
  const parts = t.trim().split(':').map((p) => Number(p))
  if (parts.some((n) => Number.isNaN(n))) return null
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  return null
}

/** Heaviest set logged per weights exercise, best first. */
export function computeWeightPRs(sessions: LoggedSession[]): WeightPR[] {
  const best = new Map<string, WeightPR>()
  for (const s of sessions) {
    for (const ex of s.loggedExercises ?? []) {
      for (const set of ex.sets) {
        if (!set.completed || !set.weightKg) continue
        const targetReps = Number(set.targetReps)
        const reps = set.actualReps ?? (Number.isNaN(targetReps) ? 0 : targetReps)
        const current = best.get(ex.name)
        if (!current || set.weightKg > current.weightKg ||
          (set.weightKg === current.weightKg && reps > current.reps)) {
          best.set(ex.name, { name: ex.name, weightKg: set.weightKg, reps, date: s.date })
        }
      }
    }
  }
  return [...best.values()].sort((a, b) => b.weightKg - a.weightKg)
}

/** Fastest recorded time per cardio interval label. */
export function computeCardioPRs(sessions: LoggedSession[]): CardioPR[] {
  const best = new Map<string, CardioPR>()
  for (const s of sessions) {
    for (const iv of s.loggedIntervals ?? []) {
      if (!iv.completed || !iv.actualTime) continue
      const seconds = parseTimeToSeconds(iv.actualTime)
      if (seconds == null) continue
      const current = best.get(iv.label)
      if (!current || seconds < current.seconds) {
        best.set(iv.label, { label: iv.label, time: iv.actualTime, seconds, date: s.date })
      }
    }
  }
  return [...best.values()].sort((a, b) => a.seconds - b.seconds)
}
