import type { CardioType } from '../types'
import type { DistanceUnit } from './units'

/** Human label for a cardio modality. */
export function cardioLabel(type: CardioType): string {
  switch (type) {
    case 'run': return 'Run'
    case 'row': return 'Row'
    case 'bike': return 'Bike'
    case 'swim': return 'Swim'
    default: return 'Cardio'
  }
}

/** The unit the athlete enters distance in for a given modality: metres for row and swim, else km or mi. */
export function distanceUnit(type: CardioType, d: DistanceUnit = 'km'): DistanceUnit | 'm' {
  return type === 'row' || type === 'swim' ? 'm' : d
}

const METERS_PER: Record<DistanceUnit | 'm', number> = { m: 1, km: 1000, mi: 1609.344 }

/** Convert a distance entered in the modality's input unit into metres. */
export function distanceToMeters(type: CardioType, value: number, d: DistanceUnit = 'km'): number {
  return value * METERS_PER[distanceUnit(type, d)]
}

/** Convert metres back into the modality's input unit (for editing). */
export function metersToDistance(type: CardioType, meters: number, d: DistanceUnit = 'km'): number {
  return meters / METERS_PER[distanceUnit(type, d)]
}

function fmtPace(secondsPer: number): string {
  const total = Math.round(secondsPer)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

/**
 * Compute a display split/pace for a piece, using the conventional unit for the
 * modality: run → /km (or /mi), row → /500m, swim → /100m, bike → km/h (or mph).
 * Returns null when inputs are missing or non-positive.
 */
export function computeSplit(
  type: CardioType,
  meters: number | undefined,
  seconds: number | undefined,
  d: DistanceUnit = 'km',
): string | null {
  if (!meters || !seconds || meters <= 0 || seconds <= 0) return null
  const per = METERS_PER[d]
  switch (type) {
    case 'run':
    case 'other':
      return `${fmtPace(seconds / (meters / per))}/${d}`
    case 'row':
      return `${fmtPace(seconds / (meters / 500))}/500m`
    case 'swim':
      return `${fmtPace(seconds / (meters / 100))}/100m`
    case 'bike': {
      const speed = (meters / per) / (seconds / 3600)
      return `${speed.toFixed(1)} ${d === 'mi' ? 'mph' : 'km/h'}`
    }
  }
}

/** Best-guess a modality from free text (session title/focus/label). */
export function inferCardioType(text: string): CardioType {
  const t = text.toLowerCase()
  if (/\b(row|erg|rower|c2|concept2)\b/.test(t)) return 'row'
  if (/\b(bike|cycl|ride|spin|watt)\b/.test(t)) return 'bike'
  if (/\b(swim|pool|laps)\b/.test(t)) return 'swim'
  if (/\b(run|jog|tempo|track)\b/.test(t)) return 'run'
  return 'run'
}

/** Parse a "m:ss", "mm:ss" or "h:mm:ss" duration string into seconds. */
export function parseDurationToSeconds(t: string): number | null {
  const trimmed = t.trim()
  if (!trimmed) return null
  const parts = trimmed.split(':').map((p) => Number(p))
  if (parts.some((n) => Number.isNaN(n))) return null
  if (parts.length === 1) return parts[0]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  return null
}

/**
 * Parse a distance like "5km", "2000m", "800 m", "1.5 km" or "1 mile" into
 * metres. Returns null when there's no recognisable distance.
 */
export function parseDistanceToMeters(text: string | undefined): number | null {
  if (!text) return null
  const m = text.trim().toLowerCase().match(/^(\d+(?:\.\d+)?)\s*(km|k|m|metres|meters|mi|mile|miles)?$/)
  if (!m) return null
  const n = Number(m[1])
  if (!(n > 0)) return null
  switch (m[2]) {
    case 'km':
    case 'k':
      return Math.round(n * 1000)
    case 'mi':
    case 'mile':
    case 'miles':
      return Math.round(n * 1609.344)
    case undefined:
      // A bare number: under 100 is almost certainly km ("5"), else metres.
      return n < 100 ? Math.round(n * 1000) : Math.round(n)
    default:
      return Math.round(n)
  }
}

/** Seconds as "m:ss" (or "h:mm:ss" from an hour). */
export function formatClock(totalSeconds: number): string {
  const sec = Math.max(0, Math.round(totalSeconds))
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  return h
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`
}
