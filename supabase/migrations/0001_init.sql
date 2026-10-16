-- Coach Clawde v0.2.0 — multi-user schema
--
-- Run this in the Supabase SQL editor (or via the Supabase CLI) once, after
-- creating the project. Every table is owner-scoped with Row-Level Security so a
-- signed-in user can only ever read and write their own rows.
--
-- Data shapes mirror src/types/index.ts. The rich, frequently-changing objects
-- (WeekPlan / LoggedSession / ProgramConfig) are stored as JSONB so the
-- TypeScript types stay the single source of truth; only the columns we query or
-- index are promoted out of the JSON.

-- ---------------------------------------------------------------------------
-- profiles — one row per user. This is the "background" Clawde needs to plan.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id                 uuid primary key references auth.users (id) on delete cascade,
  name               text        not null default 'Athlete',
  sex                text        not null default 'male',
  height_cm          numeric     not null default 0,
  weight_kg          numeric     not null default 0,
  program_week       integer     not null default 1,
  injuries           jsonb       not null default '[]'::jsonb,
  goals              jsonb       not null default '[]'::jsonb,
  fitness_background text        not null default '',
  gym_access         boolean     not null default true,
  dietary_notes      jsonb       not null default '[]'::jsonb,
  program            jsonb,
  updated_at         timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- week_plans — the generated WeekPlans. (user_id, id) is the natural key; `id`
-- is the app-generated WeekPlan.id (e.g. "plan-2026-06-16"), which is only
-- unique per user, so the primary key is composite.
-- ---------------------------------------------------------------------------
create table if not exists public.week_plans (
  user_id         uuid        not null references auth.users (id) on delete cascade,
  id              text        not null,
  week_start_date date        not null,
  available_days  jsonb       not null default '[]'::jsonb,
  user_notes      text        not null default '',
  plan            jsonb       not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  primary key (user_id, id)
);

create index if not exists week_plans_user_week_idx
  on public.week_plans (user_id, week_start_date desc);

-- ---------------------------------------------------------------------------
-- logged_sessions — completed/in-progress workouts. Same composite-key pattern.
-- ---------------------------------------------------------------------------
create table if not exists public.logged_sessions (
  user_id      uuid        not null references auth.users (id) on delete cascade,
  id           text        not null,
  week_plan_id text,
  date         date        not null,
  type         text        not null,
  status       text        not null,
  session      jsonb       not null,
  updated_at   timestamptz not null default now(),
  primary key (user_id, id)
);

create index if not exists logged_sessions_user_date_idx
  on public.logged_sessions (user_id, date desc);

-- ---------------------------------------------------------------------------
-- Row-Level Security — each user sees only their own rows.
-- ---------------------------------------------------------------------------
alter table public.profiles        enable row level security;
alter table public.week_plans      enable row level security;
alter table public.logged_sessions enable row level security;

-- profiles: keyed on the user's own id.
create policy "profiles are owner-only"
  on public.profiles for all
  using (id = auth.uid())
  with check (id = auth.uid());

-- week_plans: keyed on user_id.
create policy "week_plans are owner-only"
  on public.week_plans for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- logged_sessions: keyed on user_id.
create policy "logged_sessions are owner-only"
  on public.logged_sessions for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Auto-provision an empty profile row whenever a new auth user signs up, so the
-- app always has a profile to read/upsert against.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', 'Athlete'))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
