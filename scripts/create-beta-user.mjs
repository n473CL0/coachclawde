// Create (or re-password) Coach Claude beta accounts.
//
// Beta testers sign in with an email + password you hand them directly, so no
// email delivery is involved — nothing to rate-limit, nothing to land in spam.
// Accounts are created already-confirmed, so they can sign in immediately.
//
// This uses the SERVICE ROLE key and the Supabase admin API, which bypass Row-
// Level Security. Run it locally and never ship that key to the client.
//
// Usage:
//   SUPABASE_URL=https://xxxx.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=eyJ... \
//   node scripts/create-beta-user.mjs alice@example.com bob@example.com
//
// Options:
//   --password <pw>    Use this password for every account listed.
//                      Omitted: a random one is generated per account.
//   --reset            If an account already exists, set its password instead
//                      of skipping it. (Use when a tester loses theirs.)
//
// Passwords are printed once, to this terminal, and are not stored anywhere by
// this script — copy them before you close it.

import { randomBytes } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing env. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.')
  process.exit(1)
}

// --- args -------------------------------------------------------------------
const argv = process.argv.slice(2)
let sharedPassword = null
let reset = false
const emails = []

for (let i = 0; i < argv.length; i++) {
  const arg = argv[i]
  if (arg === '--password') {
    sharedPassword = argv[++i]
    if (!sharedPassword) {
      console.error('--password needs a value.')
      process.exit(1)
    }
  } else if (arg === '--reset') {
    reset = true
  } else if (arg.startsWith('--')) {
    console.error(`Unknown option: ${arg}`)
    process.exit(1)
  } else {
    emails.push(arg)
  }
}

if (emails.length === 0) {
  console.error('No emails given.\n\nUsage: node scripts/create-beta-user.mjs alice@example.com [bob@example.com ...]')
  process.exit(1)
}

const invalid = emails.filter((e) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e))
if (invalid.length) {
  console.error(`Not valid email addresses: ${invalid.join(', ')}`)
  process.exit(1)
}

// Supabase enforces a 6-character minimum by default; this comfortably clears
// it while staying short enough to read out over a message.
function generatePassword() {
  return randomBytes(9).toString('base64url')
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

/** Finds an existing auth user by email, paging until found or exhausted. */
async function findUserByEmail(email) {
  const target = email.toLowerCase()
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    const hit = data.users.find((u) => u.email?.toLowerCase() === target)
    if (hit) return hit
    if (data.users.length < 200) return null
  }
}

/**
 * Makes sure the athlete lands in the onboarding slideshow on first sign-in.
 * The `on_auth_user_created` trigger provisions the profile row; migration 0003
 * has it write `onboarded = false`, but setting it here too means the script
 * still does the right thing against a database that hasn't been migrated yet.
 */
async function ensureOnboardingPending(userId) {
  const { error } = await supabase
    .from('profiles')
    .update({ onboarded: false })
    .eq('id', userId)
  if (error) throw new Error(`profile row: ${error.message}`)
}

async function main() {
  const results = []

  for (const email of emails) {
    const password = sharedPassword ?? generatePassword()
    try {
      const existing = await findUserByEmail(email)

      if (existing && !reset) {
        results.push({ email, status: 'exists — skipped', password: '(unchanged)' })
        continue
      }

      if (existing) {
        const { error } = await supabase.auth.admin.updateUserById(existing.id, { password })
        if (error) throw error
        await ensureOnboardingPending(existing.id)
        results.push({ email, status: 'password reset', password })
        continue
      }

      const { data, error } = await supabase.auth.admin.createUser({
        email,
        password,
        // Pre-confirm: no verification email, so they can sign in right away.
        email_confirm: true,
      })
      if (error) throw error
      await ensureOnboardingPending(data.user.id)
      results.push({ email, status: 'created', password })
    } catch (e) {
      results.push({ email, status: `FAILED — ${e.message ?? e}`, password: '—' })
    }
  }

  console.log('\nBeta accounts\n')
  const pad = Math.max(...results.map((r) => r.email.length), 5)
  for (const r of results) {
    console.log(`  ${r.email.padEnd(pad)}  ${r.password.padEnd(14)}  ${r.status}`)
  }

  const failed = results.filter((r) => r.status.startsWith('FAILED'))
  console.log(
    `\n${results.length - failed.length}/${results.length} ready.` +
      ' Send each tester their email + password — they sign in on the login screen.'
  )
  console.log('Passwords are shown only here. Copy them now.\n')

  if (failed.length) process.exit(1)
}

main().catch((e) => {
  console.error('Failed:', e.message ?? e)
  process.exit(1)
})
