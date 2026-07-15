-- supabase/migrations/003_add_requested_by_default.sql
alter table public.requests alter column requested_by set default auth.uid();
