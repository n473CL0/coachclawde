// Reports the live state of the Supabase project: which env vars are set,
// whether the schema is in place, and every account with its onboarding state.
//
// Read-only: it counts rows and lists accounts, and never writes anything.
//
// Usage:
//   node --env-file=.env.local scripts/check-setup.mjs
//
// Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (the service-role key
// bypasses RLS, which is what lets this see every user's rows). Never prints
// any key.

import { createClient } from '@supabase/supabase-js'

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  VITE_SUPABASE_URL,
  VITE_SUPABASE_ANON_KEY,
} = process.env

const tick = (ok) => (ok ? '✓' : '✗')

console.log('\nCoach Clawde — setup check\n')

// --- env --------------------------------------------------------------------
console.log('Environment (.env.local)')
console.log(`  ${tick(!!VITE_SUPABASE_URL)} VITE_SUPABASE_URL        ${VITE_SUPABASE_URL ?? '(missing — the app needs this)'}`)
console.log(`  ${tick(!!VITE_SUPABASE_ANON_KEY)} VITE_SUPABASE_ANON_KEY   ${VITE_SUPABASE_ANON_KEY ? '(set)' : '(missing — the app needs this)'}`)
console.log(`  ${tick(!!SUPABASE_URL)} SUPABASE_URL             ${SUPABASE_URL ?? '(missing — the scripts need this)'}`)
console.log(`  ${tick(!!SUPABASE_SERVICE_ROLE_KEY)} SUPABASE_SERVICE_ROLE_KEY ${SUPABASE_SERVICE_ROLE_KEY ? '(set)' : '(missing — the scripts need this)'}`)

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.log('\nCannot check the database without SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.')
  console.log('Fill them into .env.local, then re-run.\n')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

async function countRows(table) {
  const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true })
  if (error) return { error: error.message }
  return { count: count ?? 0 }
}

async function main() {
  // --- schema ---------------------------------------------------------------
  console.log('\nSchema')
  const tables = ['profiles', 'week_plans', 'logged_sessions', 'check_ins']
  const counts = {}
  let schemaOk = true
  for (const t of tables) {
    const r = await countRows(t)
    if (r.error) {
      schemaOk = false
      console.log(`  ✗ ${t.padEnd(16)} ${r.error}`)
    } else {
      counts[t] = r.count
      console.log(`  ✓ ${t.padEnd(16)} ${r.count} row(s)`)
    }
  }
  // v1.0.2: the goal_profile column (migration 0005).
  {
    const { error } = await supabase.from('profiles').select('goal_profile', { head: true, count: 'exact' })
    if (error) {
      schemaOk = false
      console.log(`  ✗ ${'profiles.goal_profile'.padEnd(16)} ${error.message}`)
    } else {
      console.log(`  ✓ ${'profiles.goal_profile'}`)
    }
  }
  if (!schemaOk) {
    console.log('\n  → Run the files in supabase/migrations/ in order (0001 … 0006)')
    console.log('    in the Supabase SQL editor, then re-run this check.\n')
    process.exit(1)
  }

  // --- accounts -------------------------------------------------------------
  const { data: userPage, error: usersError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 })
  if (usersError) {
    console.log(`\nAccounts\n  ✗ could not list users: ${usersError.message}\n`)
    process.exit(1)
  }
  const users = userPage.users

  const { data: profileRows } = await supabase.from('profiles').select('id, name, onboarded')
  const profileById = new Map((profileRows ?? []).map((p) => [p.id, p]))

  console.log(`\nAccounts (${users.length})`)
  if (users.length === 0) {
    console.log('  (none yet — create them with scripts/create-beta-user.mjs)')
  }
  for (const u of users) {
    const p = profileById.get(u.id)
    const state = !p
      ? 'NO PROFILE ROW'
      : p.onboarded
        ? 'onboarded'
        : 'will onboard on first sign-in'
    const signedIn = u.last_sign_in_at ? `last in ${u.last_sign_in_at.slice(0, 10)}` : 'never signed in'
    console.log(`  • ${(u.email ?? u.id).padEnd(32)} ${state.padEnd(30)} ${signedIn}`)
  }

  console.log(
    '\nNote: this cannot tell whether migration 0003 ran. Check it in the SQL editor:\n' +
      "  select prosrc like '%onboarded%' as has_0003 from pg_proc where proname = 'handle_new_user';\n"
  )
}

main().catch((e) => {
  console.error('\nCheck failed:', e.message ?? e, '\n')
  process.exit(1)
})
