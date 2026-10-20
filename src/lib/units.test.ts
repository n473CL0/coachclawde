import { describe, expect, it } from 'vitest'
import { formatWeight, fromDistance, fromWeight, localize, METRIC, toDistance, toWeight } from './units'
import { computeSplit, distanceToMeters, metersToDistance } from './cardioUtils'
import { describeZones, formatPace } from './zones'

const IMPERIAL = { weight: 'lb', distance: 'mi' } as const

describe('units', () => {
  it('round-trips a weight typed in lb', () => {
    for (const lb of [45, 47.5, 50, 133.3, 225, 405]) expect(toWeight(fromWeight(lb, 'lb'), 'lb')).toBe(lb)
    expect(fromWeight(50, 'lb')).toBe(22.68)
    // Switching units back and forth never drifts.
    let kg = 81.7
    for (let i = 0; i < 3; i++) kg = fromWeight(toWeight(fromWeight(toWeight(kg, 'lb'), 'lb'), 'kg'), 'kg')
    expect(toWeight(kg, 'lb')).toBe(180.1)
    expect(formatWeight(22.5, 'lb')).toBe('49.6 lb')
    expect(formatWeight(22.5, 'kg')).toBe('22.5 kg')
  })

  it('round-trips a distance typed in miles', () => {
    expect(toDistance(fromDistance(3.1, 'mi'), 'mi')).toBeCloseTo(3.1)
    expect(fromDistance(1, 'mi')).toBeCloseTo(1.609344)
  })

  it('leaves text alone in metric', () => {
    expect(localize('8 × 12kg · 4:45/km · 5 km', METRIC)).toBe('8 × 12kg · 4:45/km · 5 km')
  })

  it('converts weights, paces, speeds and km, keeping metres and race names', () => {
    expect(localize('10 × 10kg, 6 × 16kg, 3 × 20kg', IMPERIAL)).toBe('10 × 22 lb, 6 × 35.3 lb, 3 × 44.1 lb')
    expect(localize('Easy 5:56–6:35/km', IMPERIAL)).toBe('Easy 9:33–10:36/mi')
    expect(localize('Hold 12 km/h', IMPERIAL)).toBe('Hold 7.5 mph')
    expect(localize('10–25 km a week', IMPERIAL)).toBe('6.2–15.5 mi a week')
    expect(localize('6 × 800 m @ interval · 21.1 km', IMPERIAL)).toBe('6 × 800 m @ interval · 13.1 mi')
    expect(localize('5K in 24:30, 2:05/500m', IMPERIAL)).toBe('5K in 24:30, 2:05/500m')
  })

  it('converts weight and distance independently', () => {
    expect(localize('20kg, 5 km', { weight: 'lb', distance: 'km' })).toBe('44.1 lb, 5 km')
    expect(localize('20kg, 5 km', { weight: 'kg', distance: 'mi' })).toBe('20kg, 3.1 mi')
  })

  it('computes splits and paces in miles without double rounding', () => {
    expect(computeSplit('run', 2 * 1609.344, 900, 'mi')).toBe('7:30/mi')
    expect(computeSplit('bike', 20 * 1609.344, 3600, 'mi')).toBe('20.0 mph')
    expect(computeSplit('row', 2000, 480, 'mi')).toBe('2:00/500m')
    expect(computeSplit('run', 5000, 1500)).toBe('5:00/km')
    expect(formatPace(300, 'mi')).toBe('8:03/mi')
    expect(describeZones({ vdot: 40, easy: [356, 395], steady: 345, marathon: 335, threshold: 310, interval: 285, repetition: 269 }, 'mi')).toMatch(/^easy 9:33–10:36\/mi · marathon 8:59/)
  })

  it('takes cardio distances in miles, but rows and swims stay in metres', () => {
    expect(distanceToMeters('run', 3.1, 'mi')).toBeCloseTo(4988.97, 1)
    expect(metersToDistance('run', 1609.344, 'mi')).toBe(1)
    expect(distanceToMeters('row', 2000, 'mi')).toBe(2000)
  })
})
