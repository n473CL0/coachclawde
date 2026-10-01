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
