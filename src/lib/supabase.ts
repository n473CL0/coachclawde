import { createClient } from '@supabase/supabase-js'

// Vite exposes only `VITE_`-prefixed env vars to the client bundle. These are
// set by the Supabase Vercel Marketplace integration (see docs/DEPLOYMENT.md)
// and, for local dev, by a `.env.local` file (see `.env.example`).
const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/**
 * Whether Supabase credentials are present. When false the app runs in
 * single-user local mode (no login, localStorage only) so `npm run dev` and the
 * existing offline experience keep working without a backend.
 */
export const isSupabaseConfigured = Boolean(url && anonKey)

export const supabase = isSupabaseConfigured
  ? createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // Needed so the OAuth / magic-link redirect back to the app picks up the
        // session from the URL hash.
        detectSessionInUrl: true,
      },
    })
  : null
