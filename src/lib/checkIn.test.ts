import { describe, expect, it } from 'vitest'
import { enumeratePaths, END, walk } from './flow'
import {
  DISPLAY_ORDER, applyCheckIn, buildCheckIn, buildCheckInFlow, checkInActions, checkInForPlanning, computeFacts,
  injuryLabel, overBudget, plannerPrefill, qualifies, selectQuestions, type CheckInFacts,
} from './checkIn'
import { CHECK_IN_MAX_QUESTIONS } from './coachingConfig'
import { DEFAULT_PROFILE } from './profileData'
import { goalFromLegacyProfile } from './goalProfile'
import type { CheckIn, LoggedSession, UserProfile, WeekPlan } from '../types'

const now = new Date('2026-10-05T09:00:00') // Monday after the reviewed week

function facts(over: Partial<CheckInFacts> = {}): CheckInFacts {
  return { weekStart: '2026-09-28', trigger: 'week-end', number: 1, planned: 4, done: 4, sessionMinutes: 60, goalStatement: 'Half marathon', ...over }
}

/** A spread of weeks: every rule switched on and off. */
function scenarios(): CheckInFacts[] {
  const out: CheckInFacts[] = []
  for (const done of [0, 2, 4]) {
    for (const injury of [undefined, { label: 'left knee', line: 'Left knee aches', fromPainNote: false }]) {
      for (const paced of [undefined, 'Intervals']) {
        for (const number of [1, 2, 3, 4, 8]) {
          for (const event of [undefined, { name: 'half marathon', date: '2026-10-18', weeksOut: 2, passed: false, resultLogged: false }, { name: 'half marathon', date: '2026-10-04', passed: true, resultLogged: false }]) {
            out.push(facts({
              done, injury, pacedSession: paced, number, event,
              milestone: event?.passed ? 'after-event' : undefined,
              deferred: number <= 2 ? 'runs-with' : undefined,
            }))
          }
        }
      }
    }
  }
  return out
}

describe('check-in budget', () => {
  it('never asks more than six questions, whatever the week and the answers', () => {
    let maxSeen = 0
    for (const f of scenarios()) {
      for (const path of enumeratePaths(buildCheckInFlow(f))) {
        expect(path.length).toBeLessThanOrEqual(CHECK_IN_MAX_QUESTIONS)
        maxSeen = Math.max(maxSeen, path.length)
      }
    }
    // The budget is actually reached in the busiest weeks.
    expect(maxSeen).toBe(CHECK_IN_MAX_QUESTIONS)
  })

  it('keeps questions by priority: C1, C4, C2…, C10/C6, C7, C9, C3, C5, C8', () => {
    const f = facts({
      done: 2, injury: { label: 'knee', line: 'Knee', fromPainNote: false }, pacedSession: 'Intervals', number: 4,
      event: { name: 'half', date: '2026-10-18', weeksOut: 2, passed: false, resultLogged: false }, deferred: 'runs-with',
    })
    const a = { c1: '2', c2: ['time', 'tired', 'else'] }
    // Qualifying: c1 c2 c2a c2b c2c c3 c4 c5 c6 c9 c8 c7 → the six highest-priority survive.
    expect(selectQuestions(f, a)).toEqual(['c1', 'c2', 'c2a', 'c2b', 'c2c', 'c4'])
    expect(overBudget(f, a)).toEqual(['c3', 'c5', 'c6', 'c9', 'c8', 'c7'])
  })

  it('a typical complete week is C1, C3, C7 plus the conditional ones', () => {
    expect(selectQuestions(facts(), {})).toEqual(['c1', 'c3', 'c7'])
  })

  it('a skipped deferred question rolls to the next check-in (it stays queued)', () => {
    const f = facts({ done: 1, injury: { label: 'knee', line: 'Knee', fromPainNote: false }, deferred: 'runs-with' })
    const a = { c1: '2', c2: ['time', 'ill'] }
    expect(qualifies('c8', f, a)).toBe(true)
    expect(selectQuestions(f, a)).not.toContain('c8')
  })

  it('always opens with C1 and asks questions in display order', () => {
    for (const f of scenarios()) {
      for (const path of enumeratePaths(buildCheckInFlow(f))) {
        expect(path[0]).toBe('c1')
        const order = path.map((id) => DISPLAY_ORDER.indexOf(id as never))
        expect(order).toEqual([...order].sort((x, y) => x - y))
      }
    }
  })

  it('the same week and answers always give the same check-in', () => {
    const f = scenarios()[123]
    const a = { c1: '2', c2: ['tired'], c2b: 'yes', c3: 'hard', c7: ['late'] }
    expect(buildCheckIn(f, a, now, 'x')).toEqual(buildCheckIn(f, a, now, 'x'))
  })
})

describe('a week with a missed session', () => {
  const plan: WeekPlan = {
    id: 'plan-2026-09-28', weekStartDate: '2026-09-28', availableDays: ['Mon', 'Thu', 'Sat'], userNotes: '', createdAt: '',
    sessions: [
      { id: 'mon', date: '2026-09-28', dayOfWeek: 'Mon', type: 'weights', title: 'Upper', focus: '', estimatedMinutes: 60, intensity: 'moderate' },
      { id: 'thu', date: '2026-10-01', dayOfWeek: 'Thu', type: 'cardio', title: 'Threshold intervals', focus: '', estimatedMinutes: 45, intensity: 'hard',
        workout: [{ kind: 'step', role: 'work', end: { by: 'time', seconds: 1200 }, effort: 'threshold' }] },
      { id: 'sat', date: '2026-10-03', dayOfWeek: 'Sat', type: 'weights', title: 'Lower', focus: '', estimatedMinutes: 60, intensity: 'moderate' },
    ],
  }
  const log = (id: string, extra: Partial<LoggedSession> = {}): LoggedSession => ({
    id: `log-${id}`, plannedSessionId: id, weekPlanId: plan.id, date: plan.sessions.find((s) => s.id === id)!.date,
    type: 'weights', title: plan.sessions.find((s) => s.id === id)!.title, focus: '', startedAt: '', status: 'complete', ...extra,
  })
  const profile: UserProfile = { ...DEFAULT_PROFILE, injuries: ['Left knee aches on stairs'], goal: goalFromLegacyProfile({ ...DEFAULT_PROFILE, injuries: ['Left knee aches on stairs'] }) }
  const f = computeFacts({
    profile, plan, checkIns: [], weekStart: '2026-09-28', trigger: 'week-end', now,
    loggedSessions: [log('mon'), log('thu', { type: 'cardio' })],
  })

  it('reads the week from the logs', () => {
    expect(f).toMatchObject({ planned: 3, done: 2, sessionMinutes: 55, pacedSession: 'Threshold intervals', number: 1, deferred: 'runs-with' })
    expect(f.injury).toMatchObject({ label: 'left knee aches on stairs', fromPainNote: false })
  })

  it('asks why, follows up on "no time", and turns answers into actions', () => {
    const answers = { c1: '3', c2: ['time'], c2a: '45', c3: 'right', c4: 'better', c5: 'hard', c8: ['watch'], c7: ['busy'] }
    const flow = buildCheckInFlow(f)
    const w = walk(flow, answers)
    // Eight qualify; by priority C7 outranks C3, C5 and C8, so C5 and C8 wait.
    expect(w.path).toEqual(['c1', 'c2', 'c2a', 'c3', 'c4', 'c7'])
    expect(w.next).toBe(END)
    expect(checkInActions(f, answers)).toEqual([
      { kind: 'session-minutes', value: 45 },
      { kind: 'injury-status', injury: 'Left knee aches on stairs', status: 'improving' },
      { kind: 'planner-notes', value: 'Busy week (work or exams): keep sessions tight.' },
    ])
    const c = buildCheckIn(f, answers, now, 'ci-1')
    expect(c.summary.split('\n')).toEqual([
      'Felt ok. Did 2 of 3 sessions (missed: time).',
      'Next week’s sessions: 45 min (was 55)',
      'Left knee aches on stairs: improving. Keep programming around it',
      'Busy week (work or exams): keep sessions tight.',
    ])
    expect(plannerPrefill(c)).toEqual({ sessionMinutes: 45, fewerDays: false, notes: ['Busy week (work or exams): keep sessions tight.'] })
  })

  it('applies injury status and zone nudges to the profile', () => {
    // A week with nothing missed has room for the pace question.
    const full = { ...f, done: 3 }
    const c = buildCheckIn(full, { c1: '3', c3: 'right', c4: 'gone', c5: 'easy', c8: ['phone'], c7: ['nothing'] }, now, 'ci-2')
    const patch = applyCheckIn(profile, c, now)
    expect(patch.injuries).toEqual([])
    expect(patch.goal?.health.pastInjuries).toEqual(['Left knee aches on stairs'])
    expect(patch.goal?.zoneOffsetPct).toBe(2)
  })

  it('answers a deferred question once and stops asking it', () => {
    const quiet = { ...f, injury: undefined, pacedSession: undefined, done: 3 }
    const c = buildCheckIn(quiet, { c1: '4', c3: 'right', c8: ['watch', 'track'], c7: ['nothing'] }, now, 'ci-3')
    const patch = applyCheckIn(profile, c, now)
    expect(patch.goal?.constraints.runsWith).toEqual(['watch', 'track'])
    expect(patch.goal?.deferred).not.toContain('runs-with')
    expect(patch.goal?.askedDeferred).toContain('runs-with')
  })
})

describe('helpers', () => {
  it('shortens injury lines', () => {
    expect(injuryLabel('Left knee aches on stairs and on long downhills, worse after runs')).toBe('left knee aches on stairs')
    expect(injuryLabel('Right shoulder: dislocated last year')).toBe('right shoulder')
  })

  it('picks the check-in from the week before the planned week', () => {
    const mk = (week: string, created: string): CheckIn => ({ id: week, weekStartDate: week, createdAt: created, trigger: 'week-end', answers: {}, actions: [], summary: '' })
    const list = [mk('2026-09-14', '2026-09-20'), mk('2026-09-28', '2026-10-04')]
    expect(checkInForPlanning(list, '2026-10-05')?.id).toBe('2026-09-28')
    expect(checkInForPlanning(list, '2026-11-02')).toBeUndefined()
  })

  it('reactive check-ins ask one question', () => {
    const f = facts({ trigger: 'reactive', reactive: 'pain', injury: { label: 'knee', line: 'Knee', fromPainNote: false } })
    expect(walk(buildCheckInFlow(f), {}).next).toBe('c4')
    expect(enumeratePaths(buildCheckInFlow(f)).every((p) => p.length === 1)).toBe(true)
  })
})

describe('block end', () => {
  it('starts a new block when the goal still stands', () => {
    const profile: UserProfile = { ...DEFAULT_PROFILE, program: { ...DEFAULT_PROFILE.program!, startDate: '2026-06-01', lengthWeeks: 12 } }
    const f = facts({ milestone: 'block-end', pursuit: 'strength', done: 3, planned: 3 })
    const c = buildCheckIn(f, { c1: '4', c3: 'right', c9: 'yes', c7: ['nothing'] }, now, 'b')
    expect(c.actions).toContainEqual({ kind: 'new-block' })
    expect(applyCheckIn(profile, c, now).program).toMatchObject({ startDate: '2026-10-05', lengthWeeks: 12 })
    const tweak = buildCheckIn(f, { c1: '4', c3: 'right', c9: 'tweak', c7: ['nothing'] }, now, 't')
    expect(tweak.actions).toContainEqual({ kind: 'reopen-goal', node: 'str.kind' })
  })
})
