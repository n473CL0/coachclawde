import type { CardioType, LoggedSession, LoggedSet } from '../types'
import { computeWeightPRs, computeCardioPRs } from './prComputations'
import { computeSplit, inferCardioType, parseDurationToSeconds } from './cardioUtils'
import { format, parseISO } from 'date-fns'

/**
 * Builds a BOUNDED, plain-text summary of training history for the planning
 * prompt. History now lives in the database (Claude can't read the repo), so it
 * has to travel in the prompt — but dumping every set would bloat the prompt and
 * bury the signal. We therefore cap every section to a fixed budget regardless
 * of how much history exists:
 *
 *   • Recent sessions  — last few weeks, one condensed line each.
 *   • Current working weights — latest top set per lift (the overload anchor).
 *   • Personal bests   — a short highlight list.
 *
 * Older raw logs are intentionally dropped; the working-weights table already
 * captures where the athlete is now, which is what progressive overload needs.
 */

// Budgets — tuned to keep the prompt focused, not exhaustive.
const RECENT_DAYS = 24 // ~3.5 weeks
const MAX_RECENT_SESSIONS = 9
const MAX_EXERCISES_PER_LINE = 4
const MAX_WORKING_LIFTS = 14
const MAX_WEIGHT_PRS = 8
const MAX_CARDIO_PRS = 5

interface TopSet {
  weightKg: number
  reps: number
}

/** Heaviest completed set in a logged exercise (the "top set"). */
function topSet(sets: LoggedSet[]): TopSet | null {
  let best: TopSet | null = null
  for (const set of sets) {
    if (!set.completed || set.weightKg == null) continue
    const targetReps = Number(set.targetReps)
    const reps = set.actualReps ?? (Number.isNaN(targetReps) ? 0 : targetReps)
    if (!best || set.weightKg > best.weightKg || (set.weightKg === best.weightKg && reps > best.reps)) {
      best = { weightKg: set.weightKg, reps }
    }
  }
  return best
}

function fmtDate(dateStr: string): string {
  try {
    return format(parseISO(dateStr), 'EEE dd MMM')
  } catch {
    return dateStr
  }
}

/** One-line description of a logged session. */
function describeSession(s: LoggedSession): string {
  const date = fmtDate(s.date)
  const feel = s.feelings ? ` (felt ${s.feelings}/5)` : ''

  if (s.type === 'cardio') {
    const type: CardioType = s.cardioType ?? inferCardioType(`${s.title} ${s.focus}`)
    const pieces = (s.loggedIntervals ?? [])
      .filter((iv) => iv.completed)
      .map((iv) => {
        const meters = iv.actualDistanceMeters
        const seconds = iv.actualSeconds ?? (iv.actualTime ? parseDurationToSeconds(iv.actualTime) ?? undefined : undefined)
        const split = computeSplit(type, meters, seconds)
        const dist = meters ? `${(meters / 1000).toFixed(meters % 1000 === 0 ? 0 : 2)}km` : ''
        const time = iv.actualTime ? ` in ${iv.actualTime}` : ''
        const splitTxt = split ? ` (${split})` : ''
        return `${iv.label}${dist ? ` ${dist}` : ''}${time}${splitTxt}`.trim()
      })
      .slice(0, 3)
    const body = pieces.length ? pieces.join('; ') : s.focus
    return `${date} — ${s.title}: ${body}${feel}`
  }

  // weights / active-recovery
  const lifts = (s.loggedExercises ?? [])
    .map((ex) => ({ name: ex.name, top: topSet(ex.sets) }))
    .filter((x): x is { name: string; top: TopSet } => x.top != null)
    .sort((a, b) => b.top.weightKg - a.top.weightKg)
    .slice(0, MAX_EXERCISES_PER_LINE)
    .map((x) => `${x.name} ${x.top.weightKg}×${x.top.reps}`)
  const body = lifts.length ? lifts.join(', ') : s.focus
  return `${date} — ${s.title}: ${body}${feel}`
}

/** Latest top working set per lift across all history — the overload anchor. */
function workingWeights(completed: LoggedSession[]): string[] {
  // completed is sorted most-recent-first; first occurrence of a lift wins.
  const seen = new Map<string, { top: TopSet; date: string }>()
  for (const s of completed) {
    for (const ex of s.loggedExercises ?? []) {
      if (seen.has(ex.name)) continue
      const top = topSet(ex.sets)
      if (top) seen.set(ex.name, { top, date: s.date })
    }
  }
  return [...seen.entries()]
    .slice(0, MAX_WORKING_LIFTS)
    .map(([name, { top }]) => `${name}: ${top.weightKg}kg × ${top.reps}`)
}

export function summarizeHistory(sessions: LoggedSession[]): string {
  const completed = [...sessions]
    .filter((s) => s.status === 'complete')
    .sort((a, b) => new Date(b.completedAt || b.date).getTime() - new Date(a.completedAt || a.date).getTime())

  if (completed.length === 0) {
    return 'No logged sessions yet — this is the first planned week. Start conservatively and establish baselines.'
  }

  const cutoff = Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000
  const recent = completed
    .filter((s) => new Date(s.completedAt || s.date).getTime() >= cutoff)
    .slice(0, MAX_RECENT_SESSIONS)

  const sections: string[] = []

  sections.push(
    `**Recent sessions (last ~3 weeks, ${recent.length} of ${completed.length} total logged):**\n` +
      (recent.length
        ? recent.map((s) => `- ${describeSession(s)}`).join('\n')
        : '- (none in the last 3 weeks)')
  )

  const working = workingWeights(completed)
  if (working.length) {
    sections.push(
      '**Current working weights (latest top set per lift — progress from these):**\n' +
        working.map((w) => `- ${w}`).join('\n')
    )
  }

  const weightPRs = computeWeightPRs(completed).slice(0, MAX_WEIGHT_PRS)
  const cardioPRs = computeCardioPRs(completed).slice(0, MAX_CARDIO_PRS)
  const prLines = [
    ...weightPRs.map((p) => `- ${p.name}: ${p.weightKg}kg × ${p.reps}`),
    ...cardioPRs.map((p) => `- ${p.label}: ${p.time}`),
  ]
  if (prLines.length) {
    sections.push('**Personal bests:**\n' + prLines.join('\n'))
  }

  return sections.join('\n\n')
}
