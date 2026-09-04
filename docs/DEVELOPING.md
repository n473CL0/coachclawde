# Developing Coach Claude (code changes)

This guide is for when you're asked to **change the app's code**. It is kept
out of `CLAUDE.md` on purpose: most requests to this repo are workout-plan
generation, which needs none of this. Read this file only when a task actually
touches the app code.

## Stack

React 19 + TypeScript + Vite 8, Tailwind CSS v4 (config is CSS-first in
`src/index.css` — there is **no** `tailwind.config.js`), Zustand (with `persist`)
for state, React Router 7, `lucide-react` icons, `date-fns`. Ships as an
installable PWA via `vite-plugin-pwa` (`registerType: 'autoUpdate'`).

**Backend (v0.2.0):** Supabase provides Postgres + auth (email magic-link; Google
is wired in `AuthProvider` but not yet surfaced in the UI) + Row-Level Security. The app talks to it directly with
`@supabase/supabase-js` from the browser — there is no custom server. Requires
`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`; when those are absent the app runs
in offline single-user "local mode" (no login), so `npm run dev` works without a
backend. See [`DEPLOYMENT.md`](DEPLOYMENT.md) for setup and the DB schema in
`supabase/migrations/`.

**Admin mode (GitHub storage):** entering `admin` (`ADMIN_EMAIL` in
`src/auth/adminMode.ts`) as the login email swaps the whole storage backend from
Supabase to the repo's `data/*.json`, via the pre-v0.2.0 Contents-API mechanism
in `src/lib/githubSync.ts`. The operator pastes a GitHub PAT at sign-in; it is
persisted to `localStorage` on that device and deliberately **not** read from a
`VITE_` env var, since those are inlined into the client bundle and would leak
repo write access to anyone loading the deployed site. The magic string is not a
credential — without a working token it grants nothing. Every push is a commit,
so the in-workout autosave (which fires per completed set) is debounced into a
single trailing write in this mode.

## Commands

- `npm run dev` — local dev server (HMR).
- `npm run lint` — ESLint. Must pass clean.
- `npm run build` — `tsc -b && vite build`. **This is the only typecheck gate**
  (there is no separate `typecheck` script and no test runner).

**Before committing any code change, run `npm run lint` and `npm run build` and
make sure both are green.** On Claude Code on the web,
`.claude/hooks/session-start.sh` installs dependencies at session start, so these
work out of the box.

## Where things live

- `src/types/index.ts` — **single source of truth** for all data shapes
  (`WeekPlan`, `PlannedSession`, `LoggedSession`, etc.). The schema documented in
  `CLAUDE.md` mirrors these types; if you change one, update the other so the two
  stay in sync.
- `src/store/useAppStore.ts` — main Zustand store (profile, week plans, logged
  sessions, active session, rest timer). Persisted to `localStorage` under
  `coach-claude-store` via `partialize` (timer/active session are intentionally
  not persisted) — this is the offline working cache; Supabase is the source of
  truth. `src/store/useSettingsStore.ts` — sync status only.
- `src/auth/` — `AuthProvider` (Supabase session + admin mode + `useAuth()`),
  `RequireAuth` (route guard that pulls the signed-in identity's data on sign-in
  and resets the store on sign-out), `adminMode.ts` (the `ADMIN_EMAIL` constant,
  kept out of `AuthProvider` so Fast Refresh keeps working).
  `src/pages/Login.tsx` is the sign-in screen.
- `src/pages/` — one component per tab (`Home`, `WeekPlanner`, `Session`,
  `Progress`, `History`, `Settings`), wired in `src/App.tsx` with `BottomNav`.
- `src/components/session/` — the live-workout UI (exercise tiles, set rows, rest
  timer, interval rows, complete flow).
- `src/components/shared/` & `components/layout/` — reusable primitives
  (`Button`, `Card`, `Badge`, `PageHeader`, …). Reuse these instead of
  hand-rolling new ones.
- `src/lib/` — pure helpers: `promptBuilder` (builds the **self-contained** plan
  prompt — embeds profile + summarised history), `historySummary` (bounds that
  history so the prompt isn't overloaded), `supabase` (client) + `supabaseSync`
  (push/pull rows), `githubSync` (the admin-mode `data/*.json` backend),
  `weekUtils`/`dateUtils`, `cardioUtils`, `export`, `nanoid`.
  `useAutoSync` (in `src/hooks/`) is the push/pull facade used by pages — it
  routes to Supabase or GitHub depending on `adminMode`, so pages don't care
  which backend is live.
- `data/*.json` — the **original single user's** profile/sessions/plans, kept as a
  pre-v0.2.0 backup. No longer read by the app at runtime (data now lives in
  Supabase per user); see `scripts/migrate-data.mjs` to import them into an
  account.

## Conventions & gotchas

- Match the style of the file you're editing (functional components + hooks
  throughout; `import type` for type-only imports).
- Use `lucide-react` for icons and the existing `shared/` primitives for UI —
  don't introduce a new component library or CSS framework.
- IDs are generated with `src/lib/nanoid.ts`; dates are local-ISO via
  `weekUtils`/`dateUtils` (don't hand-roll date math — DST/Monday-start logic
  already lives there).
- Keep changes minimal and typed; never weaken or remove the shoulder/knee safety
  semantics encoded in the data shapes or plan logic.
- `dist/` and `node_modules/` are git-ignored — never commit them.
