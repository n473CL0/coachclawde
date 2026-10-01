import type { CheckIn, DayOfWeek, LoggedSession, ProgramExerciseType, ProgramFacility, SessionType, UserProfile, WeekPlan } from '../types'
import { checkInForPlanning } from './checkIn'
import { format } from 'date-fns'
import { WEEK_DAYS_MON, addDays, toLocalISODate } from './weekUtils'
import { summarizeHistory } from './historySummary'
import { getProgramProgress } from './programProgress'
import { ageFromBirthDate } from './dateUtils'
import { daysPerWeekLabel } from './programOptions'
import { measurementLine, zonesLine } from './goalProfile'
import { buildGoalSection } from './goalPrompt'

/**
 * Builds the prompt the user pastes into Claude.
 *
 * The prompt is fully SELF-CONTAINED: it embeds the athlete's profile, a
 * *summarised* training history (see `summarizeHistory`), the programming
 * rules and the `WeekPlan` JSON schema, so it works anywhere (claude.ai can't
 * read the repo).
 *
 * It's also TAILORED: every rule, schema field and example is chosen from
 * what the athlete set up (`promptScope`). A gym-only athlete never hears
 * about cardio, a runner with no strength work never gets superset rules,
 * home-workout athletes are held to their equipment, and so on. CLAUDE.md is
 * the full, general reference; this is the per-athlete cut of it.
 *
 * Keep the rules/schema here in sync with `CLAUDE.md` and `src/types/index.ts`.
 *
 * `weekStart` is the Monday the plan targets — resolved by the caller from the
 * selected days (this week vs. next week), so the prompt, the on-screen label
 * and the imported plan all agree on which week is being planned.
 */

// --- scope ----------------------------------------------------------------------

export interface PromptScope {
  weights: boolean
  cardio: boolean
  mobility: boolean
  /** Session types Claude may use, in schema order. */
  sessionTypes: SessionType[]
  facilities: ProgramFacility[]
  /** How strength work should be shaped, from the goal. */
  strengthFocus: 'physique' | 'lifts' | 'event' | 'sport' | 'general'
  diet: boolean
}

/**
 * What this athlete's prompt covers, from their onboarding (training types,
 * equipment, goal). A profile with no training types set (pre-onboarding
 * data) gets everything, so nothing is ever lost.
 */
export function promptScope(profile: UserProfile): PromptScope {
  const types = profile.program?.exerciseTypes ?? []
  const has = (t: ProgramExerciseType) => types.length === 0 || types.includes(t)
  const weights = has('weights')
  const cardio = has('cardio')
  const mobility = has('mobility')
  const sessionTypes: SessionType[] = [
    ...(weights ? ['weights' as const] : []),
    ...(cardio ? ['cardio' as const] : []),
    ...(mobility || (!weights && !cardio) ? ['active-recovery' as const] : []),
  ]
  const goal = profile.goal
  const strengthFocus: PromptScope['strengthFocus'] =
    goal?.pursuit === 'physique' ? 'physique'
      : goal?.pursuit === 'strength' && goal.strength?.kind === 'lifts' ? 'lifts'
        : goal?.pursuit === 'event' ? 'event'
          : goal?.pursuit === 'sport' ? 'sport'
            : profile.program?.goals.includes('look-great') ? 'physique' : 'general'
  return {
    weights, cardio, mobility, sessionTypes,
    facilities: profile.program?.facilities ?? [],
    strengthFocus,
    diet: profile.dietaryNotes.length > 0,
  }
}

function coachRole(s: PromptScope, profile: UserProfile): string {
  const sport = profile.goal?.sport?.name
  if (sport) return `an experienced strength & conditioning coach for ${sport}`
  if (s.weights && s.cardio) return 'an experienced strength & conditioning coach'
  if (s.weights) return 'an experienced strength coach'
  if (s.cardio) {
    const sports = profile.program?.sports ?? []
    return sports.length === 1 && sports[0] === 'Running' ? 'an experienced running coach' : 'an experienced endurance coach'
  }
  return 'an experienced mobility and movement coach'
}

/** The equipment rule, or null when the athlete hasn't said (older profiles). */
function equipmentRule(f: ProgramFacility[], s: PromptScope): string | null {
  if (!f.length || (!s.weights && !s.mobility)) return null
  if (f.includes('full-gym')) {
    return '**Equipment:** I train in a full gym (free weights, racks, cables and machines).'
  }
  if (f.includes('weights-at-home')) {
    return '**Equipment — home only:** I train at home with my own weights. Assume dumbbells (and a mat) unless my notes say I have more: no machines, cables or barbell racks.'
  }
  return '**Equipment — bodyweight only:** I train with my bodyweight and a mat. No weights, machines or bars: build every exercise from bodyweight progressions (tempo, range, single-leg/arm, pauses).'
}

function strengthRule(s: PromptScope, profile: UserProfile): string {
  switch (s.strengthFocus) {
    case 'physique':
      return `**Balanced physique:** Across the week hit every major muscle group with
   roughly even volume — push (chest/triceps), pull (back/biceps), legs
   (quads/hamstrings/glutes/calves), shoulders and core. Don't let one area
   dominate. Each session's \`focus\` should be honest and cover a coherent group
   of muscles.`
    case 'lifts':
      return `**Build the main lifts:** Organise sessions around the squat, bench press and
   deadlift (and an overhead press if my injuries allow), progressing from my
   current working weights, with accessories that fix weak points and keep
   push, pull and legs in balance.`
    case 'event':
      return `**Strength supports my event:** Keep strength sessions short and focused on
   legs, posterior chain, core and injury resilience. Keep them away from my
   key sessions: no heavy legs the day before a hard session or long effort.`
    case 'sport': {
      const wants = profile.goal?.sport?.wants ?? []
      return `**Strength for my sport:** Emphasise ${wants.length ? wants.join(' and ') : 'power, strength and resilience'}, and
   never put heavy lower-body work within 48 hours before a match.`
    }
    default:
      return `**Balanced, full-body development:** Across the week hit every major muscle
   group with roughly even volume — push (chest/triceps), pull (back/biceps),
   legs (quads/hamstrings/glutes/calves), shoulders and core. Don't let one area
   dominate. Each session's \`focus\` should be honest and cover a coherent group
   of muscles.`
  }
}

// --- output contract --------------------------------------------------------------

/**
 * The WeekPlan schema and JSON rules, cut to the session types this athlete
 * can get (the convert-my-plan prompt passes `ALL`).
 */
function outputSection(weekStartISO: string, selectedDays: DayOfWeek[], s: PromptScope): string {
  const exercises = s.weights || s.mobility
  const focusHint = [s.weights && 'muscle groups', s.cardio && 'cardio type', s.mobility && !s.weights && 'mobility focus'].filter(Boolean).join(' or ')
  const typeLine = s.sessionTypes.map((t) => `"${t}"`).join(' | ')
  const sessionFields = [
    exercises && `  exercises${s.cardio ? '?' : ''}: PlannedExercise[],  // ${s.cardio ? `for ${s.weights ? 'weights' : 'active-recovery'} sessions` : 'the session’s exercises'}`,
    s.cardio && `  workout${exercises ? '?' : ''}: WorkoutItem[],        // ${exercises ? 'for cardio sessions (see below)' : 'the session (see below)'}`,
    s.cardio && `  cardioOptions?: CardioType[]    // modalities to choose between at the start.
                                  // First entry is the default. Drives split
                                  // units (run → /km, row → /500m, swim →
                                  // /100m, bike → km/h). Omit when the modality
                                  // is fixed.`,
  ].filter(Boolean).join('\n')

  const exerciseSchema = exercises ? `
PlannedExercise {
  id: string,
  name: string,
  coachNotes?: string,
  sets: PlannedSet[]
}

PlannedSet {
  reps: string,                   // e.g. "8-10" or "12" or "AMRAP"
  rpe?: number,                   // 1-10
  restSeconds: number,${s.weights ? `
  suggestedWeightKg?: number,     // may be a decimal, e.g. 22.5` : ''}
  durationSeconds?: number        // for TIMED holds (e.g. plank). When set, the
                                  // app shows a stopwatch instead of a
                                  // reps${s.weights ? '/weight' : ''} row; set reps to ""${s.weights ? ' and give no\n                                  // weight' : ''}.
}
` : ''

  const workoutSchema = s.cardio ? `
// CardioType = "run" | "row" | "bike" | "swim" | "other"

WorkoutItem = WorkoutStep | RepeatBlock

WorkoutStep {
  kind: "step",
  role: "warmup" | "work" | "recover" | "steady" | "cooldown",
  end: { by: "time", seconds: number }      // ends by itself
     | { by: "distance", meters: number }   // I press LAP at the distance
     | { by: "lap" },                       // ends when I press LAP
  effort: "recovery" | "easy" | "steady" | "marathon" | "threshold"
        | "interval" | "repetition" | "sprint",
  target?: string,                // only to override the app's pace, e.g.
                                  // "rate 20", "200 W", "12 km/h"
  recovery?: "stand" | "walk" | "jog",   // for recover steps
  cue?: string                    // short coaching cue
}

RepeatBlock {
  kind: "repeat",
  times: number,
  steps: WorkoutItem[],           // nest at most 2 deep: 2 × (4 × 400 m)
  everySeconds?: number,          // send-off cycle, e.g. swim "on 1:45"
  skipLastRecovery?: boolean      // no recovery after the final rep
}
` : ''

  const cardioSection = s.cardio ? `

## Cardio workouts

The app plays the workout in **Run Mode**: it times every step and plays a
tone at each change, so I never need a separate stopwatch. Build it like this:

- The easy running (or rowing, cycling…) warm-up and cool-down are workout
  steps (\`role: "warmup"\` / \`"cooldown"\`) so Run Mode times them. Drills and
  strides stay in \`warmupExercises\`, done before I press Start.
- A continuous run is just steps back to back, e.g. 30′ easy then 10′ steady.
- Pick effort words, not paces: the app converts them to my pace zones for
  the modality I choose, or to RPE when it has no zones.
- Respect what I can measure: with only a phone, end reps by **time**.

Example ("15 min easy, 6 × 3 min at interval effort with 90 s jog, 10 min easy"):

\`\`\`json
"workout": [
  { "kind": "step", "role": "warmup", "end": { "by": "time", "seconds": 900 }, "effort": "easy" },
  { "kind": "repeat", "times": 6, "skipLastRecovery": true, "steps": [
    { "kind": "step", "role": "work", "end": { "by": "time", "seconds": 180 }, "effort": "interval", "cue": "Quick feet, relaxed shoulders" },
    { "kind": "step", "role": "recover", "end": { "by": "time", "seconds": 90 }, "effort": "recovery", "recovery": "jog" }
  ]},
  { "kind": "step", "role": "cooldown", "end": { "by": "time", "seconds": 600 }, "effort": "easy" }
]
\`\`\`` : ''

  return `## Output: \`WeekPlan\` JSON schema

Output a single \`\`\`json code block first, then a short plain-English summary of
the week. I paste the JSON straight into the app, so it must parse:

- **Strict JSON only** — double-quoted keys and strings, no comments, no trailing
  commas, no \`undefined\`. Leave optional fields out rather than setting them to null.
- Only use the fields in the schema below; use the exact string values shown
  for \`type\`, \`intensity\`, \`dayOfWeek\`${s.cardio ? ' and `cardioOptions`' : ''}.
- Every \`id\` must be unique across the whole plan. Put the date in each
  session id, e.g. \`"session-${weekStartISO}-${s.weights ? 'upper' : s.cardio ? 'run' : 'mobility'}"\`, so it never repeats an
  earlier week's.
- \`sessions\` has exactly one entry per training day listed above, with that
  day's date.

The schema below is TypeScript notation for reference — the \`//\` comments
explain fields and must NOT appear in your JSON.

\`\`\`typescript
{
  id: string,                     // e.g. "plan-${weekStartISO}"
  weekStartDate: string,          // ISO date of Monday, e.g. "${weekStartISO}"
  availableDays: DayOfWeek[],     // ${JSON.stringify([...selectedDays].sort((a, b) => WEEK_DAYS_MON.indexOf(a) - WEEK_DAYS_MON.indexOf(b)))}
  userNotes: string,
  createdAt: string,              // ISO timestamp
  sessions: PlannedSession[]
}

PlannedSession {
  id: string,                     // unique, with the date (see above)
  date: string,                   // ISO date
  dayOfWeek: DayOfWeek,
  type: ${typeLine},
  title: string,
  focus: string,                  // ${focusHint}
  estimatedMinutes: number,
  intensity: "easy" | "moderate" | "hard",
  warmup: string,                 // REQUIRED: one-line summary of the warm-up
  warmupExercises: RoutineItem[], // REQUIRED: the full warm-up, in order, 4–8
                                  // moves (see "Warm-up & cool-down format")
  cooldown: string,               // REQUIRED: one-line summary of the cool-down
  cooldownExercises: RoutineItem[], // REQUIRED: the full cool-down, 3–5 moves
${sessionFields}
}

RoutineItem {
  name: string,                   // standard exercise name, e.g. "Cat Stretch"
  prescription: string,           // REQUIRED: e.g. "10 each side", "60s",
                                  // "2 × 10"${s.weights ? ', "8 × 12kg, 5 × 18kg"' : ''}
  notes?: string                  // cue or purpose
}
${exerciseSchema}${workoutSchema}\`\`\`${cardioSection}`
}

/** Everything, for prompts that must accept any session (convert-my-plan). */
const ALL: PromptScope = {
  weights: true, cardio: true, mobility: true, sessionTypes: ['weights', 'cardio', 'active-recovery'],
  facilities: [], strengthFocus: 'general', diet: false,
}

// --- warm-up -------------------------------------------------------------------------

function raiseExamples(s: PromptScope): string {
  const f = s.facilities
  if (f.includes('full-gym') || (!f.length && s.weights)) return 'e.g. bike, rower or brisk incline walk'
  if (s.cardio && !s.weights && !s.mobility) return 'e.g. a brisk walk or very easy jog'
  return 'e.g. marching on the spot, step-ups or skipping'
}

function warmupSection(s: PromptScope): string {
  const phase4 = [
    s.weights && `**Ramp-up sets (weights sessions):** before the first main lift, and any
     later lift much heavier than what came before, give 2–3 lighter build-up
     sets with falling reps at roughly 40–50%, 70% and 85–90% of the working
     weight you set. Write the actual kg in the \`prescription\`, rounded to
     loadable jumps. Skip this for bodyweight or light accessory work.`,
    s.cardio && `**${s.weights ? 'Cardio sessions' : 'Before a run or ride'}:** finish with drills (e.g. Leg Swings, High
     Knees, Butt Kicks) and 2–4 short strides or build-ups toward the target
     effort before the first rep.`,
    s.mobility && `**${s.weights || s.cardio ? 'Active recovery' : 'Mobility sessions'}:** a gentle flow into the session's first positions.`,
  ].filter(Boolean)

  const example = s.weights
    ? `"warmup": "5 min easy row, hip and upper-back mobility, band pull-aparts, ramp-up sets",
"warmupExercises": [
  { "name": "Rowing Machine", "prescription": "5 min easy", "notes": "Conversational pace, just get warm" },
  { "name": "World's Greatest Stretch", "prescription": "5 each side", "notes": "Opens hips and upper back" },
  { "name": "Cat Stretch", "prescription": "8 slow reps" },
  { "name": "Band Pull-Apart", "prescription": "2 × 15", "notes": "Shoulder prehab before pressing" },
  { "name": "Dumbbell Bench Press", "prescription": "10 × 10kg, 6 × 16kg, 3 × 20kg", "notes": "Ramp-up to the 22.5kg work sets: light, crisp reps, not logged" }
],
"cooldown": "Easy walk, then chest, lat and hip-flexor stretches",
"cooldownExercises": [
  { "name": "Walking", "prescription": "2 min easy" },
  { "name": "Chest Stretch", "prescription": "45s each side" },
  { "name": "Lat Stretch", "prescription": "45s each side" }
]`
    : s.cardio
      ? `"warmup": "Brisk walk, leg swings, drills and strides",
"warmupExercises": [
  { "name": "Walking", "prescription": "3 min brisk", "notes": "Just get warm" },
  { "name": "Leg Swings", "prescription": "10 each way, each leg" },
  { "name": "High Knees", "prescription": "2 × 20 m" },
  { "name": "Butt Kicks", "prescription": "2 × 20 m" },
  { "name": "Strides", "prescription": "3 × 80 m", "notes": "Build to the session's fastest effort, then walk back" }
],
"cooldown": "Easy walk, then calf, hamstring and hip-flexor stretches",
"cooldownExercises": [
  { "name": "Walking", "prescription": "2 min easy" },
  { "name": "Calf Stretch", "prescription": "45s each side" },
  { "name": "Hamstring Stretch", "prescription": "45s each side" }
]`
      : `"warmup": "Marching, cat-cow, thoracic rotations and hip circles",
"warmupExercises": [
  { "name": "Marching", "prescription": "2 min" },
  { "name": "Cat Stretch", "prescription": "8 slow reps" },
  { "name": "Thoracic Rotation", "prescription": "8 each side" },
  { "name": "Hip Circles", "prescription": "10 each way" }
],
"cooldown": "Child's pose and slow breathing",
"cooldownExercises": [
  { "name": "Child's Pose", "prescription": "60s" },
  { "name": "Supine Twist", "prescription": "45s each side" },
  { "name": "Box Breathing", "prescription": "2 min" }
]`

  return `## Warm-up & cool-down format (required on every session)

The app shows each session's warm-up as a one-line summary that expands into
a numbered checklist, with a movement guide for every move. Build it like this:

- \`warmup\`: one line summarising the whole warm-up.
- \`warmupExercises\`: the full warm-up **in the order I do it**, 4–8 moves,
  about 8–12 minutes (count it in \`estimatedMinutes\`). Work through these
  phases:
  1. **Raise:** 3–5 min of easy movement to get my heart rate up (${raiseExamples(s)}).
  2. **Mobilise:** dynamic mobility for the joints this session loads${s.weights ? ` (e.g.
     hips and ankles before squats, upper back and shoulders before pressing)` : ''}.
  3. **Activate / prehab:** 1–2 moves for the muscles that protect my flagged
     injuries, or that the session leans on most.
${phase4.map((p, i) => `  ${4 + i}. ${p}`).join('\n')}
- **Every move needs a \`prescription\`**: reps, sets × reps, time or distance,
  e.g. "2 × 10", "60s", "5 min easy", "10 each side"${s.weights ? ', "8 × 12kg, 5 × 18kg"' : ''}. Use
  \`notes\` for the cue or why the move is there.
- \`cooldown\` + \`cooldownExercises\`: 3–5 moves, about 5 minutes. An easy
  flush first, then static stretches (30–60s holds) for the muscles worked, in
  order.
- Warm-up and cool-down moves aren't logged${s.weights || s.mobility ? ', so don\'t repeat them in\n  `exercises`' : ''}.

Example of the shape (base the real moves${s.weights ? ' and loads' : ''} on each session${s.weights ? ' and my\nworking weights' : ''}; don't copy these):

\`\`\`json
${example}
\`\`\``
}

// --- the prompt ----------------------------------------------------------------------

export function buildWeekPlanPrompt(
  selectedDays: DayOfWeek[],
  userNotes: string,
  sessionMinutes: number,
  existingPlan: WeekPlan | undefined,
  weekStart: Date,
  profile: UserProfile,
  loggedSessions: LoggedSession[],
  checkIns: CheckIn[] = []
): string {
  const s = promptScope(profile)
  const weekEnd = addDays(weekStart, 6)
  const weekLabel = `${format(weekStart, 'dd MMM')} – ${format(weekEnd, 'dd MMM yyyy')}`
  const weekStartISO = toLocalISODate(weekStart)

  // Spell out each training day's exact date so Claude doesn't have to do date
  // math (a wrong date lands the session on the wrong day in the app).
  const dayLines = WEEK_DAYS_MON
    .map((day, i) => ({ day, i }))
    .filter(({ day }) => selectedDays.includes(day))
    .map(({ day, i }) => `  - ${day} → \`${toLocalISODate(addDays(weekStart, i))}\``)
    .join('\n')

  // Where this week sits in the athlete's program block, measured at the
  // planned week (which may be next week) rather than today.
  const progress = getProgramProgress(profile, weekStart)
  const blockLine = progress.isComplete
    ? `Week ${progress.rawWeek} — past the end of my ${progress.length}-week block. Treat it as a continuation week and keep progressing sensibly.`
    : `Week ${progress.week} of ${progress.length}`

  const replaceNote = existingPlan
    ? '\n_Note: a plan already exists for this week — generate a fresh one to replace it._'
    : ''

  const age = ageFromBirthDate(profile.birthDate)
  const goalSection = buildGoalSection(profile, weekStart)

  const program = profile.program
  const programBlock = program
    ? [
        `- **Goals:** ${program.goals.join(', ') || '—'}`,
        `- **Training types:** ${program.exerciseTypes.join(', ') || '—'} (only plan these)`,
        `- **Facilities:** ${program.facilities.join(', ') || '—'}`,
        s.cardio && program.sports.length ? `- **Preferred cardio:** ${program.sports.join(', ')}` : '',
        `- **Preferred frequency:** ${program.daysPerWeek ? `about ${daysPerWeekLabel(program.daysPerWeek)} days a week` : '—'}`,
        `- **Coaching style:** ${program.coachingStyle}`,
      ].filter(Boolean).join('\n')
    : '- (no standing program preferences set)'

  // The rules that apply to this athlete, numbered as they come.
  const rules: string[] = [
    profile.injuries.length
      ? `**INJURY-AWARE PROGRAMMING (safety-critical):** Read my stated injuries and
   program around them. Pick exercise variations, ranges of motion and loads
   that don't aggravate a flagged area, swap out movements that would, and add
   appropriate prehab/rehab work where it helps. When an injury is serious,
   recent or unresolved, keep loads conservative and note that I should get it
   assessed and cleared by a qualified professional first. This is general
   fitness guidance, not medical advice.`
      : `**Safety first:** I've reported no injuries, but choose sensible variations and
   loads, and tell me to stop anything that causes sharp or worsening pain.
   This is general fitness guidance, not medical advice.`,
    s.diet ? `**Respect my dietary needs** (${profile.dietaryNotes.join('; ')}) in any nutrition
   suggestions; they don't otherwise change the programming.` : '',
    equipmentRule(s.facilities, s) ?? '',
    s.weights
      ? `**Progressive overload:** Slightly increase volume or intensity vs. my recent
   logged data and current working weights.`
      : `**Progressive overload:** Build gradually from my recent sessions: a little
   more time, volume or intensity each week, never all three at once.`,
    s.weights ? strengthRule(s, profile) : '',
    s.weights ? `**Supersets — pairing, equipment & layout:** Pair complementary movements
   (prefer antagonist or push/pull pairs, e.g. chest press + row, quad +
   hamstring, biceps + triceps). For each superset:
   - **Keep it easy to move between:** only pair exercises that share the same
     station/equipment or sit right next to each other. Do NOT pair two
     different machines, or a machine with a bench/rack — I shouldn't have to
     hop between stations (or hold a machine others are waiting for) to alternate
     sets. Dumbbell/bodyweight pairs, or two moves on one cable/bench, are ideal.
   - **Keep it in one contiguous block:** place the paired exercises adjacent in
     the \`exercises\` array, and don't scatter a superset's exercises among
     others — all of a superset's movements come one after another so I'm not
     flipping back and forth. Note the pairing in \`coachNotes\` (e.g. "Superset
     with the next exercise — alternate sets").` : '',
    s.weights || s.mobility ? `**Timed exercises:** For holds (planks, side planks, ${s.weights ? 'dead hangs, wall sits' : 'stretches, wall sits'}),
   set \`durationSeconds\` on each set${s.weights ? ' and give them no weight' : ''}. The app shows a
   stopwatch.` : '',
    s.mobility ? `**Mobility sessions** (\`type: "active-recovery"\`): put the flow in \`exercises\`,
   one move per exercise, holds as timed sets. Keep them genuinely restorative.` : '',
    `**Periodise across the block:** If there's a Goal section above, follow its
   phase skeleton and this week's deload flag exactly; the app computed them
   from my dates. Otherwise use my program block position above. Plan a
   deload week (roughly 40% less volume, ${s.weights ? 'lighter loads, ' : 'easier efforts, '}RPE ≤ 7) about every
   4th–6th week, or sooner if my recent history shows fatigue (low "felt"
   scores${s.weights ? ', missed reps, stalled weights' : ', sessions cut short'}). Build through the middle of the block
   and push a little harder in the final week or two. Say in your summary if
   this is a deload week and why.`,
    `**Detailed warm-up & cool-down (required):** Every session must include the
   full step-by-step warm-up and cool-down described in "Warm-up & cool-down
   format" below. I follow it move by move in the app, so never skip it or
   reduce it to a one-line summary.`,
    `**Standard exercise names:** Name every ${s.weights || s.mobility ? 'exercise and ' : ''}warm-up move with its
   common, standard name (e.g. ${s.weights ? '"Dumbbell Bench Press", "Romanian Deadlift",\n   "Cat Stretch"' : s.cardio ? '"Leg Swings", "Calf Stretch"' : '"Cat Stretch", "Child\'s Pose"'}). The app looks each name up in an exercise library to
   show me a movement guide. Put variations and cues in ${s.weights || s.mobility ? '`coachNotes` / ' : ''}\`notes\`,
   not in the name.`,
    s.cardio ? `**Cardio is a structured \`workout\`:** Describe every cardio session as
   \`workout\` steps (see "Cardio workouts" below). Pick an effort word for each
   step; the app turns it into my pace or feel. Only prescribe what I can
   measure (see "what I can measure" above). The app times every step and
   cues me with tones, so there's no need to pre-calculate splits.` : '',
    `**Apply my latest check-in:** If my history includes a "Latest check-in",
   apply every line of it (session length, a lighter week, intensity, injury
   status, what's coming up). I answered it for this plan.`,
  ].filter(Boolean)

  const onlyTypes = s.sessionTypes.length === 1
    ? `Every session is \`type: "${s.sessionTypes[0]}"\`.`
    : `Use only these session types: ${s.sessionTypes.map((t) => `\`${t}\``).join(', ')}.`

  return `# New Week Plan — Week of ${weekLabel}

You are ${coachRole(s, profile)}. Generate my training plan for this
week. Everything you need is in this message — my profile, training history,
the programming rules and the output schema are all included below. Don't ask
me follow-up questions — go straight to the plan.

## This week
- **Week starts (Monday):** ${weekStartISO}
- **Training days — use exactly these dates, one session per day:**
${dayLines || '  - —'}
- **Target session length:** about ${sessionMinutes} minutes each, including warm-up and cool-down. Size the ${s.weights || s.mobility ? 'exercise count, sets and rest' : 'workout'} so it genuinely fits, and set \`estimatedMinutes\` honestly.
- **Session types:** ${onlyTypes}
- **Extra context / notes:** ${userNotes.trim() || 'None'}${replaceNote}
${goalSection ? `
## Goal
${goalSection}
` : ''}
## Athlete profile
- **Name:** ${profile.name.trim() || 'Athlete'}
- **Sex / age / height / weight:** ${profile.sex}, ${age !== undefined ? `${age}y` : 'age —'}, ${profile.heightCm}cm, ${profile.weightKg}kg
- **Program block:** ${blockLine}
- **Experience level:** ${profile.experienceLevel ?? '—'}
- **Goals:** ${profile.goals.length ? profile.goals.join('; ') : '—'}
- **⚠️ Injuries (safety-critical — program around these using your judgement; this is general fitness guidance, not medical advice):** ${profile.injuries.length ? profile.injuries.join('; ') : 'None reported'}
- **Fitness background:** ${profile.fitnessBackground || '—'}${s.diet ? `
- **Dietary notes:** ${profile.dietaryNotes.join('; ')}` : ''}

### Program preferences
${programBlock}
${s.cardio ? `
### Cardio: paces & what I can measure
- ${zonesLine(profile)}
- ${measurementLine(profile)}
` : ''}
## Training history (summary)
${summarizeHistory(loggedSessions, { latestCheckIn: checkInForPlanning(checkIns, weekStartISO)?.summary.split('\n').filter(Boolean) })}

## Critical Programming Rules

Apply all of these. The safety rules override every preference above.

${rules.map((r, i) => `${i + 1}. ${r}`).join('\n')}

Match the tone of my chosen coaching style in your written summary and how hard
you push intensity/RPE targets.

${warmupSection(s)}

${outputSection(weekStartISO, selectedDays, s)}

${s.weights ? 'Apply progressive overload against the current working weights above.' : 'Progress gradually from my recent sessions above.'}`
}

/**
 * Tracker mode (§4.6): the athlete brings their own plan. This prompt asks
 * Claude to convert pasted plan text into importable WeekPlan JSON *as
 * written*: no reprogramming, but anything that conflicts with their
 * injuries is flagged, never silently rewritten.
 */
export function buildConvertPlanPrompt(
  planText: string,
  selectedDays: DayOfWeek[],
  weekStart: Date,
  profile: UserProfile,
): string {
  const weekStartISO = toLocalISODate(weekStart)
  const dayLines = WEEK_DAYS_MON
    .map((day, i) => ({ day, i }))
    .filter(({ day }) => selectedDays.includes(day))
    .map(({ day, i }) => `  - ${day} → \`${toLocalISODate(addDays(weekStart, i))}\``)
    .join('\n')
  return `# Convert my training plan — week of ${format(weekStart, 'dd MMM yyyy')}

I follow a plan from my ${profile.goal?.tracker?.source === 'coach' ? 'coach or club' : profile.goal?.tracker?.source === 'self' ? 'own notes' : 'app or book'}. Convert this week of it into JSON for my training app,
**exactly as written**. Don't change exercises, sets, reps, loads or paces, and
don't add sessions. Where the plan is vague, pick the closest faithful reading.

## This week
- **Week starts (Monday):** ${weekStartISO}
- **Training days — use these dates, one session per day:**
${dayLines || '  - (use the days in the plan below, this week)'}

## My plan (pasted)
\`\`\`
${planText.trim() || '(paste your plan here)'}
\`\`\`

## Safety check (don't skip)
- ⚠️ My injuries: ${profile.injuries.length ? profile.injuries.join('; ') : 'none reported'}.
- If anything in the plan conflicts with them, **don't rewrite it**. Keep it, and
  put a warning starting with "⚠️" in that exercise's \`coachNotes\` (or the
  session's \`focus\`), then list the conflicts in your summary so I can ask my
  coach.

## How to fill in what the plan doesn't say
- Warm-up and cool-down: if the plan gives none, add a short, sensible one in
  the required format (it isn't logged, it's a checklist).
- Cardio goes in \`workout\` steps. Use effort words that match the plan's
  descriptions; put any explicit pace or split from the plan in \`target\`.
- Keep distances and times exactly as the plan gives them: a distance rep
  becomes \`end: { by: "distance" }\` (I press LAP at the distance), a timed one
  \`end: { by: "time" }\`.

${outputSection(weekStartISO, selectedDays, ALL)}`
}
