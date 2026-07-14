alter table public.items add column if not exists retired boolean not null default false;

-- Seed the single warehouse location. Idempotent: safe to re-run.
insert into public.locations (name, type)
select 'Warehouse', 'warehouse'
where not exists (select 1 from public.locations where type = 'warehouse');
