-- The write limit (§7.1) counts what a user does, not what Postgres does for them.
--
-- As first written, deleting an application also counted every note the
-- foreign-key cascade removed with it: one delete cost 1 + its note count
-- against 120 a minute. Notes are capped at 200 per application, so an
-- application with about 120 notes could never be deleted — the delete rolled
-- back every time, from the detail screen and bulk delete alike.
--
-- A cascade runs inside Postgres's referential-integrity trigger, so the rows it
-- touches fire their own triggers at pg_trigger_depth() 2 or more. A statement
-- the user sends — or one inside create_application / change_application_status,
-- which are functions, not triggers — fires at depth 1 and is still counted.

create or replace function public.enforce_write_rate_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- A cascade is part of the one user action that started it, already counted.
  if pg_trigger_depth() > 1 then
    return coalesce(new, old);
  end if;

  perform public.consume_rate_limit('write', 120, interval '1 minute');
  return coalesce(new, old);
end;
$$;
