import { describe, expect, it } from 'vitest'
import { enumeratePaths } from './flow'
import { applyMigration, buildMigrationFlow } from './migrationFlow'
import { DEFAULT_PROFILE } from './profileData'

const now = new Date('2026-10-01T12:00:00')
const runner = { ...DEFAULT_PROFILE, onboarded: true, injuries: ['Left knee aches on stairs'] }
const lifter = { ...runner, program: { ...runner.program!, exerciseTypes: ['weights' as const] } }

describe('migration check-in', () => {
  it('is three questions, plus one follow-up for a health change', () => {
    const lengths = enumeratePaths(buildMigrationFlow(runner)).map((p) => p.length)
    expect(Math.min(...lengths)).toBe(3)
    expect(Math.max(...lengths)).toBe(4)
  })

  it('maps the legacy profile and records what the answers add', () => {
    const { patch, reopen } = applyMigration(runner, { 'm.target': 'no', 'm.now': 'mid', 'm.health': ['ok'] }, now)
    expect(reopen).toBeUndefined()
    expect(patch.goal).toMatchObject({
      origin: 'legacy', migrated: true, pursuit: 'strength',
      starting: { runKmPerWeek: [10, 25] }, health: { flags: ['injury'] },
    })
    expect(patch.injuries).toBeUndefined()
  })

  it('updates injuries verbatim and moves cleared ones to history', () => {
    const { patch } = applyMigration(runner, { 'm.target': 'event', 'm.now': 'low', 'm.health': ['injury'], 'm.injury': 'Right Achilles tight in the mornings' }, now)
    expect(patch.injuries).toEqual(['Right Achilles tight in the mornings'])
    expect(patch.goal?.health.pastInjuries).toEqual(['Left knee aches on stairs'])
  })

  it('asks lifters about lifting, and opens the event branch when there is one', () => {
    const { patch, reopen } = applyMigration(lifter, { 'm.target': 'date', 'm.now': '1y+', 'm.health': ['condition'], 'm.clear': 'check' }, now)
    expect(reopen).toBe('physique')
    expect(patch.goal?.starting).toMatchObject({ lifting: '1y+', level: 'advanced' })
    expect(patch.goal?.health).toMatchObject({ flags: ['condition'], conservative: true })
  })
})
