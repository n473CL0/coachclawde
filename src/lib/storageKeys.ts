/**
 * Every localStorage key the app uses, per device.
 *
 * They were `coach-claude-*` before the app was renamed Coach Clawde. Importing
 * this module carries each old value over to its new key, once, so installed
 * apps keep their offline cache, last sync time, seen release notes and tours.
 * Consumers import their key from here, so the carry-over always runs before a
 * store hydrates from it.
 */
export const STORAGE_KEYS = {
  store: 'coach-clawde-store',
  settings: 'coach-clawde-settings',
  seenVersion: 'coach-clawde-seen-version',
  runTourSeen: 'coach-clawde-run-tour-seen',
} as const

const RENAMED: [from: string, to: string][] = [
  ['coach-claude-store', STORAGE_KEYS.store],
  ['coach-claude-settings', STORAGE_KEYS.settings],
  ['coach-claude-seen-version', STORAGE_KEYS.seenVersion],
  ['coach-claude-run-tour-seen', STORAGE_KEYS.runTourSeen],
]

for (const [from, to] of RENAMED) {
  try {
    const value = localStorage.getItem(from)
    if (value !== null) {
      if (localStorage.getItem(to) === null) localStorage.setItem(to, value)
      localStorage.removeItem(from)
    }
  } catch {
    // Storage blocked (private mode etc.) or absent (tests): nothing to carry over.
  }
}
