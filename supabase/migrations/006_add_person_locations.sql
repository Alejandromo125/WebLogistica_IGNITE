-- supabase/migrations/006_add_person_locations.sql
-- Adds a 'person' location type so circulating equipment (robots, consoles,
-- Oculus headsets, etc.) can be tracked as being in a staff member's custody
-- rather than tied to a school or warehouse. Idempotent: safe to re-run.

alter table public.locations
  drop constraint if exists locations_type_check;

alter table public.locations
  add constraint locations_type_check check (type in ('warehouse', 'school', 'person'));

alter table public.locations
  add column if not exists owner_profile_id uuid references public.profiles(id);

create unique index if not exists locations_owner_profile_id_key
  on public.locations(owner_profile_id)
  where owner_profile_id is not null;
