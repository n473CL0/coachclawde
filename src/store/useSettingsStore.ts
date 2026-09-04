import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { SyncStatus } from '../lib/supabaseSync'
import type { GitHubConfig } from '../lib/githubSync'

interface SettingsStore {
  /**
   * GitHub storage credentials for admin mode. Null for normal (Supabase)
   * accounts. Persisted so the operator only pastes their token once per
   * device — the same key/shape the pre-v0.2.0 build used, so a device that
   * still has one carries straight over.
   */
  github: GitHubConfig | null
  lastSyncAt: string | null
  syncStatus: SyncStatus
  syncError: string | null

  setGitHub: (config: GitHubConfig | null) => void
  setSyncStatus: (status: SyncStatus, error?: string) => void
  markSynced: () => void
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      github: null,
      lastSyncAt: null,
      syncStatus: 'idle',
      syncError: null,

      setGitHub: (github) => set({ github }),

      setSyncStatus: (status, error) =>
        set({ syncStatus: status, syncError: error ?? null }),

      markSynced: () =>
        set({ lastSyncAt: new Date().toISOString(), syncStatus: 'success', syncError: null }),
    }),
    {
      name: 'coach-claude-settings',
      partialize: (s) => ({ github: s.github, lastSyncAt: s.lastSyncAt }),
    }
  )
)
