-- ---------------------------------------------------------------------------
-- 0006_check_ins — weekly check-ins (v1.0.2). One row per check-in: the week it
-- reviewed, why it was offered, the answers, the actions the app applied and
-- the plain-English summary the next plan prompt embeds.
--
-- Same owner-only Row-Level Security as logged_sessions: a signed-in user can
-- only ever read and write their own rows. The rich object is JSONB so
-- src/types/index.ts (CheckIn) stays the single source of truth.
--
-- Apply before deploying v1.0.2. Until it exists, check-ins stay on the device
-- (the app tolerates the missing table when pulling) and the sync indicator
-- shows an error when one is saved.
-- ---------------------------------------------------------------------------
create table if not exists public.check_ins (
  user_id         uuid        not null references auth.users (id) on delete cascade,
  id              text        not null,
  week_start_date date        not null,
  trigger         text        not null,
  check_in        jsonb       not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  primary key (user_id, id)
);

create index if not exists check_ins_user_week_idx
  on public.check_ins (user_id, week_start_date desc);

alter table public.check_ins enable row level security;

drop policy if exists "check_ins are owner-only" on public.check_ins;
create policy "check_ins are owner-only"
  on public.check_ins for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

notify pgrst, 'reload schema';
