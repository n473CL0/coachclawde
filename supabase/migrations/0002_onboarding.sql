-- ---------------------------------------------------------------------------
-- 0002_onboarding — adds first-run onboarding state to the profile.
--
-- `experience_level` stores the athlete's self-rated training experience and
-- `onboarded` gates the first-run onboarding slideshow. Existing profiles
-- predate onboarding, so `onboarded` defaults to TRUE — backfilling every
-- current row as already-onboarded — and only brand-new accounts (which have
-- no row until they finish onboarding) ever see the slideshow.
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists experience_level text,
  add column if not exists onboarded boolean not null default true;
