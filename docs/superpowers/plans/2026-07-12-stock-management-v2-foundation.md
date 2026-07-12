# Stock Management v2 — Foundation (Plan 1 of 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Supabase backend (schema + Row Level Security policies) and the client-side
auth foundation (Supabase client + login/session/role handling), deployed alongside the existing
read-only dashboard, so a real invited user can log in on the live site and the database enforces
admin-vs-viewer permissions before any CRUD screens exist.

**Architecture:** A SQL migration (`supabase/schema.sql`) creates `profiles`, `locations`,
`materials`, `items`, `movements`, and `requests`, with Row Level Security policies keyed off
`profiles.role`. On the client, `js/supabaseClient.js` creates the Supabase JS client (loaded from
esm.sh, no npm/bundler); `js/auth.js` exports a `createAuthModule(client)` factory holding all auth
logic, built with dependency injection specifically so it can be unit-tested under plain Node
without a network call or a live Supabase project. `js/main.js` wires a login/logout bar into
`index.html` alongside the current dashboard, which is left completely untouched in this plan.

**Tech Stack:** Supabase (Postgres + Auth + Row Level Security), vanilla JS ES modules (no
bundler), `@supabase/supabase-js` v2 via `https://esm.sh/@supabase/supabase-js@2` in the browser,
Node.js built-in test runner (`node:test`, `node:assert/strict`) for dev-time unit tests only.

## Global Constraints

- The deployed site remains a static site with zero build step — GitHub Pages serves `index.html`
  and `js/*.js` directly. Node/npm are dev-time only (for running unit tests), never part of the
  deployed artifact.
- Any module whose logic needs the Supabase client receives it as a parameter (dependency
  injection) instead of importing `js/supabaseClient.js` directly, so that logic can be
  unit-tested under Node without network access or a browser. `js/supabaseClient.js` itself is a
  thin, intentionally untested wrapper — verified only by manual/browser steps.
- Roles are exactly the strings `admin` and `viewer` (matches the `profiles.role` check
  constraint) — no other role values anywhere in app code or SQL.
- Accounts are per-person and invite-only: no shared passwords, no public signup form, in this or
  any later plan.
- This plan does not touch the existing dashboard's inline `<script>` in `index.html` or its CSV
  fetch logic — that is fully in scope for Plan 2, not this one.

---

### Task 1: Node test harness

**Files:**
- Create: `package.json`
- Create: `tests/smoke.test.js`

**Interfaces:**
- Produces: `npm test` runs `node --test tests/`, the convention every later task's tests rely on.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "weblogistica-ignite",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test tests/"
  }
}
```

- [ ] **Step 2: Write a smoke test that fails on purpose**

```javascript
// tests/smoke.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('harness runs', () => {
  assert.equal(1, 2);
});
```

- [ ] **Step 3: Run it and confirm it fails**

Run: `npm test`
Expected: output includes `tests 1`, `pass 0`, `fail 1`.

- [ ] **Step 4: Fix the assertion**

```javascript
// tests/smoke.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('harness runs', () => {
  assert.equal(1, 1);
});
```

- [ ] **Step 5: Run it and confirm it passes**

Run: `npm test`
Expected: output includes `tests 1`, `pass 1`, `fail 0`.

- [ ] **Step 6: Commit**

```bash
git add package.json tests/smoke.test.js
git commit -m "chore: add Node test harness"
```

---

### Task 2: Database schema and Row Level Security policies

**Files:**
- Create: `supabase/schema.sql`
- Create: `supabase/README.md`

**Interfaces:**
- Produces: tables `profiles`, `locations`, `materials`, `items`, `movements`, `requests`, all with
  RLS enabled, matching the columns listed below — every later task and plan queries exactly these
  table/column names.

This task requires a real Supabase project, which only you (the human) can create — there is no
way for an agent to do this on your behalf. Steps marked **USER ACTION** must be performed by you;
report back the results (or paste any error) so the task can continue.

- [ ] **Step 1: USER ACTION — create the Supabase project**

Go to https://supabase.com, create a new project (any name/region). Once it's provisioned, go to
Project Settings → API and note down:
- **Project URL** (looks like `https://abcdefgh.supabase.co`)
- **anon public key** (a long string)

Keep these — Task 3 needs them.

- [ ] **Step 2: Write `supabase/schema.sql`**

```sql
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
-- The first admin is bootstrapped manually in Step 4.
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
  current_location_id uuid not null references public.locations(id)
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
```

- [ ] **Step 3: USER ACTION — apply the schema**

In the Supabase dashboard, open SQL Editor → New Query, paste the entire contents of
`supabase/schema.sql`, and run it. Expected: "Success. No rows returned." If it errors, paste the
exact error back before continuing.

- [ ] **Step 4: USER ACTION — verify the schema structurally**

Still in SQL Editor, run:

```sql
select table_name from information_schema.tables
where table_schema = 'public'
order by table_name;
```

Expected rows: `items`, `locations`, `materials`, `movements`, `profiles`, `requests`.

Then run:

```sql
select tablename, policyname from pg_policies
where schemaname = 'public'
order by tablename, policyname;
```

Expected: at least one policy per table above (11 policies total across the 6 tables, per the SQL
in Step 2).

- [ ] **Step 5: USER ACTION — bootstrap the first admin**

Go to Authentication → Users → Add user (or Invite), create your own account with your email.
This fires the trigger from Step 2, creating a `profiles` row with `role = 'viewer'`. Promote
yourself to admin by running in SQL Editor:

```sql
update public.profiles set role = 'admin'
where id = (select id from auth.users where email = 'YOUR-EMAIL-HERE');
```

Replace `YOUR-EMAIL-HERE` with the email you just used. Verify with:

```sql
select id, role from public.profiles;
```

Expected: one row, `role = 'admin'`.

- [ ] **Step 6: Write `supabase/README.md`**

```markdown
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

   \`\`\`sql
   update public.profiles set role = 'admin'
   where id = (select id from auth.users where email = 'you@example.com');
   \`\`\`

## Inviting collaborators

Authentication -> Users -> Invite user, entering their email. They arrive as `role = 'viewer'`
automatically. There is no public signup form in the app itself.
```

- [ ] **Step 7: Commit**

```bash
git add supabase/schema.sql supabase/README.md
git commit -m "feat: add Supabase schema and RLS policies for stock management v2"
```

---

### Task 3: Supabase client and auth module

**Files:**
- Create: `js/config.js`
- Create: `js/supabaseClient.js`
- Create: `js/auth.js`
- Test: `tests/auth.test.js`

**Interfaces:**
- Consumes: nothing from earlier tasks except the Project URL/anon key from Task 2 Step 1, and the
  `profiles` table shape (`id`, `role`) from Task 2.
- Produces: `createAuthModule(client)` returning
  `{ signIn(email, password), signOut(), getSession(), getCurrentProfile(), onAuthStateChange(callback) }`,
  and a real `supabase` client export from `js/supabaseClient.js` — both used by Task 4's `main.js`
  and by every later plan that needs auth state.

- [ ] **Step 1: Write the failing test for the auth module**

```javascript
// tests/auth.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAuthModule } from '../js/auth.js';

function makeFakeClient({ session = null, profile = null, signInError = null } = {}) {
  const calls = [];
  return {
    calls,
    auth: {
      async signInWithPassword({ email, password }) {
        calls.push(['signInWithPassword', email, password]);
        if (signInError) return { data: { session: null }, error: { message: signInError } };
        return { data: { session: { user: { id: 'user-1' } } }, error: null };
      },
      async signOut() {
        calls.push(['signOut']);
        return { error: null };
      },
      async getSession() {
        return { data: { session }, error: null };
      },
      onAuthStateChange(cb) {
        calls.push(['onAuthStateChange']);
        return { data: { subscription: { unsubscribe() { calls.push(['unsubscribe']); } } } };
      },
    },
    from(table) {
      calls.push(['from', table]);
      return {
        select() { return this; },
        eq() { return this; },
        async single() {
          if (!profile) return { data: null, error: { message: 'no rows' } };
          return { data: profile, error: null };
        },
      };
    },
  };
}

test('signIn resolves with the session on success', async () => {
  const client = makeFakeClient();
  const auth = createAuthModule(client);
  const session = await auth.signIn('a@b.com', 'secret');
  assert.equal(session.user.id, 'user-1');
  assert.deepEqual(client.calls[0], ['signInWithPassword', 'a@b.com', 'secret']);
});

test('signIn throws with the Supabase error message on failure', async () => {
  const client = makeFakeClient({ signInError: 'Invalid login credentials' });
  const auth = createAuthModule(client);
  await assert.rejects(
    () => auth.signIn('a@b.com', 'wrong'),
    (err) => {
      assert.equal(err.message, 'Invalid login credentials');
      return true;
    }
  );
});

test('getCurrentProfile returns null when there is no session', async () => {
  const client = makeFakeClient({ session: null });
  const auth = createAuthModule(client);
  const profile = await auth.getCurrentProfile();
  assert.equal(profile, null);
});

test('getCurrentProfile returns the profile row for the current session', async () => {
  const client = makeFakeClient({
    session: { user: { id: 'user-1' } },
    profile: { id: 'user-1', role: 'admin' },
  });
  const auth = createAuthModule(client);
  const profile = await auth.getCurrentProfile();
  assert.deepEqual(profile, { id: 'user-1', role: 'admin' });
});

test('onAuthStateChange forwards the session to the callback and returns the subscription', () => {
  const client = makeFakeClient();
  const auth = createAuthModule(client);
  let received;
  const subscription = auth.onAuthStateChange((session) => { received = session; });
  assert.ok(subscription.unsubscribe);
  assert.deepEqual(client.calls.at(-1), ['onAuthStateChange']);
});
```

- [ ] **Step 2: Run tests and confirm they fail**

Run: `npm test`
Expected: fails with `Cannot find module '../js/auth.js'`.

- [ ] **Step 3: Implement `js/auth.js`**

```javascript
// js/auth.js
export function createAuthModule(client) {
  async function signIn(email, password) {
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
    return data.session;
  }

  async function signOut() {
    const { error } = await client.auth.signOut();
    if (error) throw new Error(error.message);
  }

  async function getSession() {
    const { data, error } = await client.auth.getSession();
    if (error) throw new Error(error.message);
    return data.session;
  }

  async function getCurrentProfile() {
    const session = await getSession();
    if (!session) return null;
    const { data, error } = await client
      .from('profiles')
      .select('id, role')
      .eq('id', session.user.id)
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  function onAuthStateChange(callback) {
    const { data } = client.auth.onAuthStateChange((_event, session) => callback(session));
    return data.subscription;
  }

  return { signIn, signOut, getSession, getCurrentProfile, onAuthStateChange };
}
```

- [ ] **Step 4: Run tests and confirm they pass**

Run: `npm test`
Expected: `tests 5`, `pass 5`, `fail 0`.

- [ ] **Step 5: Write `js/config.js`**

```javascript
// js/config.js
// Fill these in from your Supabase project: Project Settings -> API.
export const SUPABASE_URL = 'https://YOUR-PROJECT.supabase.co';
export const SUPABASE_ANON_KEY = 'YOUR-ANON-PUBLIC-KEY';
```

Then replace the two placeholder values with the real Project URL and anon key you noted in
Task 2, Step 1.

- [ ] **Step 6: Write `js/supabaseClient.js`**

```javascript
// js/supabaseClient.js
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Exposed for manual verification in the browser console (Task 4). The anon key is
// public by design in Supabase's model — RLS policies are what protect the data.
window.supabase = supabase;
```

This file is intentionally not covered by `npm test` — it imports a bare `https://` URL, which
Node's module loader cannot resolve, and it needs a live Supabase project to do anything
meaningful. It's verified manually in Task 4.

- [ ] **Step 7: Commit**

```bash
git add js/config.js js/supabaseClient.js js/auth.js tests/auth.test.js
git commit -m "feat: add Supabase client and unit-tested auth module"
```

---

### Task 4: Login UI wired into the existing page

**Files:**
- Modify: `index.html` (add markup only; the existing inline `<script>` and CSV `.livebar` are
  untouched)
- Create: `js/main.js`

**Interfaces:**
- Consumes: `supabase` from `js/supabaseClient.js`, `createAuthModule` from `js/auth.js` (Task 3).
- Produces: nothing consumed by other tasks in this plan — this is the plan's end-to-end
  deliverable. Later plans add their own containers/scripts alongside this one.

- [ ] **Step 1: Add the auth bar markup to `index.html`**

Insert immediately after the closing `</header>` tag (i.e. directly above the existing
`<div class="livebar">` block), and add the new script tag at the end of `<body>` alongside the
existing one:

```html
<div class="livebar" id="authBar">
  <div class="livebar-inner">
    <span class="livebar-label">Account</span>
    <form id="loginForm" style="display:flex; gap:8px; align-items:center; flex:1; min-width:220px;">
      <input id="loginEmail" type="email" placeholder="Email" required
        style="border:1px solid var(--line); background:var(--card); padding:7px 10px; font-family:'IBM Plex Mono', monospace; font-size:12.5px;">
      <input id="loginPassword" type="password" placeholder="Password" required
        style="border:1px solid var(--line); background:var(--card); padding:7px 10px; font-family:'IBM Plex Mono', monospace; font-size:12.5px;">
      <button type="submit" class="chip">Log in</button>
    </form>
    <button id="logoutBtn" class="chip" style="display:none;">Log out</button>
    <span id="authStatus" class="live-status idle">Not logged in.</span>
  </div>
</div>
```

```html
<script type="module" src="js/main.js"></script>
```

Add this new `<script type="module">` tag alongside (after) the existing plain `<script>` tag at
the bottom of `<body>` — do not remove or modify the existing one.

- [ ] **Step 2: Write `js/main.js`**

```javascript
// js/main.js
import { supabase } from './supabaseClient.js';
import { createAuthModule } from './auth.js';

const auth = createAuthModule(supabase);

function setAuthStatus(msg, kind) {
  const el = document.getElementById('authStatus');
  el.textContent = msg;
  el.className = 'live-status ' + (kind || '');
}

async function refreshAuthUI() {
  const loginForm = document.getElementById('loginForm');
  const logoutBtn = document.getElementById('logoutBtn');
  try {
    const profile = await auth.getCurrentProfile();
    if (profile) {
      setAuthStatus(`Logged in as ${profile.role}`, 'live');
      loginForm.style.display = 'none';
      logoutBtn.style.display = '';
    } else {
      setAuthStatus('Not logged in.', 'idle');
      loginForm.style.display = '';
      logoutBtn.style.display = 'none';
    }
  } catch (err) {
    setAuthStatus('Could not check session: ' + err.message, 'error');
  }
}

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;
  setAuthStatus('Logging in…', 'loading');
  try {
    await auth.signIn(email, password);
    await refreshAuthUI();
  } catch (err) {
    setAuthStatus('Login failed: ' + err.message, 'error');
  }
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
  await auth.signOut();
  await refreshAuthUI();
});

refreshAuthUI();
```

- [ ] **Step 3: USER ACTION — serve the site locally and verify login**

Run: `npx http-server -p 8080 .` (or any static file server — module imports require `http://`,
not `file://`), then open `http://localhost:8080`.

Expected: the existing dashboard still renders exactly as before. The new "Account" bar shows a
login form and "Not logged in."

Log in with the admin email/password from Task 2, Step 5. Expected: the form hides, "Log out"
appears, and the status reads "Logged in as admin."

- [ ] **Step 4: USER ACTION — verify RLS enforcement from the browser console**

Still logged in as admin, open devtools console and run:

```javascript
await window.supabase.from('locations').insert({ name: 'Test School', type: 'school' })
```

Expected: `{ data: [...], error: null }` — the insert succeeds.

Click "Log out", then invite a second test user (Authentication → Users → Invite, in the Supabase
dashboard) and log in as that user on the page (they'll need to set a password via the invite
email first). Expected status: "Logged in as viewer" (the trigger from Task 2 defaults new users
to viewer).

As this viewer, run in the console:

```javascript
await window.supabase.from('locations').insert({ name: 'Should Fail', type: 'school' })
```

Expected: `data: null`, and `error.message` mentioning a row-level security policy violation.

Then run:

```javascript
await window.supabase.from('locations').select('*')
```

Expected: succeeds and includes the "Test School" row the admin inserted — proving the read
policy (`using (true)`) applies to both roles while writes are admin-only.

- [ ] **Step 5: Commit**

```bash
git add index.html js/main.js
git commit -m "feat: add login/logout UI wired to Supabase auth"
```

---

## What this plan does not cover

Schools/items CRUD, direct transfers, the request/approval workflow, and history views are all
deferred to later plans, per the design spec's data model and flows sections — this plan only
proves the database schema, RLS policies, and login/session/role infrastructure work end-to-end.
