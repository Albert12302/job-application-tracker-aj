-- Per-IP sign-in failure limit (SPEC §7.1: 20 failures / hour, then a temporary block).
--
-- Behind the sign-in edge function, Supabase Auth sees one caller for every
-- sign-in: the function. Its per-IP limit in config.toml is therefore a single
-- bucket shared by everyone — useless against one machine spraying many
-- accounts, and a cheap way to lock every user out. The function is the only
-- place that sees the caller's address, so the per-IP count lives beside the
-- per-account one it already keeps, and is checked before Auth is called.
--
-- RLS on this table is unchanged: enabled, no policies, service role only.

alter table public.sign_in_attempts add column ip_hash text;

alter table public.sign_in_attempts
  add constraint sign_in_attempts_ip_hash_len check (ip_hash is null or char_length(ip_hash) = 64);

comment on column public.sign_in_attempts.ip_hash is
  'SHA-256 of (pepper || ''ip:'' || client IP) — a lookup key, never the address itself (§7.7; security_events stores no IP either). Null only for rows written before this column existed.';

-- The per-IP check reads recent failures for one hash, newest first.
create index sign_in_attempts_ip_lookup_idx
  on public.sign_in_attempts (ip_hash, created_at desc)
  where outcome = 'failure';
