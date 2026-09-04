import type { UserProfile } from '../types'

export const DEFAULT_PROFILE: UserProfile = {
  name: 'Athlete',
  sex: 'male',
  heightCm: 175,
  weightKg: 75,
  programWeek: 1,
  injuries: [],
  goals: [],
  fitnessBackground: '',
  gymAccess: true,
  dietaryNotes: [],
  program: {
    goals: ['get-strong', 'look-great'],
    exerciseTypes: ['weights', 'cardio'],
    facilities: ['full-gym'],
    sports: ['Running'],
    coachingStyle: 'balanced',
    lengthWeeks: 12,
  },
  experienceLevel: 'returning',
  // New stores start un-onboarded so the first-run slideshow is shown. Existing
  // accounts are grandfathered in by the Supabase column default (see
  // migration 0002) / by completing onboarding once.
  onboarded: false,
  updatedAt: new Date().toISOString(),
}
