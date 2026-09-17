-- security_events gets the insert limit §7.7 asks of every client-written log.
--
-- app_errors has had its 60 an hour since the table was made; security_events
-- had none, so any signed-in user could insert rows in a loop — filling the
-- table and burying real events under invented ones.
--
-- Counted through consume_rate_limit, like every other limit the database can
-- see (§7.1). The edge functions write their events with the service role,
-- whose auth.uid() is null, so consume_rate_limit skips them: only what the
-- browser writes is counted. Every client call site already catches a refused
-- insert and reports it, so a user who trips this sees nothing.

create or replace function public.enforce_security_event_rate_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform public.consume_rate_limit('security_event', 60, interval '1 hour');
  return new;
end;
$$;

revoke all on function public.enforce_security_event_rate_limit() from public, anon;

create trigger security_events_rate_limit
  before insert on public.security_events
  for each row execute function public.enforce_security_event_rate_limit();
