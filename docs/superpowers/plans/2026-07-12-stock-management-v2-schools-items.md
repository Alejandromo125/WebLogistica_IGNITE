# Stock Management v2 — Schools & Items CRUD (Plan 2 of 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retire the Google Sheet entirely as a data source. Rebuild the dashboard (stats, material
chart, tier split, school grid, school detail modal) on top of the live Supabase tables from
Plan 1, and add admin CRUD for schools and items: an admin can add/edit schools, add new items
(assigning a material and starting location) and retire existing items; viewers see the same data
read-only. Every authenticated user (admin or viewer) can view schools; there is no more
unauthenticated read access, matching the RLS policies already in place from Plan 1.

**Architecture:** A new `js/api.js` wraps every Supabase table query needed by this plan
(`locations`, `materials`, `items`) behind plain async functions, following the exact
dependency-injection pattern `js/auth.js` established in Plan 1 (takes a `client` parameter,
importable and unit-testable under Node with zero network access). `js/schools.js` and
`js/items.js` are DOM-rendering modules — like `js/main.js` — that call into `js/api.js` and
directly manipulate the existing page's DOM elements; per Plan 1's precedent, these are verified
manually against the live Supabase project rather than unit tested, since they require a live DOM.
The entire old inline `<script>` block in `index.html` (CSV parsing, `SCHOOLS` array, the Google
Sheet fetch) is deleted in this plan, along with the CSV "Data source" bar — the dashboard now
renders exclusively from Supabase.

The warehouse (seeded as a `locations` row with `type = 'warehouse'` in Task 1) is where admins
add newly-arrived items; moving items from the warehouse to a school is a **transfer**, which is
explicitly out of scope for this plan (Plan 3). This plan renders the warehouse as its own single
card, reusing the same detail-modal and item-manifest code as a school's card, so admins have
somewhere to add new stock without yet being able to move it anywhere — that capability lands in
Plan 3.

**Tech Stack:** Same as Plan 1 — Supabase (Postgres + Auth + RLS), vanilla JS ES modules (no
bundler), Node.js built-in test runner for dev-time unit tests only.

## Global Constraints

- The deployed site remains a static site with zero build step. Node/npm are dev-time only.
- Any module whose logic needs the Supabase client receives it as a parameter (dependency
  injection), never importing `js/supabaseClient.js` directly — this is how `js/api.js` stays
  unit-testable under Node, exactly like `js/auth.js` from Plan 1.
- `js/schools.js` and `js/items.js` are DOM-rendering modules with no automated tests — verified
  manually against the live Supabase project, per the precedent `js/main.js` set in Plan 1. Only
  `js/api.js` (pure data-access functions with no DOM dependency) gets Node unit tests.
- Roles are exactly the strings `admin` and `viewer`. Every read in this plan requires an
  authenticated session — there is no more public/unauthenticated view of the dashboard, matching
  the `to authenticated` scoping already on every `select` policy from Plan 1.
- An "item" is never hard-deleted. Retiring an item sets its `retired` column to `true`; reads
  filter out `retired = true` items from normal manifests. No `DELETE` policy exists on `items`,
  `locations`, or any other table, and this plan does not add one.
- Editing an existing item in this plan only ever changes its `material_id` or `retired` flag —
  never its `current_location_id`. Moving an item between locations is a **transfer**, and belongs
  to Plan 3, not this one.
- `createSchoolsView({ api })` is constructed exactly once per page load (in `js/main.js`); its
  page-level DOM event listeners (search input, modal overlay, Escape key, "+ Add school" button)
  are registered exactly once, inside the factory, not per render. Admin/viewer state is passed
  into `loadAndRender(isAdminFlag)` on every call rather than baked in at construction — this
  avoids re-registering duplicate listeners every time a user logs in or out.

---

### Task 1: Schema migration — `items.retired` column and warehouse seed row

**Files:**
- Modify: `supabase/schema.sql` (so a brand-new project created from this file already has the
  column and the seed row)
- Create: `supabase/migrations/001_add_items_retired_and_seed_warehouse.sql` (for the already-live
  project from Plan 1, which won't have `schema.sql` re-run against it)
- Modify: `supabase/README.md`

**Interfaces:**
- Produces: `items.retired` (boolean, not null, default `false`) — every later task's item queries
  filter or set this column. Produces exactly one `locations` row with `type = 'warehouse'` —
  `js/schools.js` (Task 3) looks this row up by `type = 'warehouse'`, not by name or a hardcoded id.

- [ ] **Step 1: Modify `supabase/schema.sql`'s `items` table to add the `retired` column**

Find this block in `supabase/schema.sql`:

```sql
-- ---------- items ----------
create table public.items (
  id text primary key,
  material_id uuid not null references public.materials(id),
  current_location_id uuid not null references public.locations(id)
);
```

Replace it with:

```sql
-- ---------- items ----------
create table public.items (
  id text primary key,
  material_id uuid not null references public.materials(id),
  current_location_id uuid not null references public.locations(id),
  retired boolean not null default false
);
```

- [ ] **Step 2: Add a warehouse seed insert to `supabase/schema.sql`**

Immediately after the `-- ---------- locations ----------` table's RLS policies (i.e. right after
the `create policy "locations: admin can update" ...` statement, and before the
`-- ---------- materials ----------` section), add:

```sql
-- Seed the single warehouse location. Idempotent: safe to re-run.
insert into public.locations (name, type)
select 'Warehouse', 'warehouse'
where not exists (select 1 from public.locations where type = 'warehouse');
```

- [ ] **Step 3: Write `supabase/migrations/001_add_items_retired_and_seed_warehouse.sql`**

This is what actually needs to run against the already-provisioned live project from Plan 1 (which
won't have the full `schema.sql` re-applied):

```sql
-- supabase/migrations/001_add_items_retired_and_seed_warehouse.sql
alter table public.items add column if not exists retired boolean not null default false;

-- Seed the single warehouse location. Idempotent: safe to re-run.
insert into public.locations (name, type)
select 'Warehouse', 'warehouse'
where not exists (select 1 from public.locations where type = 'warehouse');
```

- [ ] **Step 4: USER ACTION — apply the migration to the live project**

In the Supabase dashboard, open SQL Editor → New Query, paste the entire contents of
`supabase/migrations/001_add_items_retired_and_seed_warehouse.sql`, and run it. Expected:
"Success. No rows returned."

- [ ] **Step 5: USER ACTION — verify the migration**

Still in SQL Editor, run:

```sql
select column_name, data_type, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'items'
order by ordinal_position;
```

Expected: a `retired` row with `data_type = boolean` and a default involving `false`.

Then run:

```sql
select id, name, type from public.locations where type = 'warehouse';
```

Expected: exactly one row, `name = 'Warehouse'`.

- [ ] **Step 6: Update `supabase/README.md`'s migrations section**

Add this section after "## Inviting collaborators" (at the end of the file):

```markdown

## Applying incremental changes to an existing project

`schema.sql` is only for a brand-new project. Once a project is live, apply new changes via the
numbered files in `supabase/migrations/`, in order, the same way as `schema.sql` — paste each
file's contents into SQL Editor → New Query and run it once. Each migration file is written to be
safe to run more than once (idempotent) in case you're unsure whether it already ran.
```

- [ ] **Step 7: Commit**

```bash
git add supabase/schema.sql supabase/migrations/001_add_items_retired_and_seed_warehouse.sql supabase/README.md
git commit -m "feat: add items.retired column and seed warehouse location"
```

---

### Task 2: `js/api.js` — Supabase query layer

**Files:**
- Create: `js/api.js`
- Test: `tests/api.test.js`

**Interfaces:**
- Consumes: a Supabase-like `client` (dependency injection, same pattern as `createAuthModule`).
- Produces: `createApi(client)` returning
  `{ listLocations(), createLocation(location), updateLocation(id, changes), listMaterials(),
  createMaterial(name), listItems(), createItem(item), updateItem(id, changes) }` — every function
  returns the row(s) on success or throws `Error(message)` on failure. `js/schools.js` and
  `js/items.js` (Tasks 3-4) consume this exact shape.

- [ ] **Step 1: Write the failing tests**

```javascript
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
          return {
            eq(col, val) {
              calls.push(['eq', col, val]);
              return {
                select() {
                  return {
                    single() {
                      return Promise.resolve(behavior.update);
                    },
                  };
                },
              };
            },
          };
        },
      };
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
```

- [ ] **Step 2: Run tests and confirm they fail**

Run: `npm test`
Expected: fails with `Cannot find module '../js/api.js'`.

- [ ] **Step 3: Implement `js/api.js`**

```javascript
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

  return {
    listLocations, createLocation, updateLocation,
    listMaterials, createMaterial,
    listItems, createItem, updateItem,
  };
}
```

- [ ] **Step 4: Run tests and confirm they pass**

Run: `npm test`
Expected: `tests 17`, `pass 17`, `fail 0` (11 new tests in `tests/api.test.js` plus the 6 existing
from Plan 1).

- [ ] **Step 5: Commit**

```bash
git add js/api.js tests/api.test.js
git commit -m "feat: add Supabase query layer (js/api.js) with unit tests"
```

---

### Task 3: Cut over the dashboard to Supabase, with admin school CRUD

**Files:**
- Modify: `index.html` (keep `<head>`/`<style>`, lines 1-399, byte-for-byte unchanged; replace
  everything from `<body>` onward)
- Modify: `js/main.js` (replace entire contents)
- Create: `js/schools.js`

**Interfaces:**
- Consumes: `createApi` (Task 2), `supabase` and `createAuthModule` (Plan 1).
- Produces: `createSchoolsView({ api })` returning `{ loadAndRender(isAdmin), clear() }`. Task 4
  modifies this file's `openDetailModal` function to delegate to `js/items.js` — read that
  function's full definition below before Task 4, since Task 4 replaces part of it.

- [ ] **Step 1: Replace `index.html` from `<body>` onward**

Keep lines 1-399 (everything from `<!DOCTYPE html>` through `</style></head>`) exactly as they are.
Replace everything from the `<body>` tag through `</html>` with:

```html
<body>

<header class="topbar">
  <div class="brand">
    <div class="mark">M26</div>
    <div class="brand-text">STOCK<span>·</span>MANIFEST</div>
  </div>
  <div class="searchwrap">
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
    <input id="searchInput" type="text" placeholder="Search school name…" aria-label="Search schools">
  </div>
</header>

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

<div class="hero">
  <div class="hero-eyebrow">Material deployment · Course 26–27 prep</div>
  <h1>Where every kit, robot and box currently lives — school by school.</h1>
  <div class="stamps">
    <div class="stamp"><div class="num" id="statSchools">0</div><div class="lbl">Schools tracked</div></div>
    <div class="stamp"><div class="num" id="statUnits">0</div><div class="lbl">Units deployed</div></div>
    <div class="stamp"><div class="num" id="statMaterials">0</div><div class="lbl">Material lines</div></div>
  </div>
</div>

<section>
  <div class="section-head">
    <h2>Material distribution</h2>
    <div class="tag">units in the field, by material line</div>
  </div>
  <div id="chartArea"></div>
  <div class="chart-hint">Click a bar to filter the manifest below to schools using that material.</div>
</section>

<section>
  <div class="section-head">
    <h2>Tier split</h2>
    <div class="tag">school priority tier</div>
  </div>
  <div class="tiersplit" id="tierSplit"></div>
</section>

<section>
  <div class="section-head">
    <h2>Warehouse</h2>
    <div class="tag">central unassigned stock</div>
  </div>
  <div id="warehouseCard"></div>
</section>

<section>
  <div class="section-head">
    <h2>School manifest</h2>
    <div style="display:flex; align-items:center; gap:12px;">
      <button id="addSchoolBtn" class="chip" style="display:none;">+ Add school</button>
      <div class="tag" id="resultCount">0 schools</div>
    </div>
  </div>
  <div class="filterbar" id="tierFilterBar"></div>
  <div class="grid" id="schoolGrid"></div>
  <div class="empty-note" id="emptyNote" style="display:none;">No schools match this filter. Try clearing the search or material filter.</div>
</section>

<footer>
  Live data from Supabase · Preparación curso 26-27 · the Google Sheet this app used to read from is retired.
</footer>

<div class="overlay" id="overlay">
  <div class="modal" id="modalContent"></div>
</div>

<script type="module" src="js/main.js"></script>
</body>
</html>
```

This removes: the old "Data source" CSV livebar, and the entire old inline `<script>` block (the
`SCHOOLS` array, `parseCSV`, `schoolsFromCSV`, `parseMaterialsField`, `connectSheet`, and all the
old `render*`/`openModal` functions). It adds: a "Warehouse" section, an "+ Add school" button, and
an updated footer.

- [ ] **Step 2: Write `js/schools.js`**

```javascript
// js/schools.js
import { renderItemsSection } from './items.js';

export function createSchoolsView({ api }) {
  let locations = [];
  let materials = [];
  let items = [];
  let isAdmin = false;
  const state = { tier: 'ALL', material: null, query: '' };

  function fmt(n) { return (n === null || n === undefined || n === '') ? '—' : n; }

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
      materials: locMaterials,
      totalUnits: locItems.length,
    };
  }

  function computeSchools() {
    return locations.filter(l => l.type === 'school').map(computeLocationView);
  }

  function computeWarehouse() {
    const wh = locations.find(l => l.type === 'warehouse');
    return wh ? computeLocationView(wh) : null;
  }

  function renderStats(schools) {
    document.getElementById('statSchools').textContent = schools.length;
    document.getElementById('statUnits').textContent = schools.reduce((a, s) => a + s.totalUnits, 0);
    const matSet = new Set();
    schools.forEach(s => s.materials.forEach(m => matSet.add(m.name)));
    document.getElementById('statMaterials').textContent = matSet.size;
  }

  function materialTotals(schools) {
    const totals = {};
    schools.forEach(s => s.materials.forEach(m => {
      totals[m.name] = (totals[m.name] || 0) + m.count;
    }));
    return Object.entries(totals).sort((a, b) => b[1] - a[1]);
  }

  function renderChart(schools) {
    const totals = materialTotals(schools);
    const max = totals.length ? totals[0][1] : 1;
    const area = document.getElementById('chartArea');
    area.innerHTML = '';
    totals.forEach(([name, count]) => {
      const row = document.createElement('div');
      row.className = 'chart-row';
      const active = state.material === name;
      row.innerHTML = `
        <div class="mname" title="${name}">${name}</div>
        <div class="bar-track ${active ? 'active' : ''}" data-mat="${name}">
          <div class="bar-fill" style="width:${(count / max * 100).toFixed(1)}%"></div>
        </div>
        <div class="count">${count}</div>
      `;
      row.querySelector('.bar-track').addEventListener('click', () => {
        state.material = (state.material === name) ? null : name;
        renderAll();
      });
      area.appendChild(row);
    });
  }

  function renderTierSplit(schools) {
    const wrap = document.getElementById('tierSplit');
    if (schools.length === 0) {
      wrap.innerHTML = `<div class="tier-block"><div class="desc">No schools yet${isAdmin ? ' — click "+ Add school" below to add the first one.' : '.'}</div></div>`;
      return;
    }
    const t1 = schools.filter(s => s.tier === 'Tier1').length;
    const t2 = schools.filter(s => s.tier === 'Tier2').length;
    const other = schools.length - t1 - t2;
    wrap.innerHTML = `
      <div class="tier-block">
        <div class="tt"><span class="dot t1"></span><strong>Tier 1</strong></div>
        <div class="big">${t1}</div>
        <div class="desc">schools · ${(t1 / schools.length * 100).toFixed(0)}% of total</div>
      </div>
      <div class="tier-block">
        <div class="tt"><span class="dot t2"></span><strong>Tier 2</strong></div>
        <div class="big">${t2}</div>
        <div class="desc">schools · ${(t2 / schools.length * 100).toFixed(0)}% of total</div>
      </div>
      ${other > 0 ? `<div class="tier-block"><div class="tt"><strong>Unclassified</strong></div><div class="big">${other}</div><div class="desc">tier not recorded</div></div>` : ''}
    `;
  }

  function renderTierFilterBar(schools) {
    const t1 = schools.filter(s => s.tier === 'Tier1').length;
    const t2 = schools.filter(s => s.tier === 'Tier2').length;
    const bar = document.getElementById('tierFilterBar');
    const chips = [
      { key: 'ALL', label: 'All schools', n: schools.length },
      { key: 'Tier1', label: 'Tier 1', n: t1 },
      { key: 'Tier2', label: 'Tier 2', n: t2 },
    ];
    bar.innerHTML = '';
    chips.forEach(c => {
      const btn = document.createElement('button');
      btn.className = 'chip' + (state.tier === c.key ? ' active' : '');
      btn.innerHTML = `${c.label} <span class="n">${c.n}</span>`;
      btn.addEventListener('click', () => { state.tier = c.key; renderAll(); });
      bar.appendChild(btn);
    });
    if (state.material) {
      const clear = document.createElement('button');
      clear.className = 'chip active';
      clear.innerHTML = `Material: ${state.material} ✕`;
      clear.addEventListener('click', () => { state.material = null; renderAll(); });
      bar.appendChild(clear);
    }
  }

  function schoolMatchesFilters(s) {
    if (state.tier !== 'ALL' && s.tier !== state.tier) return false;
    if (state.material && !s.materials.some(m => m.name === state.material)) return false;
    if (state.query) {
      const q = state.query.toLowerCase();
      if (!s.name.toLowerCase().includes(q)) return false;
    }
    return true;
  }

  function renderGrid(schools) {
    const grid = document.getElementById('schoolGrid');
    const list = schools.filter(schoolMatchesFilters);
    document.getElementById('resultCount').textContent = `${list.length} school${list.length === 1 ? '' : 's'}`;
    grid.innerHTML = '';
    const emptyNote = document.getElementById('emptyNote');
    if (schools.length === 0) {
      emptyNote.style.display = 'block';
      emptyNote.textContent = isAdmin
        ? 'No schools yet. Click "+ Add school" above to add the first one.'
        : 'No schools recorded yet.';
    } else {
      emptyNote.style.display = list.length ? 'none' : 'block';
      emptyNote.textContent = 'No schools match this filter. Try clearing the search or material filter.';
    }

    list.forEach(s => {
      const card = document.createElement('div');
      card.className = 'card';
      const tierClass = s.tier === 'Tier1' ? 't1' : 't2';
      const chipsHtml = s.materials.slice(0, 4).map(m => `<span class="matchip">${m.name} ×${m.count}</span>`).join('');
      const moreHtml = s.materials.length > 4 ? `<span class="matchip more">+${s.materials.length - 4} more</span>` : '';
      card.innerHTML = `
        <div class="punch"></div>
        <div class="tierbadge ${tierClass}">${s.tier || 'N/A'}</div>
        <div class="cname">${s.name}</div>
        <div class="metaline">${s.totalUnits} units · ${s.materials.length} material line${s.materials.length === 1 ? '' : 's'}</div>
        <div class="chiprow">${chipsHtml || '<span class="matchip">no material recorded</span>'}${moreHtml}</div>
      `;
      card.addEventListener('click', () => openDetailModal(s));
      grid.appendChild(card);
    });
  }

  function renderWarehouseCard() {
    const wh = computeWarehouse();
    const container = document.getElementById('warehouseCard');
    if (!wh) {
      container.innerHTML = '<div class="empty-note">Warehouse location not found — check that the schema migration seeded it.</div>';
      return;
    }
    container.innerHTML = '';
    const card = document.createElement('div');
    card.className = 'card';
    const chipsHtml = wh.materials.slice(0, 6).map(m => `<span class="matchip">${m.name} ×${m.count}</span>`).join('');
    const moreHtml = wh.materials.length > 6 ? `<span class="matchip more">+${wh.materials.length - 6} more</span>` : '';
    card.innerHTML = `
      <div class="punch"></div>
      <div class="tierbadge" style="color:var(--slate);">WAREHOUSE</div>
      <div class="cname">${wh.name}</div>
      <div class="metaline">${wh.totalUnits} units in stock · ${wh.materials.length} material line${wh.materials.length === 1 ? '' : 's'}</div>
      <div class="chiprow">${chipsHtml || '<span class="matchip">no material recorded</span>'}${moreHtml}</div>
    `;
    card.addEventListener('click', () => openDetailModal(wh));
    container.appendChild(card);
  }

  function openDetailModal(s) {
    const modal = document.getElementById('modalContent');
    const isWarehouse = s.type === 'warehouse';
    const tierClass = s.tier === 'Tier1' ? 't1' : 't2';
    const manifestLines = s.materials.map(m => `
      <div class="manifest-line">
        <div class="mn">${m.name}</div>
        <div class="ids">${m.ids.join(', ')}</div>
      </div>
    `).join('') || '<div class="manifest-line"><div class="mn">No material currently recorded</div></div>';

    modal.innerHTML = `
      <button class="modal-close" id="modalCloseBtn" aria-label="Close">✕</button>
      <h3>${s.name}</h3>
      ${isWarehouse
        ? '<div class="modal-tier" style="color:var(--slate)">Central warehouse</div>'
        : `<div class="modal-tier" style="color:var(--${tierClass === 't1' ? 'rust' : 'teal'})">${s.tier || 'Tier not recorded'}</div>`
      }
      <div class="modal-grid">
        ${isWarehouse
          ? `<div class="modal-stat"><div class="l">Units in stock</div><div class="v">${s.totalUnits}</div></div>
             <div class="modal-stat"><div class="l">Material lines</div><div class="v">${s.materials.length}</div></div>`
          : `<div class="modal-stat"><div class="l">Students</div><div class="v">${fmt(s.students)}</div></div>
             <div class="modal-stat"><div class="l">Units deployed</div><div class="v">${s.totalUnits}</div></div>`
        }
      </div>
      <div class="manifest-title">Material manifest</div>
      ${manifestLines}
      ${isWarehouse ? '' : `
        <div class="proposal-box">
          <div class="l">Notes</div>
          <div>${s.notes ? s.notes : 'No notes recorded.'}</div>
        </div>
      `}
      ${(!isWarehouse && isAdmin) ? '<button id="editSchoolBtn" class="chip" style="margin-top:16px;">Edit school</button>' : ''}
    `;
    document.getElementById('overlay').classList.add('open');
    document.getElementById('modalCloseBtn').addEventListener('click', closeModal);
    if (!isWarehouse && isAdmin) {
      document.getElementById('editSchoolBtn').addEventListener('click', () => openSchoolForm(s));
    }
  }

  function closeModal() {
    document.getElementById('overlay').classList.remove('open');
  }

  function openSchoolForm(existing) {
    const modal = document.getElementById('modalContent');
    const formStyle = "display:block; margin-bottom:14px;";
    const inputStyle = "width:100%; border:1px solid var(--line); background:var(--card); padding:8px 10px; font-family:'IBM Plex Mono', monospace; font-size:13px; margin-top:4px;";
    modal.innerHTML = `
      <button class="modal-close" id="modalCloseBtn" aria-label="Close">✕</button>
      <h3>${existing ? 'Edit school' : 'Add school'}</h3>
      <form id="schoolForm">
        <label style="${formStyle}">Name
          <input name="name" required value="${existing ? existing.name : ''}" style="${inputStyle}">
        </label>
        <label style="${formStyle}">Tier
          <select name="tier" style="${inputStyle}">
            <option value="">—</option>
            <option value="Tier1" ${existing && existing.tier === 'Tier1' ? 'selected' : ''}>Tier 1</option>
            <option value="Tier2" ${existing && existing.tier === 'Tier2' ? 'selected' : ''}>Tier 2</option>
          </select>
        </label>
        <label style="${formStyle}">Students
          <input name="students" type="number" min="0" value="${existing && existing.students !== null && existing.students !== undefined ? existing.students : ''}" style="${inputStyle}">
        </label>
        <label style="${formStyle}">Notes
          <textarea name="notes" rows="3" style="${inputStyle}">${existing && existing.notes ? existing.notes : ''}</textarea>
        </label>
        <div id="schoolFormError" class="live-status error" style="display:none; margin-bottom:10px;"></div>
        <button type="submit" class="chip">Save</button>
        <button type="button" id="schoolFormCancel" class="chip" style="margin-left:8px;">Cancel</button>
      </form>
    `;
    document.getElementById('overlay').classList.add('open');
    document.getElementById('modalCloseBtn').addEventListener('click', closeModal);
    document.getElementById('schoolFormCancel').addEventListener('click', closeModal);
    document.getElementById('schoolForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.target;
      const errorEl = document.getElementById('schoolFormError');
      errorEl.style.display = 'none';
      const payload = {
        name: form.name.value.trim(),
        tier: form.tier.value || null,
        students: form.students.value === '' ? null : Number(form.students.value),
        notes: form.notes.value.trim() || null,
      };
      try {
        if (existing) {
          await api.updateLocation(existing.id, payload);
        } else {
          await api.createLocation({ ...payload, type: 'school' });
        }
        closeModal();
        await refresh();
      } catch (err) {
        errorEl.textContent = 'Could not save: ' + err.message;
        errorEl.style.display = 'block';
      }
    });
  }

  function renderAll() {
    const schools = computeSchools();
    renderStats(schools);
    renderChart(schools);
    renderTierSplit(schools);
    renderTierFilterBar(schools);
    renderGrid(schools);
    renderWarehouseCard();
  }

  function showLoadError(err) {
    const emptyNote = document.getElementById('emptyNote');
    emptyNote.style.display = 'block';
    emptyNote.textContent = 'Could not load schools: ' + err.message;
  }

  async function refresh() {
    [locations, materials, items] = await Promise.all([
      api.listLocations(),
      api.listMaterials(),
      api.listItems(),
    ]);
    document.getElementById('addSchoolBtn').style.display = isAdmin ? '' : 'none';
    renderAll();
  }

  async function loadAndRender(adminFlag) {
    isAdmin = adminFlag;
    try {
      await refresh();
    } catch (err) {
      showLoadError(err);
    }
  }

  function clear() {
    isAdmin = false;
    locations = [];
    materials = [];
    items = [];
    document.getElementById('statSchools').textContent = '0';
    document.getElementById('statUnits').textContent = '0';
    document.getElementById('statMaterials').textContent = '0';
    document.getElementById('chartArea').innerHTML = '';
    document.getElementById('tierSplit').innerHTML = '';
    document.getElementById('tierFilterBar').innerHTML = '';
    document.getElementById('schoolGrid').innerHTML = '';
    document.getElementById('warehouseCard').innerHTML = '';
    const emptyNote = document.getElementById('emptyNote');
    emptyNote.style.display = 'block';
    emptyNote.textContent = 'Log in to view schools.';
    document.getElementById('resultCount').textContent = '0 schools';
    document.getElementById('addSchoolBtn').style.display = 'none';
  }

  document.getElementById('overlay').addEventListener('click', (e) => {
    if (e.target.id === 'overlay') closeModal();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
  document.getElementById('searchInput').addEventListener('input', (e) => {
    state.query = e.target.value;
    renderGrid(computeSchools());
  });
  document.getElementById('addSchoolBtn').addEventListener('click', () => openSchoolForm(null));

  return { loadAndRender, clear };
}
```

Note: this step imports `renderItemsSection` from `./items.js`, which does not exist yet — that's
fine, `js/items.js` is created in Task 4. `openDetailModal` in this task does NOT call
`renderItemsSection` yet (it renders `manifestLines` directly, matching the old inline script's
approach) — Task 4 modifies this specific function to delegate to `js/items.js` instead. Until
Task 4 lands, leave the `import` unused... **actually**: since `js/items.js` doesn't exist until
Task 4, this import would break the page load in this task's manual verification. To keep this
task's deliverable actually loadable and testable on its own, do NOT add the
`import { renderItemsSection } from './items.js';` line yet — add it in Task 4, at the same time
`openDetailModal` is modified to use it. Write `js/schools.js` in this task without that import
line.

- [ ] **Step 3: Replace `js/main.js` entirely**

```javascript
// js/main.js
import { supabase } from './supabaseClient.js';
import { createAuthModule } from './auth.js';
import { createApi } from './api.js';
import { createSchoolsView } from './schools.js';

const auth = createAuthModule(supabase);
const api = createApi(supabase);
const schoolsView = createSchoolsView({ api });
schoolsView.clear();

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
      await schoolsView.loadAndRender(profile.role === 'admin');
    } else {
      setAuthStatus('Not logged in.', 'idle');
      loginForm.style.display = '';
      logoutBtn.style.display = 'none';
      schoolsView.clear();
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
  try {
    await auth.signOut();
    await refreshAuthUI();
  } catch (err) {
    setAuthStatus('Logout failed: ' + err.message, 'error');
  }
});

refreshAuthUI();
```

- [ ] **Step 4: USER ACTION — verify the cutover and admin school CRUD end-to-end**

Serve the site locally (`npx http-server -p 8080 .`) and open `http://localhost:8080`.

Expected: the page loads with everything showing empty/zero state ("Not logged in", "Log in to
view schools" in the empty-note area), no leftover CSV UI anywhere.

Log in as admin. Expected: "+ Add school" button appears; the "Warehouse" section shows a card
(0 units in stock, since no items exist yet); stats show 0/0/0.

Click "+ Add school", fill in a name (e.g. "BSB Test"), pick Tier 1, enter a student count, save.
Expected: modal closes, the new school appears in the grid, "Schools tracked" stat becomes 1,
tier split shows 1 under Tier 1.

Click the new school's card. Expected: detail modal shows its stats, an empty material manifest,
notes box, and an "Edit school" button. Click "Edit school", change the tier to Tier 2, save.
Expected: modal closes, the card's tier badge updates to Tier 2, tier split updates accordingly.

Log out, then log in as the viewer test account from Plan 1. Expected: no "+ Add school" button,
the school is still visible in the grid and its detail modal opens, but there's no "Edit school"
button in the modal.

- [ ] **Step 5: Commit**

```bash
git add index.html js/main.js js/schools.js
git commit -m "feat: cut dashboard over to Supabase, add admin school CRUD"
```

---

### Task 4: `js/items.js` — interactive item manifest (add / retire)

**Files:**
- Create: `js/items.js`
- Modify: `js/schools.js` (add the import, and replace `openDetailModal`'s static manifest
  rendering with a call into `js/items.js`)

**Interfaces:**
- Consumes: `api` (Task 2), `materials`/`items` arrays and `location` object shaped like
  `computeLocationView`'s return value (from `js/schools.js`, Task 3).
- Produces: `renderItemsSection(container, ctx)` where
  `ctx = { api, location, materials, items, isAdmin, onChange }` — `onChange` is an async callback
  this function calls after a successful add/retire so the caller can refresh and re-render.

- [ ] **Step 1: Write `js/items.js`**

```javascript
// js/items.js
export function renderItemsSection(container, ctx) {
  const { api, location, materials, items, isAdmin, onChange } = ctx;
  const locItems = items.filter(i => i.current_location_id === location.id && !i.retired);
  const byMaterial = new Map();
  locItems.forEach(i => {
    const mat = materials.find(m => m.id === i.material_id);
    const name = mat ? mat.name : 'Unknown material';
    if (!byMaterial.has(name)) byMaterial.set(name, []);
    byMaterial.get(name).push(i);
  });

  const manifestHtml = Array.from(byMaterial.entries()).map(([name, itemsForMaterial]) => `
    <div class="manifest-line">
      <div class="mn">${name}</div>
      <div class="ids">
        ${itemsForMaterial.map(i => `<span>${i.id}${isAdmin ? ` <button type="button" class="retire-item-btn" data-item="${i.id}" style="border:none; background:none; color:var(--rust); cursor:pointer; font-family:inherit;" title="Retire ${i.id}">✕</button>` : ''}</span>`).join(', ')}
      </div>
    </div>
  `).join('') || '<div class="manifest-line"><div class="mn">No material currently recorded</div></div>';

  container.innerHTML = `
    ${manifestHtml}
    ${isAdmin ? `
      <form id="addItemForm" style="margin-top:14px; display:flex; gap:8px; flex-wrap:wrap; align-items:flex-end;">
        <label style="flex:1; min-width:140px;">Unit ID
          <input name="itemId" required style="width:100%; border:1px solid var(--line); background:var(--card); padding:7px 9px; font-family:'IBM Plex Mono', monospace; font-size:12.5px; margin-top:4px;">
        </label>
        <label style="flex:1; min-width:160px;">Material
          <input name="materialName" required list="materialOptions" style="width:100%; border:1px solid var(--line); background:var(--card); padding:7px 9px; font-family:'IBM Plex Mono', monospace; font-size:12.5px; margin-top:4px;">
          <datalist id="materialOptions">
            ${materials.map(m => `<option value="${m.name}">`).join('')}
          </datalist>
        </label>
        <button type="submit" class="chip">+ Add item</button>
      </form>
      <div id="itemFormError" class="live-status error" style="display:none; margin-top:8px;"></div>
    ` : ''}
  `;

  if (!isAdmin) return;

  container.querySelectorAll('.retire-item-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const itemId = btn.dataset.item;
      if (!confirm(`Retire item ${itemId}? It will be removed from this manifest.`)) return;
      try {
        await api.updateItem(itemId, { retired: true });
        await onChange();
      } catch (err) {
        alert('Could not retire item: ' + err.message);
      }
    });
  });

  const form = container.querySelector('#addItemForm');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = container.querySelector('#itemFormError');
    errorEl.style.display = 'none';
    const itemId = form.itemId.value.trim();
    const materialName = form.materialName.value.trim();
    if (!itemId || !materialName) return;
    try {
      let material = materials.find(m => m.name.toLowerCase() === materialName.toLowerCase());
      if (!material) {
        material = await api.createMaterial(materialName);
      }
      await api.createItem({ id: itemId, material_id: material.id, current_location_id: location.id });
      await onChange();
    } catch (err) {
      errorEl.textContent = 'Could not add item: ' + err.message;
      errorEl.style.display = 'block';
    }
  });
}
```

- [ ] **Step 2: Add the import to `js/schools.js`**

At the top of `js/schools.js`, add:

```javascript
import { renderItemsSection } from './items.js';
```

- [ ] **Step 3: Replace `openDetailModal`'s manifest rendering in `js/schools.js`**

Find this function in `js/schools.js` (written in Task 3):

```javascript
  function openDetailModal(s) {
    const modal = document.getElementById('modalContent');
    const isWarehouse = s.type === 'warehouse';
    const tierClass = s.tier === 'Tier1' ? 't1' : 't2';
    const manifestLines = s.materials.map(m => `
      <div class="manifest-line">
        <div class="mn">${m.name}</div>
        <div class="ids">${m.ids.join(', ')}</div>
      </div>
    `).join('') || '<div class="manifest-line"><div class="mn">No material currently recorded</div></div>';

    modal.innerHTML = `
      <button class="modal-close" id="modalCloseBtn" aria-label="Close">✕</button>
      <h3>${s.name}</h3>
      ${isWarehouse
        ? '<div class="modal-tier" style="color:var(--slate)">Central warehouse</div>'
        : `<div class="modal-tier" style="color:var(--${tierClass === 't1' ? 'rust' : 'teal'})">${s.tier || 'Tier not recorded'}</div>`
      }
      <div class="modal-grid">
        ${isWarehouse
          ? `<div class="modal-stat"><div class="l">Units in stock</div><div class="v">${s.totalUnits}</div></div>
             <div class="modal-stat"><div class="l">Material lines</div><div class="v">${s.materials.length}</div></div>`
          : `<div class="modal-stat"><div class="l">Students</div><div class="v">${fmt(s.students)}</div></div>
             <div class="modal-stat"><div class="l">Units deployed</div><div class="v">${s.totalUnits}</div></div>`
        }
      </div>
      <div class="manifest-title">Material manifest</div>
      ${manifestLines}
      ${isWarehouse ? '' : `
        <div class="proposal-box">
          <div class="l">Notes</div>
          <div>${s.notes ? s.notes : 'No notes recorded.'}</div>
        </div>
      `}
      ${(!isWarehouse && isAdmin) ? '<button id="editSchoolBtn" class="chip" style="margin-top:16px;">Edit school</button>' : ''}
    `;
    document.getElementById('overlay').classList.add('open');
    document.getElementById('modalCloseBtn').addEventListener('click', closeModal);
    if (!isWarehouse && isAdmin) {
      document.getElementById('editSchoolBtn').addEventListener('click', () => openSchoolForm(s));
    }
  }
```

Replace it with:

```javascript
  function openDetailModal(s) {
    const modal = document.getElementById('modalContent');
    const isWarehouse = s.type === 'warehouse';
    const tierClass = s.tier === 'Tier1' ? 't1' : 't2';

    modal.innerHTML = `
      <button class="modal-close" id="modalCloseBtn" aria-label="Close">✕</button>
      <h3>${s.name}</h3>
      ${isWarehouse
        ? '<div class="modal-tier" style="color:var(--slate)">Central warehouse</div>'
        : `<div class="modal-tier" style="color:var(--${tierClass === 't1' ? 'rust' : 'teal'})">${s.tier || 'Tier not recorded'}</div>`
      }
      <div class="modal-grid">
        ${isWarehouse
          ? `<div class="modal-stat"><div class="l">Units in stock</div><div class="v">${s.totalUnits}</div></div>
             <div class="modal-stat"><div class="l">Material lines</div><div class="v">${s.materials.length}</div></div>`
          : `<div class="modal-stat"><div class="l">Students</div><div class="v">${fmt(s.students)}</div></div>
             <div class="modal-stat"><div class="l">Units deployed</div><div class="v">${s.totalUnits}</div></div>`
        }
      </div>
      <div class="manifest-title">Material manifest</div>
      <div id="itemsSection"></div>
      ${isWarehouse ? '' : `
        <div class="proposal-box">
          <div class="l">Notes</div>
          <div>${s.notes ? s.notes : 'No notes recorded.'}</div>
        </div>
      `}
      ${(!isWarehouse && isAdmin) ? '<button id="editSchoolBtn" class="chip" style="margin-top:16px;">Edit school</button>' : ''}
    `;
    document.getElementById('overlay').classList.add('open');
    document.getElementById('modalCloseBtn').addEventListener('click', closeModal);
    renderItemsSection(document.getElementById('itemsSection'), {
      api, location: s, materials, items, isAdmin,
      onChange: async () => {
        await refresh();
        const refreshed = isWarehouse ? computeWarehouse() : computeSchools().find(sch => sch.id === s.id);
        if (refreshed) openDetailModal(refreshed);
      },
    });
    if (!isWarehouse && isAdmin) {
      document.getElementById('editSchoolBtn').addEventListener('click', () => openSchoolForm(s));
    }
  }
```

- [ ] **Step 4: USER ACTION — verify item add/retire end-to-end**

Serve the site locally and log in as admin. Open the Warehouse card's detail modal.

Type a new unit ID (e.g. `R-101`) and a new material name (e.g. `Robot Kit`) into the "add item"
form, submit. Expected: the modal refreshes in place showing `R-101` under "Robot Kit" in the
manifest, and a ✕ retire button next to it; the Warehouse card's unit count updates to 1 in the
background once you close the modal.

Add a second item `R-102` using the *same* material name `Robot Kit` (test the datalist
autocomplete). Expected: it's grouped under the same "Robot Kit" line as `R-101`, and no duplicate
`materials` row was created (open the Supabase dashboard's Table Editor on `materials` and confirm
only one "Robot Kit" row exists).

Click the ✕ next to `R-101`, confirm the browser confirm dialog. Expected: `R-101` disappears from
the manifest (but `R-102` remains), and the unit count drops accordingly.

Log out, log in as viewer, open the same Warehouse modal. Expected: `R-102` is visible in the
manifest, but there is no "add item" form and no ✕ retire buttons.

- [ ] **Step 5: Commit**

```bash
git add js/items.js js/schools.js
git commit -m "feat: add interactive item manifest (add/retire) via js/items.js"
```

---

## What this plan does not cover

Direct transfers between locations (moving an existing item from one location to another) and the
viewer request/approval workflow are Plan 3. History/timeline views are Plan 4. This plan only
covers viewing schools/warehouse stock and admin CRUD for schools and items at their current
location.
