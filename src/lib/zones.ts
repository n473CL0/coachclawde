import type { CardioType, Effort, RecentResult } from '../types'
import { DEFAULT_RUN_PACE_S_PER_KM, EFFORT_FEEL, MODALITY_SPEED_FACTOR, ZONE_VDOT_FRACTION } from './coachingConfig'
import { formatClock } from './cardioUtils'

/**
 * Running effort zones from a recent result, using the Daniels–Gilbert
 * equations:
 *   VO₂(v)   = −4.60 + 0.182258·v + 0.000104·v²     (v in m/min)
 *   %max(t)  = 0.8 + 0.1894393·e^(−0.012778·t) + 0.2989558·e^(−0.1932605·t)   (t in min)
 *   VDOT     = VO₂(race speed) / %max(race time)
 * Each zone is the pace whose VO₂ is a fraction of VDOT (coachingConfig).
 * Riegel (T₂ = T₁·(D₂/D₁)^1.06) is exported as a cross-check.
 */

const vo2 = (v: number) => -4.6 + 0.182258 * v + 0.000104 * v * v
const fractionAt = (minutes: number) =>
  0.8 + 0.1894393 * Math.exp(-0.012778 * minutes) + 0.2989558 * Math.exp(-0.1932605 * minutes)

/** VDOT from a race or timed run. */
export function vdot(meters: number, seconds: number): number {
  const minutes = seconds / 60
  return vo2(meters / minutes) / fractionAt(minutes)
}

/** Speed (m/min) at which VO₂ equals `o2`. */
function speedForVo2(o2: number): number {
  const a = 0.000104, b = 0.182258, c = -4.6 - o2
  return (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a)
}

/** Seconds per km at `fraction` of VDOT. */
export function paceAtFraction(v: number, fraction: number): number {
  return 60000 / speedForVo2(v * fraction)
}

/** Predicted race time (s) for `meters` at a given VDOT (bisection). */
export function predictSeconds(meters: number, v: number): number {
  let lo = 60, hi = 60 * 60 * 12
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2
    if (vdot(meters, mid) > v) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

/** Riegel's endurance model, a cross-check on the VDOT prediction. */
export function riegelSeconds(fromMeters: number, fromSeconds: number, toMeters: number): number {
  return fromSeconds * Math.pow(toMeters / fromMeters, 1.06)
}

export interface RunZones {
  vdot: number
  /** Seconds per km. Easy is [faster, slower]. */
  easy: [number, number]
  steady: number
  marathon: number
  threshold: number
  interval: number
  repetition: number
}

/**
 * Pace zones from a result. `offsetPct` comes from check-ins (C5): +2 makes
 * every zone 2% faster, −3 makes them 3% slower.
 */
export function runZones(result: RecentResult, offsetPct = 0): RunZones {
  const v = vdot(result.meters, result.seconds)
  const k = 1 - offsetPct / 100
  const at = (f: number) => paceAtFraction(v, f) * k
  return {
    vdot: v,
    easy: [at(ZONE_VDOT_FRACTION.easy[0]), at(ZONE_VDOT_FRACTION.easy[1])],
    steady: at(ZONE_VDOT_FRACTION.steady),
    marathon: at(ZONE_VDOT_FRACTION.marathon),
    threshold: at(ZONE_VDOT_FRACTION.threshold),
    interval: at(ZONE_VDOT_FRACTION.interval),
    repetition: at(ZONE_VDOT_FRACTION.repetition),
  }
}

/** Single representative pace (s/km) for an effort; easy uses the middle of its range. */
export function zonePace(z: RunZones, effort: Effort): number | null {
  switch (effort) {
    case 'easy': return (z.easy[0] + z.easy[1]) / 2
    case 'recovery': return z.easy[1] * 1.08
    case 'steady': return z.steady
    case 'marathon': return z.marathon
    case 'threshold': return z.threshold
    case 'interval': return z.interval
    case 'repetition': return z.repetition
    case 'sprint': return z.repetition * 0.92
  }
}

export const formatPace = (secPerKm: number) => `${formatClock(secPerKm)}/km`

/** "easy 5:56–6:35/km · marathon 5:35 · threshold 5:10 · interval 4:45 · repetition 4:29" */
export function describeZones(z: RunZones): string {
  return [
    `easy ${formatClock(z.easy[0])}–${formatPace(z.easy[1])}`,
    `marathon ${formatClock(z.marathon)}`,
    `threshold ${formatClock(z.threshold)}`,
    `interval ${formatClock(z.interval)}`,
    `repetition ${formatClock(z.repetition)}`,
  ].join(' · ')
}

/** Human description of a distance in metres: "5K", "800 m", "21.1 km". */
export function describeDistance(meters: number): string {
  if (meters === 5000) return '5K'
  if (meters === 10000) return '10K'
  if (Math.abs(meters - 21097.5) < 1) return 'half marathon'
  if (Math.abs(meters - 42195) < 1) return 'marathon'
  if (meters < 1000) return `${Math.round(meters)} m`
  return `${+(meters / 1000).toFixed(1)} km`
}

/**
 * Estimated seconds to cover `meters` at `effort`, for strip widths and
 * duration estimates. Uses zones for running when known, else defaults.
 */
export function estimateSeconds(meters: number, effort: Effort, modality: CardioType, zones?: RunZones): number {
  const runPace = (modality === 'run' && zones ? zonePace(zones, effort) : null) ?? DEFAULT_RUN_PACE_S_PER_KM[effort]
  return (meters / 1000) * runPace / MODALITY_SPEED_FACTOR[modality]
}

/**
 * What the athlete aims for on a step, resolved for the chosen modality.
 * Running with zones → a pace (and the rep time for distance reps);
 * otherwise effort by feel (RPE). An explicit `target` wins.
 */
export function resolveTarget(
  effort: Effort,
  modality: CardioType,
  zones: RunZones | undefined,
  meters?: number,
): { primary: string; secondary?: string } {
  if (modality === 'run' && zones) {
    if (effort === 'easy') return { primary: `${formatClock(zones.easy[0])}–${formatPace(zones.easy[1])}` }
    if (effort === 'recovery') return { primary: 'Very easy', secondary: EFFORT_FEEL.recovery.feel }
    const pace = zonePace(zones, effort)!
    return {
      primary: formatPace(pace),
      secondary: meters ? `aim ≈ ${formatClock((meters / 1000) * pace)}` : undefined,
    }
  }
  const f = EFFORT_FEEL[effort]
  return { primary: f.rpe, secondary: f.feel }
}
