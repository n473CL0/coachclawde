---
description: Walk through the database-only cutover and beta launch, verifying each step
allowed-tools: Bash(node:*), Bash(npm:*), Bash(git:*), Bash(ls:*), Bash(test:*), Read, Write, Edit
---

You are walking the operator through taking Coach Claude database-only and
launching the closed beta. Work through the checklist below **in order**, one
step at a time.

How to run it:

- Verify each step yourself with a command wherever that is possible, rather
  than asking whether it was done. Report what you actually observed.
- Stop and hand back when a step needs the operator to act outside the repo (the
  Supabase dashboard, copying a key). Tell them exactly what to do, wait, then
  verify before moving on.
- If a step is already done, say so in one line and move to the next.
- Some steps have a **gate**: do not proceed past it until it passes. Say why if
  you stop.
- Never print the contents of `.env.local`, any key, or any generated password
  into your replies. Report only whether a value is present.

Start by running `node --env-file=.env.local scripts/check-setup.mjs` if
`.env.local` exists — it answers several steps at once. Then report a summary of
where things stand before starting on the first incomplete step.

---

## 1. Local environment

- `node -v` — must be **20.6 or newer** (22 LTS recommended). The scripts use
  `--env-file`, which does not exist before 20.6.
- `git rev-parse --abbrev-ref HEAD` — should be `claude/confident-cerf-drygyr`.
  That branch has the scripts and the migration; `main` does not yet.
- `npm install` if `node_modules` is missing.
- `npm run lint` and `npm run build` — both must pass clean.

**Gate:** do not continue until lint and build are green.

## 2. `.env.local`

Check which of these are present (never print the values):

```
VITE_SUPABASE_URL           # the browser app
VITE_SUPABASE_ANON_KEY      # the browser app
SUPABASE_URL                # the Node scripts
SUPABASE_SERVICE_ROLE_KEY   # the Node scripts — bypasses RLS, keep it secret
TARGET_USER_ID              # only for the legacy import, filled in at step 4
```

`VITE_ENABLE_MAGIC_LINK` should stay unset. Magic-link sign-in is hidden unless
it is exactly `'true'`, which is deliberate — passwords are handed out directly,
and Supabase's built-in mailer only allows a couple of emails an hour.

All are in Supabase → **Project Settings → API**. If the file is missing, create
it from `.env.example` and ask the operator to paste the values in themselves —
do not ask them to send you a key.

Confirm `.env.local` is ignored by git (`git check-ignore -v .env.local`). The
service-role key must never be committed, and must never be put on a `VITE_`
variable, which would inline it into the public bundle.

## 3. Database migrations

Ask the operator to run each file in `supabase/migrations/` **in numerical
order** in the Supabase SQL editor: `0001_init.sql`, `0002_onboarding.sql`,
`0003_fix_new_user_onboarding.sql`, `0004_profile_birth_date.sql`. If the project is
already live, only the ones it hasn't run yet are new. **`0004` must be applied
before the build that collects date of birth is deployed** — otherwise every profile save
fails on the missing `birth_date` column. Check it with:

```sql
select count(*) = 1 as has_0004 from information_schema.columns
 where table_schema = 'public' and table_name = 'profiles' and column_name = 'birth_date';
```

Then have them run this in the SQL editor and report the result:

```sql
select prosrc like '%onboarded%' as has_0003
  from pg_proc where proname = 'handle_new_user';
```

`has_0003 = true` means 0003 is applied.

**Gate:** do not create any beta account until this returns true. Without 0003
the signup trigger marks new profiles as already-onboarded, so every tester
skips the onboarding slideshow and lands in the app with an empty profile — no
injuries, no goals. Plan generation programs around exactly that data.

## 4. Import the operator's own training data

Their training history is in the legacy JSON files, not the database — the app
was running on the GitHub-storage admin mode until this change.

**Gate:** this must happen before the new build is deployed, or they will sign
in to an empty app.

1. They sign in to the app once with their real email, to create the user row.
2. Supabase → **Authentication → Users** → copy the UUID into `TARGET_USER_ID`
   in `.env.local`.
3. Restore the files and import:

   ```bash
   DEL=$(git log --diff-filter=D --format=%H -1 -- data/)
   git checkout "$DEL^" -- data/
   node --env-file=.env.local scripts/migrate-data.mjs
   ```

   (`$DEL` is the commit that removed the files; its parent still has them. The
   `v0.2.0-final-data` tag from step 7 points at the same content, if it exists
   by the time you read this.)

   Expect `✓ profile imported`, `✓ 7 week plan(s) imported`,
   `✓ 20 logged session(s) imported`.
4. Verify with `node --env-file=.env.local scripts/check-setup.mjs` — the legacy
   data section should show the profile plus 7 plans and 20 sessions.
5. Clean up, since `data/` is no longer tracked:

   ```bash
   git rm -r --cached data/
   rm -rf data
   ```

   Confirm `git status` is clean afterwards.

## 5. Create the beta accounts

Ask which email addresses to provision, then:

```bash
node --env-file=.env.local scripts/create-beta-user.mjs <email> [<email> ...]
```

The script prints a table with one generated password per account. **Those
passwords are shown once and stored nowhere** — tell the operator to copy them
out of their terminal now. Do not repeat them back in your replies, and do not
write them to a file in the repo.

Testers get their password directly from the operator; there is no self-service
password reset while magic links are hidden. When someone is locked out, the
operator re-runs the script with `--reset` and sends them the new one.

Verify with `scripts/check-setup.mjs`: each new account should appear as
"will onboard on first sign-in".

## 6. Deploy

Confirm the Vercel project has `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
set, then redeploy. Smoke-test against §6 of `docs/DEPLOYMENT.md` — in
particular, that a fresh account lands on the **onboarding slideshow** rather
than dropping into Home with a blank profile, and that the login screen shows
only the password fields (no "email me a sign-in link" option).

## 7. Tag the legacy data and merge

Tag the last commit that still carries the legacy data files, so the import in
step 4 has a stable handle after they are removed:

```bash
git tag -a v0.2.0-final-data \
  "$(git log --diff-filter=D --format=%H -1 -- data/)^" \
  -m "Legacy single-user data, before database-only"
git push origin v0.2.0-final-data
```

Then merge the pull request normally. The branch sits directly on top of `main`,
so it is an ordinary fast-forward — **no force-push, and nothing to rewrite.**

## 8. Loose ends

Mention these once, at the end — don't act on them without being asked:

- Two unmerged branches claim migration numbers this change took. When
  `claude/beta-feedback-banner-modal-uazdpq` (feedback sheet) and
  `claude/iphone-timer-notifications-8m7aon` (rest-timer push) land, renumber
  their `0003`/`0004` migrations to `0005`/`0006` (`0004` is now
  `0004_profile_birth_date.sql`).
- `claude/smtp-resend-to-brevo-1jn9ng` has a finished Brevo SMTP guide. Not
  needed for a password-based beta. Land it, then set
  `VITE_ENABLE_MAGIC_LINK=true`, when magic-link sign-in is wanted.
- `docs/DEVELOPING.md` still says "never weaken the shoulder/knee safety
  semantics", a leftover from before the programming rules went
  injury-agnostic.
