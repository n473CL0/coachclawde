import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AppState, CheckIn, UserProfile, WeekPlan, LoggedSession, TimerState } from '../types'
import { DEFAULT_PROFILE } from '../lib/profileData'
import { getMonday, toLocalISODate } from '../lib/weekUtils'
import { normalizePlan } from '../lib/workout'
import { scopePlansAndLogs, scopeSessionIds } from '../lib/planIds'

/**
 * Every plan the store holds is read through this: legacy intervals get a
 * structured workout, and session ids are scoped to their week (lib/planIds).
 */
const readPlan = (p: WeekPlan) => scopeSessionIds(normalizePlan(p))

/** Plans and logs from storage or the database, with logs re-linked to scoped ids. */
function readAll(plans: WeekPlan[], logs: LoggedSession[]) {
  return scopePlansAndLogs(plans.map(normalizePlan), logs)
}

interface AppStore extends AppState {
  setProfile: (profile: Partial<UserProfile>) => void
  addWeekPlan: (plan: WeekPlan) => void
  updateWeekPlan: (id: string, updates: Partial<WeekPlan>) => void
  addLoggedSession: (session: LoggedSession) => void
  updateLoggedSession: (id: string, updates: Partial<LoggedSession>) => void
  removeLoggedSession: (id: string) => void
  /** Adds a check-in, or replaces one with the same id. */
  saveCheckIn: (checkIn: CheckIn) => void
  /**
   * Check-in invitations the athlete dismissed on this device, as keys like
   * "week:2026-09-28" or "milestone:block-end". Local only: at most one
   * nudge per trigger, never a nag.
   */
  checkInDismissed: string[]
  dismissCheckIn: (key: string) => void
  setActiveSession: (id: string | null) => void
  setTimer: (timer: TimerState) => void
  clearTimer: () => void
  getCurrentWeekPlan: () => WeekPlan | undefined
  getLastNSessions: (n: number) => LoggedSession[]
  restoreFromRemote: (data: { profile: UserProfile; weekPlans: WeekPlan[]; loggedSessions: LoggedSession[]; checkIns?: CheckIn[] }) => void
  /** Wipe in-memory + persisted data (used on sign-out so accounts don't leak on a shared device). */
  reset: () => void
}

const DEFAULT_TIMER: TimerState = {
  isActive: false,
  endTime: null,
  durationSeconds: 0,
  label: '',
}

export const useAppStore = create<AppStore>()(
  persist(
    (set, get) => ({
      profile: DEFAULT_PROFILE,
      weekPlans: [],
      loggedSessions: [],
      checkIns: [],
      checkInDismissed: [],
      activeSessionId: null,
      timer: DEFAULT_TIMER,

      saveCheckIn: (checkIn) =>
        set((s) => ({ checkIns: [...s.checkIns.filter((c) => c.id !== checkIn.id), checkIn] })),

      dismissCheckIn: (key) =>
        set((s) => (s.checkInDismissed.includes(key) ? s : { checkInDismissed: [...s.checkInDismissed, key] })),

      setProfile: (updates) =>
        set((s) => ({ profile: { ...s.profile, ...updates, updatedAt: new Date().toISOString() } })),

      addWeekPlan: (plan) =>
        set((s) => ({ weekPlans: [...s.weekPlans, readPlan(plan)] })),

      updateWeekPlan: (id, updates) =>
        set((s) => ({
          weekPlans: s.weekPlans.map((p) => (p.id === id ? readPlan({ ...p, ...updates }) : p)),
        })),

      addLoggedSession: (session) =>
        set((s) => ({ loggedSessions: [...s.loggedSessions, session] })),

      updateLoggedSession: (id, updates) =>
        set((s) => ({
          loggedSessions: s.loggedSessions.map((s) =>
            s.id === id ? { ...s, ...updates } : s
          ),
        })),

      removeLoggedSession: (id) =>
        set((s) => ({
          loggedSessions: s.loggedSessions.filter((l) => l.id !== id),
          activeSessionId: s.activeSessionId === id ? null : s.activeSessionId,
        })),

      setActiveSession: (id) => set({ activeSessionId: id }),

      setTimer: (timer) => set({ timer }),

      clearTimer: () => set({ timer: DEFAULT_TIMER }),

      getCurrentWeekPlan: () => {
        const { weekPlans } = get()
        const mondayStr = toLocalISODate(getMonday(new Date()))
        // Plan for the week we're currently in.
        const current = weekPlans.find((p) => p.weekStartDate === mondayStr)
        if (current) return current
        // No plan for this week yet — surface the soonest upcoming plan so a
        // plan imported ahead of time (the planner targets *next* Monday) is
        // visible immediately instead of staying hidden until that week starts.
        return weekPlans
          .filter((p) => p.weekStartDate > mondayStr)
          .sort((a, b) => a.weekStartDate.localeCompare(b.weekStartDate))[0]
      },

      getLastNSessions: (n) => {
        const { loggedSessions } = get()
        return [...loggedSessions]
          .filter((s) => s.status === 'complete')
          .sort((a, b) => new Date(b.completedAt || b.date).getTime() - new Date(a.completedAt || a.date).getTime())
          .slice(0, n)
      },

      restoreFromRemote: (data) => set(() => {
        // Stored plans may predate structured workouts or week-scoped ids.
        const { plans, logs } = readAll(data.weekPlans, data.loggedSessions)
        return {
        profile: data.profile,
        weekPlans: plans,
        loggedSessions: logs,
        // Older databases may not have the check_ins table yet; keep local ones.
        ...(data.checkIns ? { checkIns: data.checkIns } : {}),
        }
      }),

      reset: () => set({
        profile: DEFAULT_PROFILE,
        weekPlans: [],
        loggedSessions: [],
        checkIns: [],
        checkInDismissed: [],
        activeSessionId: null,
        timer: DEFAULT_TIMER,
      }),
    }),
    {
      name: 'coach-claude-store',
      // Plans cached before structured workouts get one on rehydrate.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<AppState>
        const { plans, logs } = readAll(p.weekPlans ?? current.weekPlans, p.loggedSessions ?? current.loggedSessions)
        return {
          ...current,
          ...p,
          weekPlans: plans,
          loggedSessions: logs,
          checkIns: p.checkIns ?? [],
          checkInDismissed: (p as { checkInDismissed?: string[] }).checkInDismissed ?? [],
        }
      },
      partialize: (state) => ({
        profile: state.profile,
        weekPlans: state.weekPlans,
        loggedSessions: state.loggedSessions,
        checkIns: state.checkIns,
        checkInDismissed: state.checkInDismissed,
      }),
    }
  )
)

