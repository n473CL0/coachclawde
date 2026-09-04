# Coach Claude — Workout Tracker

A workout-tracking PWA that turns Claude into your personal strength & conditioning
coach. Plan your week, log your sessions, and generate progressive-overload plans
tailored to your profile, injuries and history.

## How it works

1. In the app, pick your training days and add any notes, then **Generate & Copy
   Prompt**. The prompt bundles your profile and a summarised recent history.
2. Paste it into Claude (with this repo available). Claude applies the programming
   rules and `WeekPlan` schema from [`CLAUDE.md`](CLAUDE.md) and returns a plan.
3. **Import** the JSON back into the app and train. Logged sessions sync to your
   account automatically.

## v0.2.0 — multiple users

The app is multi-user: sign in with an email magic-link, and your data lives in a
per-user [Supabase](https://supabase.com) database (Postgres + auth + Row-Level
Security) instead of repo JSON files. Deploy on Vercel. (Google/social login can
be enabled later — the plumbing is already in place; see `docs/DEPLOYMENT.md`.)

- **Setup / migration guide:** [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)
- **Database schema:** [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql)

## Development

```bash
npm install
npm run dev      # local dev (runs in offline "local mode" without Supabase env vars)
npm run lint     # must pass clean
npm run build    # tsc -b && vite build — the typecheck gate
```

Copy `.env.example` to `.env.local` and add your Supabase keys to test login
locally. See [`docs/DEVELOPING.md`](docs/DEVELOPING.md) for the stack, file map and
conventions.
