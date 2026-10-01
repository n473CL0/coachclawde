import { describe, expect, it } from 'vitest'
import { enumeratePaths, rewindTo, walk, END, type FlowAnswers } from './flow'
import { GOAL_FLOW, confirmationRows, feasibility, profilePatchFromGoal, toGoalProfile, weeksUntil } from './goalFlow'

// Thursday 1 October 2026; this week's Monday is 28 September.
const ctx = { now: new Date('2026-10-01T12:00:00') }

/** §3.4 personas, as the answers each would give. */
const PERSONAS: Record<string, { answers: FlowAnswers; path: string[] }> = {
  'Half marathon, time goal, knee niggle': {
    answers: {
      why: 'event', 'ev.kind': 'half', 'ev.date': '2027-03-14', 'ev.aim': 'time:6300', 'ev.now': 'mid',
      'ev.result': { distance: '5000', time: '1470' }, time: { days: '4', mins: '60' }, kit: ['gym'],
      health: ['injury'], 'health.injury': 'Left knee aches on stairs',
    },
    path: ['why', 'ev.kind', 'ev.date', 'ev.aim', 'ev.now', 'ev.result', 'time', 'kit', 'health', 'health.injury'],
  },
  'First 5K from the sofa': {
    answers: { why: 'fitness', 'fit.what': '5k', 'fit.now': 'sitting', 'fit.likes': ['walking', 'running'], time: { days: '3', mins: '30' }, health: ['ok'] },
    path: ['why', 'fit.what', 'fit.now', 'fit.likes', 'time', 'health'],
  },
  'Beach-ready for a July holiday': {
    answers: { why: 'physique', 'phy.change': 'lose-fat', 'phy.date': 'date:2027-07-10', lifting: 'on-off', time: { days: '4', mins: '45' }, kit: ['gym'], health: ['ok'] },
    path: ['why', 'phy.change', 'phy.date', 'lifting', 'time', 'kit', 'health'],
  },
  'Long-term habit': {
    answers: { why: 'fitness', 'fit.what': 'routine', 'fit.now': 'light', 'fit.likes': ['walking', 'home', 'yoga'], time: { days: '3', mins: '30' }, health: ['ok'] },
    path: ['why', 'fit.what', 'fit.now', 'fit.likes', 'time', 'health'],
  },
  'Lifter chasing numbers': {
    answers: { why: 'strength', 'str.kind': 'lifts', lifting: '1y+', 'str.numbers': { squat: '100x5', bench: '75x5', deadlift: '130x5' }, time: { days: '4', mins: '75' }, kit: ['gym'], health: ['ok'] },
    path: ['why', 'str.kind', 'lifting', 'str.numbers', 'time', 'kit', 'health'],
  },
  'Rugby player, in-season': {
    answers: { why: 'sport', 'sp.sport': 'Rugby', 'sp.season': 'in', 'sp.fixed': { Tue: 'training', Thu: 'training', Sat: 'match' }, 'sp.want': ['power', 'injury'], time: { days: '2', mins: '45' }, kit: ['gym'], health: ['ok'] },
    path: ['why', 'sp.sport', 'sp.season', 'sp.fixed', 'sp.want', 'time', 'kit', 'health'],
  },
  'Has a coach’s plan': {
    answers: { why: 'tracker', 'trk.source': 'coach', 'trk.intake': 'convert', 'trk.coach': 'light', health: ['ok'] },
    path: ['why', 'trk.source', 'trk.intake', 'trk.coach', 'health'],
  },
}

describe('onboarding graph', () => {
  const paths = enumeratePaths(GOAL_FLOW)

  it('has no cycles and no dangling edges (enumeration would throw)', () => {
    expect(paths.length).toBeGreaterThan(10)
  })

  it('never asks more than 10 questions on any path', () => {
    const longest = Math.max(...paths.map((p) => p.length))
    expect(longest).toBeLessThanOrEqual(10)
    // The documented worst case: a running event with a recent result and an injury.
    expect(longest).toBe(10)
  })

  it('never asks fewer than 5', () => {
    expect(Math.min(...paths.map((p) => p.length))).toBeGreaterThanOrEqual(5)
  })

  it('reaches every node', () => {
    const reached = new Set(paths.flat())
    expect([...reached].sort()).toEqual(Object.keys(GOAL_FLOW.nodes).sort())
  })

  it('never asks the same question twice on a path', () => {
    for (const p of paths) expect(new Set(p).size).toBe(p.length)
  })
})

describe('§3.4 personas', () => {
  for (const [name, { answers, path }] of Object.entries(PERSONAS)) {
    it(`${name}: ${path.length} questions`, () => {
      const w = walk(GOAL_FLOW, answers)
      expect(w.path).toEqual(path)
      expect(w.next).toBe(END)
    })
  }

  it('gives the same profile for the same answers (deterministic)', () => {
    for (const { answers } of Object.values(PERSONAS)) {
      expect(toGoalProfile(answers, ctx)).toEqual(toGoalProfile(answers, ctx))
    }
  })

  it('snapshots each persona’s confirmation card', () => {
    const cards = Object.fromEntries(Object.entries(PERSONAS).map(([name, { answers }]) => [
      name, confirmationRows(toGoalProfile(answers, ctx), ctx).map((r) => `${r.icon} ${r.label}: ${r.text}`),
    ]))
    expect(cards).toMatchSnapshot()
  })
})

describe('toGoalProfile', () => {
  it('builds the half-marathon persona’s profile', () => {
    const g = toGoalProfile(PERSONAS['Half marathon, time goal, knee niggle'].answers, ctx)
    expect(g).toMatchObject({
      pursuit: 'event',
      event: { kind: 'half', date: '2027-03-14', aim: 'time', targetSeconds: 6300 },
      starting: { level: 'intermediate', runKmPerWeek: [10, 25], recentResult: { meters: 5000, seconds: 1470 } },
      constraints: { daysPerWeek: 4, sessionMinutes: 60, facilities: ['full-gym'], strengthWork: true },
      health: { flags: ['injury'] },
      deferred: ['runs-with', 'coaching-tone', 'long-run-day'],
    })
  })

  it('routes "Run 5K without stopping" into the event model without event questions', () => {
    const g = toGoalProfile(PERSONAS['First 5K from the sofa'].answers, ctx)
    expect(g.pursuit).toBe('fitness')
    expect(g.event).toEqual({ kind: '5k', aim: 'get-round' })
    expect(g.starting.level).toBe('beginner')
  })

  it('stores health flags only, and keeps injuries verbatim in the legacy field', () => {
    const answers = { ...PERSONAS['Long-term habit'].answers, health: ['condition', 'cardiac'], 'health.clear': 'check' }
    expect(walk(GOAL_FLOW, answers).path.at(-1)).toBe('health.clear')
    const g = toGoalProfile(answers, ctx)
    expect(g.health).toEqual({ flags: ['condition', 'cardiac'], conservative: true })
    const patch = profilePatchFromGoal(toGoalProfile(PERSONAS['Half marathon, time goal, knee niggle'].answers, ctx), { now: ctx.now })
    expect(patch.injuries).toEqual(['Left knee aches on stairs'])
  })

  it('ignores answers left behind on an abandoned branch', () => {
    const answers = { ...PERSONAS['Lifter chasing numbers'].answers, 'ev.kind': 'marathon', 'phy.change': 'lose-fat' }
    const g = toGoalProfile(answers, ctx)
    expect(g.event).toBeUndefined()
    expect(g.physique).toBeUndefined()
    expect(Object.keys(g.answers!)).toEqual(PERSONAS['Lifter chasing numbers'].path)
  })

  it('derives the legacy ProgramConfig, with the block length from the date', () => {
    const patch = profilePatchFromGoal(toGoalProfile(PERSONAS['Half marathon, time goal, knee niggle'].answers, ctx), { now: ctx.now })
    expect(patch.program).toEqual({
      goals: ['get-fit'], exerciseTypes: ['cardio', 'weights'], facilities: ['full-gym'], sports: ['Running'],
      coachingStyle: 'balanced', lengthWeeks: 24, startDate: '2026-09-28', daysPerWeek: 4,
    })
    expect(patch.experienceLevel).toBe('intermediate')
    const sofa = profilePatchFromGoal(toGoalProfile(PERSONAS['First 5K from the sofa'].answers, ctx), { now: ctx.now })
    expect(sofa.program?.lengthWeeks).toBe(8)
  })
})

describe('feasibility', () => {
  const base = PERSONAS['Half marathon, time goal, knee niggle'].answers
  it('calls a 1:45 half from a 24:30 5K over 24 weeks realistic', () => {
    expect(weeksUntil('2027-03-14', ctx.now)).toBe(24)
    expect(feasibility(base, ctx)).toMatchObject({ verdict: 'realistic' })
  })
  it('flags the same gap over 8 weeks as ambitious (a stretch)', () => {
    expect(feasibility({ ...base, 'ev.date': '2026-11-22' }, ctx)).toMatchObject({ verdict: 'ambitious' })
  })
  it('suggests a stepping-stone target when the gap is too big for the runway', () => {
    const f = feasibility({ ...base, 'ev.date': '2026-10-25' }, ctx)!
    expect(f.verdict).toBe('stretch-too-far')
    expect(f.steppingStone).toBeGreaterThan(6300)
    expect(f.steppingStone).toBeLessThan(f.predicted)
  })
})

describe('rewindTo', () => {
  it('keeps answers before the node and drops it and everything after', () => {
    const a = PERSONAS['Rugby player, in-season'].answers
    expect(Object.keys(rewindTo(GOAL_FLOW, a, 'sp.fixed'))).toEqual(['why', 'sp.sport', 'sp.season'])
  })
})
