import { differenceInYears, format, formatDistanceToNow, isToday, isTomorrow, isPast, isThisWeek, isValid, parseISO } from 'date-fns'

/** True for a plausible date of birth: a real yyyy-mm-dd date from 1900 up to today. */
export function isValidBirthDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const d = parseISO(value)
  return isValid(d) && value >= '1900-01-01' && d <= new Date()
}

/** Whole years old on `now`, or undefined when there's no usable birth date. */
export function ageFromBirthDate(birthDate: string | undefined, now: Date = new Date()): number | undefined {
  if (!birthDate || !isValidBirthDate(birthDate)) return undefined
  return differenceInYears(now, parseISO(birthDate))
}

export function getWeekday(dateStr: string): string {
  const d = parseISO(dateStr)
  if (isToday(d)) return 'Today'
  if (isTomorrow(d)) return 'Tomorrow'
  return format(d, 'EEEE')
}

export function formatSessionDate(dateStr: string): string {
  return format(parseISO(dateStr), 'EEE dd MMM')
}

export function formatTime(dateStr: string): string {
  return format(parseISO(dateStr), 'h:mm a')
}

export function isSessionPast(dateStr: string): boolean {
  return isPast(parseISO(dateStr))
}

export function isThisWeekDate(dateStr: string): boolean {
  return isThisWeek(parseISO(dateStr), { weekStartsOn: 1 })
}

export function timeAgo(dateStr: string): string {
  return formatDistanceToNow(parseISO(dateStr), { addSuffix: true })
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

export function formatRestTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return s > 0 ? `${m}:${s.toString().padStart(2, '0')}` : `${m}:00`
}

export function secondsToDisplay(remaining: number): string {
  const m = Math.floor(remaining / 60)
  const s = remaining % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}
