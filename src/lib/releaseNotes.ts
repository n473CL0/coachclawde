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
  /** Semver, matching package.json, e.g. "1.0.1". */
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
    version: '1.0.1',
    date: '2026-09-30',
    headline: 'Faster setup and a better workout screen, shaped by your feedback.',
    fromFeedback: [
      'Onboarding is now a quick chat with Clawde, right in the app. No more copying prompts back and forth.',
      'Fewer setup steps. Your name and stats come last, and we now ask your age.',
      'Warm-ups expand into the full list of moves, just like the main workout.',
      'Every exercise has a ? button with a how-to guide and photos, plus a YouTube search as backup.',
      "Tick a set without entering reps and we'll check it wasn't an accident.",
      'Logged a set wrong? Tap its tick again to reopen it and fix the reps or weight.',
      'Generate & Open Claude opens the Claude app with your prompt already filled in.',
    ],
    alsoNew: [
      'When you come back from Claude, the import sheet is open and ready to paste.',
      'Set how many days a week you want to train in Program setup.',
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
