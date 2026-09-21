# Coach Claude — Workout Tracker

A workout-tracking PWA that turns Claude into your personal strength & conditioning
coach. Plan your week, log your sessions, and generate progressive-overload plans
tailored to your profile, injuries and history.

## How it works

1. In the app, pick your training days and add any notes, then **Generate & Copy
   Prompt**. The prompt bundles your profile and a summarised recent history.
2. Paste it into Claude (with this repo available). The prompt is self-contained,
   so Claude applies the programming rules and `WeekPlan` schema from
   [`CLAUDE.md`](CLAUDE.md) to the profile and history embedded in it.
3. **Import** the JSON back into the app and train. Logged sessions sync to your
   account automatically.

## Multiple users

The app is multi-user and **database-only**: every athlete's profile, plans and
logged sessions live in their own rows in a [Supabase](https://supabase.com)
database (Postgres + auth + Row-Level Security). Nothing is stored in this repo.
Deploy on Vercel.

Sign in with an **email and password** — accounts are provisioned with
[`scripts/create-beta-user.mjs`](scripts/create-beta-user.mjs), so a closed beta
needs no email delivery at all. A magic-link fallback is available when SMTP is
configured. (Google/social login can be enabled later — the plumbing is already
in place; see `docs/DEPLOYMENT.md`.)

- **Setup guide, incl. creating beta accounts:** [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)
- **Database schema:** [`supabase/migrations/`](supabase/migrations/)

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
