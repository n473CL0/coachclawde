import { differenceInCalendarDays, format, parseISO } from 'date-fns'
import type {
  CoachingStyle, DeferredId, EventKind, ExperienceLevel, FixedDay, GoalProfile, HealthFlag,
  ProgramConfig, ProgramExerciseType, ProgramFacility, ProgramGoal, Pursuit, RecentResult, UserProfile,
} from '../types'
import { END, scopedAnswers, splitInline, type ChatOption, type Flow, type FlowAnswers, type FlowContext, type FlowNode } from './flow'
import {
  AMBITION_PCT_PER_WEEK, BEGINNER_BLOCK_WEEKS, DEFAULT_BLOCK_WEEKS, EVENT_METERS, FAT_LOSS_PCT_PER_WEEK,
  MAX_BLOCK_WEEKS, MIN_WEEKS, RUN_VOLUME_KM, STEPPING_STONE_PCT_PER_WEEK, type RunVolume,
} from './coachingConfig'
import { predictSeconds, vdot, describeDistance, runZones, formatPace } from './zones'
import { formatClock } from './cardioUtils'
import { getMonday, toLocalISODate, WEEK_DAYS_MON } from './weekUtils'
import { daysPerWeekLabel } from './programOptions'

/**
 * Onboarding v2: a deterministic goal tree (§3 of docs/RUNNERS-AND-ATHLETES.md).
 * One "why" question routes to a short branch, then a shared tail (time, kit,
 * health). Every answer changes the plan, the app's behaviour or safety;
 * anything that can be measured or learned later is deferred.
 *
 * Clawde's replies are templates filled with computed values: reflections and
 * feasibility checks, never free generation.
 */

// --- option sets ---------------------------------------------------------------

export const EVENT_LABEL: Record<EventKind, string> = {
  '5k': '5K', '10k': '10K', half: 'half marathon', marathon: 'marathon', trail: 'trail race',
  tri: 'triathlon', sportive: 'sportive', hyrox: 'Hyrox', other: 'event',
}
const RUN_EVENTS: EventKind[] = ['5k', '10k', 'half', 'marathon', 'trail']
const TIMED_EVENTS = ['5k', '10k', 'half', 'marathon'] as const

const FIT_WHAT: ChatOption[] = [
  { value: 'energy', label: 'More energy, feel healthier' },
  { value: '5k', label: 'Run 5K without stopping' },
  { value: 'keepup', label: 'Keep up with sport, kids or mates' },
  { value: 'routine', label: 'A routine I actually stick to' },
]
const LIKES: ChatOption[] = [
  { value: 'walking', label: 'Walking' }, { value: 'running', label: 'Running' },
  { value: 'cycling', label: 'Cycling' }, { value: 'swimming', label: 'Swimming' },
  { value: 'gym', label: 'Gym' }, { value: 'home', label: 'Home workouts' },
  { value: 'classes', label: 'Classes' }, { value: 'yoga', label: 'Yoga & mobility' },
]
const LIFTING: ChatOption[] = [
  { value: 'none', label: 'None' }, { value: 'on-off', label: 'On and off' },
  { value: 'under-1y', label: 'Consistently, under a year' }, { value: '1y+', label: 'Consistently, a year+' },
]
const SPORTS: ChatOption[] = [
  { value: 'Football', label: 'Football' }, { value: 'Rugby', label: 'Rugby' }, { value: 'Rowing', label: 'Rowing' },
  { value: 'Cycling', label: 'Cycling' }, { value: 'Swimming', label: 'Swimming' }, { value: 'Tennis', label: 'Tennis / racket' },
  { value: 'Hockey', label: 'Hockey' }, { value: 'Climbing', label: 'Climbing' },
  { value: 'other', label: 'Other', input: 'text', placeholder: 'Which sport?' },
]
const RUN_NOW: ChatOption[] = [
  { value: 'none', label: 'Not running yet' }, { value: 'low', label: 'Under 10 km a week' },
  { value: 'mid', label: '10–25 km a week' }, { value: 'high', label: '25–50 km a week' }, { value: 'vhigh', label: '50 km+ a week' },
]
const HOURS_NOW: ChatOption[] = [
  { value: 'none', label: 'Not training yet' }, { value: 'low', label: '1–3 hours a week' },
  { value: 'mid', label: '3–6 hours a week' }, { value: 'high', label: '6–10 hours a week' }, { value: 'vhigh', label: '10 hours+' },
]
const HOURS: Record<RunVolume, [number, number]> = { none: [0, 0], low: [1, 3], mid: [3, 6], high: [6, 10], vhigh: [10, 15] }
const HEALTH: ChatOption[] = [
  { value: 'ok', label: 'All good' },
  { value: 'injury', label: 'An injury or niggle' },
  { value: 'condition', label: 'A medical condition or medication' },
  { value: 'pregnancy', label: 'Pregnant or recently gave birth' },
  { value: 'cardiac', label: 'Heart, chest pain or dizziness' },
]
const MEDICAL: HealthFlag[] = ['condition', 'pregnancy', 'cardiac']
const RESULT_DISTANCES: ChatOption[] = [
  { value: '5000', label: '5K' }, { value: '10000', label: '10K' },
  { value: '21097.5', label: 'Half' }, { value: '42195', label: 'Marathon' },
]

// --- answer readers ------------------------------------------------------------------

const str = (a: FlowAnswers, id: string) => (typeof a[id] === 'string' ? (a[id] as string) : '')
const list = (a: FlowAnswers, id: string) => (Array.isArray(a[id]) ? (a[id] as string[]) : [])
const rec = (a: FlowAnswers, id: string) =>
  (a[id] && typeof a[id] === 'object' && !Array.isArray(a[id]) ? (a[id] as Record<string, string>) : {})

const isRunEvent = (a: FlowAnswers) => RUN_EVENTS.includes(splitInline(a['ev.kind']).value as EventKind)
const eventKind = (a: FlowAnswers) => splitInline(a['ev.kind']).value as EventKind

function eventName(a: FlowAnswers): string {
  const { value, payload } = splitInline(a['ev.kind'])
  return value === 'other' && payload ? payload : EVENT_LABEL[value as EventKind] ?? 'event'
}

/** The event or physique date, when one was given. */
function dateAnswer(a: FlowAnswers): string | undefined {
  if (a.why === 'event') {
    const d = str(a, 'ev.date')
    return d && d !== 'none' ? d : undefined
  }
  if (a.why === 'physique') {
    const { value, payload } = splitInline(a['phy.date'])
    return value === 'date' && payload ? payload : undefined
  }
  return undefined
}

/** Weeks from this week's Monday to `date`, counting the week it falls in. */
export function weeksUntil(date: string, now: Date): number {
  const days = differenceInCalendarDays(parseISO(date), getMonday(now))
  return Math.max(1, Math.floor(days / 7) + 1)
}

function weeksOf(a: FlowAnswers, ctx: FlowContext): number | null {
  const d = dateAnswer(a)
  return d ? weeksUntil(d, ctx.now) : null
}

function recentResult(a: FlowAnswers): RecentResult | undefined {
  const r = rec(a, 'ev.result')
  const meters = Number(r.distance)
  const seconds = Number(r.time)
  return meters > 0 && seconds > 0 ? { meters, seconds } : undefined
}

function aimSeconds(a: FlowAnswers): number | undefined {
  const { value, payload } = splitInline(a['ev.aim'])
  const n = Number(payload)
  return value === 'time' && n > 0 ? n : undefined
}

const longDate = (iso: string) => format(parseISO(iso), 'EEE d MMM yyyy')

// --- reflections & feasibility ---------------------------------------------------------

function dateLine(a: FlowAnswers, ctx: FlowContext): string {
  const w = weeksOf(a, ctx)
  if (!w) return 'No date yet is fine. I’ll build your base, and we can lock the date in at a check-in.'
  const runway = w >= 16 ? 'plenty of runway.' : w >= 10 ? 'enough to build properly.' : 'so we’ll keep it focused.'
  return `That’s ${w} week${w === 1 ? '' : 's'} away: ${runway}`
}

/** Below the minimum runway for the starting volume → plan to get round safely. */
export function isTight(a: FlowAnswers, ctx: FlowContext): boolean | null {
  const w = weeksOf(a, ctx)
  const min = MIN_WEEKS[eventKind(a) as keyof typeof MIN_WEEKS]?.[str(a, 'ev.now') as RunVolume]
  if (!w || !min) return null
  return w < min
}

function runwayLine(a: FlowAnswers, ctx: FlowContext): string | null {
  const tight = isTight(a, ctx)
  if (tight == null) return null
  const w = weeksOf(a, ctx)
  return tight
    ? `From where you are, ${w} weeks is tight for a ${eventName(a)}. I’ll plan to get you round safely rather than chase a time.`
    : `${w} weeks is enough to build up properly from there.`
}

export interface Feasibility {
  predicted: number
  /** % faster than predicted the aim needs (negative = already there). */
  gapPct?: number
  perWeekPct?: number
  verdict?: 'already' | 'no-date' | 'realistic' | 'ambitious' | 'stretch-too-far'
  /** A stepping-stone target when the aim is too far for the runway. */
  steppingStone?: number
}

export function feasibility(a: FlowAnswers, ctx: FlowContext): Feasibility | null {
  const r = recentResult(a)
  const meters = EVENT_METERS[eventKind(a) as keyof typeof EVENT_METERS]
  if (!r || !meters) return null
  const predicted = predictSeconds(meters, vdot(r.meters, r.seconds))
  const aim = aimSeconds(a)
  if (!aim) return { predicted }
  const gapPct = ((predicted - aim) / predicted) * 100
  const w = weeksOf(a, ctx)
  if (gapPct <= 0) return { predicted, gapPct, verdict: 'already' }
  if (!w) return { predicted, gapPct, verdict: 'no-date' }
  const perWeekPct = gapPct / w
  const verdict = perWeekPct <= AMBITION_PCT_PER_WEEK.realistic ? 'realistic'
    : perWeekPct <= AMBITION_PCT_PER_WEEK.ambitious ? 'ambitious' : 'stretch-too-far'
  const steppingStone = verdict === 'stretch-too-far'
    ? Math.ceil((predicted * (1 - (STEPPING_STONE_PCT_PER_WEEK / 100) * w)) / 60) * 60
    : undefined
  return { predicted, gapPct, perWeekPct, verdict, steppingStone }
}

function resultLine(a: FlowAnswers, ctx: FlowContext): string | null {
  if (str(a, 'ev.result') === 'none') return 'No problem. Week 1 includes a short benchmark run, and I’ll set your paces from that.'
  const r = recentResult(a)
  if (!r) return null
  const f = feasibility(a, ctx)
  const v = vdot(r.meters, r.seconds)
  const name = eventName(a)
  let s = f
    ? `A ${formatClock(r.seconds)} ${describeDistance(r.meters)} puts you around ${formatClock(f.predicted)} for a ${name} today.`
    : `A ${formatClock(r.seconds)} ${describeDistance(r.meters)} puts you around ${formatClock(predictSeconds(10000, v))} for 10K and ${formatClock(predictSeconds(21097.5, v))} for a half.`
  const aim = aimSeconds(a)
  const w = weeksOf(a, ctx)
  if (f?.gapPct != null && aim) {
    const gap = f.gapPct.toFixed(1)
    if (f.verdict === 'already') s += ' You’re already there on paper, so we’ll make it feel comfortable.'
    else if (f.verdict === 'no-date') s += ` ${formatClock(aim)} needs you about ${gap}% faster. I’ll check how realistic that is once there’s a date.`
    else if (f.verdict === 'realistic') s += ` ${formatClock(aim)} needs you about ${gap}% faster. Over ${w} weeks that’s realistic. I’ll set paces from where you are today and re-test every 4 weeks.`
    else if (f.verdict === 'ambitious') s += ` ${formatClock(aim)} needs you about ${gap}% faster: ambitious over ${w} weeks, so I’ll treat it as a stretch and re-test every 4 weeks.`
    else s += ` ${formatClock(aim)} needs you about ${gap}% faster, which is a lot for ${w} weeks. I’d aim for ${formatClock(f.steppingStone!)} first, then go again.`
  }
  return s
}

function physiqueLine(a: FlowAnswers, ctx: FlowContext): string {
  const w = weeksOf(a, ctx)
  if (!w) return 'Long-term is the best way to do it. Steady habits beat crash plans.'
  const [lo, hi] = FAT_LOSS_PCT_PER_WEEK
  if (a['phy.change'] !== 'build-muscle' && ctx.weightKg) {
    const kg = (pct: number) => Math.round((ctx.weightKg! * pct / 100) * w)
    return `In ${w} weeks a healthy rate (about ${lo}–${hi}% of body weight a week) is roughly ${kg(lo)}–${kg(hi)} kg. Let’s aim for that and look sharper by then.`
  }
  return `${w} weeks is enough to look and feel noticeably sharper. A healthy fat-loss rate is about ${lo}–${hi}% of body weight a week, so we’ll aim for that.`
}

function timeIntro(a: FlowAnswers, ctx: FlowContext): string | null {
  if (a.why === 'event') return a['ev.result'] !== undefined ? resultLine(a, ctx) : runwayLine(a, ctx)
  if (a.why === 'strength' && a['str.numbers'] !== undefined) {
    return a['str.numbers'] === 'test' ? 'Week 1 will find your working weights.' : 'Great. I’ll start your working sets just under those.'
  }
  if (a.why === 'fitness') return 'Good. That also tells me where you’ll train.'
  if (a.why === 'sport') return 'Got it. I’ll keep your heavy work well away from match days.'
  return null
}

const KG_LIFTS = [{ key: 'squat', label: 'Squat' }, { key: 'bench', label: 'Bench press' }, { key: 'deadlift', label: 'Deadlift' }]

function parseLift(v: string | undefined): { kg: number; reps: number } | null {
  const m = v?.match(/^(\d+(?:\.\d+)?)x(\d+)$/)
  return m ? { kg: Number(m[1]), reps: Number(m[2]) } : null
}

// --- the tree --------------------------------------------------------------------

const DAYS_DEFAULT: Record<string, number> = { event: 4, fitness: 3, physique: 4, strength: 4, sport: 2 }
const MINS_DEFAULT: Record<string, number> = { fitness: 30, physique: 45, strength: 75, sport: 45 }

const nodes: FlowNode[] = [
  {
    id: 'why',
    kind: 'single',
    coach: () => [
      "Hey! I'm Clawde, your Coach Claude training partner. 🦀",
      'A few quick questions so every plan fits you. Tap an answer to reply, and tap any answer later to change it.',
      'First: what’s the main reason you’re here?',
    ],
    options: [
      { value: 'event', label: 'Training for an event' },
      { value: 'fitness', label: 'Get fitter, build a habit' },
      { value: 'physique', label: 'Look and feel better' },
      { value: 'strength', label: 'Get stronger' },
      { value: 'sport', label: 'Better at my sport' },
      { value: 'tracker', label: 'I’ve got a plan, just track it' },
    ],
    next: (a) => ({ event: 'ev.kind', fitness: 'fit.what', physique: 'phy.change', strength: 'str.kind', sport: 'sp.sport', tracker: 'trk.source' } as Record<string, string>)[str(a, 'why')] ?? END,
  },

  // Event
  {
    id: 'ev.kind',
    kind: 'single',
    coach: () => ['Love it. Which event?'],
    options: [
      { value: '5k', label: '5K' }, { value: '10k', label: '10K' }, { value: 'half', label: 'Half marathon' },
      { value: 'marathon', label: 'Marathon' }, { value: 'trail', label: 'Trail / ultra' }, { value: 'tri', label: 'Triathlon' },
      { value: 'sportive', label: 'Cycling sportive' }, { value: 'hyrox', label: 'Hyrox' },
      { value: 'other', label: 'Something else', input: 'text', placeholder: 'What’s the event?' },
    ],
    next: () => 'ev.date',
  },
  {
    id: 'ev.date',
    kind: 'date',
    coach: (a) => [`When’s the ${eventName(a)}?`],
    skip: { value: 'none', label: 'No date yet' },
    samples: ['2027-03-21'],
    label: (v) => (v === 'none' ? 'No date yet' : longDate(v as string)),
    next: () => 'ev.aim',
  },
  {
    id: 'ev.aim',
    kind: 'single',
    coach: (a, ctx) => [dateLine(a, ctx), 'What would make it a win?'],
    options: (a) => [
      { value: 'get-round', label: 'Get round' },
      { value: 'finish-strong', label: 'Finish strong' },
      ...((TIMED_EVENTS as readonly string[]).includes(eventKind(a))
        ? [{ value: 'time', label: 'A time', input: 'duration' as const, hours: ['half', 'marathon'].includes(eventKind(a)) }]
        : []),
    ],
    label: (v) => {
      const { value, payload } = splitInline(v)
      return value === 'time' ? `Under ${formatClock(Number(payload))}` : value === 'get-round' ? 'Get round' : 'Finish strong'
    },
    next: () => 'ev.now',
  },
  {
    id: 'ev.now',
    kind: 'single',
    coach: (a) => [isRunEvent(a) ? 'How much are you running at the moment?' : 'How much are you training at the moment?'],
    options: (a) => (isRunEvent(a) ? RUN_NOW : HOURS_NOW),
    next: (a) => (isRunEvent(a) && a['ev.now'] !== 'none' ? 'ev.result' : 'time'),
  },
  {
    id: 'ev.result',
    kind: 'compound',
    coach: (a, ctx) => [runwayLine(a, ctx), 'Got a recent race or timed run? It sets your training paces.'].filter((x): x is string => !!x),
    fields: [
      { key: 'distance', label: 'Distance', kind: 'chips', options: RESULT_DISTANCES, initial: '5000' },
      { key: 'time', label: 'Time', kind: 'duration', hours: (v) => Number(v.distance) > 10000 },
    ],
    skip: { value: 'none', label: 'Not recently. Test me in week 1' },
    samples: [{ distance: '5000', time: '1470' }],
    label: (v) => {
      if (v === 'none') return 'Not recently. Test me in week 1'
      const r = v as Record<string, string>
      return `${describeDistance(Number(r.distance))} in ${formatClock(Number(r.time))}`
    },
    next: () => 'time',
  },

  // Fitness
  {
    id: 'fit.what',
    kind: 'single',
    coach: () => ['Nice. What would “fitter” mean for you?'],
    options: FIT_WHAT,
    next: () => 'fit.now',
  },
  {
    id: 'fit.now',
    kind: 'single',
    coach: (a) => [
      a['fit.what'] === '5k' ? 'Couch to 5K it is: walk–run sessions that build to 30 minutes of running.' : 'Good goal.',
      'How active are you right now?',
    ],
    options: [
      { value: 'sitting', label: 'Mostly sitting' }, { value: 'light', label: 'Walking, the odd session' },
      { value: '1-2x', label: 'Exercise 1–2× a week' }, { value: '3x+', label: '3+ times a week' },
    ],
    next: () => 'fit.likes',
  },
  {
    id: 'fit.likes',
    kind: 'multi',
    coach: () => ['What would you enjoy? This also tells me where you’ll train.'],
    options: LIKES,
    preselect: (a) => ({ '5k': ['walking', 'running'], energy: ['walking', 'home'], keepup: ['running', 'gym'], routine: ['gym', 'classes'] } as Record<string, string[]>)[str(a, 'fit.what')] ?? [],
    next: () => 'time',
  },

  // Physique
  {
    id: 'phy.change',
    kind: 'single',
    coach: () => ['Let’s do it. What’s the main change you want?'],
    options: [
      { value: 'lose-fat', label: 'Lose fat' }, { value: 'build-muscle', label: 'Build muscle' },
      { value: 'recomp', label: 'Both: leaner and more toned' },
    ],
    next: () => 'phy.date',
  },
  {
    id: 'phy.date',
    kind: 'single',
    coach: () => ['Is there a date in mind, like a holiday or a wedding?'],
    options: [
      { value: 'date', label: 'Yes', input: 'date' },
      { value: 'none', label: 'No, long-term' },
    ],
    label: (v) => {
      const { value, payload } = splitInline(v)
      return value === 'date' && payload ? `Yes: ${longDate(payload)}` : 'No, long-term'
    },
    next: () => 'lifting',
  },

  // Strength
  {
    id: 'str.kind',
    kind: 'single',
    coach: () => ['Stronger how?'],
    options: [
      { value: 'all-round', label: 'All-round strength' },
      { value: 'lifts', label: 'Bigger lifts (squat, bench, deadlift)' },
      { value: 'bodyweight', label: 'Bodyweight skills (pull-ups, press-ups)' },
      { value: 'job-or-sport', label: 'Strong for my job or sport' },
    ],
    next: () => 'lifting',
  },
  {
    id: 'lifting',
    kind: 'single',
    coach: (a, ctx) => [a.why === 'physique' ? physiqueLine(a, ctx) : 'Good.', 'How much lifting have you done?'],
    options: LIFTING,
    next: (a) => (a.why === 'strength' && a['str.kind'] === 'lifts' && ['under-1y', '1y+'].includes(str(a, 'lifting')) ? 'str.numbers' : 'time'),
  },
  {
    id: 'str.numbers',
    kind: 'compound',
    coach: () => ['Know your current best lifts? Weight × reps for a hard set. I’ll start just under them.'],
    fields: KG_LIFTS.map((l) => ({ key: l.key, label: l.label, kind: 'lift' as const, optional: true })),
    skip: { value: 'test', label: 'Not sure. Test me in week 1' },
    samples: [{ squat: '100x5', bench: '75x5', deadlift: '130x5' }],
    label: (v) => {
      if (v === 'test') return 'Not sure. Test me in week 1'
      const r = v as Record<string, string>
      return KG_LIFTS.map((l) => (parseLift(r[l.key]) ? `${l.label} ${r[l.key].replace('x', ' × ')}` : '')).filter(Boolean).join(' · ') || 'None'
    },
    next: () => 'time',
  },

  // Sport
  {
    id: 'sp.sport',
    kind: 'single',
    coach: () => ['Which sport?'],
    options: SPORTS,
    next: () => 'sp.season',
  },
  {
    id: 'sp.season',
    kind: 'single',
    coach: () => ['Where are you in your season?'],
    options: [
      { value: 'off', label: 'Off-season' }, { value: 'pre', label: 'Pre-season' },
      { value: 'in', label: 'In-season' }, { value: 'none', label: 'No real seasons' },
    ],
    next: () => 'sp.fixed',
  },
  {
    id: 'sp.fixed',
    kind: 'days',
    coach: () => ['Which days are already taken by your sport? Tap once for training, twice for a match.'],
    samples: [{ Tue: 'training', Thu: 'training', Sat: 'match' }],
    label: (v) => {
      const r = v as Record<string, string>
      const days = WEEK_DAYS_MON.filter((d) => r[d])
      return days.length ? days.map((d) => `${d} ${r[d]}`).join(' · ') : 'No fixed days'
    },
    next: () => 'sp.want',
  },
  {
    id: 'sp.want',
    kind: 'multi',
    coach: () => ['What do you most want from extra training? Pick up to two.'],
    options: [
      { value: 'power', label: 'Speed & power' }, { value: 'strength', label: 'Strength' },
      { value: 'engine', label: 'Engine / endurance' }, { value: 'injury', label: 'Fewer injuries' }, { value: 'size', label: 'Size' },
    ],
    max: 2,
    next: () => 'time',
  },

  // Tracker
  {
    id: 'trk.source',
    kind: 'single',
    coach: () => ['Easy. Where’s your plan from?'],
    options: [{ value: 'coach', label: 'My coach or club' }, { value: 'app-or-book', label: 'An app or book' }, { value: 'self', label: 'I wrote it' }],
    next: () => 'trk.intake',
  },
  {
    id: 'trk.intake',
    kind: 'single',
    coach: () => ['How shall we get it in?'],
    options: [{ value: 'convert', label: 'I’ll paste it and Claude converts it' }, { value: 'log', label: 'I’ll log sessions as I go' }],
    next: () => 'trk.coach',
  },
  {
    id: 'trk.coach',
    kind: 'single',
    coach: () => ['Want me to chip in, or just keep score?'],
    options: [{ value: 'silent', label: 'Just track' }, { value: 'light', label: 'Light suggestions' }, { value: 'check-ins', label: 'Weekly check-ins too' }],
    next: () => 'health',
  },

  // Shared tail
  {
    id: 'time',
    kind: 'compound',
    coach: (a, ctx) => [
      timeIntro(a, ctx),
      a.why === 'sport' ? 'On top of your sport, how much time can you give it?' : 'How much time can you give it each week?',
    ].filter((x): x is string => !!x),
    fields: (a) => [
      {
        key: 'days', label: 'Days a week', kind: 'chips', initial: String(DAYS_DEFAULT[str(a, 'why')] ?? 3),
        options: [2, 3, 4, 5, 6].map((d) => ({ value: String(d), label: daysPerWeekLabel(d) })),
      },
      {
        key: 'mins', label: 'Minutes per session', kind: 'chips', initial: String(MINS_DEFAULT[str(a, 'why')] ?? 60),
        options: [30, 45, 60, 75, 90].map((m) => ({ value: String(m), label: `${m} min` })),
      },
    ],
    samples: [{ days: '3', mins: '45' }],
    label: (v) => {
      const r = v as Record<string, string>
      return `${daysPerWeekLabel(Number(r.days))} days a week · ${r.mins} min`
    },
    next: (a) => (a.why === 'fitness' ? 'health' : 'kit'),
  },
  {
    id: 'kit',
    kind: 'multi',
    coach: (a) => [
      a.why === 'event'
        ? isRunEvent(a)
          ? 'Strength work makes runners faster and less injury-prone. Want some, and where?'
          : 'Want some strength work alongside, and where?'
        : 'Where will you train?',
    ],
    options: (a) => [
      { value: 'gym', label: a.why === 'event' ? 'Yes, at a gym' : 'Gym' },
      { value: 'home', label: a.why === 'event' ? 'Yes, home weights' : 'Home weights' },
      { value: 'bodyweight', label: a.why === 'event' ? 'Yes, bodyweight' : 'Bodyweight only' },
      ...(a.why === 'event' ? [{ value: 'none', label: isRunEvent(a) ? 'No, just running' : 'No thanks' }] : []),
    ],
    exclusive: 'none',
    preselect: (a) => (a.why === 'event' ? [] : ['gym']),
    next: () => 'health',
  },
  {
    id: 'health',
    kind: 'multi',
    coach: () => [
      'Nearly done. Anything I should know health-wise?',
      'I ask because it’s the standard pre-exercise safety check. I only keep which boxes you tick, never details of a condition, and you can clear it any time in Settings.',
    ],
    options: HEALTH,
    exclusive: 'ok',
    next: (a) => {
      const flags = list(a, 'health')
      if (flags.includes('injury')) return 'health.injury'
      if (flags.some((f) => (MEDICAL as string[]).includes(f))) return 'health.clear'
      return END
    },
  },
  {
    id: 'health.injury',
    kind: 'text',
    multiline: true,
    placeholder: 'e.g. Left knee aches on stairs and long downhills',
    coach: (a) => [
      ...(list(a, 'health').some((f) => (MEDICAL as string[]).includes(f))
        ? ['Thanks for telling me. Please check with your GP or physio before starting. I’ll keep things conservative until you’re cleared.']
        : []),
      'Coach Claude isn’t medical advice. If an injury is serious, recent or unresolved, get it assessed first, and stop if anything causes sharp or worsening pain.',
      'Describe the injury and how it behaves day to day, one issue per line. I’ll program around it.',
    ],
    samples: ['Left knee aches on stairs'],
    next: () => END,
  },
  {
    id: 'health.clear',
    kind: 'single',
    coach: () => [
      'Thanks for telling me. Please check with your GP or physio before starting, and I’ll keep things conservative until you’re cleared. You don’t need to tell me any details.',
    ],
    options: [{ value: 'check', label: 'I’ll check with them' }, { value: 'cleared', label: 'I’ve already been cleared' }],
    next: () => END,
  },
]

export const GOAL_FLOW: Flow = {
  start: 'why',
  nodes: Object.fromEntries(nodes.map((n) => [n.id, n])),
}

// --- answers → GoalProfile -----------------------------------------------------------

/** Experience level, derived from facts rather than a self-label. */
function levelOf(a: FlowAnswers): ExperienceLevel {
  if (a.why === 'event') return ({ none: 'beginner', low: 'beginner', mid: 'intermediate', high: 'advanced', vhigh: 'advanced' } as Record<string, ExperienceLevel>)[str(a, 'ev.now')] ?? 'beginner'
  if (a.why === 'fitness') return ({ sitting: 'beginner', light: 'beginner', '1-2x': 'returning', '3x+': 'intermediate' } as Record<string, ExperienceLevel>)[str(a, 'fit.now')] ?? 'beginner'
  if (a.lifting) return ({ none: 'beginner', 'on-off': 'returning', 'under-1y': 'intermediate', '1y+': 'advanced' } as Record<string, ExperienceLevel>)[str(a, 'lifting')] ?? 'beginner'
  if (a.why === 'sport') return 'intermediate'
  return 'returning'
}

function facilitiesOf(a: FlowAnswers): ProgramFacility[] {
  const out = new Set<ProgramFacility>()
  const src = a.why === 'fitness' ? list(a, 'fit.likes') : list(a, 'kit')
  for (const v of src) {
    if (v === 'gym') out.add('full-gym')
    if (v === 'home') out.add('weights-at-home')
    if (v === 'bodyweight' || v === 'yoga') out.add('yoga-mat')
  }
  return [...out]
}

function deferredFor(a: FlowAnswers, runs: boolean): DeferredId[] {
  const d: DeferredId[] = []
  if (runs) d.push('runs-with')
  if (a.why === 'physique') d.push('nutrition')
  if (a.why !== 'tracker') d.push('coaching-tone')
  if (a.why === 'physique') d.push('focus-areas')
  if (a.why === 'event' && ['half', 'marathon', 'trail'].includes(eventKind(a))) d.push('long-run-day')
  return d
}

function statementOf(a: FlowAnswers, ctx: FlowContext): string {
  const date = dateAnswer(a)
  const w = weeksOf(a, ctx)
  const when = date && w ? ` on ${longDate(date)} (${w} weeks)` : ''
  switch (a.why) {
    case 'event': {
      const cap = eventName(a).charAt(0).toUpperCase() + eventName(a).slice(1)
      const aim = aimSeconds(a)
      const aimTxt = aim ? `, aiming for ${formatClock(aim)}` : a['ev.aim'] === 'finish-strong' ? ', aiming to finish strong' : ', aiming to get round'
      return `${cap}${when || ' (date to be set)'}${aimTxt}`
    }
    case 'fitness':
      return ({
        '5k': 'Run 5K without stopping',
        energy: 'Feel fitter and more energetic',
        keepup: 'Get fit enough to keep up with sport, kids or mates',
        routine: 'Build a training routine that sticks',
      } as Record<string, string>)[str(a, 'fit.what')] ?? 'Get fitter'
    case 'physique': {
      const what = ({ 'lose-fat': 'Lose fat and look sharper', 'build-muscle': 'Build muscle', recomp: 'Get leaner and more toned' } as Record<string, string>)[str(a, 'phy.change')] ?? 'Look and feel better'
      return date ? `${what} by ${longDate(date)} (${w} weeks)` : `${what} (long-term)`
    }
    case 'strength':
      return ({ 'all-round': 'All-round strength', lifts: 'Bigger squat, bench and deadlift', bodyweight: 'Bodyweight skills: pull-ups and press-ups', 'job-or-sport': 'Strength for my job or sport' } as Record<string, string>)[str(a, 'str.kind')] ?? 'Get stronger'
    case 'sport': {
      const season = ({ off: 'off-season', pre: 'pre-season', in: 'in-season', none: 'year-round' } as Record<string, string>)[str(a, 'sp.season')] ?? ''
      return `${sportName(a)}: ${season} training to support my sport`
    }
    case 'tracker':
      return 'Track my own plan'
    default:
      return 'Get fitter'
  }
}

function sportName(a: FlowAnswers): string {
  const { value, payload } = splitInline(a['sp.sport'])
  return value === 'other' ? payload || 'My sport' : value
}

/** Pure: onboarding answers → GoalProfile. */
export function toGoalProfile(raw: FlowAnswers, ctx: FlowContext): GoalProfile {
  const a = scopedAnswers(GOAL_FLOW, raw)
  const why = (str(a, 'why') || 'fitness') as Pursuit
  const ts = ctx.now.toISOString()
  const flags = list(a, 'health').filter((f) => f !== 'ok') as HealthFlag[]
  const medical = flags.some((f) => MEDICAL.includes(f))
  const time = rec(a, 'time')
  const runs = (why === 'event' && isRunEvent(a)) || (why === 'fitness' && (a['fit.what'] === '5k' || list(a, 'fit.likes').includes('running')))

  const goal: GoalProfile = {
    version: 1,
    origin: 'onboarding',
    pursuit: why,
    statement: statementOf(a, ctx),
    starting: { level: levelOf(a) },
    constraints: {
      daysPerWeek: Number(time.days) || DAYS_DEFAULT[why] || 3,
      sessionMinutes: Number(time.mins) || MINS_DEFAULT[why] || 60,
      facilities: facilitiesOf(a),
    },
    health: {
      flags,
      ...(medical ? { conservative: a['health.clear'] !== 'cleared', ...(a['health.clear'] === 'cleared' ? { cleared: true } : {}) } : {}),
    },
    deferred: deferredFor(a, runs),
    answers: a as Record<string, unknown>,
    createdAt: ts,
    updatedAt: ts,
  }

  if (why === 'event') {
    const date = dateAnswer(a)
    const aim = splitInline(a['ev.aim']).value
    const kind = eventKind(a)
    goal.event = {
      kind,
      ...(kind === 'other' && splitInline(a['ev.kind']).payload ? { name: splitInline(a['ev.kind']).payload } : {}),
      ...(date ? { date } : {}),
      aim: aim === 'time' ? 'time' : aim === 'finish-strong' ? 'finish-strong' : 'get-round',
      ...(aimSeconds(a) ? { targetSeconds: aimSeconds(a) } : {}),
    }
    const now = str(a, 'ev.now') as RunVolume
    if (isRunEvent(a)) goal.starting.runKmPerWeek = RUN_VOLUME_KM[now]
    else goal.starting.trainingHoursPerWeek = HOURS[now]
    const r = recentResult(a)
    if (r) goal.starting.recentResult = r
    const kit = list(a, 'kit')
    goal.constraints.strengthWork = kit.length > 0 && !kit.includes('none')
  }
  if (why === 'fitness') {
    goal.starting.activity = str(a, 'fit.now') as GoalProfile['starting']['activity']
    // "Run 5K without stopping" uses the event model, with no event questions.
    if (a['fit.what'] === '5k') goal.event = { kind: '5k', aim: 'get-round' }
  }
  if (why === 'physique') {
    goal.physique = { change: str(a, 'phy.change') as 'lose-fat', ...(dateAnswer(a) ? { byDate: dateAnswer(a) } : {}) }
  }
  if (a.lifting) goal.starting.lifting = str(a, 'lifting') as GoalProfile['starting']['lifting']
  if (why === 'strength') {
    const nums = rec(a, 'str.numbers')
    const lifts = KG_LIFTS.flatMap((l) => {
      const p = parseLift(nums[l.key])
      return p ? [{ name: l.label, ...p }] : []
    })
    goal.strength = { kind: str(a, 'str.kind') as 'lifts', ...(lifts.length ? { lifts } : {}) }
  }
  if (why === 'sport') {
    const fixedRec = rec(a, 'sp.fixed')
    const fixed: FixedDay[] = WEEK_DAYS_MON.filter((d) => fixedRec[d]).map((d) => ({ day: d, kind: fixedRec[d] === 'match' ? 'match' : 'training' }))
    goal.sport = { name: sportName(a), season: str(a, 'sp.season') as 'in', fixed, wants: list(a, 'sp.want') }
  }
  if (why === 'tracker') {
    goal.tracker = {
      source: str(a, 'trk.source') as 'coach',
      intake: str(a, 'trk.intake') === 'log' ? 'log' : 'convert',
      involvement: str(a, 'trk.coach') as 'silent',
    }
  }
  return goal
}

// --- GoalProfile → legacy profile fields -------------------------------------------------

/** Block length: weeks to the date when there is one, else 12 (8 for sedentary beginners). */
export function blockLengthWeeks(goal: GoalProfile, now: Date): number {
  const date = goal.event?.date ?? goal.physique?.byDate
  if (date) return Math.min(MAX_BLOCK_WEEKS, weeksUntil(date, now))
  const sedentary = goal.starting.activity === 'sitting' || goal.starting.activity === 'light'
  return sedentary ? BEGINNER_BLOCK_WEEKS : DEFAULT_BLOCK_WEEKS
}

const EVENT_SPORTS: Record<EventKind, string[]> = {
  '5k': ['Running'], '10k': ['Running'], half: ['Running'], marathon: ['Running'], trail: ['Running', 'Hiking'],
  tri: ['Running', 'Cycling', 'Swimming'], sportive: ['Cycling'], hyrox: ['Running', 'Rowing'], other: [],
}
const LIKE_SPORTS: Record<string, string> = { walking: 'Walking', running: 'Running', cycling: 'Cycling', swimming: 'Swimming' }

function programOf(goal: GoalProfile, style: CoachingStyle, now: Date): ProgramConfig {
  const a = (goal.answers ?? {}) as FlowAnswers
  const goals = new Set<ProgramGoal>()
  const types = new Set<ProgramExerciseType>()
  let sports: string[] = []
  switch (goal.pursuit) {
    case 'event':
      goals.add('get-fit')
      types.add('cardio')
      if (goal.constraints.strengthWork) types.add('weights')
      types.add('mobility')
      sports = EVENT_SPORTS[goal.event?.kind ?? 'other']
      break
    case 'fitness': {
      goals.add('get-fit')
      const likes = list(a, 'fit.likes')
      if (likes.some((l) => ['walking', 'running', 'cycling', 'swimming', 'classes'].includes(l)) || goal.event) types.add('cardio')
      if (likes.some((l) => ['gym', 'home'].includes(l))) types.add('weights')
      if (likes.includes('yoga')) types.add('mobility')
      sports = likes.flatMap((l) => (LIKE_SPORTS[l] ? [LIKE_SPORTS[l]] : []))
      if (goal.event && !sports.includes('Running')) sports.push('Running')
      break
    }
    case 'physique':
      goals.add('look-great')
      types.add('weights').add('cardio')
      break
    case 'strength':
      goals.add('get-strong')
      types.add('weights').add('mobility')
      break
    case 'sport': {
      goals.add('get-fit')
      const wants = goal.sport?.wants ?? []
      if (wants.some((w) => ['strength', 'power', 'size'].includes(w))) goals.add('get-strong')
      types.add('weights')
      if (wants.includes('engine')) types.add('cardio')
      if (wants.includes('injury')) types.add('mobility')
      break
    }
    case 'tracker':
      goals.add('get-fit')
      types.add('weights').add('cardio')
      break
  }
  return {
    goals: [...goals],
    exerciseTypes: [...types],
    facilities: goal.constraints.facilities,
    sports,
    coachingStyle: style,
    lengthWeeks: blockLengthWeeks(goal, now),
    startDate: toLocalISODate(getMonday(now)),
    daysPerWeek: goal.constraints.daysPerWeek,
  }
}

/** Plain-English facts for `fitnessBackground`, so legacy prompt fields stay useful. */
function backgroundOf(goal: GoalProfile, extra?: string): string {
  const s = goal.starting
  const out: string[] = [`Experience (derived): ${s.level}.`]
  if (s.runKmPerWeek) out.push(s.runKmPerWeek[1] === 0 ? 'Not running yet.' : `Running ${s.runKmPerWeek[0]}–${s.runKmPerWeek[1]} km a week.`)
  if (s.trainingHoursPerWeek) out.push(`Training ${s.trainingHoursPerWeek[0]}–${s.trainingHoursPerWeek[1]} hours a week.`)
  if (s.activity) out.push(`Activity now: ${({ sitting: 'mostly sitting', light: 'walking and the odd session', '1-2x': 'exercising 1–2× a week', '3x+': 'exercising 3+ times a week' })[s.activity]}.`)
  if (s.lifting) out.push(`Lifting: ${LIFTING.find((l) => l.value === s.lifting)?.label.toLowerCase()}.`)
  if (s.recentResult) out.push(`Recent result: ${describeDistance(s.recentResult.meters)} in ${formatClock(s.recentResult.seconds)}.`)
  if (goal.strength?.lifts?.length) out.push(`Best lifts: ${goal.strength.lifts.map((l) => `${l.name} ${l.kg}kg × ${l.reps}`).join(', ')}.`)
  if (goal.sport) out.push(`Plays ${goal.sport.name} (${goal.sport.season} season).`)
  out.push(`Wants to train about ${daysPerWeekLabel(goal.constraints.daysPerWeek)} days a week, ${goal.constraints.sessionMinutes} min a session.`)
  if (extra?.trim()) out.push(`In their words: ${extra.trim().replace(/\s+/g, ' ')}${/[.!?]$/.test(extra.trim()) ? '' : '.'}`)
  return out.join(' ')
}

/**
 * The legacy profile fields every existing screen and the current prompt use,
 * derived from the GoalProfile so nothing else has to change.
 */
export function profilePatchFromGoal(
  goal: GoalProfile,
  opts: { now: Date; coachingStyle?: CoachingStyle; anythingElse?: string },
): Partial<UserProfile> {
  const a = (goal.answers ?? {}) as FlowAnswers
  const program = programOf(goal, opts.coachingStyle ?? 'balanced', opts.now)
  const injuries = str(a, 'health.injury').split(/\n+/).map((l) => l.trim()).filter(Boolean)
  return {
    goal,
    goals: [goal.statement],
    experienceLevel: goal.starting.level,
    fitnessBackground: backgroundOf(goal, opts.anythingElse),
    // Safety-critical: kept verbatim, one item per line the athlete wrote.
    injuries,
    program,
    gymAccess: program.facilities.includes('full-gym') || program.facilities.includes('weights-at-home'),
    programWeek: 1,
  }
}

// --- confirmation card ------------------------------------------------------------------

export interface ConfirmRow {
  icon: string
  label: string
  text: string
  /** Node to rewind to when the row is tapped. */
  target?: string
}

/** "Here's what I heard": one line per thing the plan is built from. */
export function confirmationRows(goal: GoalProfile, ctx: FlowContext): ConfirmRow[] {
  const a = (goal.answers ?? {}) as FlowAnswers
  const rows: ConfirmRow[] = [{ icon: '🎯', label: 'Goal', text: goal.statement, target: 'why' }]

  const s = goal.starting
  let start = ''
  let startTarget: string | undefined
  if (goal.pursuit === 'event') {
    const vol = RUN_NOW.find((o) => o.value === a['ev.now'])?.label ?? HOURS_NOW.find((o) => o.value === a['ev.now'])?.label ?? ''
    start = vol.charAt(0).toUpperCase() + vol.slice(1)
    if (s.recentResult) {
      const z = runZones(s.recentResult)
      start += `. Paces from your ${formatClock(s.recentResult.seconds)} ${describeDistance(s.recentResult.meters)} (threshold ≈ ${formatPace(z.threshold)})`
    } else if (isRunEvent(a) && a['ev.now'] !== 'none') start += '. A benchmark run in week 1 sets your paces'
    startTarget = 'ev.now'
    const f = feasibility(a, ctx)
    if (f?.verdict === 'stretch-too-far') start += `. Stepping stone first: ${formatClock(f.steppingStone!)}`
    if (isTight(a, ctx)) start += '. Tight runway: getting round safely comes first'
  } else if (goal.pursuit === 'fitness') {
    start = ({ sitting: 'Mostly sitting at the moment', light: 'Walking and the odd session', '1-2x': 'Exercising 1–2× a week', '3x+': 'Exercising 3+ times a week' } as Record<string, string>)[s.activity ?? ''] ?? ''
    startTarget = 'fit.now'
  } else if (goal.pursuit === 'physique' || goal.pursuit === 'strength') {
    start = `Lifting: ${LIFTING.find((l) => l.value === s.lifting)?.label.toLowerCase() ?? '—'}`
    if (goal.strength?.lifts?.length) start += `. Best: ${goal.strength.lifts.map((l) => `${l.name.toLowerCase()} ${l.kg}×${l.reps}`).join(', ')}`
    else if (a['str.numbers'] === 'test') start += '. Week 1 finds your working weights'
    startTarget = 'lifting'
  } else if (goal.pursuit === 'sport' && goal.sport) {
    start = goal.sport.fixed.length
      ? `Taken: ${goal.sport.fixed.map((f) => `${f.day} ${f.kind}`).join(', ')}. No heavy legs within 48 h of a match`
      : 'No fixed sport days'
    startTarget = 'sp.fixed'
  } else if (goal.tracker) {
    start = goal.tracker.intake === 'convert' ? 'You paste your plan; Claude converts it for the app' : 'You log sessions as you go'
    startTarget = 'trk.intake'
  }
  if (start) rows.push({ icon: '📈', label: 'Starting point', text: start, target: startTarget })

  if (goal.pursuit !== 'tracker') {
    const kit = goal.pursuit === 'event'
      ? goal.constraints.strengthWork ? ` · plus strength (${kitWords(goal.constraints.facilities)})` : ''
      : goal.constraints.facilities.length ? ` · ${kitWords(goal.constraints.facilities)}` : ''
    rows.push({ icon: '🗓️', label: 'Schedule', text: `${daysPerWeekLabel(goal.constraints.daysPerWeek)} days a week · ${goal.constraints.sessionMinutes} min${kit}`, target: 'time' })
  }

  const injuries = str(a, 'health.injury').split(/\n+/).map((l) => l.trim()).filter(Boolean)
  const medical = goal.health.flags.some((f) => MEDICAL.includes(f))
  const health = !goal.health.flags.length
    ? 'All good'
    : [
        injuries.length ? `${injuries.join('; ')}: I’ll program around it` : '',
        medical ? (goal.health.cleared ? 'Cleared by your GP or physio' : 'Conservative until your GP or physio clears you') : '',
      ].filter(Boolean).join('. ')
  rows.push({ icon: '🩹', label: 'Health', text: health, target: 'health' })

  const benchmark = (goal.pursuit === 'event' && isRunEvent(a) && !s.recentResult && a['ev.now'] !== 'none') ||
    (goal.pursuit === 'fitness') || a['str.numbers'] === 'test'
  const next = goal.pursuit === 'tracker'
    ? goal.tracker?.involvement === 'check-ins' ? 'A quick check-in after your last session each week' : 'A short weekly summary of what you did'
    : `${benchmark ? 'Week 1 includes a short benchmark. ' : ''}I’ll suggest a quick check-in each week.`
  rows.push({ icon: '🔜', label: 'Next', text: next })
  return rows
}

function kitWords(f: ProgramFacility[]): string {
  const words: Record<ProgramFacility, string> = { 'full-gym': 'gym', 'weights-at-home': 'home weights', 'yoga-mat': 'bodyweight' }
  return f.map((x) => words[x]).join(', ') || 'no equipment'
}

/**
 * Re-entering the tree ("my race moved"): the new answers win, but what the
 * app learned since onboarding (deferred answers, zone nudges, injury status,
 * a result the new path didn't ask for) carries over.
 */
export function mergeGoalUpdate(previous: GoalProfile | undefined, next: GoalProfile): GoalProfile {
  if (!previous) return next
  return {
    ...next,
    createdAt: previous.createdAt,
    deferred: next.deferred.filter((d) => !(previous.askedDeferred ?? []).includes(d)),
    askedDeferred: previous.askedDeferred,
    zoneOffsetPct: previous.zoneOffsetPct,
    checkInsOff: previous.checkInsOff,
    migrated: previous.migrated,
    starting: {
      ...next.starting,
      recentResult: next.starting.recentResult ?? previous.starting.recentResult,
    },
    constraints: {
      ...next.constraints,
      runsWith: previous.constraints.runsWith,
      longRunDay: previous.constraints.longRunDay,
    },
    health: {
      ...next.health,
      injuryStatus: previous.health.injuryStatus,
      pastInjuries: previous.health.pastInjuries,
    },
  }
}
