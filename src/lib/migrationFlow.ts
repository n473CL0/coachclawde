import type { ExperienceLevel, GoalProfile, HealthFlag, UserProfile } from '../types'
import { END, scopedAnswers, type Flow, type FlowAnswers, type FlowNode } from './flow'
import { RUN_VOLUME_KM, type RunVolume } from './coachingConfig'
import { goalFromLegacyProfile } from './goalProfile'

/**
 * "Upgrade your goal" (§3.9): three questions for athletes onboarded before
 * v1.0.2, so nobody is forced back through onboarding. Their current profile is
 * mapped best-effort (get-strong → strength, look-great → physique, get-fit →
 * fitness) and these answers fill in what the mapping can't know.
 */

const MEDICAL: HealthFlag[] = ['condition', 'pregnancy', 'cardiac']
const list = (a: FlowAnswers, id: string) => (Array.isArray(a[id]) ? (a[id] as string[]) : [])
const runs = (p: UserProfile) => !!p.program?.exerciseTypes.includes('cardio')

export function buildMigrationFlow(profile: UserProfile): Flow {
  const nodes: FlowNode[] = [
    {
      id: 'm.target',
      kind: 'single',
      coach: () => [
        `Hi${profile.name ? ` ${profile.name.split(' ')[0]}` : ''}! Coach Clawde can now plan around a real goal. Three quick questions, and nothing you’ve logged changes.`,
        'Are you working towards an event or a date?',
      ],
      options: [
        { value: 'no', label: 'No, same goals as before' },
        { value: 'event', label: 'Yes, an event (a race…)' },
        { value: 'date', label: 'Yes, a date (holiday, wedding…)' },
      ],
      next: () => 'm.now',
    },
    runs(profile)
      ? {
          id: 'm.now',
          kind: 'single',
          coach: () => ['How much are you running at the moment?'],
          options: [
            { value: 'none', label: 'Not running' }, { value: 'low', label: 'Under 10 km a week' },
            { value: 'mid', label: '10–25 km a week' }, { value: 'high', label: '25–50 km a week' }, { value: 'vhigh', label: '50 km+ a week' },
          ],
          next: () => 'm.health',
        }
      : {
          id: 'm.now',
          kind: 'single',
          coach: () => ['How much lifting have you done?'],
          options: [
            { value: 'none', label: 'None' }, { value: 'on-off', label: 'On and off' },
            { value: 'under-1y', label: 'Consistently, under a year' }, { value: '1y+', label: 'Consistently, a year+' },
          ],
          next: () => 'm.health',
        },
    {
      id: 'm.health',
      kind: 'multi',
      exclusive: 'ok',
      coach: () => [
        profile.injuries.length
          ? `Last one: anything changed health-wise? I have: ${profile.injuries.join('; ')}.`
          : 'Last one: anything I should know health-wise?',
        'It’s the standard pre-exercise safety check. I only keep which boxes you tick, never details of a condition.',
      ],
      options: [
        { value: 'ok', label: profile.injuries.length ? 'No change' : 'All good' },
        { value: 'injury', label: profile.injuries.length ? 'My injuries changed' : 'An injury or niggle' },
        { value: 'condition', label: 'A medical condition or medication' },
        { value: 'pregnancy', label: 'Pregnant or recently gave birth' },
        { value: 'cardiac', label: 'Heart, chest pain or dizziness' },
      ],
      next: (a) => {
        const f = list(a, 'm.health')
        if (f.includes('injury')) return 'm.injury'
        if (f.some((x) => (MEDICAL as string[]).includes(x))) return 'm.clear'
        return END
      },
    },
    {
      id: 'm.injury',
      kind: 'text',
      multiline: true,
      optional: true,
      placeholder: 'One issue per line. Leave it empty if they’ve all cleared up.',
      coach: () => ['Update the list, one issue per line. I’ll program around them. (Empty means all clear.)'],
      next: () => END,
    },
    {
      id: 'm.clear',
      kind: 'single',
      coach: () => ['Thanks. Please check with your GP or physio, and I’ll keep things conservative until you’re cleared. No details needed.'],
      options: [{ value: 'check', label: 'I’ll check with them' }, { value: 'cleared', label: 'I’ve already been cleared' }],
      next: () => END,
    },
  ]
  return { start: 'm.target', nodes: Object.fromEntries(nodes.map((n) => [n.id, n])) }
}

/**
 * The upgraded profile. Returns the patch plus, when the athlete has an event
 * or a date, which goal-tree branch to open next.
 */
export function applyMigration(profile: UserProfile, raw: FlowAnswers, now: Date): { patch: Partial<UserProfile>; reopen?: 'event' | 'physique' } {
  const flow = buildMigrationFlow(profile)
  const a = scopedAnswers(flow, raw)
  const base: GoalProfile = profile.goal ?? goalFromLegacyProfile(profile, now)
  const flags = list(a, 'm.health').filter((f) => f !== 'ok') as HealthFlag[]
  const medical = flags.some((f) => MEDICAL.includes(f))
  // "No change" keeps an existing injury flag.
  const keptFlags: HealthFlag[] = flags.length ? flags : profile.injuries.length ? ['injury'] : []
  const now_ = String(a['m.now'] ?? '')
  const starting = { ...base.starting }
  if (runs(profile)) {
    starting.runKmPerWeek = RUN_VOLUME_KM[now_ as RunVolume] ?? starting.runKmPerWeek
  } else if (now_) {
    starting.lifting = now_ as GoalProfile['starting']['lifting']
    starting.level = ({ none: 'beginner', 'on-off': 'returning', 'under-1y': 'intermediate', '1y+': 'advanced' } as Record<string, ExperienceLevel>)[now_] ?? starting.level
  }
  const goal: GoalProfile = {
    ...base,
    starting,
    health: {
      ...base.health,
      flags: keptFlags,
      ...(medical ? { conservative: a['m.clear'] !== 'cleared', cleared: a['m.clear'] === 'cleared' } : {}),
    },
    migrated: true,
    updatedAt: now.toISOString(),
  }
  const patch: Partial<UserProfile> = { goal }
  if (a['m.injury'] !== undefined) {
    // Safety-critical: verbatim, one per line. Empty = all cleared up.
    const lines = String(a['m.injury']).split(/\n+/).map((l) => l.trim()).filter(Boolean)
    const cleared = profile.injuries.filter((i) => !lines.includes(i))
    patch.injuries = lines
    goal.health.pastInjuries = [...(goal.health.pastInjuries ?? []), ...cleared]
    if (!lines.length) goal.health.flags = goal.health.flags.filter((f) => f !== 'injury')
  }
  const reopen = a['m.target'] === 'event' ? 'event' : a['m.target'] === 'date' ? 'physique' : undefined
  return { patch, reopen }
}
