import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AppState, UserProfile, WeekPlan, LoggedSession, TimerState } from '../types'
import { DEFAULT_PROFILE } from '../lib/profileData'
import { getMonday, toLocalISODate } from '../lib/weekUtils'

interface AppStore extends AppState {
  setProfile: (profile: Partial<UserProfile>) => void
  addWeekPlan: (plan: WeekPlan) => void
  updateWeekPlan: (id: string, updates: Partial<WeekPlan>) => void
  addLoggedSession: (session: LoggedSession) => void
  updateLoggedSession: (id: string, updates: Partial<LoggedSession>) => void
  setActiveSession: (id: string | null) => void
  setTimer: (timer: TimerState) => void
  clearTimer: () => void
  getCurrentWeekPlan: () => WeekPlan | undefined
  getLastNSessions: (n: number) => LoggedSession[]
  restoreFromRemote: (data: { profile: UserProfile; weekPlans: WeekPlan[]; loggedSessions: LoggedSession[] }) => void
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
      activeSessionId: null,
      timer: DEFAULT_TIMER,

      setProfile: (updates) =>
        set((s) => ({ profile: { ...s.profile, ...updates, updatedAt: new Date().toISOString() } })),

      addWeekPlan: (plan) =>
        set((s) => ({ weekPlans: [...s.weekPlans, plan] })),

      updateWeekPlan: (id, updates) =>
        set((s) => ({
          weekPlans: s.weekPlans.map((p) => (p.id === id ? { ...p, ...updates } : p)),
        })),

      addLoggedSession: (session) =>
        set((s) => ({ loggedSessions: [...s.loggedSessions, session] })),

      updateLoggedSession: (id, updates) =>
        set((s) => ({
          loggedSessions: s.loggedSessions.map((s) =>
            s.id === id ? { ...s, ...updates } : s
          ),
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

      restoreFromRemote: (data) => set({
        profile: data.profile,
        weekPlans: data.weekPlans,
        loggedSessions: data.loggedSessions,
      }),

      reset: () => set({
        profile: DEFAULT_PROFILE,
        weekPlans: [],
        loggedSessions: [],
        activeSessionId: null,
        timer: DEFAULT_TIMER,
      }),
    }),
    {
      name: 'coach-claude-store',
      partialize: (state) => ({
        profile: state.profile,
        weekPlans: state.weekPlans,
        loggedSessions: state.loggedSessions,
      }),
    }
  )
)

