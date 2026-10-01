import { describe, expect, it } from 'vitest'
import { homeInvitation, plannerInvitation, reviewedWeekStart, type TriggerState } from './checkInTriggers'
import { DEFAULT_PROFILE } from './profileData'
import { goalFromLegacyProfile } from './goalProfile'
import type { LoggedSession, UserProfile, WeekPlan } from '../types'

const base: UserProfile = { ...DEFAULT_PROFILE, onboarded: true, program: { ...DEFAULT_PROFILE.program!, startDate: '2026-09-14', lengthWeeks: 12 } }
const migrated: UserProfile = { ...base, goal: { ...goalFromLegacyProfile(base), migrated: true } }
const plan: WeekPlan = {
  id: 'p', weekStartDate: '2026-09-28', availableDays: [], userNotes: '', createdAt: '',
  sessions: ['a', 'b', 'c'].map((id, i) => ({ id, date: `2026-09-${28 + i}`, dayOfWeek: 'Mon', type: 'weights', title: id, focus: '', estimatedMinutes: 60, intensity: 'easy' })),
}
const done = (id: string, extra: Partial<LoggedSession> = {}): LoggedSession => ({
  id: `l-${id}`, plannedSessionId: id, weekPlanId: 'p', date: plan.sessions.find((s) => s.id === id)?.date ?? '2026-09-30',
  type: 'weights', title: id, focus: '', startedAt: '', status: 'complete', ...extra,
})
const st = (over: Partial<TriggerState> = {}): TriggerState => ({ profile: migrated, weekPlans: [plan], loggedSessions: [done('a'), done('b')], checkIns: [], dismissed: [], ...over })

describe('reviewedWeekStart', () => {
  it('is this week from Sunday 18:00, last week otherwise', () => {
    expect(reviewedWeekStart(new Date('2026-10-04T17:59:00'))).toBe('2026-09-21')
    expect(reviewedWeekStart(new Date('2026-10-04T18:00:00'))).toBe('2026-09-28')
    expect(reviewedWeekStart(new Date('2026-10-05T08:00:00'))).toBe('2026-09-28')
  })
})

describe('homeInvitation', () => {
  const monday = new Date('2026-10-05T08:00:00')

  it('offers a week-end check-in when sessions are outstanding', () => {
    expect(homeInvitation(st(), monday)).toMatchObject({ kind: 'week-end', key: 'week:2026-09-28', title: '2 of 3 done' })
  })

  it('stays quiet once dismissed, once checked in, or when the week was complete', () => {
    expect(homeInvitation(st({ dismissed: ['week:2026-09-28'] }), monday)).toBeNull()
    expect(homeInvitation(st({ checkIns: [{ id: 'x', weekStartDate: '2026-09-28', createdAt: '2026-10-01T00:00:00Z', trigger: 'week-complete', answers: {}, actions: [], summary: '' }] }), monday)).toBeNull()
    expect(homeInvitation(st({ loggedSessions: [done('a'), done('b'), done('c')] }), monday)).toBeNull()
  })

  it('respects "Don’t suggest check-ins"', () => {
    expect(homeInvitation(st({ profile: { ...migrated, goal: { ...migrated.goal!, checkInsOff: true } } }), monday)).toBeNull()
  })

  it('offers pre-v1.0.2 athletes the goal upgrade first', () => {
    expect(homeInvitation(st({ profile: base }), monday)?.kind).toBe('migration')
  })

  it('reacts to pain noted on two sessions', () => {
    const logs = [done('a', { date: '2026-10-02', painNotes: 'knee' }), done('b', { date: '2026-10-03', painNotes: 'knee again' })]
    expect(homeInvitation(st({ loggedSessions: logs }), monday)?.kind).toBe('reactive')
  })

  it('marks the block end as a milestone check-in instead of re-onboarding', () => {
    const ended = { ...migrated, program: { ...migrated.program!, startDate: '2026-06-01', lengthWeeks: 12 } }
    expect(homeInvitation(st({ profile: ended }), monday)).toMatchObject({ kind: 'milestone', key: 'milestone:block-end:2026-06-01' })
  })

  it('gives trackers who just track a weekly summary instead', () => {
    const tracker = { ...migrated, goal: { ...migrated.goal!, tracker: { source: 'coach' as const, intake: 'log' as const, involvement: 'silent' as const } } }
    expect(homeInvitation(st({ profile: tracker }), monday)).toMatchObject({ kind: 'summary', text: '2 sessions. Nice work.' })
  })
})

describe('plannerInvitation', () => {
  it('asks for a check-in first when last week has none', () => {
    expect(plannerInvitation(st(), '2026-10-05')).toBe('2026-09-28')
    expect(plannerInvitation(st({ dismissed: ['planner:2026-09-28'] }), '2026-10-05')).toBeNull()
    expect(plannerInvitation(st(), '2026-09-28')).toBeNull()
  })
})
