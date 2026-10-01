import { describe, expect, it } from 'vitest'
import { buildWeekPlanPrompt } from './promptBuilder'
import { DEFAULT_PROFILE } from './profileData'
import type { UserProfile } from '../types'
import { goalFromLegacyProfile } from './goalProfile'

const monday = new Date('2026-10-05T00:00:00')

function prompt(profile: UserProfile) {
  return buildWeekPlanPrompt(['Mon', 'Thu'], '', 45, undefined, monday, profile, [])
}

describe('buildWeekPlanPrompt', () => {
  it('asks for structured workouts, not legacy intervals', () => {
    const p = prompt(DEFAULT_PROFILE)
    expect(p).toMatch(/workout\?: WorkoutItem\[\]/)
    expect(p).toMatch(/RepeatBlock \{/)
    expect(p).not.toMatch(/intervals\?: PlannedInterval/)
  })

  it('tells Claude to set reps by time until the athlete can measure distance', () => {
    expect(prompt(DEFAULT_PROFILE)).toMatch(/Runs with: unknown \(assume phone only\) → prescribe reps and runs by \*\*time\*\*/)
    const goal = { ...goalFromLegacyProfile(DEFAULT_PROFILE), constraints: { daysPerWeek: 3, sessionMinutes: 60, facilities: [], runsWith: ['watch' as const] } }
    expect(prompt({ ...DEFAULT_PROFILE, goal })).toMatch(/Runs with: a GPS watch → distance reps are fine/)
  })

  it('embeds pace zones from a recent result', () => {
    const base = goalFromLegacyProfile(DEFAULT_PROFILE)
    const goal = { ...base, starting: { ...base.starting, recentResult: { meters: 5000, seconds: 1470 } } }
    expect(prompt({ ...DEFAULT_PROFILE, goal })).toMatch(/Pace zones \(from 5K in 24:30, VDOT 39\.2\): easy 5:56–6:35\/km · marathon 5:35 · threshold 5:10/)
  })
})

describe('Goal section', () => {
  it('embeds the goal, the phase skeleton and the deload flag', async () => {
    const { toGoalProfile, profilePatchFromGoal } = await import('./goalFlow')
    const now = new Date('2026-10-01T12:00:00')
    const goal = toGoalProfile({
      why: 'event', 'ev.kind': 'half', 'ev.date': '2027-03-14', 'ev.aim': 'time:6300', 'ev.now': 'mid',
      'ev.result': { distance: '5000', time: '1470' }, time: { days: '4', mins: '60' }, kit: ['gym'], health: ['ok'],
    }, { now })
    const profile = { ...DEFAULT_PROFILE, ...profilePatchFromGoal(goal, { now }) } as UserProfile
    // Week 8 of the block: 2026-11-16.
    const p = buildWeekPlanPrompt(['Mon'], '', 60, undefined, new Date('2026-11-16T00:00:00'), profile, [])
    expect(p).toMatch(/## Goal\n- Half marathon on 2027-03-14 \(17 weeks from this week\)\. Aim: 1:45:00 \(current fitness predicts ~1:52:\d\d\)\./)
    expect(p).toMatch(/Week 8 of 24 · Phase: Base \(weeks 1–8\) → Build \(weeks 9–18\) → Peak \(weeks 19–22\) → Taper \(weeks 23–24\)\. This week: Base, deload week/)
  })
})
