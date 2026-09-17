-- Private buckets for cover letters and avatars (SPEC §7.3).
-- public = false: served only via 60-second signed URLs generated on click.
-- Size and MIME limits here are a backstop; magic-byte verification still
-- happens before upload, because Content-Type is client-supplied.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('cover-letters', 'cover-letters', false, 10485760, array[
     'application/pdf',
     'application/msword',
     'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
   ]),
  ('avatars', 'avatars', false, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- SVG is not accepted in either bucket. It is a script execution vector (§7.3).

-- Object paths are {user_id}/{uuid}.ext, so the first path segment is the
-- ownership check. Policies are per operation, per bucket.
-- auth.uid() is wrapped in a select so Postgres evaluates it once per statement
-- rather than once per row (Supabase's auth_rls_initplan lint). Same result.
create policy cover_letters_select_own on storage.objects
  for select to authenticated using (
    bucket_id = 'cover-letters' and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy cover_letters_insert_own on storage.objects
  for insert to authenticated with check (
    bucket_id = 'cover-letters' and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy cover_letters_update_own on storage.objects
  for update to authenticated using (
    bucket_id = 'cover-letters' and (storage.foldername(name))[1] = (select auth.uid())::text
  ) with check (
    bucket_id = 'cover-letters' and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy cover_letters_delete_own on storage.objects
  for delete to authenticated using (
    bucket_id = 'cover-letters' and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy avatars_select_own on storage.objects
  for select to authenticated using (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy avatars_insert_own on storage.objects
  for insert to authenticated with check (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy avatars_update_own on storage.objects
  for update to authenticated using (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text
  ) with check (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy avatars_delete_own on storage.objects
  for delete to authenticated using (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text
  );
