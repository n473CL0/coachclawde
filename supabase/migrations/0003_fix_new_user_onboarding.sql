-- ---------------------------------------------------------------------------
-- 0003_fix_new_user_onboarding — make brand-new accounts actually onboard.
--
-- 0002 added `onboarded` with a DEFAULT of TRUE so that every profile existing
-- at the time was backfilled as already-onboarded. That assumed new accounts
-- had no profile row until they finished the slideshow — but the
-- `on_auth_user_created` trigger from 0001 inserts one the moment a user signs
-- up, so new users picked up the TRUE default and skipped onboarding entirely,
-- landing in the app with an empty 'Athlete' profile: no injuries, no goals, no
-- program preferences.
--
-- That matters beyond a bad first run. Plan generation is built on the
-- athlete's stated injuries (see the injury-safety rule in CLAUDE.md), and an
-- empty profile silently produces plans with nothing to program around.
--
-- The fix: have the trigger write `onboarded = false` explicitly. The column
-- default stays TRUE so the 0002 backfill semantics are unchanged for any row
-- inserted by another path (e.g. the legacy data import).
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, onboarded)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', 'Athlete'), false)
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Repair any account created between 0002 and this migration that was marked
-- onboarded without ever having onboarded. An untouched auto-provisioned row
-- still has every profile field at its default, which no real athlete's does.
update public.profiles
   set onboarded = false
 where onboarded
   and fitness_background = ''
   and injuries = '[]'::jsonb
   and goals    = '[]'::jsonb
   and program is null
   and height_cm = 0
   and weight_kg = 0;
