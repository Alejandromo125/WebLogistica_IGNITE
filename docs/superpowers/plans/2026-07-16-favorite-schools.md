# Favourite Schools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let each account (viewer or admin) mark schools as favourites for faster access, without a
new nav tab — a star toggle on each school card plus a "★ Favourites" filter chip alongside the
existing Tier 1/Tier 2 chips on the Schools route.

**Architecture:** A new `favorites` join table (`profile_id`, `location_id`) is genuinely personal
preference data, not stock data — RLS lets each user read/insert/delete only their own rows, no
admin gate, and (unlike every other table in this app) it's fine for it to be freely deletable.
`js/store.js` fetches it alongside everything else and exposes `isFavorite(locationId)`;
`js/schools.js` renders a star button per card (`stopPropagation` so it doesn't trigger card-click
navigation) and reuses the existing chip-filter pattern for a favourites-only view.

**Tech Stack:** Vanilla ES modules (no bundler), Supabase JS client, Node's built-in test runner.

## Depends on

**This plan assumes [`2026-07-16-person-locations.md`](2026-07-16-person-locations.md) has already
been merged.** That plan also touches `js/api.js` and `js/store.js` (adding `listProfiles` /
`profiles` / `computeTeam`), and this plan's full-file replacements for those two files are written
against the *post-person-locations* content. If person-locations hasn't landed yet, apply that plan
first — building both in parallel against the same two files will conflict.

## Global Constraints

- No build step, no bundler — every modified file is a plain ES module loaded by the browser
  exactly like the existing ones.
- `js/api.js` is the only module that talks to Supabase tables directly; new functions follow the
  same `createApi(client)` pattern and get test coverage in `tests/api.test.js`.
- `js/store.js` is unit-tested against an injected fake api in `tests/store.test.js`; new store
  functions get the same treatment.
- Containers are fully cleared and rebuilt on each render (`innerHTML = ''` then repopulated) — the
  favourites toggle follows the existing app-wide mutation pattern (`await api.<mutate>()` →
  `await store.refresh()` → `await ctx.rerender()`), not a local DOM patch.
- User-entered free text must go through `escapeHtml()` (from `js/schools.js`) before being
  interpolated into `innerHTML`.
- Unlike every other table in this app, `favorites` rows **are** meant to be freely deletable by
  their own owner — un-favouriting is normal personal-preference churn, not the kind of stock-data
  deletion this app otherwise avoids.
- Every new/modified `.js` file must pass `node --check <path>` before it's considered done.

---

## File Structure

**Create:**
- `supabase/migrations/007_add_favorites.sql` — live-DB migration

**Modify:**
- `supabase/schema.sql` — add the `favorites` table + RLS policies
- `js/api.js` — add `listFavorites()`, `addFavorite(locationId)`, `removeFavorite(locationId)`
- `js/store.js` — add the `favorites` collection, `getFavorites()`, `isFavorite(locationId)`
- `js/schools.js` — star toggle per card + "★ Favourites" filter chip
- `index.html` — small CSS block for `.fav-toggle`
- `tests/api.test.js` — cover the three new functions (and extend the shared fake-client helper
  with a `.delete()` chain, which nothing currently exercises)
- `tests/store.test.js` — cover `favorites`/`isFavorite`
- `CLAUDE.md` — document the new table and the favourites UI

**Unchanged:** `js/auth.js`, `js/items.js`, `js/transfers.js`, `js/history.js`, `js/history.js`,
`js/requests.js`, `js/overview.js`, `js/locationDetail.js`, `js/schoolForm.js`, `js/personForm.js`,
`js/router.js`, `js/main.js`, `js/config.js`, `js/supabaseClient.js`.

---

### Task 1: Schema change — `favorites` table + migration

**Files:**
- Modify: `supabase/schema.sql` (append after the `perform_transfer` grant, at the end of the file)
- Create: `supabase/migrations/007_add_favorites.sql`

**Interfaces:**
- Produces: `favorites(profile_id uuid, location_id uuid, created_at)`, primary key
  `(profile_id, location_id)`, RLS-scoped so `auth.uid()` can only see/insert/delete its own rows.
  Consumed by `js/api.js` (Task 2).

- [ ] **Step 1: Append to `supabase/schema.sql`**

Add this block at the very end of `supabase/schema.sql` (after the existing
`grant execute on function public.perform_transfer(...)` line):

```sql

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
```

- [ ] **Step 2: Write the migration file**

```sql
-- supabase/migrations/007_add_favorites.sql
-- Adds a per-user "favourite schools" list. Personal preference data, not
-- stock data — freely insertable/deletable by its own owner, no admin gate.
-- Idempotent: safe to re-run.

create table if not exists public.favorites (
  profile_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, location_id)
);

alter table public.favorites enable row level security;

drop policy if exists "favorites: user can read their own" on public.favorites;
create policy "favorites: user can read their own"
  on public.favorites for select
  to authenticated
  using (profile_id = auth.uid());

drop policy if exists "favorites: user can insert their own" on public.favorites;
create policy "favorites: user can insert their own"
  on public.favorites for insert
  to authenticated
  with check (profile_id = auth.uid());

drop policy if exists "favorites: user can delete their own" on public.favorites;
create policy "favorites: user can delete their own"
  on public.favorites for delete
  to authenticated
  using (profile_id = auth.uid());
```

- [ ] **Step 3: Commit**

```bash
git add supabase/schema.sql supabase/migrations/007_add_favorites.sql
git commit -m "feat: add per-user favorite schools table"
```

---

### Task 2: `js/api.js` — favourites functions

**Files:**
- Modify: `js/api.js` (full replacement)
- Test: `tests/api.test.js` (full replacement — also extends the shared fake-client helper with a
  `.delete()` chain)

**Interfaces:**
- Produces: `listFavorites() -> Promise<Array<{location_id: string}>>` (RLS already scopes this to
  the caller's own rows, so no `profileId` argument is needed); `addFavorite(locationId: string) ->
  Promise<{profile_id, location_id, created_at}>`; `removeFavorite(locationId: string) ->
  Promise<void>`. Consumed by `js/store.js` (Task 3) and `js/schools.js` (Task 4).

- [ ] **Step 1: Write the failing tests**

Replace `tests/api.test.js` in full (this adds a `.delete()` chain to `makeFakeClient` and appends
favourites tests at the end; every existing test is unchanged):

```js
// tests/api.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApi } from '../js/api.js';

function makeFakeClient(responses) {
  const calls = [];
  return {
    calls,
    from(table) {
      const behavior = responses[table] || {};
      return {
        select(cols) {
          calls.push(['select', table, cols]);
          return {
            order(col) {
              calls.push(['order', table, col]);
              return Promise.resolve(behavior.selectOrder);
            },
            then(resolve, reject) {
              return Promise.resolve(behavior.select).then(resolve, reject);
            },
          };
        },
        insert(payload) {
          calls.push(['insert', table, payload]);
          return {
            select() {
              return {
                single() {
                  return Promise.resolve(behavior.insert);
                },
              };
            },
          };
        },
        update(changes) {
          calls.push(['update', table, changes]);
          const chain = {
            eq(col, val) {
              calls.push(['eq', col, val]);
              return chain;
            },
            select() {
              return {
                single() {
                  return Promise.resolve(behavior.update);
                },
              };
            },
          };
          return chain;
        },
        delete() {
          calls.push(['delete', table]);
          return {
            eq(col, val) {
              calls.push(['eq', col, val]);
              return Promise.resolve(behavior.delete || { error: null });
            },
          };
        },
      };
    },
    rpc(fn, params) {
      calls.push(['rpc', fn, params]);
      return Promise.resolve(responses.rpc);
    },
  };
}

test('listLocations returns locations ordered by name', async () => {
  const rows = [{ id: '1', name: 'BSB Cast', type: 'school' }];
  const client = makeFakeClient({ locations: { selectOrder: { data: rows, error: null } } });
  const api = createApi(client);
  const result = await api.listLocations();
  assert.deepEqual(result, rows);
  assert.deepEqual(client.calls[0], ['select', 'locations', '*']);
  assert.deepEqual(client.calls[1], ['order', 'locations', 'name']);
});

test('listLocations throws with the Supabase error message on failure', async () => {
  const client = makeFakeClient({ locations: { selectOrder: { data: null, error: { message: 'boom' } } } });
  const api = createApi(client);
  await assert.rejects(() => api.listLocations(), (err) => { assert.equal(err.message, 'boom'); return true; });
});

test('createLocation inserts and returns the new row', async () => {
  const row = { id: '2', name: 'BSB Sitges', type: 'school' };
  const client = makeFakeClient({ locations: { insert: { data: row, error: null } } });
  const api = createApi(client);
  const result = await api.createLocation({ name: 'BSB Sitges', type: 'school' });
  assert.deepEqual(result, row);
  assert.deepEqual(client.calls[0], ['insert', 'locations', { name: 'BSB Sitges', type: 'school' }]);
});

test('createLocation throws with the Supabase error message on failure', async () => {
  const client = makeFakeClient({ locations: { insert: { data: null, error: { message: 'insert failed' } } } });
  const api = createApi(client);
  await assert.rejects(
    () => api.createLocation({ name: 'X', type: 'school' }),
    (err) => { assert.equal(err.message, 'insert failed'); return true; }
  );
});

test('updateLocation updates by id and returns the updated row', async () => {
  const row = { id: '2', name: 'BSB Sitges Updated', type: 'school' };
  const client = makeFakeClient({ locations: { update: { data: row, error: null } } });
  const api = createApi(client);
  const result = await api.updateLocation('2', { name: 'BSB Sitges Updated' });
  assert.deepEqual(result, row);
  assert.deepEqual(client.calls[0], ['update', 'locations', { name: 'BSB Sitges Updated' }]);
  assert.deepEqual(client.calls[1], ['eq', 'id', '2']);
});

test('listMaterials returns materials ordered by name', async () => {
  const rows = [{ id: 'm1', name: 'Robot Kit' }];
  const client = makeFakeClient({ materials: { selectOrder: { data: rows, error: null } } });
  const api = createApi(client);
  const result = await api.listMaterials();
  assert.deepEqual(result, rows);
});

test('createMaterial inserts by name and returns the new row', async () => {
  const row = { id: 'm2', name: 'Box' };
  const client = makeFakeClient({ materials: { insert: { data: row, error: null } } });
  const api = createApi(client);
  const result = await api.createMaterial('Box');
  assert.deepEqual(result, row);
  assert.deepEqual(client.calls[0], ['insert', 'materials', { name: 'Box' }]);
});

test('listItems returns all items', async () => {
  const rows = [{ id: 'R-101', material_id: 'm1', current_location_id: 'l1', retired: false }];
  const client = makeFakeClient({ items: { select: { data: rows, error: null } } });
  const api = createApi(client);
  const result = await api.listItems();
  assert.deepEqual(result, rows);
});

test('createItem inserts and returns the new row', async () => {
  const row = { id: 'R-102', material_id: 'm1', current_location_id: 'l1', retired: false };
  const client = makeFakeClient({ items: { insert: { data: row, error: null } } });
  const api = createApi(client);
  const result = await api.createItem({ id: 'R-102', material_id: 'm1', current_location_id: 'l1' });
  assert.deepEqual(result, row);
});

test('updateItem updates by id and returns the updated row (used for retiring)', async () => {
  const row = { id: 'R-102', material_id: 'm1', current_location_id: 'l1', retired: true };
  const client = makeFakeClient({ items: { update: { data: row, error: null } } });
  const api = createApi(client);
  const result = await api.updateItem('R-102', { retired: true });
  assert.deepEqual(result, row);
  assert.deepEqual(client.calls[0], ['update', 'items', { retired: true }]);
  assert.deepEqual(client.calls[1], ['eq', 'id', 'R-102']);
});

test('updateItem throws with the Supabase error message on failure', async () => {
  const client = makeFakeClient({ items: { update: { data: null, error: { message: 'update failed' } } } });
  const api = createApi(client);
  await assert.rejects(
    () => api.updateItem('R-102', { retired: true }),
    (err) => { assert.equal(err.message, 'update failed'); return true; }
  );
});

test('createRequest inserts and returns the new row', async () => {
  const row = { id: 'req1', requested_by: 'u1', location_id: 'l1', material_id: 'm1', quantity: 3, status: 'pending' };
  const client = makeFakeClient({ requests: { insert: { data: row, error: null } } });
  const api = createApi(client);
  const result = await api.createRequest({ location_id: 'l1', material_id: 'm1', quantity: 3 });
  assert.deepEqual(result, row);
  assert.deepEqual(client.calls[0], ['insert', 'requests', { location_id: 'l1', material_id: 'm1', quantity: 3 }]);
});

test('createRequest throws with the Supabase error message on failure', async () => {
  const client = makeFakeClient({ requests: { insert: { data: null, error: { message: 'quantity must be positive' } } } });
  const api = createApi(client);
  await assert.rejects(
    () => api.createRequest({ location_id: 'l1', material_id: 'm1', quantity: 0 }),
    (err) => { assert.equal(err.message, 'quantity must be positive'); return true; }
  );
});

test('listRequests returns all requests', async () => {
  const rows = [{ id: 'req1', status: 'pending', profiles: { email: 'viewer@example.com' } }];
  const client = makeFakeClient({ requests: { select: { data: rows, error: null } } });
  const api = createApi(client);
  const result = await api.listRequests();
  assert.deepEqual(result, rows);
});

test('updateRequest updates a pending request by id and returns the updated row', async () => {
  const row = { id: 'req1', status: 'denied', resolved_by: 'admin1' };
  const client = makeFakeClient({ requests: { update: { data: row, error: null } } });
  const api = createApi(client);
  const result = await api.updateRequest('req1', { status: 'denied', resolved_by: 'admin1', resolved_at: '2026-07-14T00:00:00Z' });
  assert.deepEqual(result, row);
  assert.deepEqual(client.calls[0], ['update', 'requests', { status: 'denied', resolved_by: 'admin1', resolved_at: '2026-07-14T00:00:00Z' }]);
  assert.deepEqual(client.calls[1], ['eq', 'id', 'req1']);
  assert.deepEqual(client.calls[2], ['eq', 'status', 'pending']);
});

test('updateRequest throws when the request is no longer pending', async () => {
  const client = makeFakeClient({ requests: { update: { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned' } } } });
  const api = createApi(client);
  await assert.rejects(
    () => api.updateRequest('req1', { status: 'denied' }),
    (err) => { assert.equal(err.message, 'JSON object requested, multiple (or no) rows returned'); return true; }
  );
});

test('performTransfer calls the perform_transfer RPC with the expected params and returns its result', async () => {
  const client = makeFakeClient({ rpc: { data: null, error: null } });
  const api = createApi(client);
  const result = await api.performTransfer(['R-101', 'R-102'], 'loc-warehouse', 'loc-school1', 'restock', 'req1');
  assert.deepEqual(result, null);
  assert.deepEqual(client.calls[0], ['rpc', 'perform_transfer', {
    item_ids: ['R-101', 'R-102'],
    from_location_id: 'loc-warehouse',
    to_location_id: 'loc-school1',
    note: 'restock',
    request_id: 'req1',
  }]);
});

test('performTransfer throws with the Supabase error message on failure', async () => {
  const client = makeFakeClient({ rpc: { data: null, error: { message: 'item(s) not available at expected location: R-101' } } });
  const api = createApi(client);
  await assert.rejects(
    () => api.performTransfer(['R-101'], 'loc-warehouse', 'loc-school1', null, null),
    (err) => { assert.equal(err.message, 'item(s) not available at expected location: R-101'); return true; }
  );
});

test('listMovements returns all movements', async () => {
  const rows = [{
    id: 'mv1', item_id: 'R-101', from_location_id: 'l1', to_location_id: 'l2',
    moved_by: 'admin1', moved_at: '2026-07-15T00:00:00Z', note: 'restock', request_id: null,
    mover: { email: 'admin@example.com' },
  }];
  const client = makeFakeClient({ movements: { select: { data: rows, error: null } } });
  const api = createApi(client);
  const result = await api.listMovements();
  assert.deepEqual(result, rows);
  assert.deepEqual(client.calls[0], ['select', 'movements', '*, mover:moved_by(email)']);
});

test('listMovements throws with the Supabase error message on failure', async () => {
  const client = makeFakeClient({ movements: { select: { data: null, error: { message: 'boom' } } } });
  const api = createApi(client);
  await assert.rejects(() => api.listMovements(), (err) => { assert.equal(err.message, 'boom'); return true; });
});

test('listProfiles returns profiles ordered by email', async () => {
  const rows = [{ id: 'u1', email: 'admin@example.com', role: 'admin' }];
  const client = makeFakeClient({ profiles: { selectOrder: { data: rows, error: null } } });
  const api = createApi(client);
  const result = await api.listProfiles();
  assert.deepEqual(result, rows);
  assert.deepEqual(client.calls[0], ['select', 'profiles', 'id, email, role']);
  assert.deepEqual(client.calls[1], ['order', 'profiles', 'email']);
});

test('listProfiles throws with the Supabase error message on failure', async () => {
  const client = makeFakeClient({ profiles: { selectOrder: { data: null, error: { message: 'boom' } } } });
  const api = createApi(client);
  await assert.rejects(() => api.listProfiles(), (err) => { assert.equal(err.message, 'boom'); return true; });
});

test('listFavorites returns the caller\'s favorite rows', async () => {
  const rows = [{ location_id: 'sch-1' }, { location_id: 'sch-2' }];
  const client = makeFakeClient({ favorites: { select: { data: rows, error: null } } });
  const api = createApi(client);
  const result = await api.listFavorites();
  assert.deepEqual(result, rows);
  assert.deepEqual(client.calls[0], ['select', 'favorites', 'location_id']);
});

test('listFavorites throws with the Supabase error message on failure', async () => {
  const client = makeFakeClient({ favorites: { select: { data: null, error: { message: 'boom' } } } });
  const api = createApi(client);
  await assert.rejects(() => api.listFavorites(), (err) => { assert.equal(err.message, 'boom'); return true; });
});

test('addFavorite inserts by location_id (profile_id defaults server-side) and returns the new row', async () => {
  const row = { profile_id: 'u1', location_id: 'sch-1', created_at: '2026-07-16T00:00:00Z' };
  const client = makeFakeClient({ favorites: { insert: { data: row, error: null } } });
  const api = createApi(client);
  const result = await api.addFavorite('sch-1');
  assert.deepEqual(result, row);
  assert.deepEqual(client.calls[0], ['insert', 'favorites', { location_id: 'sch-1' }]);
});

test('addFavorite throws with the Supabase error message on failure', async () => {
  const client = makeFakeClient({ favorites: { insert: { data: null, error: { message: 'duplicate key value' } } } });
  const api = createApi(client);
  await assert.rejects(
    () => api.addFavorite('sch-1'),
    (err) => { assert.equal(err.message, 'duplicate key value'); return true; }
  );
});

test('removeFavorite deletes by location_id', async () => {
  const client = makeFakeClient({ favorites: { delete: { error: null } } });
  const api = createApi(client);
  await api.removeFavorite('sch-1');
  assert.deepEqual(client.calls[0], ['delete', 'favorites']);
  assert.deepEqual(client.calls[1], ['eq', 'location_id', 'sch-1']);
});

test('removeFavorite throws with the Supabase error message on failure', async () => {
  const client = makeFakeClient({ favorites: { delete: { error: { message: 'boom' } } } });
  const api = createApi(client);
  await assert.rejects(() => api.removeFavorite('sch-1'), (err) => { assert.equal(err.message, 'boom'); return true; });
});
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `npm test`
Expected: FAIL — `api.listFavorites is not a function` (and `addFavorite`/`removeFavorite`).

- [ ] **Step 3: Replace `js/api.js` in full**

```js
// js/api.js
export function createApi(client) {
  async function listLocations() {
    const { data, error } = await client.from('locations').select('*').order('name');
    if (error) throw new Error(error.message);
    return data;
  }

  async function createLocation(location) {
    const { data, error } = await client.from('locations').insert(location).select().single();
    if (error) throw new Error(error.message);
    return data;
  }

  async function updateLocation(id, changes) {
    const { data, error } = await client.from('locations').update(changes).eq('id', id).select().single();
    if (error) throw new Error(error.message);
    return data;
  }

  async function listMaterials() {
    const { data, error } = await client.from('materials').select('*').order('name');
    if (error) throw new Error(error.message);
    return data;
  }

  async function createMaterial(name) {
    const { data, error } = await client.from('materials').insert({ name }).select().single();
    if (error) throw new Error(error.message);
    return data;
  }

  async function listItems() {
    const { data, error } = await client.from('items').select('*');
    if (error) throw new Error(error.message);
    return data;
  }

  async function createItem(item) {
    const { data, error } = await client.from('items').insert(item).select().single();
    if (error) throw new Error(error.message);
    return data;
  }

  async function updateItem(id, changes) {
    const { data, error } = await client.from('items').update(changes).eq('id', id).select().single();
    if (error) throw new Error(error.message);
    return data;
  }

  async function createRequest(request) {
    const { data, error } = await client.from('requests').insert(request).select().single();
    if (error) throw new Error(error.message);
    return data;
  }

  async function listRequests() {
    const { data, error } = await client.from('requests').select('*, requester:requested_by(email)');
    if (error) throw new Error(error.message);
    return data;
  }

  async function updateRequest(id, changes) {
    const { data, error } = await client.from('requests').update(changes).eq('id', id).eq('status', 'pending').select().single();
    if (error) throw new Error(error.message);
    return data;
  }

  async function performTransfer(itemIds, fromLocationId, toLocationId, note, requestId) {
    const { data, error } = await client.rpc('perform_transfer', {
      item_ids: itemIds,
      from_location_id: fromLocationId,
      to_location_id: toLocationId,
      note,
      request_id: requestId,
    });
    if (error) throw new Error(error.message);
    return data;
  }

  async function listMovements() {
    const { data, error } = await client.from('movements').select('*, mover:moved_by(email)');
    if (error) throw new Error(error.message);
    return data;
  }

  async function listProfiles() {
    const { data, error } = await client.from('profiles').select('id, email, role').order('email');
    if (error) throw new Error(error.message);
    return data;
  }

  async function listFavorites() {
    const { data, error } = await client.from('favorites').select('location_id');
    if (error) throw new Error(error.message);
    return data;
  }

  async function addFavorite(locationId) {
    const { data, error } = await client.from('favorites').insert({ location_id: locationId }).select().single();
    if (error) throw new Error(error.message);
    return data;
  }

  async function removeFavorite(locationId) {
    const { error } = await client.from('favorites').delete().eq('location_id', locationId);
    if (error) throw new Error(error.message);
  }

  return {
    listLocations, createLocation, updateLocation,
    listMaterials, createMaterial,
    listItems, createItem, updateItem,
    createRequest, listRequests, updateRequest, performTransfer,
    listMovements,
    listProfiles,
    listFavorites, addFavorite, removeFavorite,
  };
}
```

> Note: if the person-locations plan hasn't landed, `js/api.js` won't have `listProfiles` yet —
> drop that one function/export line and everything else in this task still applies cleanly.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS — every test in the file green.

- [ ] **Step 5: Syntax-check**

Run: `node --check js/api.js`
Expected: no output, exit code 0.

- [ ] **Step 6: Commit**

```bash
git add js/api.js tests/api.test.js
git commit -m "feat: add listFavorites/addFavorite/removeFavorite to js/api.js"
```

---

### Task 3: `js/store.js` — favorites collection

**Files:**
- Modify: `js/store.js` (full replacement)
- Test: `tests/store.test.js` (full replacement)

**Interfaces:**
- Consumes: `api.listFavorites()` from Task 2.
- Produces: `getFavorites() -> Array<{location_id}>`; `isFavorite(locationId: string) -> boolean`.
  Consumed by `js/schools.js` (Task 4).

- [ ] **Step 1: Write the failing tests**

Replace `tests/store.test.js` in full:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../js/store.js';

function makeFakeApi(data) {
  return {
    listLocations: async () => data.locations,
    listMaterials: async () => data.materials,
    listItems: async () => data.items,
    listRequests: async () => data.requests,
    listMovements: async () => data.movements,
    listProfiles: async () => data.profiles,
    listFavorites: async () => data.favorites,
  };
}

const sampleData = {
  locations: [
    { id: 'wh-mad', name: 'Warehouse Madrid', type: 'warehouse' },
    { id: 'wh-bcn', name: 'Warehouse Barcelona', type: 'warehouse' },
    { id: 'sch-1', name: 'BSB Cast', type: 'school', tier: 'Tier1', students: 200 },
    { id: 'sch-2', name: 'BSB Sitges', type: 'school', tier: 'Tier2', students: 150 },
    { id: 'per-1', name: 'Monitor 1 custody', type: 'person', owner_profile_id: 'mon1' },
  ],
  materials: [{ id: 'm1', name: 'Robot Kit' }],
  items: [
    { id: 'R-1', material_id: 'm1', current_location_id: 'sch-1', retired: false },
    { id: 'R-2', material_id: 'm1', current_location_id: 'wh-mad', retired: false },
    { id: 'R-3', material_id: 'm1', current_location_id: 'wh-mad', retired: true },
    { id: 'R-4', material_id: 'm1', current_location_id: 'per-1', retired: false },
  ],
  requests: [],
  movements: [],
  profiles: [
    { id: 'admin1', email: 'admin@example.com', role: 'admin' },
    { id: 'mon1', email: 'monitor1@example.com', role: 'viewer' },
  ],
  favorites: [{ profile_id: 'admin1', location_id: 'sch-1' }],
};

test('refresh populates all seven collections from the injected api', async () => {
  const store = createStore(makeFakeApi(sampleData));
  await store.refresh();
  assert.deepEqual(store.getLocations(), sampleData.locations);
  assert.deepEqual(store.getMaterials(), sampleData.materials);
  assert.deepEqual(store.getItems(), sampleData.items);
  assert.deepEqual(store.getProfiles(), sampleData.profiles);
  assert.deepEqual(store.getFavorites(), sampleData.favorites);
});

test('clear empties all collections', async () => {
  const store = createStore(makeFakeApi(sampleData));
  await store.refresh();
  store.clear();
  assert.deepEqual(store.getLocations(), []);
  assert.deepEqual(store.getItems(), []);
  assert.deepEqual(store.getProfiles(), []);
  assert.deepEqual(store.getFavorites(), []);
});

test('computeSchools returns only school-type locations with computed material totals', async () => {
  const store = createStore(makeFakeApi(sampleData));
  await store.refresh();
  const schools = store.computeSchools();
  assert.equal(schools.length, 2);
  const cast = schools.find(s => s.id === 'sch-1');
  assert.equal(cast.totalUnits, 1);
  assert.deepEqual(cast.materials, [{ name: 'Robot Kit', ids: ['R-1'], count: 1 }]);
});

test('computeWarehouses returns both warehouses sorted by name, excluding retired items', async () => {
  const store = createStore(makeFakeApi(sampleData));
  await store.refresh();
  const warehouses = store.computeWarehouses();
  assert.equal(warehouses.length, 2);
  assert.deepEqual(warehouses.map(w => w.name), ['Warehouse Barcelona', 'Warehouse Madrid']);
  const madrid = warehouses.find(w => w.id === 'wh-mad');
  assert.equal(madrid.totalUnits, 1); // R-3 excluded because it's retired
});

test('computeTeam returns only person-type locations with resolved owner email', async () => {
  const store = createStore(makeFakeApi(sampleData));
  await store.refresh();
  const team = store.computeTeam();
  assert.equal(team.length, 1);
  assert.equal(team[0].ownerEmail, 'monitor1@example.com');
});

test('findLocationView returns null for an unknown id', async () => {
  const store = createStore(makeFakeApi(sampleData));
  await store.refresh();
  assert.equal(store.findLocationView('nope'), null);
});

test('findLocationView returns the computed view for a known id', async () => {
  const store = createStore(makeFakeApi(sampleData));
  await store.refresh();
  const view = store.findLocationView('sch-1');
  assert.equal(view.name, 'BSB Cast');
  assert.equal(view.totalUnits, 1);
});

test('isFavorite returns true for a favorited location', async () => {
  const store = createStore(makeFakeApi(sampleData));
  await store.refresh();
  assert.equal(store.isFavorite('sch-1'), true);
});

test('isFavorite returns false for a non-favorited location', async () => {
  const store = createStore(makeFakeApi(sampleData));
  await store.refresh();
  assert.equal(store.isFavorite('sch-2'), false);
});

test('isFavorite returns false before any refresh has happened', () => {
  const store = createStore(makeFakeApi(sampleData));
  assert.equal(store.isFavorite('sch-1'), false);
});
```

> Note: if the person-locations plan hasn't landed, drop the `per-1` location, the `computeTeam`
> test, and `listProfiles`/`getProfiles` references — everything else applies unchanged.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `store.getFavorites is not a function` / `store.isFavorite is not a function`.

- [ ] **Step 3: Replace `js/store.js` in full**

```js
export function createStore(api) {
  let locations = [];
  let materials = [];
  let items = [];
  let requests = [];
  let movements = [];
  let profiles = [];
  let favorites = [];

  async function refresh() {
    [locations, materials, items, requests, movements, profiles, favorites] = await Promise.all([
      api.listLocations(),
      api.listMaterials(),
      api.listItems(),
      api.listRequests(),
      api.listMovements(),
      api.listProfiles(),
      api.listFavorites(),
    ]);
  }

  function clear() {
    locations = [];
    materials = [];
    items = [];
    requests = [];
    movements = [];
    profiles = [];
    favorites = [];
  }

  function getLocations() { return locations; }
  function getMaterials() { return materials; }
  function getItems() { return items; }
  function getRequests() { return requests; }
  function getMovements() { return movements; }
  function getProfiles() { return profiles; }
  function getFavorites() { return favorites; }

  function isFavorite(locationId) {
    return favorites.some(f => f.location_id === locationId);
  }

  function computeLocationView(loc) {
    const materialsById = new Map(materials.map(m => [m.id, m]));
    const locItems = items.filter(i => i.current_location_id === loc.id && !i.retired);
    const byMaterial = new Map();
    locItems.forEach(i => {
      const mat = materialsById.get(i.material_id);
      const name = mat ? mat.name : 'Unknown material';
      if (!byMaterial.has(name)) byMaterial.set(name, []);
      byMaterial.get(name).push(i.id);
    });
    const locMaterials = Array.from(byMaterial.entries()).map(([name, ids]) => ({ name, ids, count: ids.length }));
    return {
      id: loc.id,
      name: loc.name,
      type: loc.type,
      tier: loc.tier,
      students: loc.students,
      notes: loc.notes,
      ownerProfileId: loc.owner_profile_id || null,
      materials: locMaterials,
      totalUnits: locItems.length,
    };
  }

  function computeSchools() {
    return locations.filter(l => l.type === 'school').map(computeLocationView);
  }

  function computeWarehouses() {
    return locations.filter(l => l.type === 'warehouse')
      .map(computeLocationView)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  function computeTeam() {
    const profilesById = new Map(profiles.map(p => [p.id, p]));
    return locations.filter(l => l.type === 'person')
      .map(l => {
        const view = computeLocationView(l);
        const owner = profilesById.get(l.owner_profile_id);
        return { ...view, ownerEmail: owner ? owner.email : null };
      })
      .sort((a, b) => (a.ownerEmail || a.name).localeCompare(b.ownerEmail || b.name));
  }

  function findLocationView(id) {
    const loc = locations.find(l => l.id === id);
    return loc ? computeLocationView(loc) : null;
  }

  return {
    refresh, clear,
    getLocations, getMaterials, getItems, getRequests, getMovements, getProfiles, getFavorites,
    computeSchools, computeWarehouses, computeTeam, findLocationView,
    isFavorite,
  };
}
```

> Note: if the person-locations plan hasn't landed, drop `profiles`/`getProfiles`/`computeTeam`/
> `ownerProfileId`/`api.listProfiles()` from this file — the `favorites` additions apply unchanged
> on top of the original (pre-person-locations) `js/store.js`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS — all store tests green.

- [ ] **Step 5: Syntax-check**

Run: `node --check js/store.js`
Expected: no output, exit code 0.

- [ ] **Step 6: Commit**

```bash
git add js/store.js tests/store.test.js
git commit -m "feat: add favorites collection and isFavorite() to the store"
```

---

### Task 4: `js/schools.js` — star toggle + Favourites filter chip

**Files:**
- Modify: `js/schools.js` (full replacement)
- Modify: `index.html` (add `.fav-toggle` CSS)

**Interfaces:**
- Consumes: `store.isFavorite(locationId)` (Task 3), `ctx.api.addFavorite`/`removeFavorite`
  (Task 2).
- Produces: no exported-signature change (`renderSchools(container, ctx)`, `escapeHtml` unchanged)
  — each school card gets a star button, and the tier filter bar gets a fourth "★ Favourites" chip.

- [ ] **Step 1: Add `.fav-toggle` CSS to `index.html`**

Insert this block into the `<style>` section, directly after the existing `.matchip.more{ opacity:0.75; }`
rule (in the "School / warehouse grid (cards)" section):

```css
  .fav-toggle{
    position:absolute; top:20px; left:20px;
    width:28px; height:28px; border-radius:999px;
    border:1px solid var(--border); background:var(--surface-muted);
    color:var(--text-muted); font-size:14px; line-height:1;
    cursor:pointer; display:flex; align-items:center; justify-content:center;
    transition:color .15s, border-color .15s, background .15s;
  }
  .fav-toggle:hover{ border-color:var(--accent); color:var(--accent); }
  .fav-toggle.active{
    background:color-mix(in srgb, var(--accent) 18%, var(--surface));
    border-color:var(--accent); color:var(--accent);
  }
```

- [ ] **Step 2: Replace `js/schools.js` in full**

```js
// js/schools.js
import { openSchoolForm } from './schoolForm.js';

export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

const state = { tier: 'ALL', query: '', favOnly: false };

function schoolMatchesFilters(s, store) {
  if (state.favOnly && !store.isFavorite(s.id)) return false;
  if (!state.favOnly && state.tier !== 'ALL' && s.tier !== state.tier) return false;
  if (state.query) {
    const q = state.query.toLowerCase();
    if (!s.name.toLowerCase().includes(q)) return false;
  }
  return true;
}

export function renderSchools(container, ctx) {
  const { store, isAdmin, navigate, api } = ctx;
  const schools = store.computeSchools();
  const t1 = schools.filter(s => s.tier === 'Tier1').length;
  const t2 = schools.filter(s => s.tier === 'Tier2').length;
  const favCount = schools.filter(s => store.isFavorite(s.id)).length;

  container.innerHTML = `
    <section>
      <div class="section-head">
        <h2>School manifest</h2>
        <div style="display:flex; align-items:center; gap:12px;">
          ${isAdmin ? '<button id="addSchoolBtn" class="chip">+ Add school</button>' : ''}
          <div class="tag" id="resultCount">0 schools</div>
        </div>
      </div>
      <div style="max-width:340px; margin-bottom:16px; background:var(--surface); border-radius:10px;">
        <input id="searchInput" type="text" placeholder="Search school name…" aria-label="Search schools"
          style="width:100%; border:none; background:none; padding:10px 12px; font-family:'Poppins', sans-serif; font-size:14px; color:var(--text);">
      </div>
      <div class="filterbar" id="tierFilterBar"></div>
      <div class="grid" id="schoolGrid"></div>
      <div class="empty-note" id="emptyNote" style="display:none;"></div>
    </section>
  `;

  const searchInput = container.querySelector('#searchInput');
  searchInput.value = state.query;
  searchInput.addEventListener('input', (e) => {
    state.query = e.target.value;
    renderGrid();
  });

  const tierFilterBar = container.querySelector('#tierFilterBar');
  function renderTierFilterBar() {
    const chips = [
      { key: 'ALL', label: 'All schools', n: schools.length },
      { key: 'Tier1', label: 'Tier 1', n: t1 },
      { key: 'Tier2', label: 'Tier 2', n: t2 },
      { key: 'FAVORITES', label: '★ Favourites', n: favCount },
    ];
    tierFilterBar.innerHTML = '';
    chips.forEach(c => {
      const btn = document.createElement('button');
      const active = c.key === 'FAVORITES' ? state.favOnly : (state.tier === c.key && !state.favOnly);
      btn.className = 'chip' + (active ? ' active' : '');
      btn.innerHTML = `${c.label} <span class="n">${c.n}</span>`;
      btn.addEventListener('click', () => {
        if (c.key === 'FAVORITES') {
          state.favOnly = !state.favOnly;
        } else {
          state.favOnly = false;
          state.tier = c.key;
        }
        renderTierFilterBar();
        renderGrid();
      });
      tierFilterBar.appendChild(btn);
    });
  }

  const grid = container.querySelector('#schoolGrid');
  const emptyNote = container.querySelector('#emptyNote');
  function renderGrid() {
    const list = schools.filter(s => schoolMatchesFilters(s, store));
    container.querySelector('#resultCount').textContent = `${list.length} school${list.length === 1 ? '' : 's'}`;
    grid.innerHTML = '';
    if (schools.length === 0) {
      emptyNote.style.display = 'block';
      emptyNote.textContent = isAdmin
        ? 'No schools yet. Click "+ Add school" above to add the first one.'
        : 'No schools recorded yet.';
      return;
    }
    emptyNote.style.display = list.length ? 'none' : 'block';
    emptyNote.textContent = state.favOnly
      ? 'No favourite schools yet. Click the star on a school card to add one.'
      : 'No schools match this filter. Try clearing the search.';
    list.forEach(s => {
      const card = document.createElement('div');
      card.className = 'card';
      const tierClass = s.tier === 'Tier1' ? 't1' : 't2';
      const isFav = store.isFavorite(s.id);
      const chipsHtml = s.materials.slice(0, 4).map(m => `<span class="matchip">${escapeHtml(m.name)} ×${m.count}</span>`).join('');
      const moreHtml = s.materials.length > 4 ? `<span class="matchip more">+${s.materials.length - 4} more</span>` : '';
      card.innerHTML = `
        <div class="punch"></div>
        <button type="button" class="fav-toggle${isFav ? ' active' : ''}" aria-label="${isFav ? 'Remove from favourites' : 'Add to favourites'}" aria-pressed="${isFav}">★</button>
        <div class="tierbadge ${tierClass}">${s.tier || 'N/A'}</div>
        <div class="cname">${escapeHtml(s.name)}</div>
        <div class="metaline">${s.totalUnits} units · ${s.materials.length} material line${s.materials.length === 1 ? '' : 's'}</div>
        <div class="chiprow">${chipsHtml || '<span class="matchip">no material recorded</span>'}${moreHtml}</div>
      `;
      card.addEventListener('click', () => navigate(`#/locations/${s.id}`));
      card.querySelector('.fav-toggle').addEventListener('click', async (e) => {
        e.stopPropagation();
        try {
          if (isFav) {
            await api.removeFavorite(s.id);
          } else {
            await api.addFavorite(s.id);
          }
          await store.refresh();
          await ctx.rerender();
        } catch (err) {
          alert('Could not update favourite: ' + err.message);
        }
      });
      grid.appendChild(card);
    });
  }

  renderTierFilterBar();
  renderGrid();

  if (isAdmin) {
    container.querySelector('#addSchoolBtn').addEventListener('click', () => {
      openSchoolForm(null, ctx);
    });
  }
}
```

- [ ] **Step 3: Syntax-check**

Run: `node --check js/schools.js`
Expected: no output, exit code 0.

- [ ] **Step 4: Commit**

```bash
git add js/schools.js index.html
git commit -m "feat: add favourite-school star toggle and filter chip"
```

---

### Task 5: `CLAUDE.md` documentation

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Document the new table**

Find (in the "Working in this file" bullet list):

```markdown
- Nothing in this app hard-deletes a row; `items`/`locations`/`materials` have no `DELETE` policy;
  denying a request sets `status = 'denied'`, it doesn't delete the row. If a feature seems to need
  deletion, that's a design question to raise, not something to add to the schema unilaterally.
```

Replace with:

```markdown
- Nothing in this app hard-deletes a row; `items`/`locations`/`materials` have no `DELETE` policy;
  denying a request sets `status = 'denied'`, it doesn't delete the row. If a feature seems to need
  deletion, that's a design question to raise, not something to add to the schema unilaterally. The
  one exception is `favorites` — personal per-user preference data, not stock data, so its own
  owner can freely insert/delete rows (RLS-scoped to `profile_id = auth.uid()`, no admin gate).
```

- [ ] **Step 2: Document the Schools route addition**

Find (module 5's list):

```markdown
   - `js/schools.js` — `renderSchools` for the `#/schools` route: school grid and search/filter
     state. Exports `escapeHtml()`, used by every rendering module to safely interpolate
     user-entered text into `innerHTML`.
```

Replace with:

```markdown
   - `js/schools.js` — `renderSchools` for the `#/schools` route: school grid, search/tier filter
     state, and a per-user favourite-school star toggle (backed by the `favorites` table via
     `store.isFavorite()`/`api.addFavorite()`/`api.removeFavorite()`) with a "★ Favourites" filter
     chip alongside Tier 1/Tier 2. Exports `escapeHtml()`, used by every rendering module to safely
     interpolate user-entered text into `innerHTML`.
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document the favorites table and favourite-school UI"
```

---

### Task 6: Apply migration to the live database + manual verification

**Files:** none (operational task)

- [ ] **Step 1: Apply the migration**

Paste the contents of `supabase/migrations/007_add_favorites.sql` into the Supabase SQL editor for
the live project and run it. Confirm afterward with:

```sql
select tablename from pg_tables where tablename = 'favorites';
select policyname from pg_policies where tablename = 'favorites';
```

Expected: the table exists, and three policies (`favorites: user can read their own`, `...insert...`,
`...delete...`) are listed.

- [ ] **Step 2: Serve the app locally**

Run: `npx http-server -p 8080 .`
Open `http://localhost:8080` and log in.

- [ ] **Step 3: Star a school**

Go to Schools. Click the star on a school card — confirm it turns gold/active immediately (after
the refresh+rerender round-trip) and the "★ Favourites" chip's count increments.

- [ ] **Step 4: Filter to favourites**

Click the "★ Favourites" chip. Confirm only starred schools show, and the tier chips deselect.
Click a tier chip afterward and confirm favourites-only mode turns off.

- [ ] **Step 5: Un-star and confirm it's per-account**

Click the star again to remove it — confirm it un-stars. Log in as a second account (or open a
private/incognito window) and confirm that account's favourites are independent (empty, unless
that account starred something itself).

- [ ] **Step 6: Run the full test suite one more time**

Run: `npm test`
Expected: PASS, no regressions.
