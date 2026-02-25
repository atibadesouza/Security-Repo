-- =============================================================================
-- NEW TABLE MIGRATION TEMPLATE
-- =============================================================================
-- Usage: Copy this file, rename to your migration timestamp + table name,
-- and replace all instances of "items" with your table name.
--
-- ADAPT: Replace "items" with your actual table name.
-- ADAPT: Add your domain-specific columns in the marked section.
-- =============================================================================

-- 1) Create the table
-- NOTE: auth.uid() as a column default works when rows are inserted via
-- PostgREST (i.e., from your app with a JWT). It will NOT work in raw
-- migration scripts or seed files — use explicit UUIDs there instead.
create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,

  -- ADAPT: Add your domain-specific columns here
  -- name text not null,
  -- description text,
  -- status text not null default 'active' check (status in ('active', 'archived')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2) Index on user_id (every user-scoped table needs this)
create index if not exists items_user_id_idx on public.items(user_id);

-- 3) Enable RLS (non-negotiable)
alter table public.items enable row level security;

-- 4) Policies: user can only access their own rows
-- SELECT
create policy "Users can read own items"
  on public.items
  for select
  using (user_id = auth.uid());

-- INSERT
-- WITH CHECK ensures the user_id column matches the authenticated user.
-- Combined with the column default, this means:
--   - If client omits user_id → default fills it correctly
--   - If client sends a DIFFERENT user_id → policy rejects it
create policy "Users can insert own items"
  on public.items
  for insert
  with check (user_id = auth.uid());

-- UPDATE
create policy "Users can update own items"
  on public.items
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- DELETE
create policy "Users can delete own items"
  on public.items
  for delete
  using (user_id = auth.uid());

-- 5) Auto-update the updated_at timestamp
-- This trigger function may already exist in your project. If so, skip this block.
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql security invoker;

create trigger set_updated_at
  before update on public.items
  for each row
  execute function public.handle_updated_at();

-- 6) Revoke direct access from anon and authenticated roles
-- (RLS policies are the ONLY access path)
-- This is a defense-in-depth measure. RLS is the primary gate,
-- but revoking broad grants prevents accidental policy gaps from
-- exposing everything.
revoke all on public.items from anon, authenticated;
grant select, insert, update, delete on public.items to authenticated;
