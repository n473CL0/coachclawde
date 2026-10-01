import { describe, expect, it } from 'vitest'
import { summarizeHistory, clip } from './historySummary'
import type { LoggedSession } from '../types'

const NOW = new Date('2026-10-01T12:00:00')

function session(overrides: Partial<LoggedSession>): LoggedSession {
  return {
    id: overrides.id ?? Math.random().toString(36).slice(2),
    plannedSessionId: 'p',
    weekPlanId: 'w',
    date: '2026-09-29',
    type: 'weights',
    title: 'Upper body',
    focus: 'Chest, back',
    startedAt: '2026-09-29T08:00:00',
    completedAt: '2026-09-29T09:00:00',
    status: 'complete',
    ...overrides,
  }
}

describe('summarizeHistory', () => {
  it('says so when nothing has been logged', () => {
    expect(summarizeHistory([], { now: NOW })).toMatch(/No logged sessions yet/)
  })

  it('includes recent notes, clipped, and caps how many', () => {
    const long = 'x'.repeat(400)
    const sessions = Array.from({ length: 10 }, (_, i) =>
      session({ id: `s${i}`, completedAt: `2026-09-${20 + (i % 9)}T09:00:00`, generalNotes: long, painNotes: 'knee ached' }))
    const out = summarizeHistory(sessions, { now: NOW })
    const notes = out.split("**Athlete's notes")[1].split('\n\n')[0].split('\n').filter((l) => l.startsWith('- '))
    expect(notes.length).toBeLessThanOrEqual(6)
    for (const n of notes) expect(n.length).toBeLessThan(200)
  })

  it('drops notes older than two weeks', () => {
    const out = summarizeHistory([session({ date: '2026-09-01', completedAt: '2026-09-01T09:00:00', generalNotes: 'old note' })], { now: NOW })
    expect(out).not.toMatch(/old note/)
  })

  it('reports swaps as what was really done', () => {
    const out = summarizeHistory([
      session({ outcome: 'substituted', substitute: { activity: 'Bike', minutes: 45, distanceMeters: 17500 }, rpe: 6 }),
    ], { now: NOW })
    expect(out).toMatch(/Planned: Upper body → Did: 45′ bike, 17.5 km \(RPE 6\)/)
    expect(out).toMatch(/Swaps & extra sessions/)
  })

  it('includes the latest week reflection, or the check-in when given', () => {
    const s = session({ weekReflection: { energyLevel: 2, overallNotes: 'Busy week', nextWeekFocus: 'Shorter sessions' } })
    expect(summarizeHistory([s], { now: NOW })).toMatch(/energy 2\/5; summary: Busy week; wants to focus on: Shorter sessions/)
    const withCheckIn = summarizeHistory([s], { now: NOW, latestCheckIn: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] })
    expect(withCheckIn).not.toMatch(/week reflection/)
    expect(withCheckIn.split('**Latest check-in:**')[1].trim().split('\n')).toHaveLength(6)
  })
})

describe('clip', () => {
  it('flattens whitespace and adds an ellipsis', () => {
    expect(clip('a\n\n b', 10)).toBe('a b')
    expect(clip('abcdefghijk', 5)).toBe('abcd…')
  })
})
