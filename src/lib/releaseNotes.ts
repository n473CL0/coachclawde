/**
 * Release notes shown to beta testers the first time they open the app after
 * an update ("What's new"). Newest release first.
 *
 * Shipping a beta update:
 *   1. Bump `version` in package.json.
 *   2. Add an entry for that version at the TOP of `RELEASES`.
 * `npm run build` fails if the newest entry here doesn't match package.json,
 * so an update can't ship without its notes (see vite.config.ts).
 *
 * Put everything that came from tester feedback under `fromFeedback` — that's
 * the "you asked, we built it" list testers see first. Write each line from
 * the athlete's point of view, in plain language.
 *
 * Keep this module dependency-free: vite.config.ts imports it at build time.
 */

export interface Release {
  /** Semver, matching package.json, e.g. "1.0.2". */
  version: string
  /** ISO date the update shipped. */
  date: string
  /** One-line theme for the release. */
  headline: string
  /** Changes made in response to tester feedback. */
  fromFeedback: string[]
  /** Anything else worth mentioning. */
  alsoNew?: string[]
}

export const RELEASES: Release[] = [
  {
    version: '1.0.2',
    date: '2026-10-01',
    headline: 'Run Mode, real goals and weekly check-ins, shaped by your feedback.',
    fromFeedback: [
      'Run Mode times your intervals for you. Press Start and it plays a tone at every change: rising for go, falling for recover, and pips just before. No more second stopwatch. Keep the app open while you run (cues stop if you lock the phone), and on iPhone turn Silent mode off to hear them.',
      'For distance reps, press the big LAP button when you reach the distance and it records your time.',
      'After a run, your log is already filled in from the timer. Check it, add one effort score, save.',
      'Logging by hand is easier: the number the plan already knows is filled in, and times use + and − buttons instead of typing "mm:ss".',
      'Did something else? Log a bike ride, a class or a swim instead of the planned session, and it counts. "Log a session" on Home works with no plan at all.',
      'Your session notes, pain notes and swaps now reach Claude when it plans your next week.',
      'The rest timer beeps when rest is over (and buzzes on Android), and your screen stays on during a workout.',
      'Updates now arrive by themselves. The app checks when you open it and switches over at a quiet moment, never mid-workout.',
      'Fixed: a session could vanish from Home (while the count still included it) if an earlier week had a session with the same name. Every week’s sessions now stay separate, and your history is untouched.',
    ],
    alsoNew: [
      'Onboarding starts with why you’re here (a race, a habit, a holiday, your sport, or your own plan), asks only what changes your plan, and ends with a card you can correct.',
      'Training for an event? Give a recent race time and the app works out your paces, and Claude plans the weeks up to race day.',
      'A one-minute check-in at the end of the week, only when you want it. Every answer changes next week’s plan.',
      'Got a plan from a coach or a book? Paste it and Claude converts it for the app, or just log as you go.',
      'The plan Claude writes is built around how you train: gym-only means no cardio, runners don’t get lifting rules, and home workouts stick to the kit you have.',
      'Plans only ask for what you can measure: with just a phone, reps are set by time.',
      'Already set up? A three-question check-in upgrades your goal. Nothing you’ve logged changes.',
      'Turn off check-in suggestions, or delete your health-screen answers, in Settings.',
    ],
  },
  {
    version: '1.0.1',
    date: '2026-09-30',
    headline: 'Faster setup and a better workout screen, shaped by your feedback.',
    fromFeedback: [
      'Onboarding is now a quick chat with Clawde, right in the app. No more copying prompts back and forth.',
      'Fewer setup steps. Your name and stats come last, and we now ask your date of birth (optional, editable in Settings).',
      'Warm-ups expand into the full list of moves, just like the main workout.',
      'Every exercise has a ? button with a how-to guide and photos, plus a YouTube search as backup.',
      "Tick a set without entering reps and we'll check it wasn't an accident.",
      'Logged a set wrong? Tap its tick again to reopen it and fix the reps or weight.',
      'Generate & Open Claude opens the Claude app with your prompt already filled in.',
    ],
    alsoNew: [
      'When you come back from Claude, the import sheet is open and ready to paste.',
      'Set how many days a week you want to train in Program setup.',
      "The app now fits your screen properly: a floating tab bar that lines up with your iPhone's corners, a sidebar on iPad, sheets that stay above the keyboard, and support for larger text sizes.",
    ],
  },
]

/** Compares dotted numeric versions: negative if a < b, 0 if equal, positive if a > b. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => Number.parseInt(n, 10) || 0)
  const pb = b.split('.').map((n) => Number.parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

/** Releases newer than `lastSeen` (all of them when `lastSeen` is null), newest first. */
export function releasesSince(lastSeen: string | null): Release[] {
  return lastSeen ? RELEASES.filter((r) => compareVersions(r.version, lastSeen) > 0) : RELEASES
}
