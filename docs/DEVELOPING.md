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

**Backend:** Supabase provides Postgres + auth (email + password and magic-link;
Google is wired in `AuthProvider` but not yet surfaced in the UI) + Row-Level
Security. The app talks to it directly with
`@supabase/supabase-js` from the browser — there is no custom server. Requires
`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`; when those are absent the app runs
in offline single-user "local mode" (no login), so `npm run dev` works without a
backend. See [`DEPLOYMENT.md`](DEPLOYMENT.md) for setup and the DB schema in
`supabase/migrations/`.

**Accounts:** Supabase is the only backend. Testers sign in with an email and
password provisioned by an operator via `scripts/create-beta-user.mjs`; the
magic-link path is still there for anyone who prefers it, but it needs working
SMTP on the Supabase project (see `DEPLOYMENT.md`).

> **Removed in the database-only change:** the `admin` login and its
> GitHub-storage backend (`src/lib/githubSync.ts`, `src/auth/adminMode.ts`),
> which read and wrote `data/*.json` through the Contents API and committed on
> every sync. All data now lives in Supabase. The legacy JSON files are
> recoverable from the `v0.2.0-final-data` tag if ever needed.

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
- `src/auth/` — `AuthProvider` (Supabase session + `useAuth()`), `RequireAuth`
  (route guard that pulls the signed-in user's data on sign-in and resets the
  store on sign-out). `src/pages/Login.tsx` is the sign-in screen.
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
  (push/pull rows), `weekUtils`/`dateUtils`, `cardioUtils`, `export`, `nanoid`.
  `useAutoSync` (in `src/hooks/`) is the push/pull facade used by pages.
- `scripts/create-beta-user.mjs` — provisions beta accounts (email + password,
  pre-confirmed) with the service-role key. `scripts/migrate-data.mjs` imports
  the legacy `data/*.json` files into an account; restore them from the
  `v0.2.0-final-data` tag first.

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
- **No athlete data belongs in this repo.** It lives in each user's Supabase
  rows; nothing in the app writes to git any more.
