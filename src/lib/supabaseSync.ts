import { supabase } from './supabase'
import type { CheckIn, UserProfile, WeekPlan, LoggedSession, ProgramConfig, ExperienceLevel, GoalProfile } from '../types'

export type SyncStatus = 'idle' | 'syncing' | 'success' | 'error'

function client() {
  if (!supabase) throw new Error('Supabase is not configured')
  return supabase
}

// --- profile ----------------------------------------------------------------

/** The columns mapped 1:1 from a `profiles` row. */
interface ProfileRow {
  name: string
  sex: string
  height_cm: number
  weight_kg: number
  birth_date: string | null
  program_week: number
  injuries: string[]
  goals: string[]
  fitness_background: string
  gym_access: boolean
  dietary_notes: string[]
  program: ProgramConfig | null
  experience_level: ExperienceLevel | null
  onboarded: boolean | null
  /** Added by migration 0005; absent on databases that haven't run it. */
  goal_profile?: GoalProfile | null
  updated_at: string
}

function rowToProfile(row: ProfileRow): UserProfile {
  return {
    name: row.name,
    sex: row.sex === 'female' ? 'female' : 'male',
    heightCm: Number(row.height_cm),
    weightKg: Number(row.weight_kg),
    birthDate: row.birth_date ?? undefined,
    programWeek: row.program_week,
    injuries: row.injuries ?? [],
    goals: row.goals ?? [],
    fitnessBackground: row.fitness_background ?? '',
    gymAccess: row.gym_access,
    dietaryNotes: row.dietary_notes ?? [],
    program: row.program ?? undefined,
    experienceLevel: row.experience_level ?? undefined,
    goal: row.goal_profile ?? undefined,
    // Existing accounts predate onboarding — treat a missing flag as done so
    // they're never forced back through the first-run slideshow.
    onboarded: row.onboarded ?? true,
    updatedAt: row.updated_at,
  }
}

export async function pushProfile(userId: string, profile: UserProfile) {
  const { error } = await client()
    .from('profiles')
    .upsert({
      id: userId,
      name: profile.name,
      sex: profile.sex,
      height_cm: profile.heightCm,
      weight_kg: profile.weightKg,
      birth_date: profile.birthDate ?? null,
      program_week: profile.programWeek,
      injuries: profile.injuries,
      goals: profile.goals,
      fitness_background: profile.fitnessBackground,
      gym_access: profile.gymAccess,
      dietary_notes: profile.dietaryNotes,
      program: profile.program ?? null,
      experience_level: profile.experienceLevel ?? null,
      onboarded: profile.onboarded ?? false,
      goal_profile: profile.goal ?? null,
      updated_at: profile.updatedAt,
    })
  if (error) throw new Error(`Failed to save profile: ${error.message}`)
}

// --- week plans -------------------------------------------------------------

export async function pushWeekPlans(userId: string, plans: WeekPlan[]) {
  if (plans.length === 0) return
  const rows = plans.map((p) => ({
    user_id: userId,
    id: p.id,
    week_start_date: p.weekStartDate,
    available_days: p.availableDays,
    user_notes: p.userNotes,
    plan: p,
    created_at: p.createdAt,
    updated_at: new Date().toISOString(),
  }))
  const { error } = await client().from('week_plans').upsert(rows, { onConflict: 'user_id,id' })
  if (error) throw new Error(`Failed to save plans: ${error.message}`)
}

// --- logged sessions --------------------------------------------------------

function loggedSessionRow(userId: string, s: LoggedSession) {
  return {
    user_id: userId,
    id: s.id,
    week_plan_id: s.weekPlanId,
    date: s.date,
    type: s.type,
    status: s.status,
    session: s,
    updated_at: new Date().toISOString(),
  }
}

export async function pushLoggedSessions(userId: string, sessions: LoggedSession[]) {
  if (sessions.length === 0) return
  const rows = sessions.map((s) => loggedSessionRow(userId, s))
  const { error } = await client().from('logged_sessions').upsert(rows, { onConflict: 'user_id,id' })
  if (error) throw new Error(`Failed to save sessions: ${error.message}`)
}

/**
 * Upserts a single session row. Used for the in-workout autosave so each
 * completed set pushes only the active session (one row) instead of the whole
 * `logged_sessions` table — keeps the write payload tiny.
 */
export async function pushLoggedSession(userId: string, session: LoggedSession) {
  const { error } = await client()
    .from('logged_sessions')
    .upsert(loggedSessionRow(userId, session), { onConflict: 'user_id,id' })
  if (error) throw new Error(`Failed to save session: ${error.message}`)
}

/** Deletes one logged session row (the athlete removed it from History). */
export async function deleteLoggedSession(userId: string, sessionId: string) {
  const { error } = await client()
    .from('logged_sessions')
    .delete()
    .eq('user_id', userId)
    .eq('id', sessionId)
  if (error) throw new Error(`Failed to delete session: ${error.message}`)
}

// --- check-ins --------------------------------------------------------------

export async function pushCheckIns(userId: string, checkIns: CheckIn[]) {
  if (checkIns.length === 0) return
  const rows = checkIns.map((c) => ({
    user_id: userId,
    id: c.id,
    week_start_date: c.weekStartDate,
    trigger: c.trigger,
    check_in: c,
    created_at: c.createdAt,
    updated_at: new Date().toISOString(),
  }))
  const { error } = await client().from('check_ins').upsert(rows, { onConflict: 'user_id,id' })
  if (error) throw new Error(`Failed to save check-ins: ${error.message}`)
}

// --- combined ---------------------------------------------------------------

export async function pushAll(
  userId: string,
  data: { profile: UserProfile; weekPlans: WeekPlan[]; loggedSessions: LoggedSession[]; checkIns: CheckIn[] }
) {
  // Profile first (cheap, always present), then the bulkier collections.
  await pushProfile(userId, data.profile)
  await pushWeekPlans(userId, data.weekPlans)
  await pushLoggedSessions(userId, data.loggedSessions)
  await pushCheckIns(userId, data.checkIns)
}

export async function pullAll(userId: string): Promise<{
  profile: UserProfile | null
  weekPlans: WeekPlan[]
  loggedSessions: LoggedSession[]
  /** Undefined when the check_ins table doesn't exist yet (migration 0006 not applied). */
  checkIns?: CheckIn[]
}> {
  const c = client()
  const [profileRes, plansRes, sessionsRes, checkInsRes] = await Promise.all([
    c.from('profiles').select('*').eq('id', userId).maybeSingle(),
    c.from('week_plans').select('plan').eq('user_id', userId),
    c.from('logged_sessions').select('session').eq('user_id', userId),
    c.from('check_ins').select('check_in').eq('user_id', userId),
  ])
  if (profileRes.error) throw new Error(profileRes.error.message)
  if (plansRes.error) throw new Error(plansRes.error.message)
  if (sessionsRes.error) throw new Error(sessionsRes.error.message)

  return {
    profile: profileRes.data ? rowToProfile(profileRes.data as ProfileRow) : null,
    weekPlans: (plansRes.data ?? []).map((r) => r.plan as WeekPlan),
    loggedSessions: (sessionsRes.data ?? []).map((r) => r.session as LoggedSession),
    // A missing table mustn't block sign-in: check-ins are an extra.
    checkIns: checkInsRes.error ? undefined : (checkInsRes.data ?? []).map((r) => r.check_in as CheckIn),
  }
}
