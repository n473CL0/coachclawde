import { registerSW } from 'virtual:pwa-register'

/**
 * Keeps the installed app up to date.
 *
 * A Home Screen app on iPhone is usually *resumed*, not relaunched, so the
 * browser rarely re-checks the service worker on its own, and even when a new
 * one activates, the page on screen keeps running the old code. So we:
 *
 *   1. check for a new version whenever the app comes back to the
 *      foreground, every 30 minutes while open, and when back online;
 *   2. once a new version has activated (the worker skips waiting, see
 *      `registerType: 'autoUpdate'`), reload the page at a *safe* moment.
 *
 * "Safe" means the athlete isn't mid-workout, mid-chat (onboarding or a
 * check-in) or typing: a reload there would lose Run Mode's timing or a
 * half-answered chat. Otherwise the reload waits for the next navigation or
 * for the app going into the background. The "What's new" sheet then tells
 * them what changed.
 */

const CHECK_EVERY_MS = 30 * 60 * 1000
/** Don't re-check more than once a minute (resume can fire repeatedly). */
const MIN_GAP_MS = 60 * 1000

let pending = false
let lastCheck = 0

/** Screens where a reload would lose work in progress. */
const UNSAFE_PATHS = ['/session/', '/onboarding', '/check-in']

function isSafeToReload(): boolean {
  // Never mid-workout or mid-chat, even in the background: Run Mode keeps
  // time while the athlete glances at another app.
  if (UNSAFE_PATHS.some((p) => location.pathname.startsWith(p))) return false
  if (document.visibilityState === 'hidden') return true
  const el = document.activeElement
  if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return false
  return true
}

/** Reloads into the new version if one is waiting and now is a safe moment. */
export function applyPendingUpdate(): void {
  if (pending && isSafeToReload()) {
    pending = false
    window.location.reload()
  }
}

export function startUpdateChecks(): void {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return

  registerSW({
    immediate: true,
    onNeedReload() {
      pending = true
      applyPendingUpdate()
    },
    onRegisteredSW(swUrl, registration) {
      if (!registration) return
      const check = async () => {
        const now = Date.now()
        if (now - lastCheck < MIN_GAP_MS || !navigator.onLine || registration.installing) return
        lastCheck = now
        try {
          // Bypass any HTTP cache so a fresh deploy is always seen.
          const res = await fetch(swUrl, { cache: 'no-store', headers: { 'cache-control': 'no-cache' } })
          if (res.status === 200) await registration.update()
        } catch {
          // Offline or the server hiccuped: try again on the next trigger.
        }
      }
      setInterval(check, CHECK_EVERY_MS)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void check()
        // Going into the background is the perfect moment to swap versions.
        else applyPendingUpdate()
      })
      window.addEventListener('online', () => void check())
    },
  })
}
