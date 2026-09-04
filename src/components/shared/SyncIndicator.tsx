import { useSettingsStore } from '../../store/useSettingsStore'
import { useAuth } from '../../auth/AuthProvider'
import { Cloud, CloudOff, Loader, CheckCircle, AlertCircle } from 'lucide-react'
import { formatDistanceToNow, parseISO } from 'date-fns'

export function SyncIndicator() {
  const { user, configured } = useAuth()
  const { syncStatus, syncError, lastSyncAt } = useSettingsStore()

  // Signed out (or running in local-only mode) — nothing is syncing.
  if (!configured || !user) {
    return (
      <div className="flex items-center gap-1.5 text-[#3a3a3a]">
        <CloudOff size={13} />
        <span className="text-[10px]">{configured ? 'Signed out' : 'Local only'}</span>
      </div>
    )
  }

  if (syncStatus === 'syncing') {
    return (
      <div className="flex items-center gap-1.5 text-[#6a6a6a]">
        <Loader size={13} className="animate-spin" />
        <span className="text-[10px]">Syncing…</span>
      </div>
    )
  }

  if (syncStatus === 'error') {
    return (
      <div className="flex items-center gap-1.5 text-red-400" title={syncError ?? ''}>
        <AlertCircle size={13} />
        <span className="text-[10px]">Sync failed</span>
      </div>
    )
  }

  if (syncStatus === 'success' && lastSyncAt) {
    return (
      <div className="flex items-center gap-1.5 text-emerald-500">
        <CheckCircle size={13} />
        <span className="text-[10px]">{formatDistanceToNow(parseISO(lastSyncAt), { addSuffix: true })}</span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1.5 text-[#4a4a4a]">
      <Cloud size={13} />
      <span className="text-[10px]">Auto-sync on</span>
    </div>
  )
}
