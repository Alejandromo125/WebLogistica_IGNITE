-- supabase/migrations/004_widen_profiles_select_policy.sql
drop policy if exists "profiles: users can read their own profile" on public.profiles;
drop policy if exists "profiles: admin can read all profiles" on public.profiles;
drop policy if exists "profiles: any authenticated user can read" on public.profiles;

create policy "profiles: any authenticated user can read"
  on public.profiles for select
  to authenticated
  using (true);
