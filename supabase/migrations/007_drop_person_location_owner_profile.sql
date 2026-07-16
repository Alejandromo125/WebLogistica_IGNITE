-- supabase/migrations/007_drop_person_location_owner_profile.sql
-- Person-type locations are identified by `name` alone, not tied to a login
-- account — most staff who carry circulating equipment (monitors, teachers)
-- never sign in to this app. Drops the account-binding column added in
-- migration 006. Idempotent: safe to re-run.

drop index if exists public.locations_owner_profile_id_key;

alter table public.locations
  drop column if exists owner_profile_id;
