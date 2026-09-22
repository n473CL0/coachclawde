import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from './AuthProvider'
import { useAutoSync } from '../hooks/useAutoSync'
import { useAppStore } from '../store/useAppStore'
import { ClaudeMark } from '../components/shared/ClaudeMark'

/**
 * Gates the app behind authentication and keeps the local store scoped to the
 * signed-in user:
 *   • On sign-in (the user changes) it pulls that user's data from Supabase.
 *   • On sign-out it resets the store so one account's data can't leak into the
 *     next on a shared device.
 *
 * When Supabase isn't configured (no env vars) it transparently passes through,
 * preserving the offline single-user experience for local dev.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading, configured } = useAuth()
  const { pull } = useAutoSync()
  const reset = useAppStore((s) => s.reset)
  const identity = user?.id ?? null
  const lastIdentity = useRef<string | null>(null)
  // Block render until the signed-in identity's data has been pulled, so the
  // onboarding gate (which keys off the profile) never flashes for a returning
  // user before their real profile has loaded.
  const [pulled, setPulled] = useState(false)

  useEffect(() => {
    if (!configured) return
    if (identity) {
      if (lastIdentity.current !== identity) {
        lastIdentity.current = identity
        setPulled(false)
        void pull().finally(() => setPulled(true))
      }
    } else if (lastIdentity.current !== null) {
      // Signed out after being signed in — clear local data.
      lastIdentity.current = null
      setPulled(false)
      reset()
    }
  }, [configured, identity, pull, reset])

  if (!configured) return <>{children}</>

  if (loading || (identity && !pulled)) {
    return (
      <div className="flex items-center justify-center min-h-svh bg-[#0a0a0a]">
        <ClaudeMark size={56} idle />
      </div>
    )
  }

  if (!identity) return <Navigate to="/login" replace />

  return <>{children}</>
}
