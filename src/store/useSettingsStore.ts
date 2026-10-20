import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { SyncStatus } from '../lib/supabaseSync'
import { STORAGE_KEYS } from '../lib/storageKeys'
import { METRIC, type Units } from '../lib/units'

interface SettingsStore {
  lastSyncAt: string | null
  syncStatus: SyncStatus
  syncError: string | null
  /** Display units, per device. Data is always stored in metric. */
  units: Units

  setSyncStatus: (status: SyncStatus, error?: string) => void
  markSynced: () => void
  setUnits: (patch: Partial<Units>) => void
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      lastSyncAt: null,
      syncStatus: 'idle',
      syncError: null,
      units: METRIC,

      setSyncStatus: (status, error) =>
        set({ syncStatus: status, syncError: error ?? null }),

      markSynced: () =>
        set({ lastSyncAt: new Date().toISOString(), syncStatus: 'success', syncError: null }),

      setUnits: (patch) => set((s) => ({ units: { ...s.units, ...patch } })),
    }),
    {
      name: STORAGE_KEYS.settings,
      partialize: (s) => ({ lastSyncAt: s.lastSyncAt, units: s.units }),
    }
  )
)

/** The athlete's display units. */
export const useUnits = () => useSettingsStore((s) => s.units)
