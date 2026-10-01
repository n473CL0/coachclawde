-- ---------------------------------------------------------------------------
-- 0004_profile_age — stores the athlete's age, asked during onboarding.
--
-- Nullable with no default: profiles that predate it simply have no age, and
-- the plan prompt shows "—". Apply this BEFORE deploying the app build that
-- writes `age`, otherwise every profile upsert fails on the unknown column.
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists age integer check (age is null or (age > 0 and age < 130));
