import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { Button } from '../components/shared/Button'
import { ClawdeMark } from '../components/shared/ClawdeMark'
import { Mail, AlertCircle, CheckCircle, LogIn } from 'lucide-react'

/**
 * Pulls a human-readable message out of whatever the auth call throws. Supabase
 * AuthErrors stringify to "{}" (message/stack are non-enumerable), so dig out
 * the useful fields explicitly and fall back to the HTTP status.
 */
function authErrorMessage(e: unknown, fallback: string): string {
  if (e && typeof e === 'object') {
    const err = e as { message?: string; error_description?: string; code?: string; status?: number }
    return (
      err.message ||
      err.error_description ||
      err.code ||
      (err.status ? `Request failed (HTTP ${err.status})` : '') ||
      fallback
    )
  }
  return fallback
}

/**
 * Magic-link sign-in is hidden unless VITE_ENABLE_MAGIC_LINK is 'true'. The
 * code below stays wired up either way — flipping the variable brings the
 * option back with no code change. It is off by default because magic links
 * need working SMTP, and Supabase's built-in mailer allows only a couple of
 * messages an hour, so the button would mostly promise an email that never
 * shows up. Beta accounts are provisioned with a password instead (see
 * scripts/create-beta-user.mjs).
 */
const MAGIC_LINK_ENABLED = import.meta.env.VITE_ENABLE_MAGIC_LINK === 'true'

export function Login() {
  const { user, loading, configured, signInWithPassword, signInWithEmail } = useAuth()
  const [mode, setMode] = useState<'password' | 'magic-link'>('password')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  async function handlePassword() {
    setError('')
    setBusy(true)
    try {
      await signInWithPassword(email.trim(), password)
      // On success the auth listener sets the session, `user` becomes non-null
      // and the redirect below fires. This route sits outside RequireAuth, so
      // without that redirect a successful sign-in would just re-render this
      // form and look like nothing happened.
    } catch (e: unknown) {
      console.error('[auth] password sign-in failed:', e)
      setError(authErrorMessage(e, 'Could not sign in'))
    } finally {
      setBusy(false)
    }
  }

  async function handleMagicLink() {
    setError('')
    setBusy(true)
    try {
      await signInWithEmail(email.trim())
      setSent(true)
    } catch (e: unknown) {
      console.error('[auth] magic-link send failed:', e)
      setError(authErrorMessage(e, 'Could not send magic link'))
    } finally {
      setBusy(false)
    }
  }

  function switchMode(next: 'password' | 'magic-link') {
    setMode(next)
    setError('')
    setPassword('')
  }

  // Local mode (no Supabase env vars) has no accounts and no route guard, so
  // there is nothing to sign in to — every button here would quietly no-op.
  if (!configured) return <Navigate to="/" replace />

  // Wait for the initial session check, so a signed-in user reloading /login
  // doesn't see the form flash before being redirected.
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-svh bg-[#0a0a0a]">
        <ClawdeMark size={56} idle />
      </div>
    )
  }

  // Signed in — including the instant a password sign-in succeeds.
  if (user) return <Navigate to="/" replace />

  return (
    <div className="flex flex-col items-center min-h-svh bg-[#0a0a0a] px-6 pt-safe pb-edge">
      {/* my-auto (not justify-center) so a short landscape screen scrolls
          instead of pushing the top of the form under the status bar. */}
      <div className="my-auto w-full max-w-sm flex flex-col items-center gap-8 py-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <ClawdeMark size={72} sweat />
          <h1 className="text-2xl font-bold text-[#f5f5f0]">Coach Clawde</h1>
          <p className="text-sm text-[#6a6a6a] leading-relaxed">
            Sign in to sync your training across devices and generate personalised weekly plans.
          </p>
        </div>

        {sent ? (
          <div className="w-full flex flex-col items-center gap-3 bg-[#161616] border border-[#2a2a2a] rounded-2xl p-6 text-center">
            <CheckCircle size={28} className="text-emerald-500" />
            <p className="text-sm font-medium text-[#f5f5f0]">Check your inbox</p>
            <p className="text-xs text-[#6a6a6a]">
              We sent a sign-in link to <span className="text-[#a8a29e]">{email.trim()}</span>. Open it on this device to finish signing in.
            </p>
            <Button variant="ghost" size="sm" onClick={() => setSent(false)}>Use a different email</Button>
          </div>
        ) : (
          <div className="w-full flex flex-col gap-2">
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError('') }}
              className={inputClass}
            />

            {mode === 'password' ? (
              <>
                <input
                  type="password"
                  autoComplete="current-password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError('') }}
                  onKeyDown={(e) => { if (e.key === 'Enter' && email.includes('@') && password) void handlePassword() }}
                  className={inputClass}
                />
                <Button
                  onClick={handlePassword}
                  loading={busy}
                  disabled={!email.includes('@') || !password}
                  fullWidth
                >
                  <LogIn size={16} />
                  Sign in
                </Button>
              </>
            ) : (
              <Button
                onClick={handleMagicLink}
                loading={busy}
                disabled={!email.includes('@')}
                fullWidth
              >
                <Mail size={16} />
                Email me a sign-in link
              </Button>
            )}

            {error && (
              <div className="flex items-start gap-2 text-red-400 bg-red-500/10 rounded-xl p-3 mt-2">
                <AlertCircle size={14} className="shrink-0 mt-0.5" />
                <p className="text-xs">{error}</p>
              </div>
            )}

            {MAGIC_LINK_ENABLED && (
              <button
                type="button"
                onClick={() => switchMode(mode === 'password' ? 'magic-link' : 'password')}
                className="text-xs text-[#6a6a6a] hover:text-[#a8a29e] transition-colors mt-2 py-1"
              >
                {mode === 'password' ? 'Email me a sign-in link instead' : 'Sign in with a password instead'}
              </button>
            )}
          </div>
        )}

        <p className="text-2xs text-[#3a3a3a] text-center leading-relaxed">
          Your data is private to your account and never shared.
        </p>
      </div>
    </div>
  )
}

const inputClass =
  'w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl px-4 py-3 text-base text-[#f5f5f0] placeholder-[#3a3a3a] focus:outline-none focus:border-[#d97756]/50 transition-colors'
