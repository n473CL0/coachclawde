/**
 * The beta testers' WhatsApp group, for feedback and ideas. Set at build time
 * (VITE_BETA_FEEDBACK_URL) so the invite link stays out of the public repo;
 * when it's unset the Home tile is hidden.
 */
export const BETA_FEEDBACK_URL: string = import.meta.env.VITE_BETA_FEEDBACK_URL
