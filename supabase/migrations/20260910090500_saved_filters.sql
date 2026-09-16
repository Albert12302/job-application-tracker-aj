-- Saved filters (SPEC §2, §5.1). Stored as discrete columns rather than a
-- jsonb blob so the field caps and enum membership are enforceable.

create type public.tri_state as enum ('any', 'yes', 'no');

create table public.saved_filters (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null,
  statuses   public.application_status[] not null default '{}',
  referral   public.tri_state not null default 'any',
  starred    public.tri_state not null default 'any',
  location   text,
  text       text,
  created_at timestamptz not null default now(),
  constraint saved_filters_name_len     check (char_length(name) between 1 and 60),
  constraint saved_filters_location_len check (location is null or char_length(location) <= 120),
  constraint saved_filters_text_len     check (text     is null or char_length(text)     <= 120),
  -- Empty array means all statuses (§5.1); duplicates would be meaningless.
  constraint saved_filters_statuses_len check (array_length(statuses, 1) is null or array_length(statuses, 1) <= 6)
);

comment on column public.saved_filters.statuses is 'Empty array = all statuses (§5.1).';
comment on column public.saved_filters.location is 'null = "Any location" (§5.1).';

create index saved_filters_user_idx on public.saved_filters (user_id, created_at);

alter table public.saved_filters enable row level security;

create policy saved_filters_select_own on public.saved_filters
  for select to authenticated using (auth.uid() = user_id);

create policy saved_filters_insert_own on public.saved_filters
  for insert to authenticated with check (auth.uid() = user_id);

create policy saved_filters_update_own on public.saved_filters
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy saved_filters_delete_own on public.saved_filters
  for delete to authenticated using (auth.uid() = user_id);
