-- Uploads go through supabase/functions/upload (SPEC §7.3), the only code that
-- reads a file's bytes before it is stored. A storage.objects policy cannot see
-- the bytes, and a bucket's allowed_mime_types trusts the Content-Type the
-- sender declares — so while a signed-in user can write to a bucket directly,
-- the server-side type check is one the client is merely asked to observe.
--
-- Signed-in users keep select and delete on their own folder. Insert and update
-- go: without update, upsert and move go with it; without insert, copy.
drop policy cover_letters_insert_own on storage.objects;
drop policy cover_letters_update_own on storage.objects;
drop policy avatars_insert_own on storage.objects;
drop policy avatars_update_own on storage.objects;

-- The upload limit (§7.1) moves with the writes. The function stores with the
-- service role, whose auth.uid() is null, so this trigger would count nothing;
-- the function calls consume_rate_limit as the user instead. One home per limit.
drop trigger storage_objects_upload_rate_limit on storage.objects;
drop function public.enforce_upload_rate_limit();
