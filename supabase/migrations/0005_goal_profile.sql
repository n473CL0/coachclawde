-- ---------------------------------------------------------------------------
-- 0005_goal_profile — the athlete's GoalProfile (v1.1): why they're here (an
-- event and its date, a physique change, a sport…), where they're starting
-- from, their recent result for pace zones and their health-screen FLAGS.
--
-- Health answers are special-category data under UK GDPR. The app stores only
-- flags here ("injury", "condition", "pregnancy", "cardiac"), never diagnoses
-- or free-text medical detail, and the athlete can clear them in Settings.
-- The row is covered by the existing owner-only RLS policy on `profiles`.
--
-- Nullable with no default: profiles onboarded before v1.1 have none, and the
-- app offers those athletes a short "upgrade your goal" check-in instead.
-- Apply this BEFORE deploying the v1.1 build, otherwise every profile save
-- fails with "Could not find the 'goal_profile' column of 'profiles' in the
-- schema cache".
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists goal_profile jsonb;

notify pgrst, 'reload schema';
