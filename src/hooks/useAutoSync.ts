import { useCallback } from 'react'
import { useAppStore } from '../store/useAppStore'
import { useSettingsStore } from '../store/useSettingsStore'
import { useAuth } from '../auth/AuthProvider'
import { pushAll, pushWeekPlans, pushLoggedSessions, pushLoggedSession, pushProfile, pullAll } from '../lib/supabaseSync'
import * as gh from '../lib/githubSync'
import type { UserProfile, WeekPlan, LoggedSession } from '../types'

export type SyncTarget = 'sessions' | 'plans' | 'profile' | 'all'

// --- admin-mode write coalescing --------------------------------------------
// GitHub keeps every logged session in a single file and each write is a commit,
// so the in-workout autosave (which fires on every completed set) would produce
// a commit per set. Coalesce those into one trailing write, and flush when the
// page is hidden so closing the tab mid-workout doesn't strand the last few
// sets — they stay in localStorage either way, but this gets them upstream.
const AUTOSAVE_DEBOUNCE_MS = 10_000
let pendingPush: (() => Promise<void>) | null = null
let pendingTimer: ReturnType<typeof setTimeout> | null = null

function schedulePush(run: () => Promise<void>) {
  pendingPush = run
  if (pendingTimer) clearTimeout(pendingTimer)
  pendingTimer = setTimeout(() => void flushPendingPush(), AUTOSAVE_DEBOUNCE_MS)
}

function cancelPendingPush() {
  if (pendingTimer) clearTimeout(pendingTimer)
  pendingTimer = null
  pendingPush = null
}

async function flushPendingPush() {
  const run = pendingPush
  cancelPendingPush()
  if (run) await run()
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flushPendingPush()
  })
}

/**
 * Pushes/pulls the signed-in identity's data to/from its backing store —
 * Supabase for a normal account, the repo's `data/*.json` via the GitHub
 * Contents API in admin mode (see `ADMIN_EMAIL`). The local Zustand store
 * (persisted to localStorage) stays the working cache for offline use; this
 * layer keeps the backend in sync. No-ops when signed out (e.g. local
 * single-user mode), so callers don't need to guard.
 *
 * State is read via `getState()` at call time rather than closed over, so a
 * `sync('plans')` fired right after `addWeekPlan` sees the fresh data.
 */
export function useAutoSync() {
  const { user, adminMode } = useAuth()
  const restoreFromRemote = useAppStore((s) => s.restoreFromRemote)
  const { github, setSyncStatus, markSynced } = useSettingsStore()

  const fail = useCallback(
    (e: unknown, fallback: string) =>
      setSyncStatus('error', e instanceof Error ? e.message : fallback),
    [setSyncStatus]
  )

  /**
   * Merges a freshly-pulled snapshot into the store, preserving any
   * locally-logged session the backend doesn't have yet. The active workout is
   * pushed as sets/intervals complete, but anything logged since the last push
   * (or while offline) lives only in localStorage — without this merge a
   * reload, which pulls and overwrites, could wipe an in-progress workout.
   * Remote wins for any session it does have; local-only sessions are kept.
   */
  const applyRemote = useCallback(
    (remote: { profile: UserProfile | null; weekPlans: WeekPlan[]; loggedSessions: LoggedSession[] }) => {
      const local = useAppStore.getState().loggedSessions
      const remoteIds = new Set(remote.loggedSessions.map((s) => s.id))
      const localOnly = local.filter((s) => !remoteIds.has(s.id))
      restoreFromRemote({
        // Keep the local profile if the backend has none yet (first sign-in).
        profile: remote.profile ?? useAppStore.getState().profile,
        weekPlans: remote.weekPlans,
        loggedSessions: [...remote.loggedSessions, ...localOnly],
      })
    },
    [restoreFromRemote]
  )

  const sync = useCallback(
    async (target: SyncTarget = 'sessions') => {
      const { loggedSessions, weekPlans, profile } = useAppStore.getState()
      // An explicit push supersedes anything the autosave has queued.
      cancelPendingPush()
      if (adminMode) {
        if (!github) return
        setSyncStatus('syncing')
        try {
          if (target === 'sessions') await gh.pushLoggedSessions(github, loggedSessions)
          else if (target === 'plans') await gh.pushWeekPlans(github, weekPlans)
          else if (target === 'profile') await gh.pushProfile(github, profile)
          else await gh.pushAll(github, { profile, weekPlans, loggedSessions })
          markSynced()
        } catch (e: unknown) {
          fail(e, 'Sync failed')
        }
        return
      }
      if (!user) return
      setSyncStatus('syncing')
      try {
        if (target === 'sessions') await pushLoggedSessions(user.id, loggedSessions)
        else if (target === 'plans') await pushWeekPlans(user.id, weekPlans)
        else if (target === 'profile') await pushProfile(user.id, profile)
        else await pushAll(user.id, { profile, weekPlans, loggedSessions })
        markSynced()
      } catch (e: unknown) {
        fail(e, 'Sync failed')
      }
    },
    [adminMode, github, user, setSyncStatus, markSynced, fail]
  )

  /**
   * Pushes a single logged session. Used for the in-workout autosave on each
   * completed set/interval. Supabase takes one row; GitHub has no per-row
   * write, so admin mode rewrites the whole sessions file on a debounce.
   * No-ops when signed out.
   */
  const syncSession = useCallback(
    async (sessionId: string) => {
      if (adminMode) {
        if (!github) return
        schedulePush(async () => {
          const config = useSettingsStore.getState().github
          if (!config) return
          setSyncStatus('syncing')
          try {
            await gh.pushLoggedSessions(config, useAppStore.getState().loggedSessions)
            markSynced()
          } catch (e: unknown) {
            fail(e, 'Sync failed')
          }
        })
        return
      }
      if (!user) return
      const session = useAppStore.getState().loggedSessions.find((s) => s.id === sessionId)
      if (!session) return
      setSyncStatus('syncing')
      try {
        await pushLoggedSession(user.id, session)
        markSynced()
      } catch (e: unknown) {
        fail(e, 'Sync failed')
      }
    },
    [adminMode, github, user, setSyncStatus, markSynced, fail]
  )

  const pull = useCallback(async () => {
    if (adminMode) {
      if (!github) return
      setSyncStatus('syncing')
      try {
        applyRemote(await gh.pullAll(github))
        markSynced()
      } catch (e: unknown) {
        fail(e, 'Restore failed')
      }
      return
    }
    if (!user) return
    setSyncStatus('syncing')
    try {
      applyRemote(await pullAll(user.id))
      markSynced()
    } catch (e: unknown) {
      fail(e, 'Restore failed')
    }
  }, [adminMode, github, user, applyRemote, setSyncStatus, markSynced, fail])

  return { sync, syncSession, pull, isConfigured: adminMode ? !!github : !!user }
}
