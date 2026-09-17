-- The one status-change path (§9.1), enforced by the database rather than by
-- convention.
--
-- Until now the rule "every status has its history row" held only because the
-- app happened to call the two functions. The table permissions still let a
-- signed-in client, with the anon key and its own token:
--   - update applications.status directly — a status with no history row;
--   - insert into applications directly — an application with no creation row;
--   - insert status_history rows directly — any statuses, any changed_at,
--     skewing stats (§4.5). History cannot be backfilled or corrected.
--
-- Neither permission can simply be revoked: change_application_status and
-- create_application run with invoker rights (§7.6), so they need both. Instead
-- each function sets a transaction-local flag, and triggers refuse those three
-- writes from a signed-in caller without it. The client cannot set the flag:
-- set_config lives in pg_catalog, and the Data API exposes only public and
-- graphql_public (config.toml [api] schemas).
--
-- AFTER triggers, deliberately. Row-level security's WITH CHECK runs after
-- BEFORE triggers, so a BEFORE guard would answer first and the RLS tests in
-- e2e/security.spec.ts would pass on the guard instead of the policy. As AFTER
-- triggers, RLS still decides first; the guard only refuses what RLS allowed.
--
-- The service role and seed.sql have no auth.uid() and are not the client, so
-- they pass — the same line consume_rate_limit draws.

create or replace function public.guard_status_writes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null
     and current_setting('app.status_write', true) is distinct from 'on' then
    raise exception 'status_change_path' using
      detail = tg_table_name,
      hint   = 'SPEC 9.1: change_application_status or create_application';
  end if;
  return null;   -- AFTER trigger: the return value is ignored
end;
$$;

revoke all on function public.guard_status_writes() from public, anon;

create trigger applications_status_path_insert
  after insert on public.applications
  for each row execute function public.guard_status_writes();

create trigger applications_status_path_update
  after update of status on public.applications
  for each row when (old.status is distinct from new.status)
  execute function public.guard_status_writes();

create trigger status_history_status_path_insert
  after insert on public.status_history
  for each row execute function public.guard_status_writes();

-- The two writers, unchanged from 20260911165950 but for the first statement.

create or replace function public.change_application_status(
  p_application_id uuid,
  p_status         public.application_status
)
returns public.applications
language plpgsql
set search_path = ''
as $$
declare
  v_row  public.applications;
  v_from public.application_status;
begin
  -- Opens the guard above for this transaction only (is_local = true).
  perform pg_catalog.set_config('app.status_write', 'on', true);

  -- Lock the row and read the status it has now, not the one the client last
  -- saw: another tab or device may have moved it, and from_status must be true.
  select * into v_row
    from public.applications
   where id = p_application_id
     for update;

  if not found then
    -- Missing and someone else's look the same here, as they do under RLS (§8.2).
    raise exception 'application_not_found' using errcode = 'P0002';
  end if;

  -- §2: no history row when the status is unchanged.
  if v_row.status = p_status then
    return v_row;
  end if;

  v_from := v_row.status;

  update public.applications
     set status = p_status
   where id = p_application_id
  returning * into v_row;

  insert into public.status_history (application_id, from_status, to_status)
  values (p_application_id, v_from, p_status);

  return v_row;
end;
$$;

create or replace function public.create_application(
  p_date_applied timestamptz,
  p_company      text,
  p_position     text,
  p_status       public.application_status,
  p_referral     boolean,
  p_location     text default null,
  p_description  text default null,
  p_first_note   text default null
)
returns public.applications
language plpgsql
set search_path = ''
as $$
declare
  v_row public.applications;
begin
  -- Opens the guard above for this transaction only (is_local = true).
  perform pg_catalog.set_config('app.status_write', 'on', true);

  -- No user_id parameter: the column defaults to auth.uid(), and the insert
  -- policy checks it (§7.2).
  insert into public.applications (date_applied, company, position, location, description, status, referral)
  values (p_date_applied, p_company, p_position, p_location, p_description, p_status, p_referral)
  returning * into v_row;

  -- §2: the creation row, from_status null.
  insert into public.status_history (application_id, from_status, to_status)
  values (v_row.id, null, v_row.status);

  -- The Add form's first note (§4.3).
  if p_first_note is not null then
    insert into public.notes (application_id, body)
    values (v_row.id, p_first_note);
  end if;

  return v_row;
end;
$$;
