-- Foundations: a dedicated extensions schema (SPEC §7.6) and the shared
-- updated_at trigger. No user tables here.

create schema if not exists extensions;
revoke all on schema extensions from public;
grant usage on schema extensions to authenticated, service_role;

-- gen_random_uuid() is built into Postgres 13+; no extension needed.

-- Touch updated_at on any table that has the column.
-- Not SECURITY DEFINER: it only writes the row already being written (§7.6).
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.set_updated_at is
  'BEFORE UPDATE trigger: maintains updated_at. search_path pinned per SPEC §7.6.';
