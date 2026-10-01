import { describe, expect, it } from 'vitest'
import {
  flattenWorkout, howItWorks, inferEffort, intervalsToWorkout, normalizePlan, normalizeWorkout,
  runLogToIntervals, totalSeconds, workoutNotation, youllRecord,
} from './workout'
import { runZones } from './zones'
import type { PlannedInterval, WeekPlan, WorkoutItem } from '../types'

// §5.2: "15 min easy, 6 × 800 m at interval pace with 90 s jog, 10 min easy".
const SIX_800S: WorkoutItem[] = [
  { kind: 'step', role: 'warmup', end: { by: 'time', seconds: 900 }, effort: 'easy' },
  { kind: 'repeat', times: 6, skipLastRecovery: true, steps: [
    { kind: 'step', role: 'work', end: { by: 'distance', meters: 800 }, effort: 'interval', cue: 'Quick feet, relaxed shoulders' },
    { kind: 'step', role: 'recover', end: { by: 'time', seconds: 90 }, effort: 'recovery', recovery: 'jog' },
  ] },
  { kind: 'step', role: 'cooldown', end: { by: 'time', seconds: 600 }, effort: 'easy' },
]
const zones = runZones({ meters: 5000, seconds: 1470 })

describe('legacy interval conversion', () => {
  const legacy: PlannedInterval[] = [
    { label: 'Easy warm-up jog', repeats: 1, targetDuration: '10:00', restSeconds: 0 },
    { label: '800m reps', repeats: 4, targetDistance: '800m', targetPace: '4:45/km', restSeconds: 90, notes: 'Relaxed' },
    { label: '3 min threshold', repeats: 2, targetDuration: '3:00', restSeconds: 60 },
    { label: 'Finish', repeats: 1, restSeconds: 0 },
  ]
  const workout = intervalsToWorkout(legacy)

  it('ends a piece by distance, else time, else LAP', () => {
    const ends = workout.map((w) => w.kind === 'repeat' && w.steps[0].kind === 'step' ? w.steps[0].end : null)
    expect(ends).toEqual([
      { by: 'time', seconds: 600 },
      { by: 'distance', meters: 800 },
      { by: 'time', seconds: 180 },
      { by: 'lap' },
    ])
  })

  it('keeps label, pace text and notes, and adds recovery steps for rest', () => {
    expect(workout[1]).toEqual({
      kind: 'repeat', times: 4,
      steps: [
        { kind: 'step', role: 'work', end: { by: 'distance', meters: 800 }, effort: 'interval', label: '800m reps', target: '4:45/km', cue: 'Relaxed' },
        { kind: 'step', role: 'recover', end: { by: 'time', seconds: 90 }, effort: 'recovery' },
      ],
    })
  })

  it('infers effort and role from the label', () => {
    expect(inferEffort('Easy warm-up jog')).toEqual({ effort: 'easy', role: 'warmup' })
    expect(inferEffort('Tempo run')).toEqual({ effort: 'threshold', role: 'work' })
    expect(inferEffort('400m reps')).toEqual({ effort: 'repetition', role: 'work' })
    expect(inferEffort('6 x 3 min reps')).toEqual({ effort: 'interval', role: 'work' })
    expect(inferEffort('Zone 2 steady')).toEqual({ effort: 'easy', role: 'steady' })
  })

  it('maps flat work steps 1:1 onto the old flat interval rows', () => {
    const rows = flattenWorkout(workout).filter((f) => f.step.role !== 'recover')
    expect(rows).toHaveLength(1 + 4 + 2 + 1)
  })

  it('converts stored plans at read time and leaves new ones alone', () => {
    const plan = { id: 'p', weekStartDate: '2026-09-28', availableDays: [], userNotes: '', createdAt: '', sessions: [
      { id: 's', date: '2026-09-28', dayOfWeek: 'Mon', type: 'cardio', title: 'Run', focus: '', estimatedMinutes: 40, intensity: 'hard', intervals: legacy },
    ] } as WeekPlan
    const read = normalizePlan(plan)
    expect(read.sessions[0].workout).toEqual(workout)
    expect(read.sessions[0].intervals).toBe(legacy)
    expect(normalizePlan(read)).toBe(read)
  })
})

describe('flattenWorkout', () => {
  it('numbers reps and drops the last recovery', () => {
    const flat = flattenWorkout(SIX_800S)
    expect(flat).toHaveLength(1 + 6 + 5 + 1)
    expect(flat[1]).toMatchObject({ path: '1.0.0', rep: { index: 1, of: 6 } })
    expect(flat[11]).toMatchObject({ path: '1.5.0', rep: { index: 6, of: 6 } })
    expect(flat[12].step.role).toBe('cooldown')
  })

  it('handles sets: 2 × (4 × 400 m)', () => {
    const flat = flattenWorkout([{ kind: 'repeat', times: 2, steps: [
      { kind: 'repeat', times: 4, steps: [
        { kind: 'step', role: 'work', end: { by: 'distance', meters: 400 }, effort: 'repetition' },
        { kind: 'step', role: 'recover', end: { by: 'time', seconds: 60 }, effort: 'recovery', recovery: 'walk' },
      ] },
      { kind: 'step', role: 'recover', end: { by: 'time', seconds: 180 }, effort: 'recovery', recovery: 'jog' },
    ] }])
    expect(flat).toHaveLength(2 * (8 + 1))
    expect(flat[2]).toMatchObject({ path: '0.0.0.1.0', rep: { index: 2, of: 4 }, set: { index: 1, of: 2 } })
  })

  it('adds a rest-to-send-off step for cycles without a recovery', () => {
    const flat = flattenWorkout([{ kind: 'repeat', times: 3, everySeconds: 105, steps: [
      { kind: 'step', role: 'work', end: { by: 'distance', meters: 100 }, effort: 'threshold' },
    ] }])
    expect(flat.map((f) => f.step.role)).toEqual(['work', 'recover', 'work', 'recover', 'work', 'recover'])
    expect(flat[1]).toMatchObject({ cycleSeconds: 105 })
    expect(flat[0].cycleStart).toBe(true)
  })
})

describe('notation and instructions', () => {
  it('writes the one-line notation in the documented form', () => {
    expect(workoutNotation(SIX_800S, 'run', zones))
      .toBe('15′ easy · 6 × 800 m @ interval (4:45/km ≈ 3:48) · 90 s jog · 10′ easy')
    expect(workoutNotation(SIX_800S, 'run')).toBe('15′ easy · 6 × 800 m @ interval · 90 s jog · 10′ easy')
  })

  it('explains LAP for distance reps and nothing to do for timed ones', () => {
    const flat = flattenWorkout(SIX_800S)
    expect(howItWorks(flat)).toMatch(/For each 800 m, press LAP/)
    expect(youllRecord(flat)).toMatch(/LAP gives me each rep time/)
    const timed = flattenWorkout([{ kind: 'step', role: 'steady', end: { by: 'time', seconds: 2400 }, effort: 'easy' }])
    expect(howItWorks(timed)).toMatch(/ends by itself/)
    expect(youllRecord(timed)).toMatch(/Add distances afterwards/)
  })

  it('estimates the session length from zones', () => {
    const minutes = totalSeconds(flattenWorkout(SIX_800S), 'run', zones) / 60
    expect(minutes).toBeGreaterThan(55)
    expect(minutes).toBeLessThan(58)
  })
})

describe('normalizeWorkout', () => {
  it('coerces sloppy input and caps nesting at two levels', () => {
    const w = normalizeWorkout([
      { kind: 'step', role: 'nonsense', end: { by: 'time', seconds: '300' }, effort: 'easy' },
      { kind: 'repeat', times: '3', steps: [{ kind: 'repeat', times: 2, steps: [{ kind: 'repeat', times: 2, steps: [{ role: 'work', end: { meters: 200 } }] }] }] },
      'junk',
    ])!
    expect(w[0]).toEqual({ kind: 'step', role: 'work', end: { by: 'time', seconds: 300 }, effort: 'easy' })
    const outer = w[1] as Extract<WorkoutItem, { kind: 'repeat' }>
    expect(outer.times).toBe(3)
    const inner = outer.steps[0] as Extract<WorkoutItem, { kind: 'repeat' }>
    expect(inner.steps[0]).toMatchObject({ kind: 'step', end: { by: 'distance', meters: 200 }, effort: 'threshold' })
    expect(normalizeWorkout([])).toBeUndefined()
  })
})

describe('runLogToIntervals', () => {
  it('fills rows from Run Mode: clock time, planned distance on a LAP', () => {
    const flat = flattenWorkout(SIX_800S)
    const rows = runLogToIntervals(flat, [
      { path: '0', role: 'warmup', startedAt: '', seconds: 900, endedBy: 'time' },
      { path: '1.0.0', role: 'work', startedAt: '', seconds: 226.4, meters: 800, endedBy: 'lap' },
      { path: '1.1.0', role: 'work', startedAt: '', seconds: 12, endedBy: 'skip' },
    ])
    expect(rows[0]).toMatchObject({ actualSeconds: 900, completed: true })
    expect(rows[1]).toMatchObject({ actualSeconds: 226, actualTime: '3:46', actualDistanceMeters: 800, completed: true, stepPath: '1.0.0' })
    expect(rows[2]).toMatchObject({ completed: false })
  })
})
