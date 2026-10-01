import { describe, expect, it } from 'vitest'
import { describePhases, isDeloadWeek, phaseSkeleton } from './goalPrompt'

describe('phaseSkeleton', () => {
  it('matches the documented 24-week half', () => {
    expect(describePhases(phaseSkeleton(24, 'half')))
      .toBe('Base (weeks 1–8) → Build (weeks 9–18) → Peak (weeks 19–22) → Taper (weeks 23–24)')
  })

  it('tapers 1 week for a 5K and 3 for a marathon', () => {
    expect(phaseSkeleton(10, '5k').at(-1)).toEqual({ name: 'Taper', from: 10, to: 10 })
    expect(phaseSkeleton(18, 'marathon').at(-1)).toEqual({ name: 'Taper', from: 16, to: 18 })
  })

  it('always covers every week exactly once', () => {
    for (let n = 1; n <= 30; n++) {
      for (const kind of [undefined, '5k', 'half', 'marathon'] as const) {
        const ph = phaseSkeleton(n, kind)
        expect(ph[0].from).toBe(1)
        expect(ph.at(-1)!.to).toBe(n)
        for (let i = 1; i < ph.length; i++) expect(ph[i].from).toBe(ph[i - 1].to + 1)
      }
    }
  })

  it('deloads every 4th week in base and build only', () => {
    const ph = phaseSkeleton(24, 'half')
    expect([4, 8, 12, 16].every((w) => isDeloadWeek(ph, w))).toBe(true)
    expect(isDeloadWeek(ph, 20)).toBe(false)
    expect(isDeloadWeek(ph, 5)).toBe(false)
  })
})
