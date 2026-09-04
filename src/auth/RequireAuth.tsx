import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from './AuthProvider'
import { useAutoSync } from '../hooks/useAutoSync'
import { useAppStore } from '../store/useAppStore'
import { ClaudeMark } from '../components/shared/ClaudeMark'

/**
 * Gates the app behind authentication and keeps the local store scoped to the
 * signed-in identity:
 *   • On sign-in (identity changes) it pulls that identity's data — from
 *     Supabase for a normal account, from GitHub in admin mode.
 *   • On sign-out it resets the store so one account's data can't leak into the
 *     next on a shared device.
 *
 * When Supabase isn't configured (no env vars) it transparently passes through,
 * preserving the offline single-user experience for local dev — unless admin
 * mode is active, which has its own storage to load regardless.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading, configured, adminMode } = useAuth()
  const { pull } = useAutoSync()
  const reset = useAppStore((s) => s.reset)
  // One key for both modes, so switching between an account and admin mode
  // re-pulls and never renders one identity's data under the other.
  const identity = adminMode ? 'github-admin' : user?.id ?? null
  const lastIdentity = useRef<string | null>(null)
  // Block render until the signed-in identity's data has been pulled, so the
  // onboarding gate (which keys off the profile) never flashes for a returning
  // user before their real profile has loaded.
  const [pulled, setPulled] = useState(false)

  useEffect(() => {
    if (!configured && !adminMode) return
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
  }, [configured, adminMode, identity, pull, reset])

  if (!configured && !adminMode) return <>{children}</>

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
