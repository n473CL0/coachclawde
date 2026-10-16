import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { SyncStatus } from '../lib/supabaseSync'
import { STORAGE_KEYS } from '../lib/storageKeys'

interface SettingsStore {
  lastSyncAt: string | null
  syncStatus: SyncStatus
  syncError: string | null

  setSyncStatus: (status: SyncStatus, error?: string) => void
  markSynced: () => void
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      lastSyncAt: null,
      syncStatus: 'idle',
      syncError: null,

      setSyncStatus: (status, error) =>
        set({ syncStatus: status, syncError: error ?? null }),

      markSynced: () =>
        set({ lastSyncAt: new Date().toISOString(), syncStatus: 'success', syncError: null }),
    }),
    {
      name: STORAGE_KEYS.settings,
      partialize: (s) => ({ lastSyncAt: s.lastSyncAt }),
    }
  )
)
