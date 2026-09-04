import type { DayOfWeek, LoggedSession, UserProfile, WeekPlan } from '../types'
import { format } from 'date-fns'
import { addDays, toLocalISODate } from './weekUtils'
import { summarizeHistory } from './historySummary'

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
  existingPlan: WeekPlan | undefined,
  weekStart: Date,
  profile: UserProfile,
  loggedSessions: LoggedSession[]
): string {
  const weekEnd = addDays(weekStart, 6)
  const weekLabel = `${format(weekStart, 'dd MMM')} – ${format(weekEnd, 'dd MMM yyyy')}`
  const weekStartISO = toLocalISODate(weekStart)

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
included below.

> 💡 **For best results, run this in a higher-tier model — e.g. Claude Opus 4.8
> with extended/high reasoning.** Programming a safe, balanced, progressive week
> around injuries and working weights is a reasoning-heavy task, and stronger
> models produce noticeably better plans.

## This week
- **Week starts (Monday):** ${weekStartISO}
- **Available training days:** ${selectedDays.join(', ') || '—'}
- **Extra context / notes:** ${userNotes.trim() || 'None'}${replaceNote}

## Athlete profile
- **Name:** ${profile.name.trim() || 'Athlete'}
- **Sex / height / weight:** ${profile.sex}, ${profile.heightCm}cm, ${profile.weightKg}kg
- **Program week:** ${profile.programWeek}
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

Match the tone of my chosen coaching style in your written summary and how hard
you push intensity/RPE targets.

## Output: \`WeekPlan\` JSON schema

Output a single JSON code block matching this schema, then a short plain-English
summary of the week.

\`\`\`typescript
{
  id: string,                     // e.g. "plan-${weekStartISO}"
  weekStartDate: string,          // ISO date of Monday, e.g. "${weekStartISO}"
  availableDays: DayOfWeek[],     // subset of ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]
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
  shoulderSafe?: boolean,
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
