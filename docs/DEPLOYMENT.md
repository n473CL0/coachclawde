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

> **Running this from Claude Code?** `/go-live` walks these steps in order,
> verifies each one as it goes, and refuses to create beta accounts before
> migration 0003 is applied. `node --env-file=.env.local scripts/check-setup.mjs`
> reports the current state of the project on its own.

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
2. Run **every file in [`supabase/migrations/`](../supabase/migrations/) in
   numerical order** — paste each one's contents and click **Run**:
   `0001_init.sql`, `0002_onboarding.sql`, `0003_fix_new_user_onboarding.sql`,
   `0004_profile_age.sql`.
3. Confirm under **Table Editor** that `profiles`, `week_plans` and
   `logged_sessions` exist, and under **Authentication → Policies** that each has
   an "owner-only" RLS policy.

`0001` installs a trigger that auto-creates a `profiles` row whenever someone
signs up, so the app always has a profile to read. **`0003` is not optional** —
without it that row is marked as already-onboarded, and every new account skips
the onboarding slideshow and lands in the app with an empty profile (no
injuries, no goals), which the plan generator depends on.

**`0004` must be applied before deploying the build that asks for age.** The
app writes an `age` column on every profile save; without the column each save
fails with an unknown-column error.

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

### 3b. Sign-in methods

The login screen offers two paths against the same Supabase **Email** provider
(Supabase → **Authentication → Providers → Email**, enabled by default):

- **Email + password** — the primary path, and what the beta runs on. You create
  each account yourself (see [§7](#7-create-beta-accounts)) and hand out the
  credentials, so **no email is sent and nothing can be rate-limited or
  spam-filtered**. Accounts are created pre-confirmed.
- **Magic link** — **hidden by default.** The code is wired up, but the option
  only appears when `VITE_ENABLE_MAGIC_LINK` is exactly `true`. Supabase's
  built-in mailer allows only a couple of messages an hour, so offering the
  button without real SMTP behind it mostly promises testers an email that
  never arrives.

**The closed beta needs no email setup at all** — password accounts never send
one, so there is nothing to rate-limit and no SMTP bill.

To turn magic links on later: configure **custom SMTP** under **Project Settings
→ Auth → SMTP Settings** (Brevo, Resend, Postmark, SendGrid…), then set
`VITE_ENABLE_MAGIC_LINK=true` in Vercel (and `.env.local` for dev) and redeploy.
`docs/email/` holds the branded templates, and the
`claude/smtp-resend-to-brevo-1jn9ng` branch has a full Brevo walkthrough.

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

## 5. Migrate the legacy single-user data

> Only relevant if you're carrying over the original file-based data. The
> `data/*.json` files were removed from the repo when the app went
> database-only; restore them from the `v0.2.0-final-data` tag first:
>
> ```bash
> mkdir -p data
> git show v0.2.0-final-data:data/profile.json  > data/profile.json
> git show v0.2.0-final-data:data/sessions.json > data/sessions.json
> git show v0.2.0-final-data:data/plans.json    > data/plans.json
> ```

Import them into an account once:

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

Once the data is in and the app shows it, delete the restored `data/` directory
again — it isn't tracked any more, and the tag keeps the originals safe.

---

## 6. Smoke-test

- [ ] Visit the production URL → you're redirected to the login screen.
- [ ] Sign in with **email + password** → you land on Home with your data.
- [ ] The login screen shows **only** the password fields — no "email me a
      sign-in link" option — unless you deliberately set
      `VITE_ENABLE_MAGIC_LINK=true`.
- [ ] Sign out → redirected back to login; local data cleared.
- [ ] Plan → **Generate & Open Claude** → the prompt now contains your profile +
      a summarised history block (not an empty stub).
- [ ] Complete a session → Settings shows "Synced just now"; confirm a new row in
      Supabase `logged_sessions`.
- [ ] Sign in on a second device/browser → same data loads.
- [ ] Create a **second test account** → it sees an empty app, proving RLS
      isolation, **and it starts on the onboarding slideshow** rather than
      dropping straight into Home with a blank profile. (Delete the test user
      afterwards.)

---

## 7. Create beta accounts

Beta testers get an email + password you generate for them. Nothing is emailed by
Supabase, so there's no SMTP dependency and no rate limit to hit.

1. Get the **service role key** from **Project Settings → API**. It bypasses RLS
   — keep it out of the client, out of git, and off any `VITE_` variable.
2. From the repo root, create the accounts:

   ```bash
   SUPABASE_URL=https://<ref>.supabase.co \
   SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
   node scripts/create-beta-user.mjs alice@example.com bob@example.com
   ```

   Or, with the values in `.env.local`:

   ```bash
   node --env-file=.env.local scripts/create-beta-user.mjs alice@example.com
   ```

3. The script prints one line per account with its generated password:

   ```
   Beta accounts

     alice@example.com   k7Qm2vXpR4wL   created
     bob@example.com     9fTbN3sZyH8c   created
   ```

   **Passwords are shown once and are not stored anywhere** — copy them before
   closing the terminal. Send each tester their own email + password.

Useful flags:

| Flag | Effect |
| --- | --- |
| `--password <pw>` | Use one password you choose for every account listed, instead of generating them. |
| `--reset` | The account already exists → set its password rather than skipping it. Use when a tester loses theirs. |

Each new account starts on the **onboarding slideshow**, which is what collects
their injuries, goals and program preferences — the inputs the plan generator
depends on. Tell testers to complete it before asking for their first plan.

To remove a tester afterwards, delete the user in Supabase → **Authentication →
Users**; their profile, plans and sessions cascade away with them.

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
