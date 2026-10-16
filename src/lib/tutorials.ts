import { STORAGE_KEYS } from './storageKeys'

// One-off coaching tours, remembered per device (outside the Zustand store,
// like the seen release notes, so signing out and back in doesn't replay them).
const RUN_TOUR_KEY = STORAGE_KEYS.runTourSeen

/** Whether the Run Mode tour (LAP + Lock) has been shown on this device. */
export function runTourSeen(): boolean {
  try {
    return localStorage.getItem(RUN_TOUR_KEY) === '1'
  } catch {
    // Storage blocked: don't nag on every run.
    return true
  }
}

export function markRunTourSeen(): void {
  try {
    localStorage.setItem(RUN_TOUR_KEY, '1')
  } catch {
    // Storage blocked (private mode etc.) — worst case the tour shows again.
  }
}
