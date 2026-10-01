import type { GoalProfile, Pursuit, RunsWith, UserProfile } from '../types'
import { describeZones, runZones, describeDistance, type RunZones } from './zones'
import { formatClock } from './cardioUtils'

/**
 * Helpers over the athlete's GoalProfile that more than one screen needs.
 */

/** The athlete's running zones, when there's a recent result to base them on. */
export function athleteZones(profile: Pick<UserProfile, 'goal'>): RunZones | undefined {
  const r = profile.goal?.starting.recentResult
  if (!r || !(r.meters > 0) || !(r.seconds > 0)) return undefined
  return runZones(r, profile.goal?.zoneOffsetPct ?? 0)
}

const DISTANCE_TOOLS: RunsWith[] = ['watch', 'track', 'treadmill']

/**
 * Plans may only ask for what the athlete can measure. A phone in a pocket
 * can't end an 800 m rep (GPS needs the screen on and drifts), so until the
 * profile says there's a GPS watch, a track or a treadmill, reps go by time.
 */
export function canMeasureDistance(profile: Pick<UserProfile, 'goal'>): boolean {
  return (profile.goal?.constraints.runsWith ?? []).some((t) => DISTANCE_TOOLS.includes(t))
}

const RUNS_WITH_LABEL: Record<RunsWith, string> = {
  phone: 'phone only',
  watch: 'a GPS watch',
  track: 'track access',
  treadmill: 'a treadmill',
}

/** The prompt's measurement rule, one line. */
export function measurementLine(profile: Pick<UserProfile, 'goal'>): string {
  const tools = profile.goal?.constraints.runsWith ?? []
  if (!canMeasureDistance(profile)) {
    return `Runs with: ${tools.length ? RUNS_WITH_LABEL.phone : 'unknown (assume phone only)'} → prescribe reps and runs by **time**, not distance (end: { by: "time" }). Don't set distance-ended steps.`
  }
  const parts = tools.map((t) => RUNS_WITH_LABEL[t]).join(', ')
  const extra = [
    tools.includes('track') ? 'distance reps are fine on the track' : '',
    tools.includes('watch') ? 'distance reps are fine (GPS watch)' : '',
    tools.includes('treadmill') ? 'on the treadmill give speeds in km/h as `target`' : '',
  ].filter(Boolean).join('; ')
  return `Runs with: ${parts} → ${extra}.`
}

/** "From a 5K in 24:30 (VDOT 39.2)" */
export function resultSource(profile: Pick<UserProfile, 'goal'>): string | null {
  const r = profile.goal?.starting.recentResult
  const z = athleteZones(profile)
  if (!r || !z) return null
  return `${describeDistance(r.meters)} in ${formatClock(r.seconds)}, VDOT ${z.vdot.toFixed(1)}`
}

/** The prompt's pace-zone line, or a by-feel fallback. */
export function zonesLine(profile: Pick<UserProfile, 'goal'>): string {
  const z = athleteZones(profile)
  if (!z) {
    return 'Pace zones: no recent result yet. Use effort words; the app shows them by feel (RPE). Consider a short benchmark (e.g. a 20-minute time trial or a 5K) early on.'
  }
  const offset = profile.goal?.zoneOffsetPct
  const adj = offset ? ` (adjusted ${offset > 0 ? '+' : ''}${offset}% from check-ins)` : ''
  return `Pace zones (from ${resultSource(profile)})${adj}: ${describeZones(z)}.`
}

const PURSUIT_STATEMENT: Record<Pursuit, string> = {
  event: 'Train for an event',
  fitness: 'Get fitter and build a habit',
  physique: 'Look and feel better',
  strength: 'Get stronger',
  sport: 'Get better at my sport',
  tracker: 'Track my own plan',
}

/**
 * Best-effort GoalProfile for a profile onboarded before v1.1
 * (get-strong → strength, look-great → physique, get-fit → fitness). Nothing
 * is invented: unknowns stay unset, and the migration check-in fills them in.
 */
export function goalFromLegacyProfile(profile: UserProfile, now: Date = new Date()): GoalProfile {
  const program = profile.program
  const goals = program?.goals ?? []
  const pursuit: Pursuit = goals.includes('get-strong') ? 'strength' : goals.includes('look-great') ? 'physique' : 'fitness'
  const ts = now.toISOString()
  return {
    version: 1,
    origin: 'legacy',
    pursuit,
    statement: profile.goals[0] ?? PURSUIT_STATEMENT[pursuit],
    starting: { level: profile.experienceLevel ?? 'beginner' },
    constraints: {
      daysPerWeek: program?.daysPerWeek ?? 3,
      sessionMinutes: 60,
      facilities: program?.facilities ?? [],
    },
    health: { flags: profile.injuries.length ? ['injury'] : [] },
    deferred: program?.exerciseTypes.includes('cardio') ? ['runs-with'] : [],
    createdAt: ts,
    updatedAt: ts,
  }
}

/** The athlete's goal, or a legacy mapping to edit when there isn't one yet. */
export function goalOrLegacy(profile: UserProfile): GoalProfile {
  return profile.goal ?? goalFromLegacyProfile(profile)
}
