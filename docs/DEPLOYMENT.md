# Deploying Coach Claude v0.2.0 (multi-user + login)

This guide covers the steps **you** have to do by hand to take the app from the
single-user GitHub-JSON setup to a multi-user app on Vercel with login and a
Supabase database. Code changes are already in the repo; the steps below are the
clicks-in-dashboards parts that can't be automated from here.

> **Architecture in one line:** the Vite SPA still deploys to Vercel as static
> files; **Supabase** provides the database, authentication (email magic-link) and
> Row-Level Security so each user only sees their own data. No custom server is
> required — the browser talks to Supabase directly with the public anon key, and
> RLS does the access control.

There are six phases:

1. Create the Supabase project (via the Vercel Marketplace)
2. Create the database schema
3. Configure authentication (email magic-link)
4. Wire up environment variables & redeploy
5. Migrate your existing data into your new account
6. Smoke-test

---

## 1. Add Supabase via the Vercel Marketplace

1. In the [Vercel dashboard](https://vercel.com), open your **coach-claude**
   project (import it from GitHub first if it isn't there yet).
2. Go to the **Integrations** / **Marketplace** tab → search **Supabase** →
   **Add Integration** (or **Install**).
3. Choose to **create a new Supabase project** and connect it to the
   coach-claude Vercel project. Pick a region near you.
4. When it finishes, the integration **automatically adds these environment
   variables** to the Vercel project: `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, etc.

> ℹ️ The build (`vite.config.ts`) auto-detects the integration's
> `SUPABASE_URL` / `SUPABASE_ANON_KEY` (and Next-style `NEXT_PUBLIC_*`) names, so
> in most cases **you don't need to add `VITE_` aliases** — just make sure the
> vars exist for the environment you're testing (Preview and/or Production) and
> **redeploy** so the build picks them up. If you ever build outside Vercel, you
> can still set `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` explicitly.

You now also have a Supabase project dashboard at https://supabase.com/dashboard
— most of the remaining steps happen there.

---

## 2. Create the database schema

1. Open your project in the **Supabase dashboard** → **SQL Editor** → **New
   query**.
2. Paste the entire contents of [`supabase/migrations/0001_init.sql`](../supabase/migrations/0001_init.sql)
   and click **Run**.
3. Confirm under **Table Editor** that `profiles`, `week_plans` and
   `logged_sessions` exist, and under **Authentication → Policies** that each has
   an "owner-only" RLS policy.

This migration also installs a trigger that auto-creates an empty `profiles` row
whenever someone signs up, so the app always has a profile to read.

*(Optional, if you prefer the CLI: `npm i -g supabase`, `supabase link
--project-ref <ref>`, then `supabase db push`.)*

---

## 3. Configure authentication

### 3a. Set the Site URL & redirect URLs

In Supabase → **Authentication → URL Configuration**:

- **Site URL:** your canonical production URL, e.g. `https://coach-claude.vercel.app`.
- **Redirect URLs (allow-list):** the app asks Supabase to send you back to the
  origin you signed in from (`emailRedirectTo`/`redirectTo = window.location.origin`).
  **Supabase only honours that if the origin matches an entry here — otherwise it
  silently falls back to the Site URL.** That's why a magic link opened from a
  Preview or localhost can dump you on the production deployment. Add (wildcards
  are supported):

  ```
  http://localhost:5173/**
  https://coach-claude.vercel.app/**
  https://coach-claude-git-*-<your-vercel-scope>.vercel.app/**
  https://coach-claude-*-<your-vercel-scope>.vercel.app/**
  ```

  The third line covers the **stable per-branch preview alias** (recommended for
  testing); the fourth covers the per-deployment hash URLs. Replace
  `<your-vercel-scope>` with your Vercel username/team slug (copy a real preview
  URL and match its shape).

> After changing these, request a **fresh** magic link — an already-sent link has
> the old redirect baked in. Tip: for day-to-day testing, the stable branch-alias
> preview URL (`…-git-<branch>-…`) is far less painful than the per-deploy hash
> URLs, since it doesn't change every push.

### 3b. Email magic-link

1. In Supabase → **Authentication → Providers → Email** → ensure **Email** is
   enabled. "Confirm email" / magic link is on by default.
2. For low volume, Supabase's built-in email works out of the box. For reliable
   production delivery, set up **custom SMTP** under **Project Settings → Auth →
   SMTP Settings** (e.g. Resend, Postmark, SendGrid). Otherwise links can land in
   spam or be rate-limited.

That's the only provider the app ships with for now.

### 3c. Branded email templates

Drop the templates in [`docs/email/`](email/) into Supabase →
**Authentication → Email Templates**:

| Supabase template | File |
| --- | --- |
| **Magic Link** | `docs/email/magic-link.html` |
| **Confirm signup** | `docs/email/confirm-signup.html` |

Keep the `{{ .ConfirmationURL }}` placeholder intact — Supabase fills it in. The
editor is HTML-only, so the matching `.txt` files are only needed if you send via
the Resend API directly (e.g. a Supabase *Send Email* hook), where you can supply
both an HTML and a text part.

The brand cue is a headband motif baked right into the card — three full-width
stripes (cream / terracotta / cream) across the top — so there are no external
images to host or break.

> **Custom SMTP needs a domain you own.** Resend (and any provider) won't let you
> send from a free public domain like `gmail.com` — you must verify a domain you
> control (add its DKIM/SPF DNS records). To finish setup without a domain, either
> leave custom SMTP **off** (Supabase's built-in mailer, low rate limits) or use
> Resend's sandbox sender `onboarding@resend.dev`, which only delivers to your own
> Resend account email.

### 3c. (Optional, later) Social logins

Google, Apple and Facebook are not wired into the UI yet. The plumbing is already
there — `AuthProvider` exposes `signInWithGoogle()` — so enabling one later is
small:

1. **Google:** in the [Google Cloud Console](https://console.cloud.google.com)
   create an **OAuth client ID** (Web application), add Supabase's callback URL
   (`https://<your-project-ref>.supabase.co/auth/v1/callback`) as an authorized
   redirect URI, then paste the Client ID + secret into Supabase →
   **Authentication → Providers → Google** and enable it. Finally add a button in
   `src/pages/Login.tsx` that calls `signInWithGoogle()`.
2. **Apple / Facebook:** enable the provider in Supabase, create the app in the
   respective developer console (Apple needs a paid $99/yr Apple Developer
   account), add the same callback URL, then add a button calling
   `signInWithOAuth({ provider: 'apple' | 'facebook' })`.

---

## 4. Environment variables & redeploy

The build auto-detects the Supabase integration's variables, so usually there's
nothing to add here. You just need to confirm two things:

1. **Scope:** the integration adds vars to Production by default. To test on a
   **Preview** deployment (a branch/PR), the vars must also apply to the Preview
   environment. In Vercel → **Settings → Environment Variables**, check that
   `SUPABASE_URL` and `SUPABASE_ANON_KEY` have **Preview** (and Production)
   ticked; edit their environments if not.
2. **Redeploy after any change.** Env vars are read at **build time**, so after
   installing the integration or editing vars you must **redeploy** the target
   deployment (Deployments → ⋯ → **Redeploy**) — an existing build won't pick them
   up. After redeploy, the build log should print
   `[coach-claude] Supabase credentials detected — auth enabled`.

If you build outside Vercel, you can instead set `VITE_SUPABASE_URL` /
`VITE_SUPABASE_ANON_KEY` explicitly (they take priority).

For **local development**, copy `.env.example` to `.env.local` and fill in the
values (find them in Supabase → **Project Settings → API**). Either the `VITE_`
or the plain `SUPABASE_*` names work. Without them the app runs in offline
single-user "local mode".

---

## 5. Migrate your existing data

Your current data lives in `data/profile.json`, `data/sessions.json` and
`data/plans.json`. Import it into your new account once:

1. **Sign in to the deployed app once** with the account that should own the data.
   This creates your user row.
2. In Supabase → **Authentication → Users**, copy your user's **UUID**.
3. Get the **service role key** from **Project Settings → API** (keep it secret).
4. Run the importer from the repo root. **Easiest (any OS)** — put the three
   values in `.env.local` (uncomment the `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
   and `TARGET_USER_ID` lines and fill them in), then let Node load the file:

   ```bash
   node --env-file=.env.local scripts/migrate-data.mjs
   ```

   <details><summary>Or pass them inline (shell-specific)</summary>

   **macOS / Linux (bash or zsh)** — a `\` at the very end of each line continues
   it (no spaces after the `\`); the shell shows a `>` prompt for each line:

   ```bash
   SUPABASE_URL=https://<ref>.supabase.co \
   SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
   TARGET_USER_ID=<your-user-uuid> \
   node scripts/migrate-data.mjs
   ```

   …or as one line: `SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… TARGET_USER_ID=… node scripts/migrate-data.mjs`

   **Windows PowerShell** — set each var first (continuation char is a backtick `` ` ``):

   ```powershell
   $env:SUPABASE_URL="https://<ref>.supabase.co"
   $env:SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"
   $env:TARGET_USER_ID="<your-user-uuid>"
   node scripts/migrate-data.mjs
   ```
   </details>

5. Reload the app (or Settings → **Restore from cloud**) — your profile, plans
   and history should appear.

The legacy `data/*.json` files stay in the repo for now as a backup; they're no
longer read by the app and can be deleted in a later release.

---

## 6. Smoke-test

- [ ] Visit the production URL → you're redirected to the login screen.
- [ ] Sign in with **email magic-link** → receive the email, link signs you in,
      and you land on Home with your data.
- [ ] Sign out → redirected back to login; local data cleared.
- [ ] Plan → **Generate & Copy Prompt** → the prompt now contains your profile +
      a summarised history block (not an empty stub).
- [ ] Complete a session → Settings shows "Synced just now"; confirm a new row in
      Supabase `logged_sessions`.
- [ ] Sign in on a second device/browser → same data loads.
- [ ] Create a **second test account** → it sees an empty app, proving RLS
      isolation. (Delete the test user afterwards.)

---

## How plan generation changes

Previously Claude Code read your profile and history straight from `/data` in the
repo. With per-user data in the database, Claude can't do that, so the app now
builds a **self-contained prompt**: it embeds your profile plus a *summarised*
recent history (recent sessions, current working weights, PRs — capped so the
prompt stays focused). The programming rules and the WeekPlan JSON schema still
live in `CLAUDE.md`, so you paste the prompt into Claude with this repo available
and it applies the rules to the embedded data. See `src/lib/promptBuilder.ts` and
`src/lib/historySummary.ts`.
