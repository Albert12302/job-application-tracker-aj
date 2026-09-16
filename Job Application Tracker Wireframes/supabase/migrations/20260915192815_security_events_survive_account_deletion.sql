-- The account_deletion record keeps its user id (SPEC §9.7).
--
-- §9.7 asks for one record that survives the account, "holding a user id and a
-- timestamp". As built it could not: security_events.user_id referenced
-- auth.users with `on delete set null`, so deleting the account blanked the id
-- on the very row that exists to name it — and the row could not be written
-- afterwards either, because the foreign key would reject an id that no longer
-- exists in auth.users.
--
-- So the constraint goes and the column stays. What is kept is an opaque UUID,
-- which is what §7.7 says a security event holds; with no auth.users row to
-- join to, it identifies nobody and resolves to nothing. The trade, stated
-- plainly: every security_events row now keeps its user id for the table's
-- 90-day retention (§7.7) rather than losing it the moment an account goes.
-- That is what makes the log answerable — "what happened to this account
-- before it was deleted" has no answer if deletion erases the thread.
--
-- app_errors is deliberately NOT changed. §9.7 wants stack traces to lose the
-- person, and they still do: its user_id keeps `on delete set null`.

alter table public.security_events
  drop constraint security_events_user_id_fkey;

comment on column public.security_events.user_id is
  'Opaque UUID, kept after the account is deleted so the account_deletion row can name it (§9.7). Still defaulted to auth.uid() and still forced by the trigger — no client ever chooses it.';
