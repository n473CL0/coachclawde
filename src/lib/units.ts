/**
 * Display units. Everything is stored, synced and sent to Claude in metric
 * (kg, metres, /km, km/h); these helpers convert at the edges, for what the
 * athlete sees and types. Weight and distance are chosen separately.
 */
import { formatClock } from './cardioUtils'

export type WeightUnit = 'kg' | 'lb'
export type DistanceUnit = 'km' | 'mi'
export interface Units { weight: WeightUnit; distance: DistanceUnit }
export const METRIC: Units = { weight: 'kg', distance: 'km' }

export const KG_PER_LB = 0.45359237
export const M_PER_MI = 1609.344

const round = (n: number, dp: number) => +n.toFixed(dp)

/** kg → the display unit: kg as stored, lb to 0.1. */
export const toWeight = (kg: number, u: WeightUnit) => (u === 'lb' ? round(kg / KG_PER_LB, 1) : kg)
/** A weight typed in the display unit → kg, to 0.01 (enough to read back to the same 0.1 lb). */
export const fromWeight = (n: number, u: WeightUnit) => (u === 'lb' ? round(n * KG_PER_LB, 2) : n)
/** "22.5 kg" / "49.6 lb". */
export const formatWeight = (kg: number, u: WeightUnit) => `${toWeight(kg, u)} ${u}`

/** km → mi when imperial. */
export const toDistance = (km: number, u: DistanceUnit) => (u === 'mi' ? (km * 1000) / M_PER_MI : km)
export const fromDistance = (n: number, u: DistanceUnit) => (u === 'mi' ? (n * M_PER_MI) / 1000 : n)

const NUM = String.raw`(\d+(?:\.\d+)?)`
const RANGE = String.raw`(?:(\s?[–-]\s?)` + NUM + ')?'
const CLOCK = String.raw`(\d+:\d{2})`

function clockSeconds(t: string): number {
  const [m, s] = t.split(':').map(Number)
  return m * 60 + s
}

/**
 * Converts the metric units in a line of text (Claude's prescriptions, cues,
 * targets, and the app's own pace/distance strings) to the athlete's units:
 * "8 × 12kg" → "8 × 26.5 lb", "4:45–5:00/km" → "7:39–8:03/mi", "12 km/h" →
 * "7.5 mph", "10–25 km" → "6.2–15.5 mi". Metres ("400 m", "/500m") and race
 * names ("5K") stay as they are.
 */
export function localize(text: string, u: Units): string
export function localize(text: string | undefined, u: Units): string | undefined
export function localize(text: string | undefined, u: Units): string | undefined {
  if (!text) return text
  let out = text
  if (u.distance === 'mi') {
    const pace = (t: string) => formatClock(clockSeconds(t) * (M_PER_MI / 1000))
    const mi = (n: string) => String(round(toDistance(Number(n), 'mi'), 1))
    out = out
      .replace(new RegExp(String.raw`\b${CLOCK}(?:(\s?[–-]\s?)${CLOCK})?\s?/\s?km\b`, 'g'),
        (_, a, sep, b) => `${pace(a)}${b ? sep + pace(b) : ''}/mi`)
      .replace(new RegExp(String.raw`\b${NUM}${RANGE}\s?(?:km/h|kph)`, 'g'),
        (_, a, sep, b) => `${mi(a)}${b ? sep + mi(b) : ''} mph`)
      .replace(new RegExp(String.raw`\b${NUM}${RANGE}\s?(?:km|kilomet(?:re|er)s?)\b`, 'g'),
        (_, a, sep, b) => `${mi(a)}${b ? sep + mi(b) : ''} mi`)
  }
  if (u.weight === 'lb') {
    const lb = (n: string) => String(toWeight(Number(n), 'lb'))
    out = out.replace(new RegExp(String.raw`\b${NUM}${RANGE}\s?(?:kgs?|kilos?)\b`, 'g'),
      (_, a, sep, b) => `${lb(a)}${b ? sep + lb(b) : ''} lb`)
  }
  return out
}
