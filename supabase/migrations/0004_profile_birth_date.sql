-- ---------------------------------------------------------------------------
-- 0004_profile_birth_date — the athlete's date of birth, asked during
-- onboarding and editable in Settings. The app derives their age from it for
-- the plan prompt, so it never goes stale.
--
-- Nullable with no default: profiles that predate it simply have none. Apply
-- this BEFORE deploying the app build that writes `birth_date`, otherwise every
-- profile save fails with "Could not find the 'birth_date' column of
-- 'profiles' in the schema cache".
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists birth_date date check (birth_date >= date '1900-01-01');

-- Make the API (PostgREST) pick up the new column immediately.
notify pgrst, 'reload schema';
