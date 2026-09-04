import type { DayOfWeek } from '../types'

// Weekday labels indexed to match JS `Date.getDay()` (0 = Sunday … 6 = Saturday).
export const WEEK_DAYS: DayOfWeek[] = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// Same labels ordered Monday-first, matching the Mon–Sun training week that
// plans use (a plan's `weekStartDate` is its Monday). Use this for anything the
// athlete reads left-to-right, e.g. the day picker.
export const WEEK_DAYS_MON: DayOfWeek[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/**
 * Formats a Date as a local `YYYY-MM-DD` string.
 *
 * We intentionally avoid `Date.toISOString()`: it converts to UTC, which can
 * shift the date to the previous/next day in non-UTC timezones. Plan
 * `weekStartDate`s and session dates are written using local dates, so all
 * lookups and comparisons must use local dates too.
 */
export function toLocalISODate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Returns a new Date `n` days after `date` (n may be negative). */
export function addDays(date: Date, n: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}

/** Monday (local midnight) of the week containing `date`. */
export function getMonday(date: Date = new Date()): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  d.setHours(0, 0, 0, 0)
  return d
}

/** Monday (local midnight) of the week *after* the one containing `date`. */
export function getNextMonday(date: Date = new Date()): Date {
  return addDays(getMonday(date), 7)
}

/** Monday-based weekday index (Mon = 0 … Sun = 6) for a `Date.getDay()` value. */
function mondayIndex(jsDay: number): number {
  return (jsDay + 6) % 7
}

/**
 * Is `day` earlier in the current week than `today`? Such a day has already
 * passed and can therefore only be trained next week.
 */
export function isDayPastThisWeek(day: DayOfWeek, today: Date = new Date()): boolean {
  const dayIdx = mondayIndex(WEEK_DAYS.indexOf(day))
  const todayIdx = mondayIndex(today.getDay())
  return dayIdx < todayIdx
}

/**
 * Resolves the Monday the plan should target given the selected training days.
 *
 * If at least one selected day is today or later this week, the plan is for the
 * current week; otherwise it rolls to next week. Pass `forceNextWeek` when the
 * athlete has explicitly opted to plan ahead.
 */
export function resolveWeekStart(
  selectedDays: DayOfWeek[],
  today: Date = new Date(),
  forceNextWeek = false
): Date {
  if (forceNextWeek) return getNextMonday(today)
  const hasTrainableDayThisWeek = selectedDays.some((d) => !isDayPastThisWeek(d, today))
  return hasTrainableDayThisWeek || selectedDays.length === 0
    ? getMonday(today)
    : getNextMonday(today)
}
