-- The write limit (§7.1) reaches the fifth writable table.
--
-- `profiles` was left out when the trigger was written because the only write
-- to it was the avatar path, already capped upstream by the 20-uploads-an-hour
-- limit the upload function spends. The editable display name (§4.6) is a write
-- with nothing above it, so without this it would be the one client write
-- nothing counts.
--
-- This adds no limit: 'write', 120, interval '1 minute' is already one of the
-- triples `consume_rate_limit` accepts (migration 20260910090800), so its list
-- is unchanged. It is the same bucket, and a name edit costs the same one as an
-- application edit.
--
-- The row `handle_new_user` inserts when an account is confirmed cannot trip it,
-- twice over: it runs inside the `on_auth_user_created` trigger, so
-- pg_trigger_depth() is 2 and enforce_write_rate_limit returns early
-- (migration 20260916200000), and it runs with a null auth.uid(), which
-- consume_rate_limit returns on. A signup is not a write the user made.

create trigger profiles_write_rate_limit
  before insert or update or delete on public.profiles
  for each row execute function public.enforce_write_rate_limit();
