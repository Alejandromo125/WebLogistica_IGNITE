-- supabase/schema.sql
create extension if not exists pgcrypto;

-- ---------- profiles ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','viewer')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles: users can read their own profile"
  on public.profiles for select
  to authenticated
  using (id = auth.uid());

create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create policy "profiles: admin can read all profiles"
  on public.profiles for select
  to authenticated
  using (public.is_admin());

-- New auth.users rows get a viewer profile automatically.
-- The first admin is bootstrapped manually via SQL (see README).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.profiles (id, role) values (new.id, 'viewer');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- locations ----------
create table public.locations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null check (type in ('warehouse','school')),
  tier text,
  students integer,
  notes text,
  created_at timestamptz not null default now()
);

alter table public.locations enable row level security;

create policy "locations: any authenticated user can read"
  on public.locations for select
  to authenticated
  using (true);

create policy "locations: admin can insert"
  on public.locations for insert
  to authenticated
  with check (public.is_admin());

create policy "locations: admin can update"
  on public.locations for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Seed the single warehouse location. Idempotent: safe to re-run.
insert into public.locations (name, type)
select 'Warehouse', 'warehouse'
where not exists (select 1 from public.locations where type = 'warehouse');

-- ---------- materials ----------
create table public.materials (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

alter table public.materials enable row level security;

create policy "materials: any authenticated user can read"
  on public.materials for select
  to authenticated
  using (true);

create policy "materials: admin can insert"
  on public.materials for insert
  to authenticated
  with check (public.is_admin());

-- ---------- items ----------
create table public.items (
  id text primary key,
  material_id uuid not null references public.materials(id),
  current_location_id uuid not null references public.locations(id),
  retired boolean not null default false
);

create index items_current_location_id_idx on public.items(current_location_id);

alter table public.items enable row level security;

create policy "items: any authenticated user can read"
  on public.items for select
  to authenticated
  using (true);

create policy "items: admin can insert"
  on public.items for insert
  to authenticated
  with check (public.is_admin());

create policy "items: admin can update"
  on public.items for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------- requests ----------
create table public.requests (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid not null references public.profiles(id),
  location_id uuid not null references public.locations(id),
  material_id uuid not null references public.materials(id),
  quantity integer not null check (quantity > 0),
  status text not null default 'pending' check (status in ('pending','approved','denied')),
  note text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id)
);

create index requests_status_idx on public.requests(status);

alter table public.requests enable row level security;

create policy "requests: any authenticated user can read"
  on public.requests for select
  to authenticated
  using (true);

create policy "requests: user can insert their own request"
  on public.requests for insert
  to authenticated
  with check (requested_by = auth.uid());

create policy "requests: admin can update"
  on public.requests for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------- movements ----------
create table public.movements (
  id uuid primary key default gen_random_uuid(),
  item_id text not null references public.items(id),
  from_location_id uuid references public.locations(id),
  to_location_id uuid not null references public.locations(id),
  moved_by uuid not null references public.profiles(id),
  moved_at timestamptz not null default now(),
  note text,
  request_id uuid references public.requests(id)
);

create index movements_item_id_idx on public.movements(item_id);
create index movements_to_location_id_idx on public.movements(to_location_id);

alter table public.movements enable row level security;

create policy "movements: any authenticated user can read"
  on public.movements for select
  to authenticated
  using (true);

create policy "movements: admin can insert"
  on public.movements for insert
  to authenticated
  with check (public.is_admin());
