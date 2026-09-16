-- Session limits (SPEC §7.1): 90 days from sign-in, 14 days idle — enforced here.
--
-- config.toml [auth.sessions] timebox / inactivity_timeout say the same thing,
-- but on the hosted Free plan both are Pro-only and ignored, and Supabase
-- refresh tokens never expire on their own. Without this, a session signed in
-- once would last until sign-out, a password change, or account deletion:
-- a refresh token copied off a device (§7.5) would work indefinitely.
--
-- Deleting the auth.sessions row is the revocation. auth.refresh_tokens and
-- auth.mfa_amr_claims reference it ON DELETE CASCADE, so every refresh token of
-- the session goes with it and the next refresh is refused. An access token
-- already issued still verifies until it expires (jwt_expiry, 1 hour):
-- PostgREST checks the signature, not the session.
--
-- `postgres` (which pg_cron jobs run as) has DELETE on auth.sessions by direct
-- grant and bypasses RLS — measured locally, and re-checked hosted after deploy
-- (README, Deploy).
--
-- Idle means not refreshed: supabase-js refreshes about hourly while a tab is
-- open, and Auth stamps refreshed_at then. refreshed_at is `timestamp without
-- time zone` holding UTC (the other columns are timestamptz), so it is read as
-- UTC explicitly rather than in whatever zone the job's session happens to use.
-- A session never refreshed falls back to updated_at, then created_at.
--
-- Hourly, so a session outlives its limit by at most an hour. pg_cron setup and
-- its schema are in 20260916170641_schedule_log_purge.sql.
-- cron.schedule with a name replaces a job of that name, so re-applying this
-- does not stack duplicates.
select cron.schedule(
  'expire-sessions',
  '17 * * * *',
  $$
  delete from auth.sessions
   where created_at < now() - interval '90 days'
      or coalesce(refreshed_at at time zone 'UTC', updated_at, created_at)
         < now() - interval '14 days'
  $$
);

-- pg_cron writes a row to cron.job_run_details for every run and never removes
-- one. An hourly job adds ~8,800 a year; keep 30 days, which is enough to see
-- that a job has been failing.
select cron.schedule(
  'purge-cron-run-details',
  '47 3 * * *',
  $$delete from cron.job_run_details where start_time < now() - interval '30 days'$$
);
