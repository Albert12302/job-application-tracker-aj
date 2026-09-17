-- Append-only status history (SPEC §2). Written by exactly one code path,
-- services/change-status.ts (§9.1) — deliberately NOT by a database trigger,
-- because a trigger plus the service would be two writers.

create table public.status_history (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id) on delete cascade,
  from_status    public.application_status,
  to_status      public.application_status not null,
  changed_at     timestamptz not null default now(),
  -- A row that records no change is noise; §2 says none is written.
  constraint status_history_actual_change check (from_status is distinct from to_status)
);

comment on table public.status_history is
  'Append-only. from_status is null for the row written at creation (§2). No update or delete policy exists for the user role by design — rows leave only via the application cascade.';

create index status_history_application_idx on public.status_history (application_id, changed_at);

alter table public.status_history enable row level security;

-- auth.uid() is wrapped in a select so Postgres evaluates it once per statement
-- rather than once per row (Supabase's auth_rls_initplan lint). Same result.
create policy status_history_select_own on public.status_history
  for select to authenticated using (
    exists (select 1 from public.applications a
            where a.id = status_history.application_id and a.user_id = (select auth.uid()))
  );

create policy status_history_insert_own on public.status_history
  for insert to authenticated with check (
    exists (select 1 from public.applications a
            where a.id = status_history.application_id and a.user_id = (select auth.uid()))
  );

-- No update policy. No delete policy. Intentional (§2) — with RLS enabled and
-- no policy, both operations are denied for the authenticated role.
