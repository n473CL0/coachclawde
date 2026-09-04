import { format, formatDistanceToNow, isToday, isTomorrow, isPast, isThisWeek, parseISO } from 'date-fns'

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
