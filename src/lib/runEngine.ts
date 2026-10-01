import type { CardioType } from '../types'
import type { Earcon } from './audioCues'
import { expectedSeconds, type FlatStep } from './workout'
import type { RunZones } from './zones'

/**
 * Pure timing logic for Run Mode: which cues each step plays and when, and
 * how long a step lasts. The component schedules these on the audio clock
 * (lib/audioCues), so they fire on time even when JS timers are throttled.
 *
 * Cue design (§5.6, tones only for now):
 *   start of a step   → Go (rising) for work, Go-last on the final rep,
 *                       Recover (falling) for recoveries, a double tone otherwise
 *   halfway           → one soft tone, on timed work of 2 min or more
 *   10 s before a rep → a "heads up" double tone (end of a recovery)
 *   last 3 s          → countdown pips, then the next step's tone
 *   distance reps     → a reminder if no LAP after twice the expected time
 *   session end       → a chord
 */

export interface Cue {
  /** Seconds after the step starts. */
  at: number
  earcon: Earcon
  /** What it means, for the on-screen cue list and tests. */
  label: string
}

/** Seconds a time-ended step lasts (including any +30 s), or null when it ends on LAP. */
export function stepDuration(
  f: FlatStep,
  opts: { extraSeconds?: number; cycleElapsed?: number } = {},
): number | null {
  const extra = opts.extraSeconds ?? 0
  if (f.cycleSeconds) {
    // Send-off rest: whatever's left of the cycle (the cycle clock started
    // with the first step of the repetition).
    return Math.max(0, f.cycleSeconds - (opts.cycleElapsed ?? 0)) + extra
  }
  if (f.step.end.by === 'time') return f.step.end.seconds + extra
  return null
}

function isLastRep(f: FlatStep): boolean {
  return !!f.rep && f.rep.of > 1 && f.rep.index === f.rep.of && (!f.set || f.set.index === f.set.of)
}

/** The cues for one step. `duration` is null for LAP-ended steps. */
export function cuesForStep(
  f: FlatStep,
  next: FlatStep | undefined,
  duration: number | null,
  expected: number,
): Cue[] {
  const cues: Cue[] = []
  const role = f.step.role
  if (role === 'work') {
    cues.push(isLastRep(f) ? { at: 0, earcon: 'goLast', label: 'Go: last one' } : { at: 0, earcon: 'go', label: 'Go' })
  } else if (role === 'recover') {
    cues.push({ at: 0, earcon: 'recover', label: 'Recover' })
  } else {
    cues.push({ at: 0, earcon: 'start', label: role === 'cooldown' ? 'Cool-down' : role === 'warmup' ? 'Warm-up' : 'Steady' })
  }

  if (duration != null) {
    if (role === 'work' && duration >= 120) cues.push({ at: duration / 2, earcon: 'half', label: 'Halfway' })
    if (next?.step.role === 'work' && duration >= 20) cues.push({ at: duration - 10, earcon: 'headsUp', label: '10 seconds to the next rep' })
    if (next && duration >= 6) {
      for (const k of [3, 2, 1]) cues.push({ at: duration - k, earcon: 'pip', label: `${k}` })
    }
    if (!next) cues.push({ at: duration, earcon: 'done', label: 'Session complete' })
  } else if (f.step.end.by === 'distance') {
    cues.push({ at: Math.max(30, expected * 2), earcon: 'remind', label: 'Press LAP when you finish the rep' })
  }
  return cues.sort((a, b) => a.at - b.at)
}

export interface PlannedCue extends Cue {
  /** Which flat step it belongs to. */
  index: number
  /** Seconds from "now" (the moment of planning). */
  delay: number
}

/**
 * Every cue from the current step up to the next point where the athlete has
 * to act (a LAP) or the end of the session. Steps after a LAP-ended step
 * can't be timed yet, so planning stops there and resumes on LAP.
 *
 * `elapsed` is how far into the current step we are; cues already passed are
 * dropped. `cycleElapsed` is how far into the current send-off cycle.
 */
export function planCues(
  flat: FlatStep[],
  index: number,
  elapsed: number,
  ctx: { modality: CardioType; zones?: RunZones; extraSeconds?: number; cycleElapsed?: number },
): { cues: PlannedCue[]; throughIndex: number } {
  const cues: PlannedCue[] = []
  let offset = -elapsed
  // Seconds into the send-off cycle at the start of step i.
  let cycleAtStart = (ctx.cycleElapsed ?? elapsed) - elapsed
  let i = index
  for (; i < flat.length; i++) {
    const f = flat[i]
    if (f.cycleStart) cycleAtStart = 0
    const duration = stepDuration(f, {
      extraSeconds: i === index ? ctx.extraSeconds : 0,
      cycleElapsed: cycleAtStart,
    })
    const expected = expectedSeconds(f, ctx.modality, ctx.zones)
    for (const c of cuesForStep(f, flat[i + 1], duration, expected)) {
      const delay = offset + c.at
      // Keep a cue that's "now" (a step's start tone), drop ones already past.
      if (delay >= -0.05) cues.push({ ...c, index: i, delay: Math.max(0, delay) })
    }
    if (duration == null) break
    offset += duration
    cycleAtStart += duration
  }
  return { cues, throughIndex: Math.min(i, flat.length - 1) }
}
