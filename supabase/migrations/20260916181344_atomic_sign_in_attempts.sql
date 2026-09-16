-- Sign-in limits that hold under concurrent requests (SPEC §7.1), and a
-- retention for the table that counts them (§7.7).
--
-- The sign-in function used to read an account's recent failures, call Auth,
-- and only then record the failure. Requests arriving together all read the
-- same count: twenty parallel guesses at an account with four failures would all
-- see four, and all twenty would reach Auth, past a limit of five. The per-IP count had
-- the same gap. (Not reproducible through the local stack, whose edge runtime
-- answers one sign-in at a time; hosted runs them side by side.)
--
-- begin_sign_in_attempt() closes it. Under a lock per account hash and per
-- address hash, it reads the recent failures and inserts this attempt as
-- `pending`, in one transaction. Pending rows count as failures for every later
-- reader, so concurrent attempts see each other: the tenth of ten sees nine.
-- The function then settles its row — `failure` or `success` — or deletes it
-- when the attempt was blocked or Auth was unavailable, which count nothing.
-- A row left pending by a function that died keeps counting as a failure until
-- it leaves the window: the limit fails closed.
--
-- The decisions stay in supabase/functions/sign-in/limits.ts. This returns the
-- times they are made from.

alter table public.sign_in_attempts drop constraint sign_in_attempts_outcome;
alter table public.sign_in_attempts
  add constraint sign_in_attempts_outcome check (outcome in ('pending', 'success', 'failure'));

drop index public.sign_in_attempts_ip_lookup_idx;
create index sign_in_attempts_ip_lookup_idx
  on public.sign_in_attempts (ip_hash, created_at desc)
  where outcome in ('pending', 'failure');

create function public.begin_sign_in_attempt(
  p_email_hash    text,
  p_ip_hash       text,
  p_account_since timestamptz,
  p_account_limit integer,
  p_ip_since      timestamptz,
  p_ip_limit      integer
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_account jsonb;
  v_ip      jsonb;
  v_id      uuid;
begin
  -- Always account first, then address, in every call, so two calls can never
  -- each hold the lock the other is waiting for. Transaction-scoped: released
  -- when this returns.
  perform pg_advisory_xact_lock(hashtextextended('sign-in account ' || p_email_hash, 0));
  perform pg_advisory_xact_lock(hashtextextended('sign-in ip ' || p_ip_hash, 0));

  select coalesce(jsonb_agg(created_at order by created_at desc), '[]'::jsonb) into v_account
    from (select created_at from public.sign_in_attempts
           where email_hash = p_email_hash
             and outcome in ('pending', 'failure')
             and created_at >= p_account_since
           order by created_at desc
           limit p_account_limit) recent;

  select coalesce(jsonb_agg(created_at order by created_at desc), '[]'::jsonb) into v_ip
    from (select created_at from public.sign_in_attempts
           where ip_hash = p_ip_hash
             and outcome in ('pending', 'failure')
             and created_at >= p_ip_since
           order by created_at desc
           limit p_ip_limit) recent;

  -- clock_timestamp(), not the column default now(): now() is when this
  -- transaction began, before it waited for the lock, and would order an attempt
  -- ahead of ones it had queued behind.
  insert into public.sign_in_attempts (email_hash, ip_hash, outcome, created_at)
  values (p_email_hash, p_ip_hash, 'pending', clock_timestamp())
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'account', v_account, 'ip', v_ip);
end;
$$;

-- The sign-in function calls it with the service role. anon too: Supabase
-- grants new functions to anon directly, not through public.
revoke all on function public.begin_sign_in_attempt(text, text, timestamptz, integer, timestamptz, integer)
  from public, anon, authenticated;
grant execute on function public.begin_sign_in_attempt(text, text, timestamptz, integer, timestamptz, integer)
  to service_role;

-- Retention. Nothing deleted from sign_in_attempts before, so every attempt's
-- email and address hashes were kept forever. The limits read at most the last
-- hour; 24 hours leaves room for the §7.8 check 7 post-deploy look at ip_hash.
-- Outcomes stay in security_events for its 90 days (§7.7). The nightly
-- purge-old-logs job (20260916170641) runs this.
create or replace function public.purge_old_logs()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.app_errors       where created_at < now() - interval '90 days';
  delete from public.security_events  where created_at < now() - interval '90 days';
  delete from public.sign_in_attempts where created_at < now() - interval '24 hours';
$$;

revoke all on function public.purge_old_logs() from public, anon, authenticated;
