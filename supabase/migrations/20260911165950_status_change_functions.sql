-- The two writers of status_history (SPEC §2). Each is one transaction, so a
-- status and the row recording it commit together or not at all. Done as two
-- requests from the browser, a dropped connection or a write-limit trip
-- between them would leave a status with no history row — and history cannot
-- be backfilled.
--
-- Invoker rights, not SECURITY DEFINER (§7.6): both run as the calling user,
-- so every RLS policy, field constraint, and the write rate limit still apply.
-- They exist for atomicity, not privilege.
--
-- Callers: change_application_status only from services/change-status.ts,
-- which the detail-screen selector and the edit form both use (§9.1);
-- create_application only from data/applications.ts.

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

comment on function public.change_application_status is
  'The one status-change path (§9.1): update + status_history row, atomically. Invoker rights; RLS applies.';

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

comment on function public.create_application is
  'Add (§4.3): the application, its creation status_history row, and the first note, atomically. Invoker rights; RLS applies.';

comment on table public.status_history is
  'Append-only. Written only by change_application_status() and create_application(); from_status is null for the creation row (§2). No update or delete policy exists for the user role by design — rows leave only via the application cascade.';

-- Supabase grants new functions to anon by default; neither is for signed-out callers.
revoke all on function public.change_application_status(uuid, public.application_status) from public, anon;
grant execute on function public.change_application_status(uuid, public.application_status) to authenticated;

revoke all on function public.create_application(
  timestamptz, text, text, public.application_status, boolean, text, text, text
) from public, anon;
grant execute on function public.create_application(
  timestamptz, text, text, public.application_status, boolean, text, text, text
) to authenticated;
