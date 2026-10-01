import { describe, expect, it } from 'vitest'
import { buildWeekPlanPrompt, promptScope } from './promptBuilder'
import { profilePatchFromGoal, toGoalProfile } from './goalFlow'
import { DEFAULT_PROFILE } from './profileData'
import type { UserProfile } from '../types'
import type { FlowAnswers } from './flow'

const now = new Date('2026-10-01T12:00:00')
const monday = new Date('2026-10-05T00:00:00')

/** A brand-new athlete's prompt, straight from their onboarding answers. */
function promptFor(answers: FlowAnswers, extra: Partial<UserProfile> = {}): string {
  const patch = profilePatchFromGoal(toGoalProfile(answers, { now }), { now })
  const profile = { ...DEFAULT_PROFILE, dietaryNotes: [], onboarded: true, ...patch, ...extra } as UserProfile
  return buildWeekPlanPrompt(['Mon', 'Wed', 'Fri'], '', 60, undefined, monday, profile, [])
}

const gymLifter = promptFor({ why: 'strength', 'str.kind': 'lifts', lifting: '1y+', 'str.numbers': 'test', time: { days: '3', mins: '60' }, kit: ['gym'], health: ['ok'] })
const runnerNoStrength = promptFor({ why: 'event', 'ev.kind': '10k', 'ev.date': '2026-12-06', 'ev.aim': 'finish-strong', 'ev.now': 'mid', 'ev.result': 'none', time: { days: '3', mins: '45' }, kit: ['none'], health: ['ok'] })
const homeBodyweight = promptFor({ why: 'physique', 'phy.change': 'recomp', 'phy.date': 'none', lifting: 'none', time: { days: '3', mins: '30' }, kit: ['bodyweight'], health: ['ok'] })
const homeWeights = promptFor({ why: 'strength', 'str.kind': 'all-round', lifting: 'on-off', time: { days: '3', mins: '45' }, kit: ['home'], health: ['ok'] })
const rugby = promptFor({ why: 'sport', 'sp.sport': 'Rugby', 'sp.season': 'in', 'sp.fixed': { Sat: 'match' }, 'sp.want': ['power'], time: { days: '2', mins: '45' }, kit: ['gym'], health: ['ok'] })

describe('the plan prompt is tailored to the athlete', () => {
  it('never mentions cardio to someone who only goes to the gym', () => {
    for (const word of [/cardio/i, /run mode/i, /pace zone/i, /WorkoutItem/, /strides/i, /\bworkout\b/i, /\bruns?\b/i]) {
      expect(gymLifter).not.toMatch(word)
    }
    expect(gymLifter).toMatch(/You are an experienced strength coach/)
    // Every training day is a lifting day: no mobility sessions they didn't ask for.
    expect(gymLifter).toMatch(/Every session is `type: "weights"`/)
    expect(gymLifter).not.toMatch(/active-recovery/)
    expect(gymLifter).toMatch(/Build the main lifts/)
    expect(gymLifter).toMatch(/full gym/)
  })

  it('gives a runner with no strength work no lifting rules', () => {
    for (const word of [/superset/i, /suggestedWeightKg/, /ramp-up sets/i, /working weights/i, /"weights"/, /PlannedExercise/]) {
      expect(runnerNoStrength).not.toMatch(word)
    }
    expect(runnerNoStrength).toMatch(/You are an experienced running coach/)
    expect(runnerNoStrength).toMatch(/Cardio is a structured `workout`/)
    expect(runnerNoStrength).toMatch(/Every session is `type: "cardio"`/)
    expect(runnerNoStrength).toMatch(/Runs with: unknown \(assume phone only\)/)
  })

  it('holds home athletes to their equipment', () => {
    expect(homeBodyweight).toMatch(/Equipment — bodyweight only/)
    expect(homeWeights).toMatch(/Equipment — home only/)
    expect(homeWeights).not.toMatch(/full gym/)
    expect(gymLifter).not.toMatch(/Equipment — home only|bodyweight only/)
  })

  it('shapes strength work by the goal', () => {
    expect(homeBodyweight).toMatch(/Balanced physique/)
    expect(rugby).toMatch(/strength & conditioning coach for Rugby/)
    expect(rugby).toMatch(/Strength for my sport:\*\* Emphasise power/)
  })

  it('only mentions diet when there are dietary needs', () => {
    expect(gymLifter).not.toMatch(/dietary/i)
    const withDiet = promptFor({ why: 'strength', 'str.kind': 'all-round', lifting: 'none', time: { days: '3', mins: '45' }, kit: ['gym'], health: ['ok'] }, { dietaryNotes: ['Vegan'] })
    expect(withDiet).toMatch(/Respect my dietary needs\*\* \(Vegan\)/)
  })

  it('numbers the rules it includes without gaps', () => {
    for (const p of [gymLifter, runnerNoStrength, homeBodyweight, rugby]) {
      const nums = [...p.split('## Critical Programming Rules')[1].split('## Warm-up')[0].matchAll(/^(\d+)\. /gm)].map((m) => Number(m[1]))
      expect(nums).toEqual(nums.map((_, i) => i + 1))
    }
  })

  it('keeps everything for profiles that predate onboarding', () => {
    const s = promptScope({ ...DEFAULT_PROFILE, program: { ...DEFAULT_PROFILE.program!, exerciseTypes: [] } })
    expect(s.sessionTypes).toEqual(['weights', 'cardio', 'active-recovery'])
  })
})
