-- Notes (SPEC §2, §9.3). Ownership derives from the parent application via
-- EXISTS rather than a denormalized user_id — a copied id can drift out of
-- sync with its parent's owner, an EXISTS check cannot.

create table public.notes (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id) on delete cascade,
  body           text not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint notes_body_len check (char_length(body) between 1 and 2000)
);

create index notes_application_created_idx on public.notes (application_id, created_at);

create trigger notes_set_updated_at
  before update on public.notes
  for each row execute function public.set_updated_at();

-- 200 notes per application (§7.3). Invoker rights: the counting select sees
-- the caller's own notes, which is exactly the set being capped.
create or replace function public.enforce_notes_per_application()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from public.notes where application_id = new.application_id) >= 200 then
    raise exception 'note_limit_reached' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

comment on function public.enforce_notes_per_application is
  'Caps notes at 200 per application (§7.3). Raises a bare code, never the note text (§7.7).';

create trigger notes_enforce_limit
  before insert on public.notes
  for each row execute function public.enforce_notes_per_application();

alter table public.notes enable row level security;

create policy notes_select_own on public.notes
  for select to authenticated using (
    exists (select 1 from public.applications a
            where a.id = notes.application_id and a.user_id = auth.uid())
  );

create policy notes_insert_own on public.notes
  for insert to authenticated with check (
    exists (select 1 from public.applications a
            where a.id = notes.application_id and a.user_id = auth.uid())
  );

create policy notes_update_own on public.notes
  for update to authenticated using (
    exists (select 1 from public.applications a
            where a.id = notes.application_id and a.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.applications a
            where a.id = notes.application_id and a.user_id = auth.uid())
  );

create policy notes_delete_own on public.notes
  for delete to authenticated using (
    exists (select 1 from public.applications a
            where a.id = notes.application_id and a.user_id = auth.uid())
  );
