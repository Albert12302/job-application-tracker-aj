-- Rate limiting that lives in the database (SPEC §7.1).
-- Two tables, both reachable only by SECURITY DEFINER functions and the
-- service role: RLS is enabled with NO policies at all, which denies the
-- authenticated role every operation.

create table public.rate_limits (
  user_id      uuid not null references auth.users (id) on delete cascade,
  bucket       text not null,
  window_start timestamptz not null,
  count        integer not null default 0,
  primary key (user_id, bucket, window_start)
);

comment on table public.rate_limits is
  'Fixed-window counters (§7.1). Fixed rather than sliding: a sliding window needs a row per
   event, which is a second write per write. A fixed window allows up to 2x the limit across a
   boundary — acceptable for limits whose job is stopping runaway loops and abuse, not billing.';

alter table public.rate_limits enable row level security;
-- No policies. Deliberate: only the functions below touch this table.

create table public.sign_in_attempts (
  id         uuid primary key default gen_random_uuid(),
  email_hash text not null,
  created_at timestamptz not null default now(),
  outcome    text not null,
  constraint sign_in_attempts_outcome check (outcome in ('success', 'failure')),
  constraint sign_in_attempts_hash_len check (char_length(email_hash) = 64)
);

comment on table public.sign_in_attempts is
  'Per-account sign-in lockout state (§7.1). Written only by the sign-in edge function.
   The email is stored as a SHA-256 of (pepper || lowercased email) — never the address
   itself (§7.7). The hash is a lookup key, not a reversible record.';

create index sign_in_attempts_lookup_idx on public.sign_in_attempts (email_hash, created_at desc);

alter table public.sign_in_attempts enable row level security;
-- No policies. Service role only.

-- Consume one unit from a per-user bucket, or raise.
-- SECURITY DEFINER is required: the counter table is unreadable by the user
-- whose writes it counts. search_path pinned, everything schema-qualified (§7.6).
create or replace function public.consume_rate_limit(
  p_bucket text,
  p_limit  integer,
  p_window interval
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_seconds double precision := extract(epoch from p_window);
  v_start   timestamptz;
  v_count   integer;
begin
  if v_uid is null then
    return;   -- unauthenticated writes are denied by RLS, not by this
  end if;

  v_start := to_timestamp(floor(extract(epoch from clock_timestamp()) / v_seconds) * v_seconds);

  insert into public.rate_limits as rl (user_id, bucket, window_start, count)
  values (v_uid, p_bucket, v_start, 1)
  on conflict (user_id, bucket, window_start)
    do update set count = rl.count + 1
  returning rl.count into v_count;

  if v_count > p_limit then
    raise exception 'rate_limited' using
      errcode = 'check_violation',
      detail  = p_bucket,
      hint    = 'SPEC 7.1';
  end if;

  -- Opportunistic cleanup; cheap because it is keyed by this user.
  delete from public.rate_limits
   where user_id = v_uid and window_start < clock_timestamp() - interval '2 days';
end;
$$;

-- anon too: Supabase grants new functions to anon directly, not through public.
revoke all on function public.consume_rate_limit(text, integer, interval) from public, anon;
grant execute on function public.consume_rate_limit(text, integer, interval) to authenticated;

-- 120 write mutations per user per minute (§7.1).
create or replace function public.enforce_write_rate_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform public.consume_rate_limit('write', 120, interval '1 minute');
  return coalesce(new, old);
end;
$$;

create trigger applications_write_rate_limit
  before insert or update or delete on public.applications
  for each row execute function public.enforce_write_rate_limit();

create trigger notes_write_rate_limit
  before insert or update or delete on public.notes
  for each row execute function public.enforce_write_rate_limit();

create trigger saved_filters_write_rate_limit
  before insert or update or delete on public.saved_filters
  for each row execute function public.enforce_write_rate_limit();

create trigger status_history_write_rate_limit
  before insert on public.status_history
  for each row execute function public.enforce_write_rate_limit();

-- 20 file uploads per user per hour (§7.1). On storage.objects rather than in
-- the client: a limit the client is asked to observe is not a limit.
create or replace function public.enforce_upload_rate_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.bucket_id in ('cover-letters', 'avatars') then
    perform public.consume_rate_limit('upload', 20, interval '1 hour');
  end if;
  return new;
end;
$$;

create trigger storage_objects_upload_rate_limit
  before insert on storage.objects
  for each row execute function public.enforce_upload_rate_limit();
