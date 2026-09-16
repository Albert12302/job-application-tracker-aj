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
-- address hash, in one transaction, it reads the recent failures, decides
-- whether the attempt is blocked, and — only if it is not — inserts it as
-- `pending`. Pending rows count as failures for every later reader, so
-- concurrent attempts see each other: the tenth of ten sees nine. The function
-- then settles its row — `failure` or `success` — or deletes it when Auth was
-- rate limited or unavailable, which count nothing. A row left pending by a
-- function that died keeps counting as a failure: the limit fails closed.
--
-- A blocked attempt writes nothing, not even for a moment. If it inserted and
-- deleted afterwards, its pending row would count against the account in
-- between: a caller whose address is already blocked could flood one account
-- and hold five pending rows there at any instant, locking out its owner
-- without a single guess reaching Auth.
--
-- The block rule is therefore in two places, and they must agree:
-- supabase/functions/sign-in/limits.ts (accountLockout, ipBlockedUntil), which
-- also computes the wait and the backoff, and the `v_blocked` expression below.
-- e2e/sign-in-function.spec.ts checks this one against those.

alter table public.sign_in_attempts drop constraint sign_in_attempts_outcome;
alter table public.sign_in_attempts
  add constraint sign_in_attempts_outcome check (outcome in ('pending', 'success', 'failure'));

drop index public.sign_in_attempts_ip_lookup_idx;
create index sign_in_attempts_ip_lookup_idx
  on public.sign_in_attempts (ip_hash, created_at desc)
  where outcome in ('pending', 'failure');

create function public.begin_sign_in_attempt(
  p_email_hash         text,
  p_ip_hash            text,
  p_account_max        integer,
  p_account_window_ms  bigint,
  p_account_lockout_ms bigint,
  p_ip_max             integer,
  p_ip_window_ms       bigint
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_account_window  interval := p_account_window_ms * interval '1 millisecond';
  v_account_lockout interval := p_account_lockout_ms * interval '1 millisecond';
  v_ip_window       interval := p_ip_window_ms * interval '1 millisecond';
  v_now     timestamptz;
  v_account timestamptz[];
  v_ip      timestamptz[];
  v_blocked boolean;
  v_id      uuid;
begin
  -- Always account first, then address, in every call, so two calls can never
  -- each hold the lock the other is waiting for. Transaction-scoped: released
  -- when this returns.
  perform pg_advisory_xact_lock(hashtextextended('sign-in account ' || p_email_hash, 0));
  perform pg_advisory_xact_lock(hashtextextended('sign-in ip ' || p_ip_hash, 0));

  -- clock_timestamp(), not now(): now() is when this transaction began, before
  -- it waited for the locks. The function decides with this same instant.
  v_now := clock_timestamp();

  -- The account's most recent failures, newest first, at most p_account_max.
  select coalesce(array_agg(created_at order by created_at desc), '{}') into v_account
    from (select created_at from public.sign_in_attempts
           where email_hash = p_email_hash
             and outcome in ('pending', 'failure')
             and created_at >= v_now - v_account_window - v_account_lockout
           order by created_at desc
           limit p_account_max) recent;

  -- The address's failures inside the hour, newest first, at most p_ip_max.
  select coalesce(array_agg(created_at order by created_at desc), '{}') into v_ip
    from (select created_at from public.sign_in_attempts
           where ip_hash = p_ip_hash
             and outcome in ('pending', 'failure')
             and created_at > v_now - v_ip_window
           order by created_at desc
           limit p_ip_max) recent;

  -- limits.ts ipBlockedUntil: p_ip_max failures inside the window.
  -- limits.ts accountLockout: the newest and the p_account_max-th newest inside
  -- one window, and the lockout from the newest not yet over.
  v_blocked := cardinality(v_ip) >= p_ip_max
    or (cardinality(v_account) >= p_account_max
        and v_account[1] - v_account[p_account_max] <= v_account_window
        and v_account[1] + v_account_lockout > v_now);

  if not v_blocked then
    insert into public.sign_in_attempts (email_hash, ip_hash, outcome, created_at)
    values (p_email_hash, p_ip_hash, 'pending', v_now)
    returning id into v_id;
  end if;

  -- id is null when blocked: nothing was recorded.
  return jsonb_build_object('id', v_id, 'now', v_now, 'account', to_jsonb(v_account), 'ip', to_jsonb(v_ip));
end;
$$;

-- The sign-in function calls it with the service role. anon too: Supabase
-- grants new functions to anon directly, not through public.
revoke all on function public.begin_sign_in_attempt(text, text, integer, bigint, bigint, integer, bigint)
  from public, anon, authenticated;
grant execute on function public.begin_sign_in_attempt(text, text, integer, bigint, bigint, integer, bigint)
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
