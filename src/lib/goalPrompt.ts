import type { EventKind, GoalProfile, InjuryStatus, UserProfile } from '../types'
import { BASE_SHARE, DELOAD_EVERY_WEEKS, EVENT_METERS, FAT_LOSS_PCT_PER_WEEK, MIN_WEEKS, TAPER_WEEKS, peakWeeks, type RunVolume } from './coachingConfig'
import { getProgramProgress } from './programProgress'
import { predictSeconds, vdot, describeDistance } from './zones'
import { formatClock } from './cardioUtils'
import { EVENT_LABEL, weeksUntil } from './goalFlow'
import { daysPerWeekLabel } from './programOptions'

/**
 * The plan prompt's "## Goal" section (§3.7). The phase skeleton is computed
 * here, deterministically, so Claude fills in sessions inside a structure
 * that's safe and consistent rather than guessing periodisation.
 */

export interface Phase {
  name: 'Base' | 'Build' | 'Peak' | 'Taper'
  from: number
  to: number
}

/**
 * Base → Build → Peak → Taper for an event (taper by event, peak by block
 * length); a plain Base → Build for blocks without one. Lengths are in
 * coachingConfig.
 */
export function phaseSkeleton(totalWeeks: number, eventKind?: EventKind): Phase[] {
  const n = Math.max(1, Math.round(totalWeeks))
  const phases: Phase[] = []
  let w = 1
  const add = (name: Phase['name'], len: number) => {
    if (len <= 0) return
    phases.push({ name, from: w, to: w + len - 1 })
    w += len
  }
  if (eventKind) {
    const taper = Math.min(TAPER_WEEKS[eventKind] ?? 1, Math.max(0, n - 1))
    const peak = Math.min(peakWeeks(n), Math.max(0, n - taper - 1))
    const rest = n - taper - peak
    const base = Math.round(rest * BASE_SHARE)
    add('Base', base)
    add('Build', rest - base)
    add('Peak', peak)
    add('Taper', taper)
  } else {
    const base = Math.max(1, Math.round(n * 0.4))
    add('Base', Math.min(base, n))
    add('Build', n - base)
  }
  return phases
}

export function phaseForWeek(phases: Phase[], week: number): Phase | undefined {
  return phases.find((p) => week >= p.from && week <= p.to) ?? phases[phases.length - 1]
}

/** Every Nth week of base and build is a deload; peak and taper aren't. */
export function isDeloadWeek(phases: Phase[], week: number): boolean {
  const p = phaseForWeek(phases, week)
  return !!p && (p.name === 'Base' || p.name === 'Build') && week % DELOAD_EVERY_WEEKS === 0
}

export function describePhases(phases: Phase[]): string {
  return phases.map((p) => `${p.name} (week${p.from === p.to ? ` ${p.from}` : `s ${p.from}–${p.to}`})`).join(' → ')
}

const STATUS_WORDS: Record<InjuryStatus, string> = { active: 'still active', improving: 'improving', worse: 'WORSE — keep it conservative and advise getting it assessed' }

function eventLine(goal: GoalProfile, now: Date): string[] {
  const ev = goal.event!
  const name = ev.name ?? EVENT_LABEL[ev.kind]
  const cap = name.charAt(0).toUpperCase() + name.slice(1)
  const lines: string[] = []
  const when = ev.date ? `on ${ev.date} (${weeksUntil(ev.date, now)} weeks from this week)` : '(no date yet: build base and confirm the date at a check-in)'
  let aim = ev.aim === 'time' && ev.targetSeconds ? `Aim: ${formatClock(ev.targetSeconds)}` : ev.aim === 'finish-strong' ? 'Aim: finish strong' : 'Aim: get round comfortably'
  const meters = EVENT_METERS[ev.kind as keyof typeof EVENT_METERS]
  const r = goal.starting.recentResult
  if (meters && r) {
    const pred = predictSeconds(meters, vdot(r.meters, r.seconds))
    aim += ` (current fitness predicts ~${formatClock(pred)})`
  }
  lines.push(`${cap} ${when}. ${aim}.`)
  const vol = (Object.entries({ none: [0, 0], low: [0, 10], mid: [10, 25], high: [25, 50], vhigh: [50, 80] }) as [RunVolume, number[]][])
    .find(([, v]) => goal.starting.runKmPerWeek && v[0] === goal.starting.runKmPerWeek[0] && v[1] === goal.starting.runKmPerWeek[1])?.[0]
  const min = vol && ev.date ? MIN_WEEKS[ev.kind as keyof typeof MIN_WEEKS]?.[vol] : undefined
  if (min && ev.date && weeksUntil(ev.date, now) < min) {
    lines.push('Runway is tight for this starting point: prioritise getting round safely over a time.')
  }
  return lines
}

/** The "## Goal" section, or null for profiles without a GoalProfile. */
export function buildGoalSection(profile: UserProfile, weekStart: Date): string | null {
  const goal = profile.goal
  if (!goal) return null
  const lines: string[] = []

  if (goal.event && goal.pursuit === 'event') lines.push(...eventLine(goal, weekStart))
  else lines.push(`${goal.statement}.`)

  if (goal.pursuit === 'fitness' && goal.event?.kind === '5k') {
    lines.push('Couch-to-5K style: walk–run sessions building to 30 minutes of continuous running. Consistency and enjoyment over intensity.')
  } else if (goal.pursuit === 'fitness') {
    lines.push('Priority: consistency and enjoyment over intensity; progress gently.')
  }

  // Block position and phases.
  const progress = getProgramProgress(profile, weekStart)
  const phases = phaseSkeleton(progress.length, goal.pursuit === 'event' ? goal.event?.kind : undefined)
  const phase = phaseForWeek(phases, progress.rawWeek)
  const deload = !progress.isComplete && isDeloadWeek(phases, progress.week)
  lines.push(
    `Week ${progress.week} of ${progress.length} · Phase: ${describePhases(phases)}. ` +
      (progress.isComplete
        ? 'Past the end of the block: treat this as a continuation week.'
        : `This week: ${phase?.name ?? 'Base'}${deload ? `, deload week (every ${DELOAD_EVERY_WEEKS}th)` : ''}.`),
  )

  // Starting point.
  const s = goal.starting
  const facts: string[] = [`experience ${s.level} (derived from what they told us, not self-rated)`]
  if (s.runKmPerWeek) facts.push(s.runKmPerWeek[1] === 0 ? 'not running yet' : `running ${s.runKmPerWeek[0]}–${s.runKmPerWeek[1]} km/week`)
  if (s.trainingHoursPerWeek) facts.push(`training ${s.trainingHoursPerWeek[0]}–${s.trainingHoursPerWeek[1]} h/week`)
  if (s.lifting) facts.push(`lifting ${s.lifting}`)
  if (s.recentResult) facts.push(`recent ${describeDistance(s.recentResult.meters)} ${formatClock(s.recentResult.seconds)}`)
  if (goal.strength?.lifts?.length) facts.push(`best lifts ${goal.strength.lifts.map((l) => `${l.name} ${l.kg}kg × ${l.reps}`).join(', ')}`)
  lines.push(`Starting point: ${facts.join(', ')}.`)

  // Week-1 benchmarks instead of remembered numbers.
  if (progress.week === 1) {
    const runs = !!goal.event || goal.pursuit === 'fitness'
    if (runs && !s.recentResult && s.runKmPerWeek?.[1] !== 0) lines.push('Week 1: include a short benchmark (e.g. a 20-minute steady time trial, or 5K) to set pace zones.')
    if (goal.pursuit === 'strength' && !goal.strength?.lifts?.length) lines.push('Week 1: find working weights with ramp-up sets to a hard set of 5 on the main lifts.')
    if (goal.pursuit === 'fitness' && !goal.event) lines.push('Week 1: include a simple benchmark (max press-ups, a timed walk/run) to calibrate.')
  }

  if (goal.physique) {
    const [lo, hi] = FAT_LOSS_PCT_PER_WEEK
    lines.push(goal.physique.change === 'build-muscle'
      ? 'Hypertrophy-led strength with enough conditioning to stay fit.'
      : `Hypertrophy-led strength plus conditioning; expect fat loss of about ${lo}–${hi}% of body weight a week${goal.physique.byDate ? ` by ${goal.physique.byDate}` : ''}.`)
  }

  if (goal.sport) {
    const fixed = goal.sport.fixed.length ? goal.sport.fixed.map((f) => `${f.day} ${f.kind}`).join(', ') : 'none'
    lines.push(`${goal.sport.name}, ${goal.sport.season}-season. Days already taken: ${fixed} — don't plan on them${goal.sport.fixed.some((f) => f.kind === 'match') ? ', and never put heavy lower-body work within 48 h before a match' : ''}. Wants from extra training: ${goal.sport.wants.join(', ') || '—'}.`)
  }

  if (goal.pursuit === 'event' && goal.constraints.strengthWork === false) lines.push('No strength sessions wanted: running only (mobility/prehab inside warm-ups is fine).')
  lines.push(`Wants about ${daysPerWeekLabel(goal.constraints.daysPerWeek)} sessions a week of ~${goal.constraints.sessionMinutes} min (this week's days and length above take precedence).`)

  // Health: flags only, never diagnoses.
  if (goal.health.conservative) {
    lines.push('⚠️ Medical flag on the pre-exercise screen and not yet cleared by a GP/physio: keep everything conservative (moderate intensity, no maximal efforts) and remind them to get cleared.')
  }
  const status = Object.entries(goal.health.injuryStatus ?? {})
  if (status.length) lines.push(`Injury status from check-ins: ${status.map(([k, v]) => `${k} — ${STATUS_WORDS[v]}`).join('; ')}.`)
  if (goal.health.pastInjuries?.length) lines.push(`Resolved injuries (be sensible, no longer restricting): ${goal.health.pastInjuries.join('; ')}.`)

  if (goal.deferred.includes('coaching-tone')) lines.push("Coaching tone not chosen yet: use 'balanced'.")
  return lines.map((l) => `- ${l}`).join('\n')
}
