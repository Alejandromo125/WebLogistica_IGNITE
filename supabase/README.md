# Supabase setup

This project's database lives in Supabase, not in this repo — `schema.sql` is the source of
truth for tables and Row Level Security policies, applied manually via the Supabase SQL Editor
(there is no CLI/migration tooling wired up).

## First-time setup

1. Create a project at https://supabase.com.
2. Project Settings -> API: copy the Project URL and anon public key into `js/config.js`.
3. SQL Editor: paste and run the contents of `schema.sql`.
4. Authentication -> Users: create your own user. It gets a `viewer` profile automatically
   (via the `handle_new_user` trigger). Promote it to admin:

   ```sql
   update public.profiles set role = 'admin'
   where id = (select id from auth.users where email = 'you@example.com');
   ```

## Inviting collaborators

Authentication -> Users -> Invite user, entering their email. They arrive as `role = 'viewer'`
automatically. There is no public signup form in the app itself.
