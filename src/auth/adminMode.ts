/**
 * Magic value for the login email field. Entering it swaps the app onto
 * GitHub-backed storage (the pre-v0.2.0 `data/*.json` mechanism) instead of
 * Supabase — see `lib/githubSync`.
 *
 * This string is not a secret and is not a credential: it only reveals the
 * token form. Without a personal access token that can reach the repo, typing
 * it grants no access to anything.
 */
export const ADMIN_EMAIL = 'admin'

/** localStorage key holding whether this device is in admin mode. */
export const ADMIN_FLAG_KEY = 'coach-claude-admin'

export function isAdminEmail(input: string): boolean {
  return input.trim().toLowerCase() === ADMIN_EMAIL.toLowerCase()
}
