import type { CardioType } from '../types'

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

/** The unit the athlete enters distance in for a given modality. */
export function distanceUnit(type: CardioType): 'km' | 'm' {
  return type === 'row' || type === 'swim' ? 'm' : 'km'
}

/** Convert a distance entered in the modality's input unit into metres. */
export function distanceToMeters(type: CardioType, value: number): number {
  return distanceUnit(type) === 'km' ? value * 1000 : value
}

/** Convert metres back into the modality's input unit (for editing). */
export function metersToDistance(type: CardioType, meters: number): number {
  return distanceUnit(type) === 'km' ? meters / 1000 : meters
}

function fmtPace(secondsPer: number): string {
  const total = Math.round(secondsPer)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

/**
 * Compute a display split/pace for a piece, using the conventional unit for the
 * modality: run → /km, row → /500m, swim → /100m, bike → km/h.
 * Returns null when inputs are missing or non-positive.
 */
export function computeSplit(
  type: CardioType,
  meters: number | undefined,
  seconds: number | undefined,
): string | null {
  if (!meters || !seconds || meters <= 0 || seconds <= 0) return null
  switch (type) {
    case 'run':
    case 'other':
      return `${fmtPace(seconds / (meters / 1000))}/km`
    case 'row':
      return `${fmtPace(seconds / (meters / 500))}/500m`
    case 'swim':
      return `${fmtPace(seconds / (meters / 100))}/100m`
    case 'bike': {
      const kmh = (meters / 1000) / (seconds / 3600)
      return `${kmh.toFixed(1)} km/h`
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
