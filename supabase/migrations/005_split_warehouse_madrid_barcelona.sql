-- supabase/migrations/005_split_warehouse_madrid_barcelona.sql
-- Renames the existing single warehouse to "Warehouse Madrid" and adds a new
-- empty "Warehouse Barcelona" location. Idempotent: safe to re-run.

update public.locations
set name = 'Warehouse Madrid'
where type = 'warehouse'
  and not exists (select 1 from public.locations where name = 'Warehouse Madrid');

insert into public.locations (name, type)
select 'Warehouse Barcelona', 'warehouse'
where not exists (select 1 from public.locations where name = 'Warehouse Barcelona');
