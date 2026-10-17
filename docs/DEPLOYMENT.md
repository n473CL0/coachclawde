# Deploying Coach Clawde

How to run your own copy of Coach Clawde: a Vite single-page app on Vercel,
with Supabase for the database, sign-in and per-user access control.

> **Architecture in one line:** the SPA deploys to Vercel as static files;
> **Supabase** provides Postgres, authentication and Row-Level Security, so each
> athlete only ever sees their own rows. There is no custom server: the browser
> talks to Supabase directly with the public anon key, and RLS does the access
> control.

The steps:

1. Create the Supabase project (via the Vercel Marketplace)
2. Create the database schema
3. Configure authentication
4. Set environment variables and redeploy
5. Create beta accounts
6. Smoke-test

`node --env-file=.env.local scripts/check-setup.mjs` reports where a project
stands at any point: which variables are set, whether the schema is in place,
and every account with its onboarding state. It is read-only.

---

## 1. Add Supabase via the Vercel Marketplace

1. In the [Vercel dashboard](https://vercel.com), import the repo as a new
   project (framework preset: Vite; `vercel.json` already sets the build).
2. Open the project's **Integrations** / **Marketplace** tab → search
   **Supabase** → **Add Integration**.
3. Choose to **create a new Supabase project** and connect it to this Vercel
   project. Pick a region near your athletes.
4. The integration adds `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY` and friends to the Vercel project.

> ℹ️ The build (`vite.config.ts`) picks up the integration's `SUPABASE_URL` /
> `SUPABASE_ANON_KEY` (and Next-style `NEXT_PUBLIC_*`) names, so you don't need
> to add `VITE_` aliases. Building somewhere else? Set `VITE_SUPABASE_URL` /
> `VITE_SUPABASE_ANON_KEY` explicitly; they take priority.

You now have a Supabase dashboard at https://supabase.com/dashboard, where most
of the remaining steps happen.

---

## 2. Create the database schema

1. Supabase → **SQL Editor** → **New query**.
2. Run **every file in [`supabase/migrations/`](../supabase/migrations/) in
   numerical order** (`0001` … `0006`): paste each one's contents, **Run**.
3. Check under **Table Editor** that `profiles`, `week_plans`,
   `logged_sessions` and `check_ins` exist, and under **Authentication →
   Policies** that each has an owner-only RLS policy.

Why each one matters:

| Migration | What it does |
| --- | --- |
| `0001_init` | The tables, owner-only RLS, and a trigger that creates a `profiles` row for every new user. |
| `0002_onboarding` | The `onboarded` flag (plus `experience_level`) that sends new athletes through the onboarding chat. |
| `0003_fix_new_user_onboarding` | **Not optional.** Without it, new accounts skip onboarding and land in the app with an empty profile (no injuries, no goals), which plan generation depends on. |
| `0004_profile_birth_date` | The `birth_date` column. Every profile save writes it, so saves fail without it. |
| `0005_goal_profile` | The `goal_profile` column (goal, event, constraints, health flags). Same failure mode as `0004`. |
| `0006_check_ins` | The weekly check-ins table. Without it check-ins stay on the device and the sync indicator shows an error. |

*(Prefer the CLI? `npm i -g supabase`, `supabase link --project-ref <ref>`,
then `supabase db push`.)*

---

## 3. Configure authentication

### Site URL and redirect URLs

Supabase → **Authentication → URL Configuration**:

- **Site URL:** your production URL, e.g. `https://coachclawde.vercel.app`.
- **Redirect URLs:** the app asks Supabase to send people back to the origin
  they signed in from (`redirectTo = window.location.origin`). Supabase only
  honours that if the origin matches an entry here; otherwise it silently falls
  back to the Site URL. Add (wildcards are supported):

  ```
  http://localhost:5173/**
  https://coachclawde.vercel.app/**
  https://coach-clawde-git-*-<your-vercel-scope>.vercel.app/**
  https://coach-clawde-*-<your-vercel-scope>.vercel.app/**
  ```

  The third line covers the stable per-branch preview alias (the easiest URL
  to test against); the fourth covers per-deployment URLs. Replace
  `<your-vercel-scope>` with your Vercel username or team slug.

### Sign-in methods

The login screen uses Supabase's **Email** provider (enabled by default):

- **Email + password**: the primary path, and what the beta runs on. You
  create each account yourself ([§5](#5-create-beta-accounts)) and hand out the
  credentials, so no email is ever sent: nothing to rate-limit, nothing to land
  in spam, no SMTP bill.
- **Magic link**: implemented but **hidden** unless `VITE_ENABLE_MAGIC_LINK`
  is exactly `true`. Supabase's built-in mailer allows only a couple of emails
  an hour, so turn it on only after configuring custom SMTP under **Project
  Settings → Auth → SMTP Settings** (Brevo, Resend, Postmark…). Custom SMTP
  needs a sending domain you own.

### Branded email templates

For magic links or sign-up confirmation emails, paste the templates in
[`docs/email/`](email/) into Supabase → **Authentication → Email Templates**:

| Supabase template | File |
| --- | --- |
| **Magic Link** | `docs/email/magic-link.html` |
| **Confirm signup** | `docs/email/confirm-signup.html` |

Keep the `{{ .ConfirmationURL }}` placeholder intact. The `.txt` versions are
for providers that take a plain-text part as well.

### Social logins (optional)

`AuthProvider` already exposes `signInWithGoogle()`. To offer it: create an
OAuth client in the [Google Cloud Console](https://console.cloud.google.com)
with `https://<your-project-ref>.supabase.co/auth/v1/callback` as an authorised
redirect URI, paste the client ID and secret into Supabase → **Authentication →
Providers → Google**, and add a button to `src/pages/Login.tsx`. Apple and
Facebook work the same way through `signInWithOAuth`.

---

## 4. Environment variables

| Variable | Where | What it does |
| --- | --- | --- |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | Vercel, `.env.local` | The browser's Supabase client. Safe to expose: RLS gates the anon key. Without them the app runs in offline single-user "local mode". |
| `VITE_ENABLE_MAGIC_LINK` | Vercel, `.env.local` | `true` shows the magic-link option. Anything else hides it. |
| `VITE_BETA_FEEDBACK_URL` | Vercel, `.env.local` | Your testers' WhatsApp (or any) group link, shown as a tile on Home. Unset hides the tile. Kept out of the repo because anyone with an invite link can join. |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | `.env.local` only | For the operator scripts. The service-role key **bypasses RLS**: never commit it and never give it a `VITE_` prefix. |

All `VITE_` values are read at **build time**:

1. In Vercel → **Settings → Environment Variables**, tick **Production** and
   **Preview** for each one you set.
2. **Redeploy** after any change (Deployments → ⋯ → **Redeploy**); an existing
   build won't pick it up. The build log prints
   `[coach-clawde] Supabase credentials detected — auth enabled` when the
   Supabase pair is present.

For local development, copy `.env.example` to `.env.local` and fill it in from
Supabase → **Project Settings → API**.

---

## 5. Create beta accounts

Testers get an email and password you generate for them. Accounts are created
already-confirmed, so nothing is emailed.

```bash
node --env-file=.env.local scripts/create-beta-user.mjs alice@example.com bob@example.com
```

The script prints each account with its generated password:

```
Beta accounts

  alice@example.com   k7Qm2vXpR4wL   created
  bob@example.com     9fTbN3sZyH8c   created
```

**Passwords are shown once and stored nowhere**, so copy them before closing
the terminal.

| Flag | Effect |
| --- | --- |
| `--password <pw>` | Use one password you choose for every account listed. |
| `--reset` | The account already exists → set its password instead of skipping it (a tester lost theirs). |

Each new account starts in the onboarding chat, which collects the goal,
injuries and preferences that plan generation depends on. To remove a tester,
delete the user in Supabase → **Authentication → Users**; their profile, plans,
sessions and check-ins cascade away with them.

---

## 6. Smoke-test

- [ ] Visit the production URL → you're redirected to the login screen.
- [ ] The login screen shows only the password fields (unless you enabled
      magic links).
- [ ] Sign in → a new account starts in the onboarding chat; finishing it lands
      you on Home.
- [ ] Plan → **Generate & Open Claude** → the prompt contains your profile and
      a summarised training history.
- [ ] Import a plan, complete a session → Settings shows "Synced just now" and a
      new row appears in `logged_sessions`.
- [ ] Sign in on a second device → the same data loads.
- [ ] Sign out → back to login, local data cleared.
- [ ] A second test account sees an empty app (RLS isolation works). Delete it
      afterwards.

---

## How plan generation works

There is no AI call on the server. The app builds a **self-contained prompt**
(`src/lib/promptBuilder.ts`): the athlete's profile and goal, a *summarised*
recent history (`src/lib/historySummary.ts`: recent sessions, working weights,
PRs, the latest check-in, capped so the prompt stays focused), the programming
rules and the `WeekPlan` JSON schema. It opens in the Claude app (or claude.ai)
pre-filled, the athlete sends it, and pastes the JSON reply back into the app.
`CLAUDE.md` holds the full, general version of the rules and schema.
