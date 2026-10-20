# Coach Clawde — Workout Tracker

This repo is a workout tracking PWA. Claude generates personalised weekly workout plans from a prompt the app produces.

## Onboarding

Onboarding happens entirely in the app: a deterministic chat with Clawde
walks a goal tree (`src/lib/goalFlow.ts`): one "why are you here?" question
(an event, fitness, physique, strength, a sport, or "I have my own plan")
routes to a short branch, then time, kit and a health screen, ending on a
"here's what I heard" card. It builds a `GoalProfile` (event and date, aim,
starting point, recent result, constraints, health flags) and derives the
legacy profile fields from it. Weekly check-ins (`src/lib/checkIn.ts`) keep it
current. There is no onboarding prompt to answer here.

## How to Generate a Week Plan

When the user pastes a prompt from the app (generated via Home → Plan → Generate & Open Claude), create a `WeekPlan` JSON matching the schema below and paste it back. The user will import it via Plan → Import Plan from Claude.

The app is **multi-user** and each athlete's data lives in a per-user database (not in this repo), so the pasted prompt is **self-contained**: it embeds the athlete's profile, injuries, goals, program preferences and a *summarised* recent training history. Read those straight from the pasted prompt:

- **What they're training for, block phases, starting point** → the prompt's "Goal" section (when present)
- **Athlete profile, injuries, goals, program preferences** → the prompt's "Athlete profile" section
- **Pace zones and what they can measure with** → the prompt's "Cardio: paces & what I can measure" section
- **Recent training history, notes, swaps, working weights and the latest check-in** → the prompt's "Training history (summary)" section
- **Programming rules & the WeekPlan schema** → this file (`CLAUDE.md`)

Always apply the Critical Programming Rules below and progressive overload against the current working weights given in the prompt.

The app **tailors each prompt** to the athlete: it only includes the rules,
session types, schema fields and examples that fit what they set up (training
types, equipment, goal, dietary needs). A gym-only lifter's prompt never
mentions cardio, a runner without strength work gets no lifting rules, and a
home athlete's equipment is a hard rule. This file is the full, general
reference; when the prompt is narrower, follow the prompt (e.g. only use the
session types it lists).

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
  id: string,                     // unique, with the date, e.g.
                                  // "session-2026-06-16-upper" (the app also
                                  // scopes ids to their week, so a repeated
                                  // id never matches an old week's log)
  date: string,                   // ISO date
  dayOfWeek: DayOfWeek,
  type: "weights" | "cardio" | "active-recovery",
  title: string,
  focus: string,                  // muscle groups or cardio type
  estimatedMinutes: number,
  intensity: "easy" | "moderate" | "hard",
  warmup: string,                 // REQUIRED: one-line summary of the warm-up
  warmupExercises: RoutineItem[], // REQUIRED: the warm-up, in order, 2–4 moves
                                  // (optional in src/types so pre-v1.0.1 plans
                                  // still load, but every new plan includes it)
  cooldown?: string,              // optional one-line cool-down summary
  cooldownExercises?: RoutineItem[], // optional: at most 2 stretches
  exercises?: PlannedExercise[],  // for weights sessions
  workout?: WorkoutItem[],        // for cardio sessions (structured; see below)
  intervals?: PlannedInterval[],  // LEGACY cardio format — don't write it in
                                  // new plans; the app converts old ones to
                                  // `workout` on import and when it reads them
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
  durationSeconds?: number        // for TIMED holds (e.g. plank). When set,
                                  // the app shows a stopwatch instead of a
                                  // reps/weight row and `reps` is ignored for
                                  // display — still set reps to "" or the hold
                                  // label. Do NOT give timed exercises a weight.
}

WorkoutItem = WorkoutStep | RepeatBlock

WorkoutStep {
  kind: "step",
  role: "warmup" | "work" | "recover" | "steady" | "cooldown",
  end: { by: "time", seconds: number }      // ends by itself
     | { by: "distance", meters: number }   // athlete presses LAP at the distance
     | { by: "lap" },                       // ends when the athlete presses LAP
  effort: "recovery" | "easy" | "steady" | "marathon" | "threshold"
        | "interval" | "repetition" | "sprint",
  target?: string,                // override the app's pace: "rate 20", "200 W", "12 km/h"
  recovery?: "stand" | "walk" | "jog",   // recover steps
  cue?: string                    // short coaching cue
}

RepeatBlock {
  kind: "repeat",
  times: number,
  steps: WorkoutItem[],           // nest at most 2 deep: 2 × (4 × 400 m)
  everySeconds?: number,          // send-off cycle (swim "on 1:45", EMOM)
  skipLastRecovery?: boolean      // no recovery after the final repetition
}

// Legacy only — kept so old plans load. Don't write it in new plans.
PlannedInterval {
  label: string,
  repeats: number,
  targetPace?: string,
  targetDuration?: string,
  targetDistance?: string,
  restSeconds: number,
  notes?: string
}
```

Cardio sessions run in the app's **Run Mode**: it times every `workout` step,
plays a tone at each change (rising = go, falling = recover, pips before each
change) and fills in the log itself. Pick **effort words**; the app resolves
them to the athlete's pace zones (from the "Pace zones" line in the prompt) for
the modality they choose, or to RPE when it has no zones. The easy warm-up and
cool-down running are workout steps so they're timed; drills and strides stay
in `warmupExercises`, and only before runs with fast work. A continuous run is
just steps back to back.

Athletes who follow their own plan (tracker mode) paste a **"Convert my
training plan"** prompt instead. Convert it into a `WeekPlan` exactly as
written: don't reprogram it, and flag anything that loads an injury marked
worse at a check-in with a "⚠️" in `coachNotes` rather than rewriting it.

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

The Critical Programming Rules below always override these preferences, and an
uncleared medical flag's limits override the coaching style.

## Critical Programming Rules

These are general, athlete-agnostic rules. Specific medical limits are **not**
hard-coded here — they come from each athlete's own profile (their `injuries`
and `dietaryNotes`), so apply them per-athlete using your own coaching judgement
rather than assuming any particular injury.

1. **TRAIN AROUND NIGGLES, PROPORTIONATELY**: The prompt lists each niggle once, with its latest check-in status. Change only the exercises that provoke it (a different variation, range of motion or load) and train everything else normally; say what you changed once, in that exercise's `coachNotes`. For one marked "worse this week", go lighter on the movements that load it. Don't add rehab or "protective" moves unless asked, and don't give medical or referral advice: the app does that itself, on specific triggers (an uncleared medical flag, a niggle getting worse). With no niggles listed, don't mention injuries at all. An uncleared medical flag (in the Goal section) means moderate intensity and no maximal efforts, whatever the coaching style.
2. **Respect dietary needs**: Note any dietary restrictions the athlete lists when making nutrition suggestions; they don't otherwise change the programming.
3. **Progressive overload**: Keep last week's exercises, with the same names, unless the athlete swapped one or a new block starts (working weights are matched by name), and slightly increase volume or intensity vs the previous week's logged data.
4. **BALANCED, FULL-BODY DEVELOPMENT (default goal)**: Unless the athlete says otherwise, program for a balanced physique. Across the week, hit every major muscle group with roughly even volume — push (chest/triceps), pull (back/biceps), legs (quads/hamstrings/glutes/calves), shoulders and core. Don't let any one area dominate. Each individual session should also state its `focus` honestly and cover a coherent group of muscles rather than a random mix. Session shape: 3–6 exercises (up to 7 past beginner), main compound exercise first, most sets 1–3 reps short of failure (RPE 7–9), rest 2–3 min on compound exercises and 60–90 s on isolation work; where the days allow, train each major muscle group at least twice a week.
5. **SUPERSETS ARE OPTIONAL**: Use straight sets by default. Only superset when the session wouldn't fit the time otherwise, and then only opposing muscles at one station (e.g. Dumbbell Bench Press + One-Arm Dumbbell Row on one bench, or Cable Curl + Cable Pushdown on one stack), never the main heavy lift:
   - **Equipment must be easy to alternate between.** Never pair two different machines, or a machine with a bench/rack — the athlete shouldn't have to move across the gym (or tie up a machine others are waiting on) to swap between sets.
   - **Keep it in one contiguous block.** Place the pair adjacent in the `exercises` array and note it in `coachNotes` (e.g. "Superset with the next exercise — alternate sets").
6. **TIMED EXERCISES**: For holds like planks, side planks, dead hangs or wall sits, set `durationSeconds` on each set (and no weight). The app gives the athlete a stopwatch.
7. **PERIODISE ACROSS THE BLOCK**: The prompt gives "Week N of M" for the athlete's program block. When the prompt has a **Goal** section, follow its phase skeleton (Base → Build → Peak → Taper, computed by the app from the weeks to race day) and its deload flag for this week; it's deliberate and deterministic. Otherwise, deload (~40% less volume, lighter loads, RPE ≤ 7) roughly every 4th–6th week, or sooner if recent history shows fatigue; build through the middle and push a little harder in the final week or two. Say in the summary if it's a deload week.
8. **FIT THE SESSION LENGTH & DATES**: The prompt gives a target session length and the exact date for each training day. Use those dates verbatim (one session per listed day) and size each session to the target, with an honest `estimatedMinutes`.
9. **SHORT WARM-UP, OPTIONAL COOL-DOWN**: The athlete follows the warm-up move by move in the app, which shows the one-line summary and expands it into a checklist with a movement guide per move. Keep it short and on the session's own equipment: only ramp-up sets have consistent evidence behind them, and cool-downs don't speed recovery.
   - `warmup`: one-line summary. `warmupExercises`: 2–4 moves **in order** (counted in `estimatedMinutes`):
     - **Weights, in a gym**: ramp-up sets before the first main lift, and any later much heavier lift: 2–3 build-up sets with falling reps at ~40–50%, 70% and 85–90% of the working weight, with actual kg in the `prescription` (e.g. "10 × 10kg, 6 × 16kg, 3 × 20kg"). In sessions of 45 min or more, add up to 5 min easy on a bike or rower first, and 1–2 mobility moves for the joints the session loads.
     - **Weights, at home or bodyweight**: an easier version of the first exercise (e.g. incline push-ups before push-ups), then ramp-up sets if it's loaded, and 1–2 mobility moves in sessions of 45 min or more. No filler like marching on the spot.
     - **Cardio**: the easy warm-up is a timed `workout` step. Drills (Leg Swings, High Knees, Butt Kicks) and 2–4 strides only before runs with fast work; one or two loosening moves before easy runs; no running drills before rowing, cycling or swimming.
     - **Active recovery**: a gentle move or two into the session's first positions.
   - Every move has a `prescription` (reps, sets × reps, time or distance) and, where useful, `notes` with the cue or purpose.
   - `cooldown` + `cooldownExercises` are optional: leave them out unless the session has time to spare, then give at most two 30–60s stretches for the muscles worked.
   - Warm-up moves aren't logged, so don't repeat them in `exercises`.
   The app's prompt (`src/lib/promptBuilder.ts`) carries the same spec plus a worked JSON example. Keep the two in sync.
10. **STANDARD EXERCISE NAMES**: Name every exercise and warm-up/cool-down move with its common gym name (e.g. "Dumbbell Bench Press", "Romanian Deadlift", "Cat Stretch"). The app matches names against an exercise library (free-exercise-db) to show a movement guide, with a YouTube search as backup. Put variations and cues in `coachNotes` / `notes`, not the name. Stick to well-known exercises that fit the athlete's equipment: no hybrids or novelty moves.
11. **APPLY THE LATEST CHECK-IN**: When the history includes a "Latest check-in", apply it: shorter sessions, a lighter week, intensity up or down, injury status (worse → lighter on the movements that load it; the app gives any referral advice), and next week's events. The athlete answered those questions for this plan.
12. **PRESCRIBE ONLY WHAT CAN BE MEASURED**: The prompt's "Runs with" line says what the athlete measures with. With a phone only (or unknown), end reps by **time**, never by distance. Distance reps need a GPS watch or a track; on a treadmill give speeds in km/h as `target`. Cardio always goes in `workout`, not `intervals`.
13. **STRICT JSON OUTPUT**: The athlete pastes the JSON straight into the app. Output strict JSON (no comments, trailing commas or nulls — omit optional fields instead), only schema fields, exact enum values, and unique ids across sessions and exercises.
14. **METRIC ONLY**: Weights in kg, distances in m or km, paces per km, speeds in km/h, even when the athlete's notes or pasted plan use lb or miles (convert them). In text, put the number right before its unit ("8 × 12kg", "5 km", "4:45/km"); numeric fields are plain numbers. The athlete picks kg/lb and km/mi in Settings and the app converts for display.

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
