import { describe, expect, it } from 'vitest'
import { describeZones, predictSeconds, riegelSeconds, runZones, vdot, resolveTarget } from './zones'

describe('VDOT zones (Daniels–Gilbert)', () => {
  // Worked example from docs/RUNNERS-AND-ATHLETES.md §5.3: a 24:30 5K.
  const z = runZones({ meters: 5000, seconds: 24 * 60 + 30 })

  it('gives VDOT ≈ 39.2 for a 24:30 5K', () => {
    expect(z.vdot).toBeCloseTo(39.2, 1)
  })

  it('matches the documented paces to the second', () => {
    expect(describeZones(z)).toBe('easy 5:56–6:35/km · marathon 5:35 · threshold 5:10 · interval 4:45 · repetition 4:29')
  })

  it('predicts the documented 10K and half times', () => {
    const v = vdot(5000, 1470)
    expect(Math.abs(predictSeconds(10000, v) - (50 * 60 + 50))).toBeLessThan(3)
    // §3.5 quotes ~1:52:40; allow a few seconds of rounding.
    expect(Math.abs(predictSeconds(21097.5, v) - (1 * 3600 + 52 * 60 + 40))).toBeLessThan(15)
  })

  it('round-trips: predicting the input distance returns the input time', () => {
    expect(predictSeconds(5000, vdot(5000, 1470))).toBeCloseTo(1470, 0)
  })

  it('agrees with Riegel within a few percent', () => {
    const v = vdot(5000, 1470)
    const ratio = predictSeconds(10000, v) / riegelSeconds(5000, 1470, 10000)
    expect(ratio).toBeGreaterThan(0.97)
    expect(ratio).toBeLessThan(1.03)
  })

  it('applies a check-in offset: +2% is faster', () => {
    const faster = runZones({ meters: 5000, seconds: 1470 }, 2)
    expect(faster.threshold).toBeLessThan(z.threshold)
    expect(faster.threshold / z.threshold).toBeCloseTo(0.98, 3)
  })

  it('resolves a distance rep to a pace and a rep time', () => {
    expect(resolveTarget('interval', 'run', z, 800)).toEqual({ primary: '4:45/km', secondary: 'aim ≈ 3:48' })
  })

  it('falls back to feel without zones or for other modalities', () => {
    expect(resolveTarget('threshold', 'run', undefined).primary).toBe('RPE 7')
    expect(resolveTarget('threshold', 'bike', z).primary).toBe('RPE 7')
  })
})
