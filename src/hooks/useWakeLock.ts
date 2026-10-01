import { useEffect } from 'react'

/**
 * Keeps the screen on while `active` (Screen Wake Lock). iOS releases the lock
 * whenever the app is backgrounded, so it's re-requested each time the page
 * becomes visible again. Silently does nothing where unsupported (iPhone
 * Home Screen apps before iOS 18.4).
 */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || typeof navigator === 'undefined' || !('wakeLock' in navigator)) return
    let lock: WakeLockSentinel | null = null
    let cancelled = false

    const request = async () => {
      if (document.visibilityState !== 'visible' || (lock && !lock.released)) return
      try {
        const l = await navigator.wakeLock.request('screen')
        if (cancelled) void l.release()
        else lock = l
      } catch {
        // Denied (e.g. low battery mode): the screen just sleeps as usual.
      }
    }

    void request()
    document.addEventListener('visibilitychange', request)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', request)
      if (lock && !lock.released) void lock.release()
    }
  }, [active])
}
