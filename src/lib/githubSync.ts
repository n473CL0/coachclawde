import type { UserProfile, WeekPlan, LoggedSession } from '../types'

/**
 * GitHub-backed storage — the pre-v0.2.0 sync mechanism, kept alive as an admin
 * escape hatch (see `ADMIN_EMAIL` in `auth/AuthProvider`). Reads and writes the
 * repo's `data/*.json` through the Contents API, committing on every push.
 *
 * The token is supplied by the operator at sign-in and persisted to
 * localStorage on their device only — it is deliberately NOT read from a
 * `VITE_`-prefixed env var, since those are inlined into the client bundle and
 * would hand repo write access to anyone who loads the deployed site.
 */
export interface GitHubConfig {
  token: string
  owner: string
  repo: string
  branch: string
}

function githubHeaders(config: GitHubConfig) {
  return {
    Authorization: `Bearer ${config.token}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
  }
}

/** UTF-8-safe base64, so non-ASCII in notes/names survives a round-trip. */
function encodeBase64(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function decodeBase64(b64: string): string {
  const binary = atob(b64.replace(/\n/g, ''))
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)))
}

function contentsUrl(config: GitHubConfig, path: string) {
  return `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${path}`
}

async function getFileSha(config: GitHubConfig, path: string): Promise<string | undefined> {
  const res = await fetch(`${contentsUrl(config, path)}?ref=${config.branch}`, {
    headers: githubHeaders(config),
  })
  if (res.status === 404) return undefined
  if (!res.ok) throw new Error(`GitHub: failed to get ${path} (${res.status})`)
  const data = await res.json()
  return data.sha
}

async function putFile(config: GitHubConfig, path: string, content: unknown, message: string) {
  const encoded = encodeBase64(JSON.stringify(content, null, 2))

  const commit = (sha: string | undefined) =>
    fetch(contentsUrl(config, path), {
      method: 'PUT',
      headers: githubHeaders(config),
      body: JSON.stringify({ message, content: encoded, branch: config.branch, ...(sha ? { sha } : {}) }),
    })

  const res = await commit(await getFileSha(config, path))
  if (res.ok) return

  // A 409 means the file moved under us (another device synced first) — re-read
  // the SHA and retry once before giving up.
  if (res.status === 409) {
    const retry = await commit(await getFileSha(config, path))
    if (retry.ok) return
    const retryErr = await retry.json().catch(() => ({}))
    throw new Error(`GitHub sync failed for ${path}: ${retryErr.message ?? retry.statusText}`)
  }

  const err = await res.json().catch(() => ({}))
  throw new Error(`GitHub sync failed for ${path}: ${err.message ?? res.statusText}`)
}

async function getFileContent<T>(config: GitHubConfig, path: string): Promise<T | null> {
  const res = await fetch(`${contentsUrl(config, path)}?ref=${config.branch}`, {
    headers: githubHeaders(config),
  })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`GitHub: failed to read ${path} (${res.status})`)
  const data = await res.json()
  return JSON.parse(decodeBase64(data.content)) as T
}

export async function pushLoggedSessions(config: GitHubConfig, sessions: LoggedSession[]) {
  await putFile(config, 'data/sessions.json', sessions, 'chore: update session history [auto-sync]')
}

export async function pushWeekPlans(config: GitHubConfig, plans: WeekPlan[]) {
  await putFile(config, 'data/plans.json', plans, 'chore: update weekly plans [auto-sync]')
}

export async function pushProfile(config: GitHubConfig, profile: UserProfile) {
  await putFile(config, 'data/profile.json', profile, 'chore: sync profile [auto-sync]')
}

export async function pushAll(
  config: GitHubConfig,
  data: { profile: UserProfile; weekPlans: WeekPlan[]; loggedSessions: LoggedSession[] }
) {
  // Sequential writes — concurrent commits to the same branch collide on SHA.
  await pushLoggedSessions(config, data.loggedSessions)
  await pushWeekPlans(config, data.weekPlans)
  await pushProfile(config, data.profile)
}

export async function pullAll(config: GitHubConfig): Promise<{
  profile: UserProfile | null
  weekPlans: WeekPlan[]
  loggedSessions: LoggedSession[]
}> {
  const [loggedSessions, weekPlans, profile] = await Promise.all([
    getFileContent<LoggedSession[]>(config, 'data/sessions.json'),
    getFileContent<WeekPlan[]>(config, 'data/plans.json'),
    getFileContent<UserProfile>(config, 'data/profile.json'),
  ])
  return {
    // The backup files predate the onboarding flag; treat a missing one as done
    // so restoring never forces the operator through the first-run slideshow.
    profile: profile ? { ...profile, onboarded: profile.onboarded ?? true } : null,
    weekPlans: weekPlans ?? [],
    loggedSessions: loggedSessions ?? [],
  }
}

/** Verifies the token can reach the repo, so sign-in fails fast and legibly. */
export async function validateConfig(config: GitHubConfig): Promise<void> {
  const res = await fetch(`https://api.github.com/repos/${config.owner}/${config.repo}`, {
    headers: githubHeaders(config),
  })
  if (res.status === 401) throw new Error('Invalid token — check your personal access token')
  if (res.status === 404) throw new Error('Repo not found — check the owner and repo name, and that the token can see it')
  if (res.status === 403) {
    // Also what GitHub returns for a fine-grained token missing Contents access.
    const retryAfter = res.headers.get('retry-after')
    throw new Error(
      retryAfter
        ? `GitHub rate limit hit — try again in ${retryAfter}s`
        : 'Forbidden — the token needs read/write access to this repo\'s contents'
    )
  }
  if (!res.ok) throw new Error(`GitHub error: ${res.statusText}`)
}
