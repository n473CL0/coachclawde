import { isMidTaskPath } from './midTask'

/** The beta testers' WhatsApp group, for feedback and ideas. */
export const BETA_FEEDBACK_URL = 'https://chat.whatsapp.com/ExampleInvite'

/** The banner's background, also used as the browser bar colour while it shows. */
export const BETA_BANNER_BG = '#1e3a8a'

/**
 * The feedback banner opens WhatsApp, so it hides wherever leaving the app
 * mid-task would lose something (a workout, an onboarding or check-in chat).
 */
export function showsBetaBanner(pathname: string): boolean {
  return !isMidTaskPath(pathname)
}
