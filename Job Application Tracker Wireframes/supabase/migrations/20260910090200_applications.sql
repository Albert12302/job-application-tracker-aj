-- Applications (SPEC §2). Field caps mirror the Zod schema (§7.3) —
-- the schema is UX, these constraints are the enforcement.

create type public.application_status as enum (
  'Applied', 'Interview', 'Callback', 'Offer', 'Rejected', 'Withdrawn'
);

create table public.applications (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date_applied      timestamptz not null default date_trunc('day', now() at time zone 'utc') at time zone 'utc',
  company           text not null,
  position          text not null,
  location          text,
  description       text,
  status            public.application_status not null default 'Applied',
  referral          boolean not null default false,
  starred           boolean not null default false,
  cover_letter_path text,
  cover_letter_name text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint applications_company_len     check (char_length(company)  between 1 and 120),
  constraint applications_position_len    check (char_length(position) between 1 and 120),
  constraint applications_location_len    check (location    is null or char_length(location)    <= 120),
  constraint applications_description_len check (description is null or char_length(description) <= 5000),
  constraint applications_cl_path_len     check (cover_letter_path is null or char_length(cover_letter_path) <= 512),
  constraint applications_cl_name_len     check (cover_letter_name is null or char_length(cover_letter_name) <= 255),
  -- Either both file columns are set or neither: a path without a display name
  -- (or a name with no object) is an orphan waiting to happen (§9.2).
  -- date_applied is a calendar date stored as UTC midnight (§2, §5.4). The
  -- constraint is what keeps it a date: without it, a client in UTC-7 writes
  -- 07:00Z and every later comparison drifts by a day.
  constraint applications_date_is_utc_midnight check (
    date_applied = date_trunc('day', date_applied at time zone 'utc') at time zone 'utc'
  ),
  constraint applications_cl_pair check (
    (cover_letter_path is null and cover_letter_name is null)
    or (cover_letter_path is not null and cover_letter_name is not null)
  )
);

comment on column public.applications.user_id is
  'Defaults to auth.uid(); never sent by the client (§7.2).';
comment on column public.applications.cover_letter_name is
  'Original filename, display label only. Escape on render (§7.3).';
comment on column public.applications.date_applied is
  'Calendar date, normalized to 00:00:00Z. Always formatted in UTC — never the browser zone (§5.4).';
comment on column public.applications.location is
  'Normalized by domain/location.ts before save (§5.2). Filter matches exactly.';

create index applications_user_date_idx   on public.applications (user_id, date_applied desc, id desc);
create index applications_user_status_idx on public.applications (user_id, status);

create trigger applications_set_updated_at
  before update on public.applications
  for each row execute function public.set_updated_at();

alter table public.applications enable row level security;

create policy applications_select_own on public.applications
  for select to authenticated using (auth.uid() = user_id);

-- with check is what stops a user writing rows owned by someone else (§7.2).
create policy applications_insert_own on public.applications
  for insert to authenticated with check (auth.uid() = user_id);

create policy applications_update_own on public.applications
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy applications_delete_own on public.applications
  for delete to authenticated using (auth.uid() = user_id);
