import type { DayOfWeek, LoggedSession, UserProfile, WeekPlan } from '../types'
import { format } from 'date-fns'
import { WEEK_DAYS_MON, addDays, toLocalISODate } from './weekUtils'
import { summarizeHistory } from './historySummary'
import { getProgramProgress } from './programProgress'

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
export function buildWeekPlanPrompt(
  selectedDays: DayOfWeek[],
  userNotes: string,
  sessionMinutes: number,
  existingPlan: WeekPlan | undefined,
  weekStart: Date,
  profile: UserProfile,
  loggedSessions: LoggedSession[]
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

  const program = profile.program
  const programBlock = program
    ? `- **Goals:** ${program.goals.join(', ') || '—'}
- **Training types:** ${program.exerciseTypes.join(', ') || '—'}
- **Facilities:** ${program.facilities.join(', ') || '—'}
- **Preferred cardio:** ${program.sports.join(', ') || '—'}
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

## Athlete profile
- **Name:** ${profile.name.trim() || 'Athlete'}
- **Sex / height / weight:** ${profile.sex}, ${profile.heightCm}cm, ${profile.weightKg}kg
- **Program block:** ${blockLine}
- **Experience level:** ${profile.experienceLevel ?? '—'}
- **Goals:** ${profile.goals.length ? profile.goals.join('; ') : '—'}
- **⚠️ Injuries (safety-critical — program around these using your judgement; this is general fitness guidance, not medical advice):** ${profile.injuries.length ? profile.injuries.join('; ') : 'None reported'}
- **Fitness background:** ${profile.fitnessBackground || '—'}
- **Dietary notes:** ${profile.dietaryNotes.length ? profile.dietaryNotes.join('; ') : '—'}

### Program preferences
${programBlock}

## Training history (summary)
${summarizeHistory(loggedSessions)}

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
7. **Periodise across the block:** Use my program block position above. Plan a
   deload week (roughly 40% less volume, lighter loads, RPE ≤ 7) about every
   4th–6th week, or sooner if my recent history shows fatigue (low "felt"
   scores, missed reps, stalled weights). Build through the middle of the block
   and push a little harder in the final week or two. Say in your summary if
   this is a deload week and why.

Match the tone of my chosen coaching style in your written summary and how hard
you push intensity/RPE targets.

## Output: \`WeekPlan\` JSON schema

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
  warmup?: string,
  cooldown?: string,
  exercises?: PlannedExercise[],  // for weights sessions
  intervals?: PlannedInterval[],  // for cardio sessions
  cardioOptions?: CardioType[]    // cardio only: modalities to choose between at
                                  // the start. First entry is the default. Drives
                                  // split units (run → /km, row → /500m, swim →
                                  // /100m, bike → km/h). Omit when the modality
                                  // is fixed.
}

// CardioType = "run" | "row" | "bike" | "swim" | "other"

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

PlannedInterval {
  label: string,                  // e.g. "6km erg piece"
  repeats: number,
  targetPace?: string,            // e.g. "2:05/500m" or "4:45/km"
  targetDuration?: string,        // e.g. "22:00"
  targetDistance?: string,        // e.g. "5km" or "2000m"
  restSeconds: number,
  notes?: string
}
\`\`\`

I log each cardio interval as **distance + time** and the app computes the split
itself, so you don't need to pre-calculate pace — just give sensible
\`targetDistance\` / \`targetDuration\` / \`targetPace\` cues.

Apply progressive overload against the current working weights above.`
}
