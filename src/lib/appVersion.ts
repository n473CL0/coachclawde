import { RELEASES, compareVersions, releasesSince, type Release } from './releaseNotes'
import { STORAGE_KEYS } from './storageKeys'

/** The running app's version, injected from package.json at build time. */
export const APP_VERSION: string = __APP_VERSION__

// Per device, outside the Zustand store: the store is reset on sign-out, and we
// don't want signing back in to replay notes the tester has already read.
const SEEN_KEY = STORAGE_KEYS.seenVersion

function readSeen(): string | null {
  try {
    return localStorage.getItem(SEEN_KEY)
  } catch {
    return null
  }
}

/** Record that release notes up to the current version have been shown. */
export function markVersionSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, APP_VERSION)
  } catch {
    // Storage blocked (private mode etc.) — worst case the notes show again.
  }
}

/**
 * Release notes this device hasn't seen yet. A device with no record has been
 * running a build from before release notes existed (new athletes are marked
 * as seen when they finish onboarding), so it gets the current notes.
 */
export function unseenReleases(): Release[] {
  const seen = readSeen()
  if (seen === null) return RELEASES.filter((r) => r.version === APP_VERSION)
  return releasesSince(seen).filter((r) => compareVersions(r.version, APP_VERSION) <= 0)
}
