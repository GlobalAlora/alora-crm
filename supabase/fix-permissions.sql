-- ============================================================
-- Fix: table-level grants + backfill existing auth users
-- Run in Supabase SQL Editor
-- ============================================================

-- 1. Grant table privileges to authenticated role
grant select, insert, update, delete on public.leads      to authenticated;
grant select, insert, update, delete on public.activities to authenticated;
grant select, insert, update, delete on public.tasks      to authenticated;
grant select                          on public.users      to authenticated;
grant update                          on public.users      to authenticated;

-- 2. Grant full privileges to service_role (needed for admin client / webhook routes)
grant all on public.leads      to service_role;
grant all on public.activities to service_role;
grant all on public.tasks      to service_role;
grant all on public.users      to service_role;

-- 2. Backfill public.users for any auth.users that were created
--    before the trigger existed (e.g. your own account)
insert into public.users (id, email, full_name, avatar_url, role)
select
  au.id,
  au.email,
  coalesce(au.raw_user_meta_data->>'full_name', split_part(au.email, '@', 1)),
  au.raw_user_meta_data->>'avatar_url',
  'admin'   -- set first user as admin; adjust if needed
from auth.users au
where not exists (
  select 1 from public.users pu where pu.id = au.id
);

-- 3. Confirm your user exists with correct role
select id, email, full_name, role from public.users;
