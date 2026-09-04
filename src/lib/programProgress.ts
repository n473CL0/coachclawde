import { differenceInCalendarWeeks, parseISO } from 'date-fns'
import type { UserProfile } from '../types'

export const DEFAULT_PROGRAM_LENGTH_WEEKS = 12

export interface ProgramProgress {
  /** Current week, 1-based, capped at the program length for display. */
  week: number
  /** Uncapped current week — exceeds `length` once the program is finished. */
  rawWeek: number
  /** Total weeks the program is set to run. */
  length: number
  /** True once the program window has fully elapsed (time to re-onboard). */
  isComplete: boolean
  /** Progress through the program, 0–100 (capped). */
  percent: number
}

/**
 * Derives where the athlete is in their program. When a `startDate` is set
 * (every onboarded athlete gets one) progression is time-based — the current
 * week is however many Mon-start weeks have elapsed since the program began —
 * so a program naturally "completes" once its weeks run out, with no manual
 * week-advancing needed. Falls back to the stored `programWeek` for accounts
 * that predate this (no start date), which never reports complete.
 */
export function getProgramProgress(profile: UserProfile, now: Date = new Date()): ProgramProgress {
  const length = profile.program?.lengthWeeks ?? DEFAULT_PROGRAM_LENGTH_WEEKS
  const startDate = profile.program?.startDate

  const rawWeek = startDate
    ? Math.max(1, differenceInCalendarWeeks(now, parseISO(startDate), { weekStartsOn: 1 }) + 1)
    : Math.max(1, profile.programWeek || 1)

  const cappedWeek = Math.min(rawWeek, length)
  return {
    week: cappedWeek,
    rawWeek,
    length,
    isComplete: rawWeek > length,
    percent: Math.min(100, Math.round((cappedWeek / length) * 100)),
  }
}
