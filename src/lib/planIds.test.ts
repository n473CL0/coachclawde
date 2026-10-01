import { describe, expect, it } from 'vitest'
import { scopePlansAndLogs, scopeSessionIds } from './planIds'
import type { LoggedSession, PlannedSession, WeekPlan } from '../types'

const session = (id: string, date: string): PlannedSession => ({
  id, date, dayOfWeek: 'Mon', type: 'weights', title: id, focus: '', estimatedMinutes: 45, intensity: 'moderate',
})
const plan = (week: string, sessions: PlannedSession[]): WeekPlan => ({
  id: `plan-${week}`, weekStartDate: week, availableDays: [], userNotes: '', createdAt: '', sessions,
})
const log = (plannedSessionId: string, weekPlanId: string, date: string): LoggedSession => ({
  id: `log-${date}`, plannedSessionId, weekPlanId, date, type: 'weights', title: '', focus: '', startedAt: '', status: 'complete',
})

describe('week-scoped session ids', () => {
  // The reported bug: last week's "session-mon-upper" was done; this week's
  // plan reused the id for today, so today's session looked done and vanished
  // from Home while the count said 1/2.
  const lastWeek = plan('2026-09-21', [session('session-mon-upper', '2026-09-21')])
  const thisWeek = plan('2026-09-28', [session('session-mon-upper', '2026-09-28'), session('session-tue-lower', '2026-09-29')])
  const oldLog = log('session-mon-upper', 'plan-2026-09-21', '2026-09-21')
  const { plans, logs } = scopePlansAndLogs([lastWeek, thisWeek], [oldLog])

  it('gives every week its own ids', () => {
    expect(plans[0].sessions[0].id).toBe('session-mon-upper--2026-09-21')
    expect(plans[1].sessions.map((s) => s.id)).toEqual(['session-mon-upper--2026-09-28', 'session-tue-lower--2026-09-28'])
  })

  it('keeps the old log on the old week, so this week shows 0 of 2 done', () => {
    expect(logs[0].plannedSessionId).toBe('session-mon-upper--2026-09-21')
    const done = plans[1].sessions.filter((s) => logs.some((l) => l.plannedSessionId === s.id && l.status === 'complete'))
    expect(done).toHaveLength(0)
  })

  it('re-links logs without a plan id by date', () => {
    const r = scopePlansAndLogs([thisWeek], [log('session-tue-lower', '', '2026-09-29')])
    expect(r.logs[0].plannedSessionId).toBe('session-tue-lower--2026-09-28')
  })

  it('is idempotent and leaves unrelated logs alone', () => {
    const again = scopePlansAndLogs(plans, logs)
    expect(again.plans).toEqual(plans)
    expect(again.logs).toBe(logs)
    const quick = log('unplanned-abc', '', '2026-09-28')
    expect(scopePlansAndLogs(plans, [quick]).logs[0]).toBe(quick)
  })

  it('de-duplicates ids within a week (e.g. a replan reusing a kept session’s id)', () => {
    const kept = session('session-mon-upper--2026-09-28', '2026-09-28')
    const merged = scopeSessionIds(plan('2026-09-28', [kept, session('session-mon-upper', '2026-09-28')]))
    expect(merged.sessions.map((s) => s.id)).toEqual(['session-mon-upper--2026-09-28', 'session-mon-upper--2026-09-28-2'])
  })
})
