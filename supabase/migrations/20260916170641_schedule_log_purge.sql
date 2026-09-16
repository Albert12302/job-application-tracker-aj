-- 90-day retention for app_errors and security_events (SPEC §7.7), scheduled.
--
-- purge_old_logs() has existed since 20260910090700_log_tables.sql, but nothing
-- ever ran it: once hosted, every log row would have been kept forever — user
-- ids included, and security_events.user_id outlives the account (§9.7).
--
-- pg_cron, because it is on the Free plan and runs inside the database, so the
-- schedule is a migration like everything else rather than a dashboard setting
-- or a GitHub Actions job holding a database password.
--
-- It is the one extension NOT in the extensions schema (§7.6). pg_cron ignores
-- WITH SCHEMA and always installs into pg_catalog, with its jobs in its own
-- `cron` schema (measured locally). What §7.6 guards against is extensions
-- landing in `public`, which PostgREST exposes; `cron` is not exposed
-- (config.toml [api] schemas), and anon and authenticated have no usage on it.

create extension if not exists pg_cron;

-- 03:00 UTC, an hour before the nightly backup (.github/workflows/backup.yml,
-- 04:00), so a dump holds only rows that passed 90 days since the purge —
-- about an hour's worth, more if GitHub Actions starts the backup late.
-- cron.schedule with a name replaces a job of that name, so re-applying this
-- does not stack duplicates.
select cron.schedule('purge-old-logs', '0 3 * * *', $$select public.purge_old_logs()$$);
