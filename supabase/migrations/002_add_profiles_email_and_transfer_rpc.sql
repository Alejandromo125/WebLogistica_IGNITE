-- supabase/migrations/002_add_profiles_email_and_transfer_rpc.sql
alter table public.profiles add column if not exists email text;

update public.profiles p
set email = u.email
from auth.users u
where p.id = u.id and p.email is null;

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
