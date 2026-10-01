import { useCallback } from 'react'
import { useAppStore } from '../store/useAppStore'
import { useSettingsStore } from '../store/useSettingsStore'
import { useAuth } from '../auth/AuthProvider'
import { pushAll, pushCheckIns, pushWeekPlans, pushLoggedSessions, pushLoggedSession, pushProfile, pullAll } from '../lib/supabaseSync'
import type { CheckIn, UserProfile, WeekPlan, LoggedSession } from '../types'

export type SyncTarget = 'sessions' | 'plans' | 'profile' | 'checkIns' | 'all'

/**
 * Pushes/pulls the signed-in user's data to/from Supabase. The local Zustand
 * store (persisted to localStorage) stays the working cache for offline use;
 * this layer keeps the database in sync. No-ops when signed out (e.g. local
 * single-user mode), so callers don't need to guard.
 *
 * State is read via `getState()` at call time rather than closed over, so a
 * `sync('plans')` fired right after `addWeekPlan` sees the fresh data.
 */
export function useAutoSync() {
  const { user } = useAuth()
  const restoreFromRemote = useAppStore((s) => s.restoreFromRemote)
  const { setSyncStatus, markSynced } = useSettingsStore()

  const fail = useCallback(
    (e: unknown, fallback: string) =>
      setSyncStatus('error', e instanceof Error ? e.message : fallback),
    [setSyncStatus]
  )

  /**
   * Merges a freshly-pulled snapshot into the store, preserving any
   * locally-logged session the database doesn't have yet. The active workout is
   * pushed as sets/intervals complete, but anything logged since the last push
   * (or while offline) lives only in localStorage — without this merge a
   * reload, which pulls and overwrites, could wipe an in-progress workout.
   * Remote wins for any session it does have; local-only sessions are kept.
   */
  const applyRemote = useCallback(
    (remote: { profile: UserProfile | null; weekPlans: WeekPlan[]; loggedSessions: LoggedSession[]; checkIns?: CheckIn[] }) => {
      const local = useAppStore.getState().loggedSessions
      const remoteIds = new Set(remote.loggedSessions.map((s) => s.id))
      const localOnly = local.filter((s) => !remoteIds.has(s.id))
      restoreFromRemote({
        // Keep the local profile if the database has none yet (first sign-in).
        profile: remote.profile ?? useAppStore.getState().profile,
        weekPlans: remote.weekPlans,
        loggedSessions: [...remote.loggedSessions, ...localOnly],
        // Same merge for check-ins; none at all if the table is missing.
        checkIns: remote.checkIns
          ? [...remote.checkIns, ...useAppStore.getState().checkIns.filter((c) => !remote.checkIns!.some((r) => r.id === c.id))]
          : undefined,
      })
    },
    [restoreFromRemote]
  )

  const sync = useCallback(
    async (target: SyncTarget = 'sessions') => {
      if (!user) return
      const { loggedSessions, weekPlans, profile, checkIns } = useAppStore.getState()
      setSyncStatus('syncing')
      try {
        if (target === 'sessions') await pushLoggedSessions(user.id, loggedSessions)
        else if (target === 'plans') await pushWeekPlans(user.id, weekPlans)
        else if (target === 'profile') await pushProfile(user.id, profile)
        else if (target === 'checkIns') await pushCheckIns(user.id, checkIns)
        else await pushAll(user.id, { profile, weekPlans, loggedSessions, checkIns })
        markSynced()
      } catch (e: unknown) {
        fail(e, 'Sync failed')
      }
    },
    [user, setSyncStatus, markSynced, fail]
  )

  /**
   * Pushes a single logged session — the in-workout autosave on each completed
   * set/interval. One row per session, so this stays a single upsert.
   * No-ops when signed out.
   */
  const syncSession = useCallback(
    async (sessionId: string) => {
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
    [user, setSyncStatus, markSynced, fail]
  )

  const pull = useCallback(async () => {
    if (!user) return
    setSyncStatus('syncing')
    try {
      applyRemote(await pullAll(user.id))
      markSynced()
    } catch (e: unknown) {
      fail(e, 'Restore failed')
    }
  }, [user, applyRemote, setSyncStatus, markSynced, fail])

  return { sync, syncSession, pull, isConfigured: !!user }
}
