import type {
  CoachingStyle, ExperienceLevel, ProgramExerciseType, ProgramFacility, ProgramGoal,
} from '../types'

/**
 * Display labels for the program preference enums. Shared by onboarding and
 * Program setup so the two always offer the same choices.
 */

export const GOAL_OPTIONS: { value: ProgramGoal; label: string }[] = [
  { value: 'get-fit', label: 'Get fit' },
  { value: 'get-strong', label: 'Get strong' },
  { value: 'look-great', label: 'Look great' },
]

export const EXERCISE_OPTIONS: { value: ProgramExerciseType; label: string }[] = [
  { value: 'weights', label: 'Weights' },
  { value: 'cardio', label: 'Cardio' },
  { value: 'mobility', label: 'Mobility' },
]

export const FACILITY_OPTIONS: { value: ProgramFacility; label: string }[] = [
  { value: 'yoga-mat', label: 'Yoga mat' },
  { value: 'weights-at-home', label: 'Weights at home' },
  { value: 'full-gym', label: 'Full gym' },
]

export const COACHING_OPTIONS: { value: CoachingStyle; label: string; hint: string }[] = [
  { value: 'supportive', label: 'Supportive', hint: 'Encouraging, gentle progression' },
  { value: 'balanced', label: 'Balanced', hint: 'Steady push with room to recover' },
  { value: 'intense', label: 'Intense', hint: 'Push me hard' },
]

export const EXPERIENCE_OPTIONS: { value: ExperienceLevel; label: string; hint: string }[] = [
  { value: 'beginner', label: 'Beginner', hint: 'New to structured training' },
  { value: 'returning', label: 'Returning', hint: 'Trained before, getting back into it' },
  { value: 'intermediate', label: 'Intermediate', hint: 'Train consistently' },
  { value: 'advanced', label: 'Advanced', hint: 'Years of structured training' },
]

export const LENGTH_OPTIONS = [4, 8, 12, 16] as const

/** Training-frequency choices; 6 stands for "6 or more". */
export const DAYS_PER_WEEK_OPTIONS = [2, 3, 4, 5, 6] as const

export function daysPerWeekLabel(days: number): string {
  return days >= 6 ? '6+' : String(days)
}
