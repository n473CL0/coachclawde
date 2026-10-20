/**
 * Opening Claude from the app.
 *
 * Linking to https://claude.ai opens a browser tab, which usually isn't signed
 * in — the athlete then has to log in before they can paste. Instead we try the
 * `claude://` deep link first, which hands off to the installed Claude app
 * (desktop or mobile) where they're already signed in. If nothing takes the
 * page away within a short window we assume the app isn't installed and report
 * that back so the caller can offer the browser as a fallback. We don't
 * auto-open the browser ourselves: a popup fired from a timer (outside the tap)
 * gets blocked on iOS, and on desktop the browser's "Open Claude?" dialog keeps
 * the page visible, so an auto-fallback would open a second, unwanted tab.
 *
 * Both links pre-fill the new chat with the prompt via `?q=`. Callers still
 * copy it to the clipboard first: very long prompts are left out of the link
 * (servers reject over-long URLs), and the pre-fill may not be honoured
 * everywhere, so pasting is the fallback.
 */

export const CLAUDE_APP_URL = 'claude://claude.ai/new'
export const CLAUDE_WEB_URL = 'https://claude.ai/new'

/**
 * Longest link we'll build. claude.ai accepted ~39 KB links when tested; a
 * plan prompt with a full training history encodes to ~15 KB, so this leaves
 * headroom while staying well clear of server limits.
 */
const MAX_PREFILL_URL_LENGTH = 30_000

/** `base?q=<prompt>`, or just `base` when there's no prompt or it's too long for a URL. */
export function withPrompt(base: string, prompt?: string): string {
  if (!prompt) return base
  // %20, not URLSearchParams' `+`: the iOS app doesn't decode `+` as a space
  const url = `${base}?q=${encodeURIComponent(prompt)}`
  return url.length <= MAX_PREFILL_URL_LENGTH ? url : base
}

/** Resolves true if the app appears to have opened, false if nothing happened. */
export function openClaudeApp(prompt?: string, timeoutMs = 1500): Promise<boolean> {
  return new Promise((resolve) => {
    let left = false
    const markLeft = () => { left = true }
    const onVisibility = () => { if (document.visibilityState === 'hidden') markLeft() }
    window.addEventListener('blur', markLeft)
    window.addEventListener('pagehide', markLeft)
    document.addEventListener('visibilitychange', onVisibility)

    window.location.href = withPrompt(CLAUDE_APP_URL, prompt)

    setTimeout(() => {
      window.removeEventListener('blur', markLeft)
      window.removeEventListener('pagehide', markLeft)
      document.removeEventListener('visibilitychange', onVisibility)
      resolve(left)
    }, timeoutMs)
  })
}

export function openClaudeWeb(prompt?: string) {
  window.open(withPrompt(CLAUDE_WEB_URL, prompt), '_blank', 'noopener,noreferrer')
}
