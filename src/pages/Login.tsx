import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { isAdminEmail } from '../auth/adminMode'
import { useSettingsStore } from '../store/useSettingsStore'
import { Button } from '../components/shared/Button'
import { ClaudeMark } from '../components/shared/ClaudeMark'
import { Mail, AlertCircle, CheckCircle, GitBranch } from 'lucide-react'

/** Where admin mode points by default — the repo this app lives in. */
const DEFAULT_OWNER = 'n473CL0'
const DEFAULT_REPO = 'coach-claude'
const DEFAULT_BRANCH = 'main'

/**
 * Pulls a human-readable message out of whatever the auth call throws. Supabase
 * AuthErrors stringify to "{}" (message/stack are non-enumerable), so dig out
 * the useful fields explicitly and fall back to the HTTP status.
 */
function authErrorMessage(e: unknown): string {
  if (e && typeof e === 'object') {
    const err = e as { message?: string; error_description?: string; code?: string; status?: number }
    return (
      err.message ||
      err.error_description ||
      err.code ||
      (err.status ? `Request failed (HTTP ${err.status})` : '') ||
      'Could not send magic link'
    )
  }
  return 'Could not send magic link'
}

export function Login() {
  const { signInWithEmail, signInAsAdmin, adminMode } = useAuth()
  const github = useSettingsStore((s) => s.github)
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  // Admin mode reuses whatever config this device already has, so a returning
  // operator only has to type the magic email and hit connect.
  const [token, setToken] = useState(github?.token ?? '')
  const [owner, setOwner] = useState(github?.owner ?? DEFAULT_OWNER)
  const [repo, setRepo] = useState(github?.repo ?? DEFAULT_REPO)
  const [branch, setBranch] = useState(github?.branch ?? DEFAULT_BRANCH)

  const isAdmin = isAdminEmail(email)

  async function handleEmail() {
    setError('')
    setBusy(true)
    try {
      await signInWithEmail(email.trim())
      setSent(true)
    } catch (e: unknown) {
      // Full object to the console for debugging; readable message to the user.
      console.error('[auth] magic-link send failed:', e)
      setError(authErrorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  async function handleAdmin() {
    setError('')
    setBusy(true)
    try {
      await signInAsAdmin({
        token: token.trim(),
        owner: owner.trim(),
        repo: repo.trim(),
        branch: branch.trim() || DEFAULT_BRANCH,
      })
    } catch (e: unknown) {
      console.error('[auth] GitHub storage sign-in failed:', e)
      setError(authErrorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  if (adminMode) return <Navigate to="/" replace />

  return (
    <div className="flex flex-col items-center justify-center min-h-svh bg-[#0a0a0a] px-6">
      <div className="w-full max-w-sm flex flex-col items-center gap-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <ClaudeMark size={72} sweat />
          <h1 className="text-2xl font-bold text-[#f5f5f0]">Coach Claude</h1>
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
              type="text"
              inputMode="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError('') }}
              className={inputClass}
            />

            {isAdmin ? (
              <div className="flex flex-col gap-2 bg-[#161616] border border-[#2a2a2a] rounded-2xl p-4 mt-1">
                <div className="flex items-center gap-2">
                  <GitBranch size={16} className="text-[#d97756]" />
                  <p className="text-sm font-semibold text-[#f5f5f0]">GitHub storage</p>
                </div>
                <p className="text-xs text-[#6a6a6a] leading-relaxed">
                  Reads and writes <span className="text-[#a8a29e]">data/*.json</span> in the repo instead of
                  Supabase. Every sync is a commit. Your token stays on this device.
                </p>
                <input
                  type="password"
                  autoComplete="off"
                  placeholder="GitHub personal access token"
                  value={token}
                  onChange={(e) => { setToken(e.target.value); setError('') }}
                  className={`${inputClass} mt-1`}
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    placeholder="owner"
                    value={owner}
                    onChange={(e) => setOwner(e.target.value)}
                    className={inputClass}
                  />
                  <input
                    placeholder="repo"
                    value={repo}
                    onChange={(e) => setRepo(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <input
                  placeholder="branch"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  className={inputClass}
                />
                <Button
                  onClick={handleAdmin}
                  loading={busy}
                  disabled={!token.trim() || !owner.trim() || !repo.trim()}
                  fullWidth
                >
                  <GitBranch size={16} />
                  Connect GitHub storage
                </Button>
              </div>
            ) : (
              <Button
                onClick={handleEmail}
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
          </div>
        )}

        <p className="text-[10px] text-[#3a3a3a] text-center leading-relaxed">
          Your data is private to your account and never shared.
        </p>
      </div>
    </div>
  )
}

const inputClass =
  'w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl px-4 py-3 text-sm text-[#f5f5f0] placeholder-[#3a3a3a] focus:outline-none focus:border-[#d97756]/50 transition-colors'

