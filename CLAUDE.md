# Coach Claude — Workout Tracker

This repo is a workout tracking PWA. Claude generates personalised weekly workout plans from a prompt the app produces.

## Onboarding

Onboarding happens entirely in the app: a scripted chat with Clawde
(`src/lib/onboardingChat.ts`) asks about goals, experience, training types,
frequency, equipment, injuries and coaching style, then an "About you"
screen collects name, age and body stats. The answers are written straight
into the profile — there is no onboarding prompt to answer here any more.

## How to Generate a Week Plan

When the user pastes a prompt from the app (generated via Home → Plan → Generate & Open Claude), create a `WeekPlan` JSON matching the schema below and paste it back. The user will import it via Plan → Import Plan from Claude.

The app is **multi-user** and each athlete's data lives in a per-user database (not in this repo), so the pasted prompt is **self-contained**: it embeds the athlete's profile, injuries, goals, program preferences and a *summarised* recent training history. Read those straight from the pasted prompt:

- **Athlete profile, injuries, goals, program preferences** → the prompt's "Athlete profile" section
- **Recent training history & current working weights** → the prompt's "Training history (summary)" section
- **Programming rules & the WeekPlan schema** → this file (`CLAUDE.md`)

Always apply the Critical Programming Rules below and progressive overload against the current working weights given in the prompt.

### WeekPlan JSON Schema

```typescript
{
  id: string,                     // e.g. "plan-2026-06-16"
  weekStartDate: string,          // ISO date of Monday, e.g. "2026-06-16"
  availableDays: DayOfWeek[],     // ["Mon","Tue","Thu","Sat"]
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
  warmup?: string,                // brief one-line summary
  cooldown?: string,              // brief one-line summary
  warmupExercises?: RoutineItem[],   // detailed warm-up moves (4–8)
  cooldownExercises?: RoutineItem[], // detailed cool-down moves
  exercises?: PlannedExercise[],  // for weights sessions
  intervals?: PlannedInterval[],  // for cardio sessions
  cardioOptions?: CardioType[]    // cardio only: modalities the athlete may
                                  // choose between at the start of the session.
                                  // First entry is the default. Drives split
                                  // units (run → /km, row → /500m, swim →
                                  // /100m, bike → km/h). Omit when the modality
                                  // is fixed.
}

// CardioType = "run" | "row" | "bike" | "swim" | "other"

RoutineItem {
  name: string,                   // standard exercise name, e.g. "Leg Swings"
  prescription?: string,          // e.g. "10 each side" or "60s"
  notes?: string
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
  durationSeconds?: number        // for TIMED holds (e.g. plank). When set,
                                  // the app shows a stopwatch instead of a
                                  // reps/weight row and `reps` is ignored for
                                  // display — still set reps to "" or the hold
                                  // label. Do NOT give timed exercises a weight.
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
```

The athlete logs each cardio interval as **distance + time**; the app computes
the split itself, so you don't need to pre-calculate pace — just give sensible
`targetDistance` / `targetDuration` / `targetPace` cues.

## Athlete Data

Everything you need is embedded in the pasted prompt — there is no athlete data
in this repo. Each athlete's profile, plans and logged sessions live in their own
database account.

If a prompt arrives *without* an embedded profile it came from an old build of
the app; ask the athlete to update and regenerate it rather than guessing at
their injuries or working weights.

### Program preferences (`profile.program`)

The athlete sets standing preferences in-app (Progress → 12-Week Program tile).
They arrive under `program` in the pasted prompt and should shape every plan:

- `goals` — any of `get-fit`, `get-strong`, `look-great`. Bias the week's
  emphasis accordingly (conditioning vs. heavy strength vs. hypertrophy/aesthetics).
- `exerciseTypes` — any of `weights`, `cardio`, `mobility`. Only program the
  types selected here (mobility maps to active-recovery / rehab blocks).
- `facilities` — any of `yoga-mat`, `weights-at-home`, `full-gym`. Pick exercises
  the athlete can actually do with the equipment available.
- `sports` — preferred cardio modalities (e.g. Running, Rowing) — favour these
  for cardio sessions. Only relevant when `cardio` is in `exerciseTypes`.
- `daysPerWeek` — roughly how often the athlete wants to train (6 means "6+").
  The prompt's listed training days take precedence for the week itself.
- `coachingStyle` — `supportive`, `balanced` or `intense`. Sets the tone of your
  written summary and how hard you push intensity/RPE targets.

`program.lengthWeeks` (how many weeks the program runs) and `program.startDate`
are **app-managed** — the athlete picks the length during onboarding / in Program
setup, and the app tracks progress and prompts a re-onboard when the block ends.
Never set them in a plan; leave them to the app.

The Critical Programming Rules below (especially the safety rules) always
override these preferences.

## Critical Programming Rules

These are general, athlete-agnostic rules. Specific medical limits are **not**
hard-coded here — they come from each athlete's own profile (their `injuries`
and `dietaryNotes`), so apply them per-athlete using your own coaching judgement
rather than assuming any particular injury.

1. **INJURY-AWARE PROGRAMMING (safety-critical)**: Read the athlete's stated injuries and program around them. Pick exercise variations, ranges of motion and loads that don't aggravate a flagged area, swap out movements that would, and add appropriate prehab/rehab work where it helps. When an injury is serious, recent or unresolved, keep loads conservative and note that they should get it assessed and cleared by a qualified professional first. This is general fitness guidance, not medical advice.
2. **Respect dietary needs**: Note any dietary restrictions the athlete lists when making nutrition suggestions; they don't otherwise change the programming.
3. **Progressive overload**: Each week should slightly increase volume or intensity vs previous week's logged data.
4. **BALANCED, FULL-BODY DEVELOPMENT (default goal)**: Unless the athlete says otherwise, program for a balanced physique. Across the week, hit every major muscle group with roughly even volume — push (chest/triceps), pull (back/biceps), legs (quads/hamstrings/glutes/calves), shoulders and core. Don't let any one area dominate. Each individual session should also state its `focus` honestly and cover a coherent group of muscles rather than a random mix.
5. **SUPERSETS — PAIRING, EQUIPMENT & LAYOUT**: Pair complementary movements — prefer antagonist or push/pull supersets (e.g. chest press + row, quad + hamstring, biceps + triceps) to save time and keep balance. Two constraints on every superset:
   - **Equipment must be easy to alternate between.** Only pair exercises that share the same station/equipment or sit right next to each other. Don't pair two different machines, or a machine with a bench/rack — the athlete shouldn't have to move across the gym (or tie up a machine others are waiting on) to swap between sets. Dumbbell/bodyweight pairs, or two movements on one cable stack or bench, are ideal.
   - **Keep it in one contiguous block.** Place the paired exercises adjacent in the `exercises` array and never scatter a superset's movements among other exercises — all of a superset's exercises come one after another so the athlete isn't flipping back and forth. Note the pairing in `coachNotes` (e.g. "Superset with the next exercise — alternate sets").
6. **TIMED EXERCISES**: For holds like planks, side planks, dead hangs or wall sits, set `durationSeconds` on each set (and no weight). The app gives the athlete a stopwatch.
7. **PERIODISE ACROSS THE BLOCK**: The prompt gives "Week N of M" for the athlete's program block. Deload (~40% less volume, lighter loads, RPE ≤ 7) roughly every 4th–6th week, or sooner if recent history shows fatigue; build through the middle and push a little harder in the final week or two. Say in the summary if it's a deload week.
8. **FIT THE SESSION LENGTH & DATES**: The prompt gives a target session length and the exact date for each training day. Use those dates verbatim (one session per listed day) and size each session to the target, with an honest `estimatedMinutes`.
9. **DETAILED WARM-UP & COOL-DOWN**: Every session gets a one-line `warmup` / `cooldown` summary *and* a detailed `warmupExercises` list (4–8 moves specific to the session, plus injury prehab where relevant) and a `cooldownExercises` list, each move with a clear `prescription`. The app shows the summary and expands to the full list.
10. **STANDARD EXERCISE NAMES**: Name every exercise and warm-up/cool-down move with its common gym name (e.g. "Dumbbell Bench Press", "Romanian Deadlift", "Cat Stretch"). The app matches names against an exercise library (free-exercise-db) to show a movement guide, with a YouTube search as backup. Put variations and cues in `coachNotes` / `notes`, not the name.
11. **STRICT JSON OUTPUT**: The athlete pastes the JSON straight into the app. Output strict JSON (no comments, trailing commas or nulls — omit optional fields instead), only schema fields, exact enum values, and unique ids across sessions and exercises.

## Session Export

Logged sessions sync automatically to each athlete's database account (Supabase).
Nothing is committed to this repo — there is no export step to run, and no
workout data should ever be added here.

---

# Changing the app's code

Everything above is about *generating workout plans* — the common request, which
needs no code changes. When (and only when) a task actually changes the app's
**code**, read **[`docs/DEVELOPING.md`](docs/DEVELOPING.md)** for the stack,
build/lint commands, file map, and conventions. It's kept out of this file so
plan-generation sessions don't pay for it on every load.
