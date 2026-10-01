import { addDays, parseISO } from 'date-fns'
import type { CheckIn, CheckInTrigger, LoggedSession, UserProfile, WeekPlan } from '../types'
import { getMonday, toLocalISODate } from './weekUtils'
import { getProgramProgress } from './programProgress'
import { weeksUntil } from './goalFlow'
import { EVENT_CONFIRM_WEEKS_OUT } from './coachingConfig'

/**
 * When a check-in is suggested (§4.2). Suggest, never force: at most one
 * invitation per week (milestones excepted), dismissing snoozes it until the
 * next trigger, and athletes can turn suggestions off. Pure, so it's tested.
 */

export interface TriggerState {
  profile: UserProfile
  weekPlans: WeekPlan[]
  loggedSessions: LoggedSession[]
  checkIns: CheckIn[]
  dismissed: string[]
}

export interface HomeInvitation {
  kind: 'migration' | 'milestone' | 'reactive' | 'week-end' | 'summary'
  trigger: CheckInTrigger
  /** Dismissal key. */
  key: string
  /** The week the check-in reviews. */
  weekStart: string
  title: string
  text: string
}

const iso = (d: Date) => toLocalISODate(d)

/**
 * The week a "week ended" check-in reviews: this week from Sunday 18:00,
 * otherwise last week.
 */
export function reviewedWeekStart(now: Date): string {
  const monday = getMonday(now)
  const sundayEvening = now.getDay() === 0 && now.getHours() >= 18
  return iso(sundayEvening ? monday : addDays(monday, -7))
}

/** Tracker athletes who didn't opt into check-ins get a weekly summary instead. */
export function wantsCheckIns(profile: UserProfile): boolean {
  const g = profile.goal
  if (g?.checkInsOff) return false
  if (g?.tracker && g.tracker.involvement !== 'check-ins') return false
  return true
}

/** Pre-v1.1 athletes are offered the three-question goal upgrade. */
export function needsMigration(profile: UserProfile): boolean {
  return !!profile.onboarded && (!profile.goal || (profile.goal.origin === 'legacy' && !profile.goal.migrated))
}

function completedIn(logs: LoggedSession[], from: string, to: string) {
  return logs.filter((s) => s.status === 'complete' && s.date >= from && s.date <= to)
}

/** The one card Home shows, if any, by priority. */
export function homeInvitation(st: TriggerState, now: Date): HomeInvitation | null {
  const { profile, weekPlans, loggedSessions, checkIns, dismissed } = st
  const off = (k: string) => dismissed.includes(k)
  const thisMonday = iso(getMonday(now))

  if (needsMigration(profile) && !off('migration')) {
    return {
      kind: 'migration', trigger: 'migration', key: 'migration', weekStart: thisMonday,
      title: 'Upgrade your goal',
      text: 'Three quick questions so your plans know what you’re working towards.',
    }
  }

  const rw = reviewedWeekStart(now)
  const rwEnd = iso(addDays(parseISO(rw), 6))

  if (!wantsCheckIns(profile)) {
    const g = profile.goal
    if (!g?.tracker || g.checkInsOff) return null
    const key = `summary:${rw}`
    const done = completedIn(loggedSessions, rw, rwEnd)
    if (!done.length || off(key)) return null
    const minutes = done.reduce((t, s) => t + (s.substitute?.minutes ?? minutesOf(s)), 0)
    return {
      kind: 'summary', trigger: 'week-end', key, weekStart: rw,
      title: 'Your week',
      text: `${done.length} session${done.length === 1 ? '' : 's'}${minutes ? ` · about ${minutes} min` : ''}. Nice work.`,
    }
  }

  const recent = checkIns.some((c) => c.createdAt >= addDays(now, -3).toISOString())

  // Milestones (not limited to one a week).
  const g = profile.goal
  const progress = getProgramProgress(profile, now)
  const today = iso(now)
  const milestones: [string, string, string][] = []
  if (g?.event?.date && g.pursuit === 'event') {
    const passed = g.event.date < today
    const resultLogged = checkIns.some((c) => c.actions.some((a) => a.kind === 'event-result'))
    const weeksOut = passed ? undefined : weeksUntil(g.event.date, now) - 1
    if (passed && !resultLogged) milestones.push([`milestone:after-event:${g.event.date}`, 'How did it go?', 'Tell me about race day and we’ll set up what’s next.'])
    else if (weeksOut === 0) milestones.push([`milestone:event-week:${g.event.date}`, 'Race week!', 'A quick check-in to set up a sharp, easy week.'])
    else if (weeksOut != null && weeksOut <= EVENT_CONFIRM_WEEKS_OUT) milestones.push([`milestone:event-3w:${g.event.date}`, `${weeksOut} weeks to go`, 'Quick check-in to make sure the taper fits.'])
  }
  if (progress.isComplete && profile.program?.startDate) {
    milestones.push([`milestone:block-end:${profile.program.startDate}`, 'Block complete! 🎉', 'A quick check-in, then we set up your next block. No need to start over.'])
  } else if (progress.length >= 6 && progress.week === Math.ceil(progress.length / 2) && profile.program?.startDate) {
    milestones.push([`milestone:midpoint:${profile.program.startDate}`, 'Halfway there', `Week ${progress.week} of ${progress.length}. Quick check-in on how it’s going?`])
  }
  const m = milestones.find(([k]) => !off(k))
  if (m && !recent) return { kind: 'milestone', trigger: 'milestone', key: m[0], weekStart: rw, title: m[1], text: m[2] }

  // Reactive: pain on 2+ sessions, or felt ≤ 2 twice, in the last 7 days.
  const last7 = completedIn(loggedSessions, iso(addDays(now, -7)), today)
  const pain = last7.filter((s) => s.painNotes?.trim()).length
  const low = last7.filter((s) => s.feelings != null && s.feelings <= 2).length
  const rKey = `reactive:${thisMonday}`
  if ((pain >= 2 || low >= 2) && !off(rKey) && !recent) {
    return {
      kind: 'reactive', trigger: 'reactive', key: rKey, weekStart: thisMonday,
      title: pain >= 2 ? 'Quick question' : 'Rough few days?',
      text: pain >= 2 ? 'You’ve noted pain a couple of times. One tap to tell me how it is.' : 'A couple of sessions felt tough. One tap and I’ll adjust.',
    }
  }

  // Week ended with sessions outstanding.
  const plan = weekPlans.find((p) => p.weekStartDate === rw)
  const wKey = `week:${rw}`
  if (plan && !checkIns.some((c) => c.weekStartDate === rw && c.trigger !== 'reactive') && !off(wKey)) {
    const doneIds = new Set(completedIn(loggedSessions, rw, rwEnd).map((s) => s.plannedSessionId))
    const done = plan.sessions.filter((s) => doneIds.has(s.id)).length
    if (done < plan.sessions.length) {
      return {
        kind: 'week-end', trigger: 'week-end', key: wKey, weekStart: rw,
        title: `${done} of ${plan.sessions.length} done`,
        text: 'Quick check-in? About a minute, and it shapes next week.',
      }
    }
  }
  return null
}

function minutesOf(s: LoggedSession): number {
  if (!s.completedAt || !s.startedAt) return 0
  const m = (new Date(s.completedAt).getTime() - new Date(s.startedAt).getTime()) / 60000
  return m > 0 && m < 300 ? Math.round(m) : 0
}

/** Planner step 0: the week before the planned week had a plan and no check-in. */
export function plannerInvitation(st: TriggerState, plannedWeekStart: string): string | null {
  if (!wantsCheckIns(st.profile)) return null
  const prev = iso(addDays(parseISO(plannedWeekStart), -7))
  if (!st.weekPlans.some((p) => p.weekStartDate === prev)) return null
  if (st.checkIns.some((c) => c.weekStartDate === prev && c.trigger !== 'reactive' && c.trigger !== 'migration')) return null
  if (st.dismissed.includes(`planner:${prev}`)) return null
  return prev
}
