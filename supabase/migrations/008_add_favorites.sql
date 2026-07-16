-- supabase/migrations/008_add_favorites.sql
-- Adds a per-user "favourite schools" list. Personal preference data, not
-- stock data — freely insertable/deletable by its own owner, no admin gate.
-- Idempotent: safe to re-run.

create table if not exists public.favorites (
  profile_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, location_id)
);

alter table public.favorites enable row level security;

drop policy if exists "favorites: user can read their own" on public.favorites;
create policy "favorites: user can read their own"
  on public.favorites for select
  to authenticated
  using (profile_id = auth.uid());

drop policy if exists "favorites: user can insert their own" on public.favorites;
create policy "favorites: user can insert their own"
  on public.favorites for insert
  to authenticated
  with check (profile_id = auth.uid());

drop policy if exists "favorites: user can delete their own" on public.favorites;
create policy "favorites: user can delete their own"
  on public.favorites for delete
  to authenticated
  using (profile_id = auth.uid());
