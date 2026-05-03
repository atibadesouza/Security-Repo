-- =============================================================================
-- STORAGE BUCKET TEMPLATE — private bucket with user-scoped policies
-- =============================================================================
-- Create a project storage bucket with the canonical security defaults:
--   - Private (public = false). Access ONLY via signed URLs.
--   - Object paths must follow `<auth.uid()>/<filename>` so policies can
--     verify ownership by inspecting the path's first segment.
--   - All four operations (SELECT, INSERT, UPDATE, DELETE) are scoped to
--     the authenticated user's own folder.
--
-- ADAPT:
--   - Replace `[slug]_uploads` with your project's slug-prefixed bucket name.
--   - Adjust file_size_limit and allowed_mime_types for your use case.
--   - If your app needs a public-read bucket (e.g., user avatars served
--     publicly), copy this template, set `public = true`, and rewrite the
--     SELECT policy to allow `using (true)` — but document the choice in
--     PRD §6.5 explicitly.
-- =============================================================================

begin;

-- 1. Create the bucket (private, with file size + mime type guards)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  '[slug]_uploads',
  '[slug]_uploads',
  false,                                       -- PRIVATE — never set true without justification
  52428800,                                    -- 50 MB; tighten or loosen per use case
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do nothing;

-- 2. SELECT policy — users can read only objects in their own folder
create policy "[slug]_uploads_select_own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = '[slug]_uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- 3. INSERT policy — users can upload only into their own folder
create policy "[slug]_uploads_insert_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = '[slug]_uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- 4. UPDATE policy — users can update only their own objects
create policy "[slug]_uploads_update_own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = '[slug]_uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = '[slug]_uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- 5. DELETE policy — users can delete only their own objects
create policy "[slug]_uploads_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = '[slug]_uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

commit;
