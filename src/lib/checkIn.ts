import { addDays, format, parseISO } from 'date-fns'
import type {
  CheckIn, CheckInAction, CheckInTrigger, CoachingStyle, DeferredId, GoalProfile, LoggedSession,
  RunsWith, UserProfile, WeekPlan,
} from '../types'
import { END, scopedAnswers, splitInline, walk, type ChatOption, type Flow, type FlowAnswers, type FlowNode } from './flow'
import { CHECK_IN_MAX_QUESTIONS, EVENT_CONFIRM_WEEKS_OUT, EVENT_METERS, INTENSITY_CALIBRATION, LIGHTER_WEEK, ZONE_OFFSET_PCT } from './coachingConfig'
import { EVENT_LABEL, blockLengthWeeks, weeksUntil } from './goalFlow'
import { getProgramProgress } from './programProgress'
import { goalOrLegacy } from './goalProfile'
import { formatClock } from './cardioUtils'
import { flattenWorkout } from './workout'
import { getMonday, toLocalISODate } from './weekUtils'
import { nanoid } from './nanoid'

/**
 * Weekly check-ins (§4 of docs/RUNNERS-AND-ATHLETES.md): a ~60-second chat on
 * the same flow engine as onboarding. Rules over the week's logs pick the
 * questions (C1–C10), a budget keeps it to six, and every answer maps to a
 * concrete action that the app applies and the next plan prompt carries.
 * Deterministic: the same week and answers always give the same check-in.
 */

export type CheckInQuestionId = 'c1' | 'c2' | 'c2a' | 'c2b' | 'c2c' | 'c3' | 'c4' | 'c5' | 'c6' | 'c7' | 'c8' | 'c9' | 'c10'

/** The order questions are asked in. */
export const DISPLAY_ORDER: CheckInQuestionId[] = ['c1', 'c2', 'c2a', 'c2b', 'c2c', 'c3', 'c4', 'c5', 'c6', 'c10', 'c9', 'c8', 'c7']
/**
 * Which questions survive when more than six qualify (§4.3): C1, C4 (safety),
 * C2 and its follow-ups, C10/C6 (event), C7, C9, C3, C5, C8.
 */
export const PRIORITY: CheckInQuestionId[] = ['c1', 'c4', 'c2', 'c2a', 'c2b', 'c2c', 'c10', 'c6', 'c7', 'c9', 'c3', 'c5', 'c8']

/** Everything the rules look at, computed from the week's data. */
export interface CheckInFacts {
  weekStart: string
  trigger: CheckInTrigger
  /** 1 for the athlete's first check-in. */
  number: number
  planned: number
  done: number
  /** Average planned session length, for "shorter sessions?" options. */
  sessionMinutes: number
  /** Injury to ask about, when one is due: a profile injury, or a pain note from this week. */
  injury?: { label: string; line: string; fromPainNote: boolean }
  /** A completed pace-based cardio session this week (title). */
  pacedSession?: string
  event?: { name: string; date?: string; weeksOut?: number; passed: boolean; resultLogged: boolean }
  goalStatement: string
  pursuit?: GoalProfile['pursuit']
  /** Block midpoint, block end or after the event. */
  milestone?: 'midpoint' | 'block-end' | 'after-event' | 'event-3w' | 'event-week'
  /** The deferred question due this check-in, if any. */
  deferred?: DeferredId
  /** Reactive one-question check-in: what triggered it. */
  reactive?: 'pain' | 'low-feel'
}

// --- facts ------------------------------------------------------------------------

const PACE_EFFORTS = new Set(['marathon', 'threshold', 'interval', 'repetition'])
const MIN_CHECK_IN: Record<DeferredId, number> = { 'runs-with': 1, nutrition: 1, 'long-run-day': 1, 'coaching-tone': 2, 'focus-areas': 3 }

/** The deferred question that may ride along with check-in `n`. */
export function dueDeferred(goal: GoalProfile | undefined, n: number): DeferredId | undefined {
  return goal?.deferred.find((d) => n >= MIN_CHECK_IN[d])
}

/** The athlete's own words, trimmed to a few for a chat bubble. */
function shortQuote(line: string): string {
  const words = line.trim().split(/\s+/)
  return words.length > 8 ? `${words.slice(0, 8).join(' ')}…` : line.trim()
}

/** Short name for an injury line: up to the first comma/colon, ≤ 5 words. */
export function injuryLabel(line: string): string {
  const head = line.split(/[:,.;—–(-]/)[0].trim()
  const words = head.split(/\s+/).slice(0, 5).join(' ')
  return (words || line).replace(/^(my|the)\s+/i, '').toLowerCase()
}

export function computeFacts(input: {
  profile: UserProfile
  plan?: WeekPlan
  loggedSessions: LoggedSession[]
  checkIns: CheckIn[]
  weekStart: string
  trigger: CheckInTrigger
  now: Date
}): CheckInFacts {
  const { profile, plan, loggedSessions, checkIns, weekStart, trigger, now } = input
  const goal = profile.goal
  const weekEnd = toLocalISODate(addDays(parseISO(weekStart), 6))
  const inWeek = loggedSessions.filter((s) => s.status === 'complete' && s.date >= weekStart && s.date <= weekEnd)
  const plannedIds = new Set(plan?.sessions.map((s) => s.id) ?? [])
  const done = plan ? inWeek.filter((s) => plannedIds.has(s.plannedSessionId)).length : inWeek.length
  const planned = plan?.sessions.length ?? done
  const mins = plan?.sessions.map((s) => s.estimatedMinutes).filter((m) => m > 0) ?? []
  const sessionMinutes = mins.length ? Math.round(mins.reduce((a, b) => a + b, 0) / mins.length) : goal?.constraints.sessionMinutes ?? 60

  const n = checkIns.filter((c) => c.trigger !== 'reactive' && c.trigger !== 'migration').length + 1
  const resolved = new Set(goal?.health.pastInjuries ?? [])
  const activeInjury = profile.injuries.find((i) => !resolved.has(i))
  const pain = inWeek.find((s) => s.painNotes?.trim())
  // A settled niggle isn't asked about every week: only when it's new, worse,
  // flagged by a pain note, or every 4th check-in (so "Gone" stays reachable).
  const status = activeInjury ? goal?.health.injuryStatus?.[activeInjury] : undefined
  const due = trigger === 'reactive' || !!pain || !status || status === 'worse' || n % 4 === 0
  const injury = activeInjury && due
    ? { label: injuryLabel(activeInjury), line: activeInjury, fromPainNote: false }
    : pain ? { label: `${injuryLabel(pain.painNotes!)} (from ${format(parseISO(pain.date), 'EEEE')})`, line: pain.painNotes!.trim(), fromPainNote: true } : undefined

  const pacedSession = inWeek.find((s) => {
    if (s.type !== 'cardio') return false
    const p = plan?.sessions.find((x) => x.id === s.plannedSessionId)
    return !!p?.workout && flattenWorkout(p.workout).some((f) => PACE_EFFORTS.has(f.step.effort))
  })?.title

  let event: CheckInFacts['event']
  if (goal?.event && goal.pursuit === 'event') {
    const today = toLocalISODate(now)
    const passed = !!goal.event.date && goal.event.date < today
    const resultLogged = checkIns.some((c) => c.actions.some((a) => a.kind === 'event-result'))
    event = {
      name: goal.event.name ?? EVENT_LABEL[goal.event.kind],
      date: goal.event.date,
      weeksOut: goal.event.date && !passed ? weeksUntil(goal.event.date, now) - 1 : undefined,
      passed,
      resultLogged,
    }
  }

  const progress = getProgramProgress(profile, now)
  let milestone: CheckInFacts['milestone']
  if (event?.passed && !event.resultLogged) milestone = 'after-event'
  else if (progress.isComplete) milestone = 'block-end'
  else if (event?.weeksOut === 0) milestone = 'event-week'
  else if (event?.weeksOut != null && event.weeksOut <= EVENT_CONFIRM_WEEKS_OUT) milestone = 'event-3w'
  else if (progress.length >= 6 && progress.week === Math.ceil(progress.length / 2)) milestone = 'midpoint'

  return {
    weekStart, trigger, number: n, planned, done, sessionMinutes, injury, pacedSession, event,
    goalStatement: goal?.statement ?? profile.goals[0] ?? 'your goal',
    pursuit: goal?.pursuit,
    milestone,
    deferred: dueDeferred(goal, n),
    reactive: trigger === 'reactive' ? (pain ? 'pain' : 'low-feel') : undefined,
  }
}

// --- rules ------------------------------------------------------------------------

const str = (a: FlowAnswers, id: string) => (typeof a[id] === 'string' ? (a[id] as string) : '')
const list = (a: FlowAnswers, id: string) => (Array.isArray(a[id]) ? (a[id] as string[]) : [])

/** Rule C1–C10: is the question asked, given the facts and answers so far? */
export function qualifies(id: CheckInQuestionId, f: CheckInFacts, a: FlowAnswers): boolean {
  if (f.trigger === 'reactive') {
    // One question, next time the app opens.
    return f.reactive === 'pain' ? id === 'c4' && !!f.injury : id === 'c2b'
  }
  const missed = f.done < f.planned
  const reasons = list(a, 'c2')
  switch (id) {
    case 'c1': return true
    case 'c2': return missed
    case 'c2a': return missed && reasons.includes('time')
    case 'c2b': return (missed && reasons.some((r) => r === 'tired' || r === 'ill')) || (a.c1 !== undefined && Number(a.c1) <= 2)
    case 'c2c': return missed && reasons.includes('else')
    case 'c3': return f.done >= 1
    case 'c4': return !!f.injury
    case 'c5': return !!f.pacedSession
    case 'c6': return !!f.event?.date && !f.event.passed && (f.number % 4 === 0 || (f.event.weeksOut != null && f.event.weeksOut <= EVENT_CONFIRM_WEEKS_OUT))
    case 'c10': return !!f.event?.passed && !f.event.resultLogged
    case 'c9': return f.number % 4 === 0 || f.milestone === 'midpoint' || f.milestone === 'block-end' || f.milestone === 'after-event'
    case 'c8': return !!f.deferred
    case 'c7': return true
  }
}

/** The questions asked: the top six qualifying by priority, in display order. */
export function selectQuestions(f: CheckInFacts, a: FlowAnswers): CheckInQuestionId[] {
  const qualifying = PRIORITY.filter((id) => qualifies(id, f, a))
  const chosen = new Set(qualifying.slice(0, CHECK_IN_MAX_QUESTIONS))
  return DISPLAY_ORDER.filter((id) => chosen.has(id))
}

/** Qualifying questions that didn't fit the budget ("no change this week" / rolls over). */
export function overBudget(f: CheckInFacts, a: FlowAnswers): CheckInQuestionId[] {
  const asked = new Set(selectQuestions(f, a))
  return DISPLAY_ORDER.filter((id) => qualifies(id, f, a) && !asked.has(id))
}

// --- the questions ----------------------------------------------------------------

const DEFERRED_Q: Record<DeferredId, { coach: string; kind: 'single' | 'multi'; options: ChatOption[]; exclusive?: string }> = {
  'runs-with': {
    coach: 'One I saved from onboarding: what do you run with? It decides whether I can set reps by distance.',
    kind: 'multi',
    options: [
      { value: 'phone', label: 'Just my phone' }, { value: 'watch', label: 'A GPS watch' },
      { value: 'track', label: 'I can use a track' }, { value: 'treadmill', label: 'A treadmill' },
    ],
  },
  'coaching-tone': {
    coach: 'One I saved from onboarding: now you’ve trained a bit, how do you like to be coached?',
    kind: 'single',
    options: [
      { value: 'supportive', label: 'Encouraging' }, { value: 'balanced', label: 'Balanced' },
      { value: 'intense', label: 'Straight-talking, push me' },
    ],
  },
  nutrition: {
    coach: 'One I saved from onboarding: any dietary needs I should know for nutrition pointers?',
    kind: 'multi',
    exclusive: 'none',
    options: [
      { value: 'none', label: 'None' }, { value: 'Vegetarian', label: 'Vegetarian' }, { value: 'Vegan', label: 'Vegan' },
      { value: 'Gluten-free', label: 'Gluten-free' }, { value: 'Dairy-free', label: 'Dairy-free' },
    ],
  },
  'focus-areas': {
    coach: 'One I saved from onboarding: any areas you’d most like to bring on?',
    kind: 'multi',
    exclusive: 'none',
    options: [
      { value: 'none', label: 'All-round' }, { value: 'arms', label: 'Arms' }, { value: 'shoulders', label: 'Shoulders' },
      { value: 'chest', label: 'Chest' }, { value: 'back', label: 'Back' }, { value: 'glutes', label: 'Glutes' },
      { value: 'legs', label: 'Legs' }, { value: 'core', label: 'Core' },
    ],
  },
  'long-run-day': {
    coach: 'One I saved from onboarding: which day suits your long run?',
    kind: 'single',
    options: [{ value: 'Sat', label: 'Saturday' }, { value: 'Sun', label: 'Sunday' }, { value: 'weekday', label: 'A weekday' }],
  },
}

const FEEL: ChatOption[] = [
  { value: '1', label: '😫 Rough' }, { value: '2', label: '😕 Meh' }, { value: '3', label: '😐 OK' },
  { value: '4', label: '🙂 Good' }, { value: '5', label: '🤩 Great' },
]

function weekLabel(f: CheckInFacts): string {
  return format(parseISO(f.weekStart), 'd MMM')
}

function questionNode(id: CheckInQuestionId, f: CheckInFacts): Omit<FlowNode, 'next'> {
  const missed = f.planned - f.done
  switch (id) {
    case 'c1':
      return {
        id, kind: 'single', options: FEEL,
        coach: () => [
          f.planned
            ? `Week of ${weekLabel(f)}: you did ${f.done} of ${f.planned} session${f.planned === 1 ? '' : 's'}. How was it overall?`
            : `Week of ${weekLabel(f)}. How was it overall?`,
        ],
      }
    case 'c2':
      return {
        id, kind: 'multi',
        coach: () => [`What got in the way of the missed session${missed === 1 ? '' : 's'}? No judgement, it helps me plan.`],
        options: [
          { value: 'time', label: 'No time' }, { value: 'tired', label: 'Too tired' }, { value: 'ill', label: 'Ill' },
          { value: 'sore', label: 'Sore or injured' }, { value: 'life', label: 'Life happened' },
          { value: 'motivation', label: 'Lost motivation' }, { value: 'else', label: 'Did something else' },
        ],
      }
    case 'c2a': {
      const shorter = [45, 30, 20].filter((m) => m < f.sessionMinutes).slice(0, 2)
      return {
        id, kind: 'single',
        coach: () => ['Sessions too long? For next week, shall I…'],
        options: [...shorter.map((m) => ({ value: String(m), label: `Make them ${m} min` })), { value: 'fewer', label: 'Plan one fewer day' }],
      }
    }
    case 'c2b':
      return {
        id, kind: 'single',
        coach: () => [f.trigger === 'reactive' ? 'A couple of your sessions felt rough lately. Want this week a bit lighter so you can recover?' : 'Want next week a bit lighter so you can recover?'],
        options: [{ value: 'yes', label: 'Yes, lighter' }, { value: 'no', label: 'No, keep building' }],
      }
    case 'c2c':
      return {
        id, kind: 'single',
        coach: () => ['Let’s log what you did instead, so it counts.'],
        options: [{ value: 'log', label: 'Log it after this' }, { value: 'logged', label: 'Already logged' }, { value: 'skip', label: 'Not worth logging' }],
      }
    case 'c3':
      return {
        id, kind: 'single',
        coach: () => ['How did the training itself feel?'],
        options: [{ value: 'easy', label: 'Too easy' }, { value: 'right', label: 'About right' }, { value: 'hard', label: 'Too hard' }],
      }
    case 'c4':
      return {
        id, kind: 'single',
        coach: () => [
          `${f.trigger === 'reactive' ? 'You’ve noted pain a couple of times. ' : ''}How has this been this week: “${shortQuote(f.injury!.line)}”?`,
        ],
        options: [{ value: 'better', label: 'Better' }, { value: 'same', label: 'Same' }, { value: 'worse', label: 'Worse' }, { value: 'gone', label: 'Gone' }],
      }
    case 'c5':
      return {
        id, kind: 'single',
        coach: () => [`Were the target paces in ${f.pacedSession}…`],
        options: [{ value: 'easy', label: 'Too easy' }, { value: 'right', label: 'About right' }, { value: 'hard', label: 'Too hard' }],
      }
    case 'c6':
      return {
        id, kind: 'single',
        coach: () => [`${f.event!.weeksOut === 0 ? 'Race week!' : `${f.event!.weeksOut} week${f.event!.weeksOut === 1 ? '' : 's'} to go.`} Still on for the ${f.event!.name} on ${format(parseISO(f.event!.date!), 'EEE d MMM')}?`],
        options: [{ value: 'yes', label: 'Yes!' }, { value: 'date', label: 'The date changed' }, { value: 'aim', label: 'Change my aim' }],
      }
    case 'c10':
      return {
        id, kind: 'single',
        coach: () => [`How did the ${f.event!.name} go?`],
        options: [
          { value: 'finished', label: 'Finished in…', input: 'duration', hours: true },
          { value: 'dnf', label: 'Didn’t finish' }, { value: 'dns', label: 'Didn’t race' },
        ],
        label: (v) => {
          const { value, payload } = splitInline(v)
          return value === 'finished' ? `Finished in ${formatClock(Number(payload))}` : value === 'dnf' ? 'Didn’t finish' : 'Didn’t race'
        },
      }
    case 'c9':
      return f.milestone === 'after-event'
        ? {
            id, kind: 'single', coach: () => ['What’s next?'],
            options: [{ value: 'rest', label: 'Recover, then decide' }, { value: 'again', label: 'Go again, faster' }, { value: 'new', label: 'Something new' }],
          }
        : {
            id, kind: 'single',
            coach: () => [f.milestone === 'block-end' ? `That’s your block done. Still working towards “${f.goalStatement}”?` : `Quick one: still working towards “${f.goalStatement}”?`],
            options: [{ value: 'yes', label: 'Yes' }, { value: 'tweak', label: 'Tweak it' }, { value: 'new', label: 'Something new' }],
          }
    case 'c8': {
      // Built for every check-in, but only asked when something is deferred.
      const q = DEFERRED_Q[f.deferred ?? 'runs-with']
      return { id, kind: q.kind, coach: () => [q.coach], options: q.options, exclusive: q.exclusive }
    }
    case 'c7':
      return {
        id, kind: 'multi', exclusive: 'nothing',
        coach: () => ['Last one. Anything coming up next week?'],
        options: [
          { value: 'travel', label: 'Travelling' }, { value: 'busy', label: 'Busy (work or exams)' },
          { value: 'match', label: 'Match or event' }, { value: 'late', label: 'Late nights' }, { value: 'nothing', label: 'Nothing special' },
        ],
      }
  }
}

/** The check-in as a flow: each node's edge is the next selected question. */
export function buildCheckInFlow(f: CheckInFacts): Flow {
  const nodes: Record<string, FlowNode> = {}
  const nextAfter = (id: CheckInQuestionId | null) => (a: FlowAnswers) => {
    const asked = selectQuestions(f, a)
    const from = id ? DISPLAY_ORDER.indexOf(id) : -1
    return asked.find((q) => DISPLAY_ORDER.indexOf(q) > from) ?? END
  }
  for (const id of DISPLAY_ORDER) nodes[id] = { ...questionNode(id, f), next: nextAfter(id) }
  const start = nextAfter(null)({})
  return { start, nodes }
}

// --- answers → actions ------------------------------------------------------------

/** The concrete things the answers do (C-P1: every answer does something). */
export function checkInActions(f: CheckInFacts, raw: FlowAnswers): CheckInAction[] {
  const flow = buildCheckInFlow(f)
  const a = scopedAnswers(flow, raw)
  const asked = new Set(Object.keys(a))
  const out: CheckInAction[] = []
  if (asked.has('c2a')) {
    out.push(a.c2a === 'fewer' ? { kind: 'fewer-days' } : { kind: 'session-minutes', value: Number(a.c2a) })
  }
  if (asked.has('c2b') && a.c2b === 'yes') out.push({ kind: 'lighter-week' })
  if (asked.has('c2c') && a.c2c === 'log') out.push({ kind: 'log-swap' })
  if (asked.has('c3') && a.c3 !== 'right') out.push({ kind: 'intensity', value: a.c3 === 'easy' ? 'up' : 'down' })
  if (asked.has('c4') && f.injury) {
    const status = ({ better: 'improving', same: 'active', worse: 'worse', gone: 'gone' } as const)[str(a, 'c4') as 'better']
    out.push({ kind: 'injury-status', injury: f.injury.line, status, ...(f.injury.fromPainNote ? { fromPainNote: true } : {}) })
  }
  if (asked.has('c5') && a.c5 !== 'right') out.push({ kind: 'zone-offset', value: a.c5 === 'easy' ? ZONE_OFFSET_PCT.tooEasy : ZONE_OFFSET_PCT.tooHard })
  if (asked.has('c6') && a.c6 !== 'yes') out.push({ kind: 'reopen-goal', node: a.c6 === 'date' ? 'ev.date' : 'ev.aim' })
  if (asked.has('c10')) {
    const { value, payload } = splitInline(a.c10)
    out.push(value === 'finished' ? { kind: 'event-result', outcome: 'finished', seconds: Number(payload) } : { kind: 'event-result', outcome: value as 'dnf' })
  }
  if (asked.has('c9')) {
    const v = str(a, 'c9')
    if (v === 'tweak') out.push({ kind: 'reopen-goal', node: TWEAK_NODE[f.pursuit ?? 'fitness'] })
    if (v === 'new' || v === 'again') out.push({ kind: 'reopen-goal', node: 'why' })
    // Same goal at the end of a block: the next block starts now.
    if (v === 'yes' && f.milestone === 'block-end') out.push({ kind: 'new-block' })
  }
  if (asked.has('c8') && f.deferred) {
    const v = a.c8
    out.push({ kind: 'deferred', id: f.deferred, value: (Array.isArray(v) ? v : [String(v)]).filter((x) => x !== 'none') })
  }
  if (asked.has('c7')) {
    const notes = list(a, 'c7').flatMap((v) => (C7_NOTES[v] ? [C7_NOTES[v]] : []))
    if (notes.length) out.push({ kind: 'planner-notes', value: notes.join(' ') })
  }
  return out
}

/** "Tweak it" re-enters the goal tree at the pursuit's first branch question. */
const TWEAK_NODE: Record<GoalProfile['pursuit'], string> = {
  event: 'ev.aim', fitness: 'fit.what', physique: 'phy.change', strength: 'str.kind', sport: 'sp.season', tracker: 'trk.coach',
}

const C7_NOTES: Record<string, string> = {
  travel: 'Travelling next week: suggest hotel-room or bodyweight sessions.',
  busy: 'Busy week (work or exams): keep sessions tight.',
  match: 'Match or event next week: keep the day before easy.',
  late: 'Late nights next week: no hard session the morning after.',
}

const TONE: Record<string, string> = { supportive: 'encouraging', balanced: 'balanced', intense: 'straight-talking' }
const RUNS_WITH_WORDS: Record<string, string> = {
  phone: 'phone only: reps by time', watch: 'GPS watch: distance reps are fine', track: 'track access: distance reps on the track', treadmill: 'treadmill: speeds in km/h',
}

/** One plain-English line per action. */
export function describeAction(x: CheckInAction, f?: CheckInFacts): string {
  switch (x.kind) {
    case 'session-minutes': return `Next week’s sessions: ${x.value} min (was ${f?.sessionMinutes ?? '—'})`
    case 'fewer-days': return 'Plan one fewer training day next week'
    case 'lighter-week': return LIGHTER_WEEK
    case 'intensity': return x.value === 'up' ? INTENSITY_CALIBRATION.tooEasy : INTENSITY_CALIBRATION.tooHard
    case 'injury-status': {
      const name = injuryLabel(x.injury)
      return ({
        improving: `${capital(name)}: improving. Keep programming around it`,
        active: `${capital(name)}: unchanged. Keep programming around it`,
        worse: `${capital(name)}: worse. Lighter on the moves that load it this week`,
        gone: `${capital(name)}: resolved. Moved to injury history`,
      } as const)[x.status]
    }
    case 'zone-offset': return x.value > 0 ? `Target paces felt too easy: zones ${x.value}% faster` : `Target paces felt too hard: zones ${-x.value}% easier`
    case 'planner-notes': return x.value
    case 'deferred':
      if (x.id === 'runs-with') return `Runs with ${x.value.map((v) => RUNS_WITH_WORDS[v]).join('; ') || 'phone only: reps by time'}`
      if (x.id === 'coaching-tone') return `Coaching tone: ${TONE[x.value[0]] ?? 'balanced'}`
      if (x.id === 'nutrition') return x.value.length ? `Dietary needs: ${x.value.join(', ')}` : 'No dietary needs'
      if (x.id === 'focus-areas') return x.value.length ? `Focus areas: ${x.value.join(', ')}` : 'Focus: all-round'
      return `Long run on ${x.value[0] === 'weekday' ? 'a weekday' : x.value[0] === 'Sat' ? 'Saturdays' : 'Sundays'}`
    case 'reopen-goal': return x.node === 'why' ? 'Set a new goal (your answers are kept)' : x.node === 'ev.date' ? 'Update the event date' : 'Update your aim'
    case 'event-result':
      return x.outcome === 'finished' && x.seconds ? `${capital(f?.event?.name ?? 'Event')} result: ${formatClock(x.seconds)}. Paces updated from it` : x.outcome === 'dnf' ? 'Didn’t finish: recover first, then a gentle build' : 'Didn’t race: keep the build going'
    case 'log-swap': return 'Log what you did instead'
    case 'new-block': return 'Same goal: a new block starts this week'
  }
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** Builds the stored check-in from the facts and answers. */
export function buildCheckIn(f: CheckInFacts, raw: FlowAnswers, now: Date, id: string = nanoid()): CheckIn {
  const flow = buildCheckInFlow(f)
  const answers = scopedAnswers(flow, raw)
  const actions = checkInActions(f, answers)
  const feel = FEEL.find((o) => o.value === answers.c1)?.label.split(' ').slice(1).join(' ').toLowerCase()
  const lines: string[] = []
  if (f.trigger !== 'reactive') {
    lines.push(`${feel ? `Felt ${feel}. ` : ''}Did ${f.done} of ${f.planned} sessions${list(answers, 'c2').length ? ` (missed: ${list(answers, 'c2').join(', ').replace('else', 'did something else')})` : ''}.`)
  }
  for (const x of actions) if (x.kind !== 'log-swap' && x.kind !== 'reopen-goal') lines.push(describeAction(x, f))
  return {
    id,
    weekStartDate: f.weekStart,
    createdAt: now.toISOString(),
    trigger: f.trigger,
    answers: answers as Record<string, unknown>,
    actions,
    summary: lines.slice(0, 6).join('\n'),
  }
}

// --- applying actions -----------------------------------------------------------------

/**
 * What a check-in changes in the profile: injury status, zone nudges, a new
 * result, and answers to deferred questions. (Planner defaults are read from
 * the check-in by the planner; reopening the goal is a button.)
 */
export function applyCheckIn(profile: UserProfile, c: CheckIn, now: Date): Partial<UserProfile> {
  let goal: GoalProfile = goalOrLegacy(profile)
  let injuries = profile.injuries
  let program = profile.program
  let dietaryNotes = profile.dietaryNotes
  let goals = profile.goals
  const ts = now.toISOString()

  for (const x of c.actions) {
    if (x.kind === 'injury-status') {
      if (x.status === 'gone') {
        injuries = injuries.filter((i) => i !== x.injury)
        const status = { ...(goal.health.injuryStatus ?? {}) }
        delete status[x.injury]
        goal = { ...goal, health: { ...goal.health, injuryStatus: status, pastInjuries: x.fromPainNote ? goal.health.pastInjuries : [...(goal.health.pastInjuries ?? []), x.injury] } }
      } else {
        // A pain note that's the same or worse becomes a real injury to program around.
        if (x.fromPainNote && !injuries.includes(x.injury)) injuries = [...injuries, x.injury]
        goal = { ...goal, health: { ...goal.health, flags: goal.health.flags.includes('injury') ? goal.health.flags : [...goal.health.flags, 'injury'], injuryStatus: { ...(goal.health.injuryStatus ?? {}), [x.injury]: x.status } } }
      }
    }
    if (x.kind === 'new-block' && program) {
      program = { ...program, startDate: toLocalISODate(getMonday(now)), lengthWeeks: blockLengthWeeks(goal, now) }
    }
    if (x.kind === 'zone-offset') goal = { ...goal, zoneOffsetPct: (goal.zoneOffsetPct ?? 0) + x.value }
    if (x.kind === 'event-result' && x.seconds && goal.event) {
      const meters = EVENT_METERS[goal.event.kind as keyof typeof EVENT_METERS]
      if (meters) goal = { ...goal, zoneOffsetPct: 0, starting: { ...goal.starting, recentResult: { meters, seconds: x.seconds, date: goal.event.date } } }
    }
    if (x.kind === 'deferred') {
      goal = { ...goal, deferred: goal.deferred.filter((d) => d !== x.id), askedDeferred: [...new Set([...(goal.askedDeferred ?? []), x.id])] }
      if (x.id === 'runs-with') goal = { ...goal, constraints: { ...goal.constraints, runsWith: (x.value.length ? x.value : ['phone']) as RunsWith[] } }
      if (x.id === 'long-run-day' && (x.value[0] === 'Sat' || x.value[0] === 'Sun')) goal = { ...goal, constraints: { ...goal.constraints, longRunDay: x.value[0] } }
      if (x.id === 'coaching-tone' && program) program = { ...program, coachingStyle: (x.value[0] ?? 'balanced') as CoachingStyle }
      if (x.id === 'nutrition') dietaryNotes = [...new Set([...dietaryNotes, ...x.value])]
      if (x.id === 'focus-areas' && x.value.length) goals = [...goals.filter((g) => !g.startsWith('Focus areas:')), `Focus areas: ${x.value.join(', ')}`]
    }
  }
  return { goal: { ...goal, updatedAt: ts }, injuries, program, dietaryNotes, goals }
}

/** The check-in that should shape the plan for `weekStart` (the week before, or the one before that). */
export function checkInForPlanning(checkIns: CheckIn[], weekStart: string): CheckIn | undefined {
  const lo = toLocalISODate(addDays(parseISO(weekStart), -14))
  return [...checkIns]
    .filter((c) => c.trigger !== 'migration' && c.weekStartDate < weekStart && c.weekStartDate >= lo)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
}

/** Planner defaults from a check-in: minutes, one fewer day, and notes. */
export function plannerPrefill(c: CheckIn | undefined): { sessionMinutes?: number; fewerDays?: boolean; notes: string[] } {
  const notes: string[] = []
  let sessionMinutes: number | undefined
  let fewerDays = false
  for (const x of c?.actions ?? []) {
    if (x.kind === 'session-minutes') sessionMinutes = x.value
    if (x.kind === 'fewer-days') fewerDays = true
    if (x.kind === 'lighter-week') notes.push('Lighter week please, I need to recover.')
    if (x.kind === 'planner-notes') notes.push(x.value)
  }
  return { sessionMinutes, fewerDays, notes }
}

/** Every path through a check-in for these facts (for tests). */
export function checkInPath(f: CheckInFacts, answers: FlowAnswers): string[] {
  return walk(buildCheckInFlow(f), answers).path
}
