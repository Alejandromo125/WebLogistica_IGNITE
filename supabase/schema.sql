-- supabase/schema.sql
create extension if not exists pgcrypto;

-- ---------- profiles ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','viewer')),
  email text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles: any authenticated user can read"
  on public.profiles for select
  to authenticated
  using (true);

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

-- New auth.users rows get a viewer profile automatically.
-- The first admin is bootstrapped manually via SQL (see README).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.profiles (id, role, email) values (new.id, 'viewer', new.email);
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
  type text not null check (type in ('warehouse','school','person')),
  tier text,
  students integer,
  notes text,
  created_at timestamptz not null default now()
);

-- A 'person' location is a staff member's custody bucket for circulating
-- equipment (robots, consoles, Oculus...), identified by `name` alone — not
-- tied to any login account, since most staff who carry this equipment
-- (monitors, teachers) never sign in to this app.

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

-- Seed the two warehouse locations. Idempotent: safe to re-run.
insert into public.locations (name, type)
select 'Warehouse Madrid', 'warehouse'
where not exists (select 1 from public.locations where name = 'Warehouse Madrid');

insert into public.locations (name, type)
select 'Warehouse Barcelona', 'warehouse'
where not exists (select 1 from public.locations where name = 'Warehouse Barcelona');

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
  requested_by uuid not null default auth.uid() references public.profiles(id),
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

-- ---------- transfers ----------
create or replace function public.perform_transfer(
  item_ids text[],
  from_location_id uuid,
  to_location_id uuid,
  note text,
  request_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  found_ids text[];
  missing_ids text[];
  req_status text;
begin
  if not public.is_admin() then
    raise exception 'only an admin can perform a transfer';
  end if;

  select array_agg(i.id) into found_ids
  from public.items i
  where i.id = any(item_ids)
    and i.retired = false
    and i.current_location_id = from_location_id;

  select array_agg(x) into missing_ids
  from unnest(item_ids) as x
  where x <> all(coalesce(found_ids, array[]::text[]));

  if missing_ids is not null then
    raise exception 'item(s) not available at expected location: %', array_to_string(missing_ids, ', ');
  end if;

  insert into public.movements (item_id, from_location_id, to_location_id, moved_by, note, request_id)
  select id, from_location_id, to_location_id, auth.uid(), note, request_id
  from unnest(item_ids) as id;

  update public.items
  set current_location_id = to_location_id
  where id = any(item_ids);

  if request_id is not null then
    select status into req_status from public.requests where id = request_id for update;

    if req_status is null then
      raise exception 'request % not found', request_id;
    elsif req_status <> 'pending' then
      raise exception 'request % is already resolved', request_id;
    end if;

    update public.requests
    set status = 'approved', resolved_by = auth.uid(), resolved_at = now()
    where id = request_id;
  end if;
end;
$$;

grant execute on function public.perform_transfer(text[], uuid, uuid, text, uuid) to authenticated;

-- ---------- favorites ----------
-- Personal preference data, not stock data — each user manages only their
-- own rows, no admin gate, and (unlike every other table here) rows are
-- meant to be freely deletable (un-favouriting).
create table public.favorites (
  profile_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, location_id)
);

alter table public.favorites enable row level security;

create policy "favorites: user can read their own"
  on public.favorites for select
  to authenticated
  using (profile_id = auth.uid());

create policy "favorites: user can insert their own"
  on public.favorites for insert
  to authenticated
  with check (profile_id = auth.uid());

create policy "favorites: user can delete their own"
  on public.favorites for delete
  to authenticated
  using (profile_id = auth.uid());
