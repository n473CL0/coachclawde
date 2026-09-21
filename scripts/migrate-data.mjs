// One-time import of the legacy single-user JSON files (data/profile.json,
// data/sessions.json, data/plans.json) into the Supabase database for one user.
//
// Those files were removed from the repo once the app went database-only. To
// run this against them, restore them from git history first:
//
//   git show v0.2.0-final-data:data/profile.json  > data/profile.json
//   git show v0.2.0-final-data:data/sessions.json > data/sessions.json
//   git show v0.2.0-final-data:data/plans.json    > data/plans.json
//
// This bypasses Row-Level Security using the SERVICE ROLE key, so run it locally
// and never ship the service-role key to the client.
//
// Usage:
//   SUPABASE_URL=https://xxxx.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=eyJ... \
//   TARGET_USER_ID=<the auth user's uuid> \
//   node scripts/migrate-data.mjs
//
// Find TARGET_USER_ID in the Supabase dashboard under Authentication → Users
// (sign in to the app once with the account you want to own this data first).

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TARGET_USER_ID } = process.env

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !TARGET_USER_ID) {
  console.error('Missing env. Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and TARGET_USER_ID.')
  process.exit(1)
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const readJson = async (rel) => JSON.parse(await readFile(join(root, rel), 'utf8'))

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

async function main() {
  const profile = await readJson('data/profile.json')
  const plans = await readJson('data/plans.json')
  const sessions = await readJson('data/sessions.json')

  // --- profile ---
  {
    const { error } = await supabase.from('profiles').upsert({
      id: TARGET_USER_ID,
      name: profile.name,
      sex: profile.sex,
      height_cm: profile.heightCm,
      weight_kg: profile.weightKg,
      program_week: profile.programWeek,
      injuries: profile.injuries ?? [],
      goals: profile.goals ?? [],
      fitness_background: profile.fitnessBackground ?? '',
      gym_access: profile.gymAccess ?? true,
      dietary_notes: profile.dietaryNotes ?? [],
      program: profile.program ?? null,
      experience_level: profile.experienceLevel ?? null,
      // Imported athletes have a real profile already, so don't send them
      // through the first-run slideshow.
      onboarded: profile.onboarded ?? true,
      updated_at: profile.updatedAt ?? new Date().toISOString(),
    })
    if (error) throw error
    console.log('✓ profile imported')
  }

  // --- week plans ---
  if (plans.length) {
    const rows = plans.map((p) => ({
      user_id: TARGET_USER_ID,
      id: p.id,
      week_start_date: p.weekStartDate,
      available_days: p.availableDays ?? [],
      user_notes: p.userNotes ?? '',
      plan: p,
      created_at: p.createdAt ?? new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }))
    const { error } = await supabase.from('week_plans').upsert(rows, { onConflict: 'user_id,id' })
    if (error) throw error
    console.log(`✓ ${rows.length} week plan(s) imported`)
  }

  // --- logged sessions ---
  if (sessions.length) {
    const rows = sessions.map((s) => ({
      user_id: TARGET_USER_ID,
      id: s.id,
      week_plan_id: s.weekPlanId ?? null,
      date: s.date,
      type: s.type,
      status: s.status,
      session: s,
      updated_at: new Date().toISOString(),
    }))
    const { error } = await supabase.from('logged_sessions').upsert(rows, { onConflict: 'user_id,id' })
    if (error) throw error
    console.log(`✓ ${rows.length} logged session(s) imported`)
  }

  console.log('\nDone. Sign in as this user and your data should appear.')
}

main().catch((e) => {
  console.error('Migration failed:', e.message ?? e)
  process.exit(1)
})
