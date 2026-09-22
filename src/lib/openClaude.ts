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
 */

export const CLAUDE_APP_URL = 'claude://claude.ai/new'
export const CLAUDE_WEB_URL = 'https://claude.ai/new'

/** Resolves true if the app appears to have opened, false if nothing happened. */
export function openClaudeApp(timeoutMs = 1500): Promise<boolean> {
  return new Promise((resolve) => {
    let left = false
    const markLeft = () => { left = true }
    const onVisibility = () => { if (document.visibilityState === 'hidden') markLeft() }
    window.addEventListener('blur', markLeft)
    window.addEventListener('pagehide', markLeft)
    document.addEventListener('visibilitychange', onVisibility)

    window.location.href = CLAUDE_APP_URL

    setTimeout(() => {
      window.removeEventListener('blur', markLeft)
      window.removeEventListener('pagehide', markLeft)
      document.removeEventListener('visibilitychange', onVisibility)
      resolve(left)
    }, timeoutMs)
  })
}

export function openClaudeWeb() {
  window.open(CLAUDE_WEB_URL, '_blank', 'noopener,noreferrer')
}
