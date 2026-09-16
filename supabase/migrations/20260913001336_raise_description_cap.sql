-- The job description cap goes from 5,000 to 15,000 characters (SPEC §7.3).
-- A pasted job listing — responsibilities, requirements, benefits, the
-- company blurb — runs past 5,000 often enough to be refused in normal use.
--
-- A new migration rather than an edit to 20260910090200_applications.sql, so a
-- local database with data in it takes the change without a reset. The Zod
-- schema (src/domain/schemas.ts) carries the same number; both exist, the
-- constraint is the enforcement.

alter table public.applications
  drop constraint applications_description_len;

alter table public.applications
  add constraint applications_description_len
  check (description is null or char_length(description) <= 15000);
