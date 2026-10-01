import type { CheckIn, DayOfWeek, LoggedSession, UserProfile, WeekPlan } from '../types'
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
 * rules and the full `WeekPlan` JSON schema. Earlier versions referenced
 * `CLAUDE.md` in the repo for the rules and schema, but that only works inside
 * Claude Code with the repo checked out — most athletes paste into claude.ai,
 * which can't read the repo. Embedding everything means the prompt works
 * anywhere, with no repo access required.
 *
 * Keep the embedded rules/schema below in sync with `CLAUDE.md` and
 * `src/types/index.ts` if any of them change.
 *
 * `weekStart` is the Monday the plan targets — resolved by the caller from the
 * selected days (this week vs. next week), so the prompt, the on-screen label
 * and the imported plan all agree on which week is being planned.
 */
/**
 * The output contract shared by the plan prompt and the convert-my-plan
 * prompt: the WeekPlan schema, strict-JSON rules and the cardio workout format.
 */
function outputSection(weekStartISO: string, selectedDays: DayOfWeek[]): string {
  return `## Output: \`WeekPlan\` JSON schema

Output a single \`\`\`json code block first, then a short plain-English summary of
the week. I paste the JSON straight into the app, so it must parse:

- **Strict JSON only** — double-quoted keys and strings, no comments, no trailing
  commas, no \`undefined\`. Leave optional fields out rather than setting them to null.
- Only use the fields in the schema below; use the exact string values shown
  for \`type\`, \`intensity\`, \`dayOfWeek\` and \`cardioOptions\`.
- Every \`id\` must be unique across the whole plan (sessions and exercises).
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
  id: string,                     // unique, e.g. "session-mon-upper"
  date: string,                   // ISO date
  dayOfWeek: DayOfWeek,
  type: "weights" | "cardio" | "active-recovery",
  title: string,
  focus: string,                  // muscle groups or cardio type
  estimatedMinutes: number,
  intensity: "easy" | "moderate" | "hard",
  warmup: string,                 // REQUIRED: one-line summary of the warm-up
  warmupExercises: RoutineItem[], // REQUIRED: the full warm-up, in order, 4–8
                                  // moves (see "Warm-up & cool-down format")
  cooldown: string,               // REQUIRED: one-line summary of the cool-down
  cooldownExercises: RoutineItem[], // REQUIRED: the full cool-down, 3–5 moves
  exercises?: PlannedExercise[],  // for weights sessions
  workout?: WorkoutItem[],        // for cardio sessions (see below)
  cardioOptions?: CardioType[]    // cardio only: modalities to choose between at
                                  // the start. First entry is the default. Drives
                                  // split units (run → /km, row → /500m, swim →
                                  // /100m, bike → km/h). Omit when the modality
                                  // is fixed.
}

// CardioType = "run" | "row" | "bike" | "swim" | "other"

RoutineItem {
  name: string,                   // standard exercise name, e.g. "Leg Swings"
  prescription: string,           // REQUIRED: e.g. "10 each side", "60s",
                                  // "2 × 10", "8 × 12kg, 5 × 18kg"
  notes?: string                  // cue or purpose
}

PlannedExercise {
  id: string,
  name: string,
  coachNotes?: string,
  sets: PlannedSet[]
}

PlannedSet {
  reps: string,                   // e.g. "8-10" or "12" or "AMRAP"
  rpe?: number,                   // 1-10
  restSeconds: number,
  suggestedWeightKg?: number,     // may be a decimal, e.g. 22.5
  durationSeconds?: number        // for TIMED holds (e.g. plank). When set, the
                                  // app shows a stopwatch instead of a
                                  // reps/weight row; set reps to "" and give no
                                  // weight.
}

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
\`\`\`

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
\`\`\``
}

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
    ? `- **Goals:** ${program.goals.join(', ') || '—'}
- **Training types:** ${program.exerciseTypes.join(', ') || '—'}
- **Facilities:** ${program.facilities.join(', ') || '—'}
- **Preferred cardio:** ${program.sports.join(', ') || '—'}
- **Preferred frequency:** ${program.daysPerWeek ? `about ${daysPerWeekLabel(program.daysPerWeek)} days a week` : '—'}
- **Coaching style:** ${program.coachingStyle}`
    : '- (no standing program preferences set)'

  return `# New Week Plan — Week of ${weekLabel}

You are Coach Claude, an experienced strength & conditioning coach. Generate my
training plan for this week. Everything you need is in this message — my
profile, training history, the programming rules and the output schema are all
included below. Don't ask me follow-up questions — go straight to the plan.

## This week
- **Week starts (Monday):** ${weekStartISO}
- **Training days — use exactly these dates, one session per day:**
${dayLines || '  - —'}
- **Target session length:** about ${sessionMinutes} minutes each, including warm-up and cool-down. Size the exercise count, sets and rest so it genuinely fits, and set \`estimatedMinutes\` honestly.
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
- **Fitness background:** ${profile.fitnessBackground || '—'}
- **Dietary notes:** ${profile.dietaryNotes.length ? profile.dietaryNotes.join('; ') : '—'}

### Program preferences
${programBlock}

### Cardio: paces & what I can measure
- ${zonesLine(profile)}
- ${measurementLine(profile)}

## Training history (summary)
${summarizeHistory(loggedSessions, { latestCheckIn: checkInForPlanning(checkIns, weekStartISO)?.summary.split('\n').filter(Boolean) })}

## Critical Programming Rules

Apply all of these. The safety rules override every preference above.

1. **INJURY-AWARE PROGRAMMING (safety-critical):** Read my stated injuries and
   program around them. Pick exercise variations, ranges of motion and loads
   that don't aggravate a flagged area, swap out movements that would, and add
   appropriate prehab/rehab work where it helps. When an injury is serious,
   recent or unresolved, keep loads conservative and note that I should get it
   assessed and cleared by a qualified professional first. This is general
   fitness guidance, not medical advice.
2. **Respect dietary needs:** Note any dietary restrictions I list when making
   nutrition suggestions; they don't otherwise change the programming.
3. **Progressive overload:** Slightly increase volume or intensity vs. my recent
   logged data and current working weights.
4. **Balanced, full-body development (default):** Unless I say otherwise, program
   for a balanced physique. Across the week hit every major muscle group with
   roughly even volume — push (chest/triceps), pull (back/biceps), legs
   (quads/hamstrings/glutes/calves), shoulders and core. Don't let one area
   dominate. Each session's \`focus\` should be honest and cover a coherent group
   of muscles.
5. **Supersets — pairing, equipment & layout:** Pair complementary movements
   (prefer antagonist or push/pull pairs, e.g. chest press + row, quad +
   hamstring, biceps + triceps). For each superset:
   - **Keep it equipment-light to move between:** only pair exercises that share
     the same station/equipment or sit right next to each other. Do NOT pair two
     different machines, or a machine with a bench/rack — I shouldn't have to
     hop between stations (or hold a machine others are waiting for) to alternate
     sets. Dumbbell/bodyweight pairs, or two moves on one cable/bench, are ideal.
   - **Keep it in one contiguous block:** place the paired exercises adjacent in
     the \`exercises\` array, and don't scatter a superset's exercises among
     others — all of a superset's movements come one after another so I'm not
     flipping back and forth. Note the pairing in \`coachNotes\` (e.g. "Superset
     with the next exercise — alternate sets").
6. **Timed exercises:** For holds (planks, side planks, dead hangs, wall sits),
   set \`durationSeconds\` on each set and give them no weight. The app shows a
   stopwatch.
7. **Periodise across the block:** If there's a Goal section above, follow its
   phase skeleton and this week's deload flag exactly; the app computed them
   from my dates. Otherwise use my program block position above. Plan a
   deload week (roughly 40% less volume, lighter loads, RPE ≤ 7) about every
   4th–6th week, or sooner if my recent history shows fatigue (low "felt"
   scores, missed reps, stalled weights). Build through the middle of the block
   and push a little harder in the final week or two. Say in your summary if
   this is a deload week and why.
8. **Detailed warm-up & cool-down (required):** Every session must include the
   full step-by-step warm-up and cool-down described in "Warm-up & cool-down
   format" below. I follow it move by move in the app, so never skip it or
   reduce it to a one-line summary.
9. **Standard exercise names:** Name every exercise and warm-up move with its
   common, standard gym name (e.g. "Dumbbell Bench Press", "Romanian Deadlift",
   "Cat Stretch") — the app looks each name up in an exercise library to show
   me a movement guide. Put variations and cues in \`coachNotes\` / \`notes\`,
   not in the name.
10. **Cardio is a structured \`workout\`:** Describe every cardio session as
    \`workout\` steps (see "Cardio workouts" below), not \`intervals\`. Pick an
    effort word for each step; the app turns it into my pace or feel. Only
    prescribe what I can measure (see "what I can measure" above). The app
    times every step and cues me with tones, so there's no need to
    pre-calculate splits.
11. **Apply my latest check-in:** If my history includes a "Latest check-in",
    apply every line of it (session length, a lighter week, intensity, injury
    status, what's coming up). I answered it for this plan.

Match the tone of my chosen coaching style in your written summary and how hard
you push intensity/RPE targets.

## Warm-up & cool-down format (required on every session)

The app shows each session's warm-up as a one-line summary that expands into
a numbered checklist, with a movement guide for every move. Build it like this:

- \`warmup\`: one line summarising the whole warm-up.
- \`warmupExercises\`: the full warm-up **in the order I do it**, 4–8 moves,
  about 8–12 minutes (count it in \`estimatedMinutes\`). Work through these
  phases:
  1. **Raise:** 3–5 min of easy cardio to get my heart rate up.
  2. **Mobilise:** dynamic mobility for the joints this session loads (e.g.
     hips and ankles before squats, upper back and shoulders before pressing).
  3. **Activate / prehab:** 1–2 moves for the muscles that protect my flagged
     injuries, or that the session leans on most.
  4. **Ramp-up sets (weights sessions):** before the first main lift, and any
     later lift much heavier than what came before, give 2–3 lighter build-up
     sets with falling reps at roughly 40–50%, 70% and 85–90% of the working
     weight you set. Write the actual kg in the \`prescription\`, rounded to
     loadable jumps. Skip this for bodyweight or light accessory work.
     **Cardio sessions:** instead finish with drills (e.g. Leg Swings, High
     Knees, Butt Kicks) and 2–4 short strides or build-ups toward the target
     pace before the first interval. **Active recovery:** a gentle mobility
     flow.
- **Every move needs a \`prescription\`**: reps, sets × reps, time or distance,
  e.g. "2 × 10", "60s", "5 min easy", "10 each side", "8 × 12kg, 5 × 18kg". Use
  \`notes\` for the cue or why the move is there (e.g. "shoulder prehab before
  pressing").
- \`cooldown\` + \`cooldownExercises\`: 3–5 moves, about 5 minutes. An easy
  flush first, then static stretches (30–60s holds) for the muscles worked, in
  order.
- Warm-up and cool-down moves aren't logged sets, so don't repeat them in
  \`exercises\`.

Example of the shape (base the real moves and loads on each session and my
working weights; don't copy these):

\`\`\`json
"warmup": "5 min easy row, hip and upper-back mobility, band pull-aparts, ramp-up sets",
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
]
\`\`\`

${outputSection(weekStartISO, selectedDays)}

Apply progressive overload against the current working weights above.`
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

${outputSection(weekStartISO, selectedDays)}`
}
