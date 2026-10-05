/**
 * Screens where leaving, or reloading, mid-task loses work in progress:
 * Run Mode's timing and an open workout (`/session/…`), and a half-answered
 * chat (onboarding, a check-in). On a phone, switching to another app can
 * also stop Run Mode's audio cues.
 */
export const MID_TASK_PATHS = ['/session/', '/onboarding', '/check-in']

export function isMidTaskPath(pathname: string): boolean {
  return MID_TASK_PATHS.some((p) => pathname.startsWith(p))
}
