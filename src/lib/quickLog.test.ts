import { describe, expect, it } from 'vitest'
import { buildQuickLog, isUnplanned } from './quickLog'
import type { LoggedSession, PlannedSession } from '../types'

const planned: PlannedSession = {
  id: 'session-mon', date: '2026-09-28', dayOfWeek: 'Mon', type: 'weights', title: 'Upper body',
  focus: 'Push/pull', estimatedMinutes: 60, intensity: 'moderate',
}

describe('buildQuickLog', () => {
  it('logs a swap against the planned session', () => {
    const log = buildQuickLog({ activity: 'Bike', minutes: 45, distanceKm: 17.5, rpe: 6, date: '2026-09-28' }, { planned, weekPlanId: 'plan-1' })
    expect(log).toMatchObject({
      plannedSessionId: 'session-mon', weekPlanId: 'plan-1', status: 'complete', outcome: 'substituted',
      substitute: { activity: 'Bike', minutes: 45, distanceMeters: 17500 }, rpe: 6, title: 'Upper body',
    })
    expect(isUnplanned(log)).toBe(false)
  })

  it('keeps the id of an in-progress log it replaces', () => {
    const existing = { id: 'abc', startedAt: '2026-09-28T07:00:00Z' } as LoggedSession
    const log = buildQuickLog({ activity: 'Row', minutes: 30, date: '2026-09-28' }, { planned, existing })
    expect(log.id).toBe('abc')
    expect(log.startedAt).toBe('2026-09-28T07:00:00Z')
  })

  it('logs a standalone session with no plan', () => {
    const log = buildQuickLog({ activity: 'Gym session', minutes: 50, date: '2026-09-30', notes: '  legs  ' })
    expect(isUnplanned(log)).toBe(true)
    expect(log).toMatchObject({ type: 'weights', title: 'Gym session', date: '2026-09-30', generalNotes: 'legs' })
    expect(log.substitute?.distanceMeters).toBeUndefined()
  })
})
