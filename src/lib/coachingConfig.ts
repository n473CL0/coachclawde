/**
 * Every coaching number the app uses, in one place.
 *
 * ⚠️ THESE ARE STARTER VALUES. A qualified coach must review them before they
 * ship to athletes: minimum weeks per event, time-goal ambition thresholds,
 * zone percentages, taper lengths, deload cadence, check-in adjustments and
 * the healthy fat-loss rate. They come from docs/RUNNERS-AND-ATHLETES.md
 * (§3.5, §3.7, §4.3, §5.3), which marks them as defaults, not rules.
 *
 * Keep this module dependency-free and data-only so it's easy to audit.
 */

import type { Effort } from '../types'

/** Running events, by distance in metres. */
export const EVENT_METERS = {
  '5k': 5000,
  '10k': 10000,
  half: 21097.5,
  marathon: 42195,
} as const

/** How much an athlete is running now, in km a week (`ev.now`). */
export type RunVolume = 'none' | 'low' | 'mid' | 'high' | 'vhigh'

export const RUN_VOLUME_KM: Record<RunVolume, [number, number]> = {
  none: [0, 0],
  low: [0, 10],
  mid: [10, 25],
  high: [25, 50],
  vhigh: [50, 80],
}

/**
 * Minimum weeks of runway for an event from a starting volume. Below this,
 * Clawde says it's tight and plans to get round safely rather than chase a
 * time. (§3.5: half — not yet 16 · <10 km 12 · 10–25 km 8 · 25+ km 6;
 * marathon — <25 km 18 · 25–50 km 14 · 50+ km 12.)
 */
export const MIN_WEEKS: Partial<Record<'5k' | '10k' | 'half' | 'marathon', Record<RunVolume, number>>> = {
  '5k': { none: 8, low: 6, mid: 4, high: 4, vhigh: 4 },
  '10k': { none: 10, low: 8, mid: 6, high: 4, vhigh: 4 },
  half: { none: 16, low: 12, mid: 8, high: 6, vhigh: 6 },
  marathon: { none: 20, low: 18, mid: 18, high: 14, vhigh: 12 },
}

/**
 * Time-goal ambition: improvement needed (% of predicted time) per week of
 * runway. ≤ realistic → realistic; ≤ ambitious → a stretch; above → suggest
 * a stepping-stone target.
 */
export const AMBITION_PCT_PER_WEEK = { realistic: 0.5, ambitious: 1 } as const

/** Stepping-stone target: assume this much improvement per week of runway. */
export const STEPPING_STONE_PCT_PER_WEEK = 0.5

/** Healthy fat-loss rate, % of body weight per week. */
export const FAT_LOSS_PCT_PER_WEEK: [number, number] = [0.5, 1]

/**
 * Running effort zones as fractions of VDOT (Daniels–Gilbert). Easy is a
 * range: [faster bound, slower bound].
 */
export const ZONE_VDOT_FRACTION = {
  easy: [0.74, 0.65] as [number, number],
  steady: 0.76,
  marathon: 0.8,
  threshold: 0.88,
  interval: 0.98,
  repetition: 1.05,
} as const

/**
 * Fallback paces (seconds per km) when there's no recent result: only used to
 * size the workout strip and estimate durations, never shown as targets.
 */
export const DEFAULT_RUN_PACE_S_PER_KM: Record<Effort, number> = {
  recovery: 450,
  easy: 400,
  steady: 370,
  marathon: 350,
  threshold: 330,
  interval: 300,
  repetition: 285,
  sprint: 260,
}

/** Speed multipliers vs running, to estimate other modalities' durations. */
export const MODALITY_SPEED_FACTOR = { run: 1, row: 1.25, bike: 2.6, swim: 0.3, other: 1 } as const

/**
 * Effort words described by feel (RPE), for athletes with no measured zones
 * yet and for modalities without a pace (bike, other).
 */
export const EFFORT_FEEL: Record<Effort, { rpe: string; feel: string }> = {
  recovery: { rpe: 'RPE 2', feel: 'very easy, just keep moving' },
  easy: { rpe: 'RPE 3–4', feel: 'you can talk in full sentences' },
  steady: { rpe: 'RPE 5', feel: 'comfortable, a few words at a time' },
  marathon: { rpe: 'RPE 6', feel: 'controlled, short sentences' },
  threshold: { rpe: 'RPE 7', feel: 'comfortably hard, a few words' },
  interval: { rpe: 'RPE 8–9', feel: 'hard, can only say a word or two' },
  repetition: { rpe: 'RPE 9', feel: 'fast and relaxed, short and sharp' },
  sprint: { rpe: 'RPE 10', feel: 'flat out' },
}

/** Taper weeks before an event (§3.7). */
export const TAPER_WEEKS: Record<string, number> = {
  '5k': 1, '10k': 1, half: 2, marathon: 3, trail: 2, tri: 2, sportive: 1, hyrox: 1, other: 1,
}

/** Peak-phase length by total block length (weeks): ≥ 12 → 4, ≥ 8 → 2, else 1. */
export function peakWeeks(totalWeeks: number): number {
  return totalWeeks >= 12 ? 4 : totalWeeks >= 8 ? 2 : 1
}

/** Base phase share of the weeks left after peak and taper; build gets the rest. */
export const BASE_SHARE = 0.45

/** A deload every Nth week of base and build. */
export const DELOAD_EVERY_WEEKS = 4

/** Default block length when there's no date: 12 weeks (8 for sedentary beginners). */
export const DEFAULT_BLOCK_WEEKS = 12
export const BEGINNER_BLOCK_WEEKS = 8
/** Longest block a date can set; beyond this the athlete re-plans at a check-in. */
export const MAX_BLOCK_WEEKS = 30

/** Check-in C5: pace-zone nudge when target paces felt too easy / too hard. */
export const ZONE_OFFSET_PCT = { tooEasy: 2, tooHard: -3 } as const

/** Check-in C3: what "too easy" / "too hard" does to the next plan. */
export const INTENSITY_CALIBRATION = {
  tooEasy: 'Push intensity up a notch: RPE +1, loads +2.5–5%',
  tooHard: 'Ease off: RPE −1, loads −5%',
} as const

/** "Lighter week" from check-in C2b. */
export const LIGHTER_WEEK = 'Make this a lighter week: about 30% less volume, RPE ≤ 7'

/** Check-in budget (§4.3). */
export const CHECK_IN_MAX_QUESTIONS = 6

/** Weeks before an event when check-ins confirm it's still on (C6). */
export const EVENT_CONFIRM_WEEKS_OUT = 3
