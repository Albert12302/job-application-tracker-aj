-- Profile row per auth user (SPEC §2 User, §4.6 Profile).
-- No password column here, ever: Supabase Auth owns credentials (§7.1).

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  name        text,
  avatar_path text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint profiles_name_len   check (name is null or char_length(name) <= 120),
  constraint profiles_avatar_len check (avatar_path is null or char_length(avatar_path) <= 512)
);

comment on column public.profiles.avatar_path is
  'Storage object path in the private avatars bucket: {user_id}/{uuid}.ext (§7.3). Not a URL.';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;

-- One policy per operation (§7.2). No delete policy: account deletion is out of
-- scope for v1 (§9.6) and cascades from auth.users when it is added.
-- auth.uid() is wrapped in a select so Postgres evaluates it once per statement
-- rather than once per row (Supabase's auth_rls_initplan lint). Same result.
create policy profiles_select_own on public.profiles
  for select to authenticated using ((select auth.uid()) = id);

create policy profiles_insert_own on public.profiles
  for insert to authenticated with check ((select auth.uid()) = id);

create policy profiles_update_own on public.profiles
  for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- Create the profile row when an auth user is confirmed.
-- SECURITY DEFINER is unavoidable: the insert happens in the auth trigger's
-- context, not the user's session. search_path pinned, every reference
-- schema-qualified (§7.6).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, name)
  values (new.id, null)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
