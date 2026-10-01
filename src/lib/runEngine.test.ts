import { describe, expect, it } from 'vitest'
import { cuesForStep, planCues, stepDuration } from './runEngine'
import { flattenWorkout } from './workout'
import type { WorkoutItem } from '../types'

const W: WorkoutItem[] = [
  { kind: 'step', role: 'warmup', end: { by: 'time', seconds: 300 }, effort: 'easy' },
  { kind: 'repeat', times: 3, skipLastRecovery: true, steps: [
    { kind: 'step', role: 'work', end: { by: 'time', seconds: 180 }, effort: 'threshold' },
    { kind: 'step', role: 'recover', end: { by: 'time', seconds: 60 }, effort: 'recovery', recovery: 'jog' },
  ] },
  { kind: 'repeat', times: 2, steps: [
    { kind: 'step', role: 'work', end: { by: 'distance', meters: 400 }, effort: 'repetition' },
    { kind: 'step', role: 'recover', end: { by: 'time', seconds: 90 }, effort: 'recovery', recovery: 'walk' },
  ] },
  { kind: 'step', role: 'cooldown', end: { by: 'time', seconds: 300 }, effort: 'easy' },
]
const flat = flattenWorkout(W)

describe('cuesForStep', () => {
  it('gives a timed rep go, halfway, and countdown pips', () => {
    const cues = cuesForStep(flat[1], flat[2], 180, 180)
    expect(cues.map((c) => [c.at, c.earcon])).toEqual([[0, 'go'], [90, 'half'], [177, 'pip'], [178, 'pip'], [179, 'pip']])
  })

  it('gives a recovery a heads-up 10 s before the next rep', () => {
    const cues = cuesForStep(flat[2], flat[3], 60, 60)
    expect(cues.map((c) => c.earcon)).toEqual(['recover', 'headsUp', 'pip', 'pip', 'pip'])
    expect(cues[1].at).toBe(50)
  })

  it('marks the final rep and reminds about LAP on distance reps', () => {
    expect(cuesForStep(flat[5], flat[6], 180, 180)[0].earcon).toBe('goLast')
    const lap = cuesForStep(flat[6], flat[7], null, 90)
    expect(lap.map((c) => [c.at, c.earcon])).toEqual([[0, 'go'], [180, 'remind']])
  })

  it('ends the session with a chord', () => {
    const last = flat[flat.length - 1]
    expect(cuesForStep(last, undefined, 300, 300).at(-1)).toMatchObject({ at: 300, earcon: 'done' })
  })
})

describe('planCues', () => {
  it('schedules through timed steps and stops at the first LAP step', () => {
    const { cues, throughIndex } = planCues(flat, 0, 0, { modality: 'run' })
    expect(throughIndex).toBe(6)
    expect(flat[6].step.end.by).toBe('distance')
    // The first 400's Go comes after 5′ + 3 × 3′ + 2 × 60 s.
    const go400 = cues.find((c) => c.index === 6)!
    expect(go400.delay).toBe(300 + 540 + 120)
    expect(cues.every((c, i) => i === 0 || c.delay >= cues[i - 1].delay - 1e-9)).toBe(true)
  })

  it('drops cues already passed when re-planning mid-step', () => {
    const { cues } = planCues(flat, 1, 100, { modality: 'run' })
    expect(cues.some((c) => c.index === 1 && c.earcon === 'half')).toBe(false)
    expect(cues.find((c) => c.index === 1 && c.label === '3')!.delay).toBe(77)
  })

  it('adds +30 s to the current step only', () => {
    const { cues } = planCues(flat, 2, 0, { modality: 'run', extraSeconds: 30 })
    expect(cues.find((c) => c.index === 3)!.delay).toBe(90)
  })
})

describe('send-off cycles', () => {
  const swim = flattenWorkout([{ kind: 'repeat', times: 3, everySeconds: 105, steps: [
    { kind: 'step', role: 'work', end: { by: 'distance', meters: 100 }, effort: 'threshold' },
  ] }])

  it('rests for whatever is left of the cycle', () => {
    expect(stepDuration(swim[1], { cycleElapsed: 92 })).toBe(13)
    expect(stepDuration(swim[1], { cycleElapsed: 110 })).toBe(0)
  })

  it('plans the rest from the cycle clock after a LAP', () => {
    const { cues } = planCues(swim, 1, 0, { modality: 'swim', cycleElapsed: 90 })
    const nextGo = cues.find((c) => c.index === 2 && c.earcon === 'go')!
    expect(nextGo.delay).toBe(15)
  })
})
