import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import { validateConfig } from '../lib/githubSync'
import type { GitHubConfig } from '../lib/githubSync'
import { useSettingsStore } from '../store/useSettingsStore'
import { ADMIN_FLAG_KEY } from './adminMode'

interface AuthContextValue {
  user: User | null
  session: Session | null
  /** True until the initial session check resolves. */
  loading: boolean
  /** False when Supabase env vars are absent — app runs in local single-user mode. */
  configured: boolean
  /** True when signed in via `ADMIN_EMAIL` — storage is GitHub, not Supabase. */
  adminMode: boolean
  signInWithGoogle: () => Promise<void>
  signInWithEmail: (email: string) => Promise<void>
  /** Validates the token, persists the config, and enters GitHub storage mode. */
  signInAsAdmin: (config: GitHubConfig) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const github = useSettingsStore((s) => s.github)
  const setGitHub = useSettingsStore((s) => s.setGitHub)
  // Admin mode survives a reload, but only while a GitHub config is still
  // persisted alongside it — the flag alone can't reach any storage.
  const [adminFlag, setAdminFlag] = useState(
    () => localStorage.getItem(ADMIN_FLAG_KEY) === '1'
  )
  const adminMode = adminFlag && !!github
  // Only "loading" when there's a backend session to resolve; in local mode
  // (no Supabase) there's nothing to wait for.
  const [loading, setLoading] = useState(isSupabaseConfigured)

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const signInWithGoogle = useCallback(async () => {
    if (!supabase) return
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    if (error) throw error
  }, [])

  const signInWithEmail = useCallback(async (email: string) => {
    if (!supabase) return
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    })
    if (error) throw error
  }, [])

  const signInAsAdmin = useCallback(
    async (config: GitHubConfig) => {
      // Fail before we persist anything, so a bad token can't leave the app
      // stuck in an admin mode that can't actually reach storage.
      await validateConfig(config)
      setGitHub(config)
      localStorage.setItem(ADMIN_FLAG_KEY, '1')
      setAdminFlag(true)
    },
    [setGitHub]
  )

  const signOut = useCallback(async () => {
    // Clear admin mode and its token regardless of which mode we're in, so
    // signing out never leaves a repo credential behind on the device.
    localStorage.removeItem(ADMIN_FLAG_KEY)
    setAdminFlag(false)
    setGitHub(null)
    if (!supabase) return
    await supabase.auth.signOut()
  }, [setGitHub])

  return (
    <AuthContext.Provider
      value={{
        user: session?.user ?? null,
        session,
        loading,
        configured: isSupabaseConfigured,
        adminMode,
        signInWithGoogle,
        signInWithEmail,
        signInAsAdmin,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
