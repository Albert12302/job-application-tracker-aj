-- app_errors and security_events (SPEC §7.7).
-- These are written BY THE CLIENT, so every column is treated as untrusted:
-- user_id comes from the token not the payload, values are hard-truncated
-- rather than rejected, inserts are rate-limited, and there is NO select
-- policy for the user role at all.

create table public.app_errors (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid default auth.uid() references auth.users (id) on delete set null,
  message    text not null,
  stack      text,
  route      text,
  release    text,
  user_agent text,
  created_at timestamptz not null default now()
);

comment on table public.app_errors is
  'Insert-only. id is shown to the user, detail is not (§8). Read via dashboard or a service-role script only.';
comment on column public.app_errors.user_id is
  'Defaults to auth.uid(). Never sent by the client — a client-supplied id is a forgery (§7.7).';
comment on column public.app_errors.route is
  'Path only, query string stripped before reporting: ?q=... is user content (§7.7).';
comment on column public.app_errors.message is
  'Mapped error code or plain message. Never a raw Postgres error — constraint violations echo the offending value (§7.7).';

create table public.security_events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid default auth.uid() references auth.users (id) on delete set null,
  event_type text not null,
  outcome    text not null,
  created_at timestamptz not null default now(),
  constraint security_events_type check (event_type in (
    'sign_in_success', 'sign_in_failure', 'sign_out',
    'password_change', 'password_reset_request', 'password_reset_complete',
    'email_change', 'rate_limit_trip', 'permission_denied',
    'file_upload', 'file_delete', 'account_deletion'
  )),
  constraint security_events_outcome check (outcome in ('success', 'failure', 'denied'))
);

comment on table public.security_events is
  'Insert-only (§7.7). Source IP is deliberately absent: a client-reported IP is worthless, and the real one is in the Supabase Auth and edge logs.';

create index app_errors_created_idx      on public.app_errors (created_at desc);
create index security_events_created_idx on public.security_events (user_id, created_at desc);

-- Hard-truncate instead of rejecting: a failed error report must never mask
-- the error it was reporting (§7.7).
create or replace function public.clamp_app_error()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.message    = left(new.message, 1000);
  new.stack      = left(new.stack, 8000);
  new.route      = left(new.route, 200);
  new.release    = left(new.release, 100);
  new.user_agent = left(new.user_agent, 300);
  new.user_id    = auth.uid();   -- ignore anything the client sent
  return new;
end;
$$;

create trigger app_errors_clamp
  before insert on public.app_errors
  for each row execute function public.clamp_app_error();

-- A client's user_id is always replaced by its own auth.uid(). The service role
-- is the exception: the sign-in edge function writes sign_in_success for a user
-- who has no session yet, and its auth.uid() is null — forcing it would erase
-- the one thing the row is for.
create or replace function public.force_security_event_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.role() is distinct from 'service_role' then
    new.user_id = auth.uid();
  end if;
  return new;
end;
$$;

create trigger security_events_force_owner
  before insert on public.security_events
  for each row execute function public.force_security_event_owner();

-- Insert rate limit: 60 error rows per user per hour (§7.7). SECURITY DEFINER
-- is unavoidable here — the count has to read rows the user has no select
-- policy for. search_path pinned and every reference schema-qualified (§7.6),
-- and it returns nothing but a boolean decision.
create or replace function public.enforce_app_error_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null
     and (select count(*) from public.app_errors
          where user_id = auth.uid() and created_at > now() - interval '1 hour') >= 60 then
    raise exception 'error_report_rate_limited' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_app_error_rate_limit() from public;

create trigger app_errors_rate_limit
  before insert on public.app_errors
  for each row execute function public.enforce_app_error_rate_limit();

alter table public.app_errors      enable row level security;
alter table public.security_events enable row level security;

-- Insert only. No select, update, or delete policy for authenticated — a user
-- who can read this table reads other people's stack traces (§7.7).
create policy app_errors_insert_only on public.app_errors
  for insert to authenticated with check (true);

create policy security_events_insert_only on public.security_events
  for insert to authenticated with check (true);

-- 90-day retention (§7.7). Run nightly by pg_cron — migration
-- 20260916170641_schedule_log_purge.sql.
create or replace function public.purge_old_logs()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.app_errors      where created_at < now() - interval '90 days';
  delete from public.security_events where created_at < now() - interval '90 days';
$$;

-- anon too: Supabase grants new functions to anon directly, not through public.
revoke all on function public.purge_old_logs() from public, anon, authenticated;
