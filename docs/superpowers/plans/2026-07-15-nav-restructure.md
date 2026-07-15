# Navigation Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single stacked-section page with tabbed navigation (Overview / Schools /
Requests), a dedicated hash-routed location-detail page (replacing the school-detail modal), a
shared in-memory data store, and a second warehouse location (Madrid + Barcelona).

**Architecture:** A pure `parseRoute(hash)` function plus a thin `createRouter` wraps
`window.location.hash` / `hashchange`. A `createStore(api)` module centralizes the five
Supabase-backed collections (`locations`, `materials`, `items`, `requests`, `movements`) and the
derived per-location computations that today live inside `js/schools.js`. `js/schools.js` is
trimmed to just the school grid; three new modules (`js/overview.js`, `js/locationDetail.js`,
`js/schoolForm.js`) take over the content that used to live in one big file and a modal.
`js/main.js` becomes the router's route table plus the auth/login-screen/tab-bar wiring. No
visual/CSS system change — same paper/ink/amber/rust/teal look, just reorganized into routes.

**Tech Stack:** Vanilla ES modules (no bundler), Supabase JS client, Node's built-in test runner
(`node --test`) for the two new pure-logic modules.

## Global Constraints

- No build step, no bundler — every new file is a plain ES module loaded by the browser exactly
  like the existing ones.
- `js/api.js` and any new pure-logic module (`router.js`, `store.js`) must not import
  `js/supabaseClient.js` directly — dependency is always injected as a parameter, so it stays
  unit-testable with a fake client, per `CLAUDE.md`.
- `escapeHtml()` continues to live in and be exported from `js/schools.js` — every other
  rendering module imports it from there.
- User-entered free text must go through `escapeHtml()` before being interpolated into
  `innerHTML` — never interpolate unescaped input, per `CLAUDE.md`.
- Nothing hard-deletes a row — this plan adds no new delete paths.
- **Shared `ctx` contract** — every route-rendering function (`renderOverview`, `renderSchools`,
  `renderLocationDetail`, `renderRequests`) receives a single `ctx` object shaped exactly as
  follows (constructed once in `js/main.js`, Task 10):

  ```js
  {
    api,             // the object returned by createApi(supabase) — js/api.js
    store,           // the object returned by createStore(api) — js/store.js (Task 3)
    isAdmin,         // boolean
    currentUserId,   // string | null
    navigate,        // (hash: string) => void — same as router.navigate (Task 2)
    rerender,        // () => Promise<void> — re-renders whatever route is current right now
  }
  ```

  `renderLocationDetail` receives this same object with one extra key, `locationId` (string,
  the id parsed from the route). Any mutating action (add/retire item, transfer, approve/deny,
  add/edit school) always follows the same two-step pattern: `await ctx.store.refresh()` then
  `await ctx.rerender()`.
- Every new/modified `.js` file must pass `node --check <path>` (syntax-only check — no bundler,
  no linter in this repo) before it's considered done.

---

## File Structure

**Create:**
- `supabase/migrations/005_split_warehouse_madrid_barcelona.sql` — data migration for the live DB
- `js/router.js` — `parseRoute(hash)` (pure) + `createRouter({ onChange })`
- `js/store.js` — `createStore(api)`: the five collections + derived computations
- `js/overview.js` — `renderOverview(container, ctx)`: hero stats, chart, tier split, warehouse grid
- `js/schoolForm.js` — `openSchoolForm(existing, ctx)`: shared add/edit-school modal
- `js/locationDetail.js` — `renderLocationDetail(container, ctx)`: replaces the old detail modal
- `tests/router.test.js`
- `tests/store.test.js`

**Modify:**
- `supabase/schema.sql` — seed both warehouses on fresh install
- `index.html` — header/tab-bar/login-screen shell, `<main id="viewport">`, small CSS additions
- `js/schools.js` — trimmed to search bar + tier filter + school grid (`renderSchools`)
- `js/requests.js` — `createRequestsView` → `renderRequests(container, ctx)`; `renderRequestSection` unchanged
- `js/main.js` — full rewrite: router wiring, tab bar, login screen, auth flow
- `CLAUDE.md` — architecture section reflects the new module list and routing behavior

**Unchanged:** `js/api.js`, `js/auth.js`, `js/items.js`, `js/transfers.js`, `js/history.js`,
`js/config.js`, `js/supabaseClient.js`, `tests/api.test.js`, `tests/auth.test.js`,
`tests/smoke.test.js`.

---

### Task 1: Warehouse split migration + schema.sql

**Files:**
- Create: `supabase/migrations/005_split_warehouse_madrid_barcelona.sql`
- Modify: `supabase/schema.sql:78-81`

**Interfaces:**
- Produces: two `locations` rows with `type = 'warehouse'`, named exactly `Warehouse Madrid` and
  `Warehouse Barcelona`, that `js/store.js` (Task 3) will query via `listLocations()`.

- [ ] **Step 1: Write the migration file**

```sql
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
```

- [ ] **Step 2: Update `schema.sql`'s seed block so a fresh install seeds both warehouses**

Replace `supabase/schema.sql:78-81`:

```sql
-- Seed the single warehouse location. Idempotent: safe to re-run.
insert into public.locations (name, type)
select 'Warehouse', 'warehouse'
where not exists (select 1 from public.locations where type = 'warehouse');
```

with:

```sql
-- Seed the two warehouse locations. Idempotent: safe to re-run.
insert into public.locations (name, type)
select 'Warehouse Madrid', 'warehouse'
where not exists (select 1 from public.locations where name = 'Warehouse Madrid');

insert into public.locations (name, type)
select 'Warehouse Barcelona', 'warehouse'
where not exists (select 1 from public.locations where name = 'Warehouse Barcelona');
```

- [ ] **Step 3: Commit**

```bash
git add supabase/schema.sql supabase/migrations/005_split_warehouse_madrid_barcelona.sql
git commit -m "feat: split warehouse into Madrid and Barcelona locations"
```

- [ ] **Step 4: Apply the migration to the live Supabase project**

Paste the contents of `supabase/migrations/005_split_warehouse_madrid_barcelona.sql` into the
Supabase SQL editor for the live project and run it (same manual process as migrations 001-004 —
there's no CLI wired up). Confirm afterward with:

```sql
select id, name, type from public.locations where type = 'warehouse';
```

Expected: two rows, `Warehouse Madrid` and `Warehouse Barcelona`.

---

### Task 2: Router module

**Files:**
- Create: `js/router.js`
- Test: `tests/router.test.js`

**Interfaces:**
- Produces: `parseRoute(hash: string) -> { name: 'overview'|'schools'|'requests'|'location', params: { id?: string } }`
  and `createRouter({ onChange: (route) => void }) -> { current(), navigate(hash), start() }`.
  `main.js` (Task 10) is the only consumer of `createRouter`; `parseRoute` is consumed directly by
  its own test.

- [ ] **Step 1: Write the failing tests**

```js
// tests/router.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRoute } from '../js/router.js';

test('parseRoute returns overview for an empty hash', () => {
  assert.deepEqual(parseRoute(''), { name: 'overview', params: {} });
});

test('parseRoute returns overview for a bare "#"', () => {
  assert.deepEqual(parseRoute('#'), { name: 'overview', params: {} });
});

test('parseRoute recognizes #/overview', () => {
  assert.deepEqual(parseRoute('#/overview'), { name: 'overview', params: {} });
});

test('parseRoute recognizes #/schools', () => {
  assert.deepEqual(parseRoute('#/schools'), { name: 'schools', params: {} });
});

test('parseRoute recognizes #/requests', () => {
  assert.deepEqual(parseRoute('#/requests'), { name: 'requests', params: {} });
});

test('parseRoute recognizes #/locations/:id and extracts the id', () => {
  assert.deepEqual(parseRoute('#/locations/abc-123'), { name: 'location', params: { id: 'abc-123' } });
});

test('parseRoute falls back to overview for #/locations with no id', () => {
  assert.deepEqual(parseRoute('#/locations'), { name: 'overview', params: {} });
});

test('parseRoute falls back to overview for an unknown route', () => {
  assert.deepEqual(parseRoute('#/nonsense'), { name: 'overview', params: {} });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module '../js/router.js'` (file doesn't exist yet).

- [ ] **Step 3: Write `js/router.js`**

```js
// js/router.js
export function parseRoute(hash) {
  const path = (hash || '').replace(/^#/, '');
  const parts = path.split('/').filter(Boolean);

  if (parts.length === 0) return { name: 'overview', params: {} };
  if (parts[0] === 'overview') return { name: 'overview', params: {} };
  if (parts[0] === 'schools') return { name: 'schools', params: {} };
  if (parts[0] === 'requests') return { name: 'requests', params: {} };
  if (parts[0] === 'locations' && parts[1]) return { name: 'location', params: { id: parts[1] } };
  return { name: 'overview', params: {} };
}

export function createRouter({ onChange }) {
  function current() {
    return parseRoute(window.location.hash);
  }

  function navigate(hash) {
    window.location.hash = hash;
  }

  function start() {
    window.addEventListener('hashchange', () => onChange(current()));
    onChange(current());
  }

  return { current, navigate, start };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS — all 8 `parseRoute` tests green. (`createRouter` uses `window`, which Node's test
runner has no DOM for — it's intentionally left untested here and verified manually in Task 12,
consistent with how this codebase only unit-tests pure logic.)

- [ ] **Step 5: Syntax-check**

Run: `node --check js/router.js`
Expected: no output, exit code 0.

- [ ] **Step 6: Commit**

```bash
git add js/router.js tests/router.test.js
git commit -m "feat: add hash-based router for tabbed navigation"
```

---

### Task 3: Shared data store

**Files:**
- Create: `js/store.js`
- Test: `tests/store.test.js`

**Interfaces:**
- Consumes: an `api` object shaped like `js/api.js`'s `createApi(client)` return value — needs
  `listLocations()`, `listMaterials()`, `listItems()`, `listRequests()`, `listMovements()`.
- Produces: `createStore(api) -> { refresh(), clear(), getLocations(), getMaterials(), getItems(),
  getRequests(), getMovements(), computeSchools(), computeWarehouses(), findLocationView(id) }`.
  Every location view returned by `computeSchools()`/`computeWarehouses()`/`findLocationView()`
  has the shape `{ id, name, type, tier, students, notes, materials: [{name, ids, count}],
  totalUnits }` — this exact shape is consumed by `js/overview.js` (Task 6), `js/schools.js`
  (Task 7), and `js/locationDetail.js` (Task 8).

- [ ] **Step 1: Write the failing tests**

```js
// tests/store.test.js
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
  };
}

const sampleData = {
  locations: [
    { id: 'wh-mad', name: 'Warehouse Madrid', type: 'warehouse' },
    { id: 'wh-bcn', name: 'Warehouse Barcelona', type: 'warehouse' },
    { id: 'sch-1', name: 'BSB Cast', type: 'school', tier: 'Tier1', students: 200 },
  ],
  materials: [{ id: 'm1', name: 'Robot Kit' }],
  items: [
    { id: 'R-1', material_id: 'm1', current_location_id: 'sch-1', retired: false },
    { id: 'R-2', material_id: 'm1', current_location_id: 'wh-mad', retired: false },
    { id: 'R-3', material_id: 'm1', current_location_id: 'wh-mad', retired: true },
  ],
  requests: [],
  movements: [],
};

test('refresh populates all five collections from the injected api', async () => {
  const store = createStore(makeFakeApi(sampleData));
  await store.refresh();
  assert.deepEqual(store.getLocations(), sampleData.locations);
  assert.deepEqual(store.getMaterials(), sampleData.materials);
  assert.deepEqual(store.getItems(), sampleData.items);
});

test('clear empties all collections', async () => {
  const store = createStore(makeFakeApi(sampleData));
  await store.refresh();
  store.clear();
  assert.deepEqual(store.getLocations(), []);
  assert.deepEqual(store.getItems(), []);
});

test('computeSchools returns only school-type locations with computed material totals', async () => {
  const store = createStore(makeFakeApi(sampleData));
  await store.refresh();
  const schools = store.computeSchools();
  assert.equal(schools.length, 1);
  assert.equal(schools[0].id, 'sch-1');
  assert.equal(schools[0].totalUnits, 1);
  assert.deepEqual(schools[0].materials, [{ name: 'Robot Kit', ids: ['R-1'], count: 1 }]);
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module '../js/store.js'`.

- [ ] **Step 3: Write `js/store.js`**

```js
// js/store.js
export function createStore(api) {
  let locations = [];
  let materials = [];
  let items = [];
  let requests = [];
  let movements = [];

  async function refresh() {
    [locations, materials, items, requests, movements] = await Promise.all([
      api.listLocations(),
      api.listMaterials(),
      api.listItems(),
      api.listRequests(),
      api.listMovements(),
    ]);
  }

  function clear() {
    locations = [];
    materials = [];
    items = [];
    requests = [];
    movements = [];
  }

  function getLocations() { return locations; }
  function getMaterials() { return materials; }
  function getItems() { return items; }
  function getRequests() { return requests; }
  function getMovements() { return movements; }

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

  function computeWarehouses() {
    return locations.filter(l => l.type === 'warehouse')
      .map(computeLocationView)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  function findLocationView(id) {
    const loc = locations.find(l => l.id === id);
    return loc ? computeLocationView(loc) : null;
  }

  return {
    refresh, clear,
    getLocations, getMaterials, getItems, getRequests, getMovements,
    computeSchools, computeWarehouses, findLocationView,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS — all 6 store tests green, plus everything from Task 2 still green.

- [ ] **Step 5: Syntax-check**

Run: `node --check js/store.js`
Expected: no output, exit code 0.

- [ ] **Step 6: Commit**

```bash
git add js/store.js tests/store.test.js
git commit -m "feat: add shared data store for locations/materials/items/requests/movements"
```

---

### Task 4: `index.html` shell restructure

**Files:**
- Modify: `index.html` (full replacement — most of the body and part of the `<style>` block change)

**Interfaces:**
- Produces the DOM anchors every later task depends on: `#tabBar` (nav element the tab bar
  renders into), `#accountArea` (login form or "logged in as" + logout button), `#viewport`
  (the `<main>` the router repopulates per route), `#overlay`/`#modalContent` (kept, now used
  only by `js/schoolForm.js`, Task 5).

- [ ] **Step 1: Replace `index.html` in full**

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Stock Manifest — Material Deployment 26-27</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  :root{
    --ink:#1C2333;
    --paper:#F3F1E9;
    --paper-2:#EAE6D9;
    --amber:#E2A63B;
    --teal:#3F7068;
    --rust:#C0532D;
    --slate:#6B7280;
    --line:#CFC9B8;
    --card:#FBFAF6;
  }
  *{box-sizing:border-box;}
  html{scroll-behavior:smooth;}
  body{
    margin:0;
    background:var(--paper);
    color:var(--ink);
    font-family:'IBM Plex Sans', sans-serif;
    -webkit-font-smoothing:antialiased;
  }
  ::selection{ background:var(--amber); color:var(--ink); }

  a, button, input, select { font-family:inherit; }
  :focus-visible{ outline:3px solid var(--rust); outline-offset:2px; }

  .mono{ font-family:'IBM Plex Mono', monospace; }
  .display{ font-family:'Space Grotesk', sans-serif; }

  /* ---------- Header ---------- */
  header.topbar{
    position:sticky; top:0; z-index:50;
    background:var(--ink);
    color:var(--paper);
    padding:14px 24px;
    display:flex; align-items:center; justify-content:space-between;
    gap:16px; flex-wrap:wrap;
    border-bottom:3px solid var(--amber);
  }
  .brand{
    display:flex; align-items:center; gap:10px;
  }
  .brand .mark{
    width:30px; height:30px;
    border:2px solid var(--amber);
    display:flex; align-items:center; justify-content:center;
    font-family:'IBM Plex Mono', monospace;
    font-size:12px; font-weight:600;
    color:var(--amber);
    transform:rotate(-4deg);
    flex-shrink:0;
  }
  .brand-text{
    font-family:'Space Grotesk', sans-serif;
    font-weight:700;
    font-size:18px;
    letter-spacing:0.02em;
  }
  .brand-text span{ color:var(--amber); }

  /* ---------- Tab bar ---------- */
  .tabbar{
    display:flex; gap:6px; flex-wrap:wrap;
  }
  .tabbar .tab{
    font-family:'IBM Plex Mono', monospace;
    font-size:13px;
    padding:8px 16px;
    background:none;
    border:1px solid rgba(243,241,233,0.35);
    color:var(--paper);
    cursor:pointer;
    transition:background .15s, color .15s;
  }
  .tabbar .tab:hover{ background:rgba(243,241,233,0.12); }
  .tabbar .tab.active{ background:var(--amber); border-color:var(--amber); color:var(--ink); }

  /* ---------- Account area ---------- */
  .account{
    display:flex; align-items:center; gap:10px; flex-wrap:wrap;
  }
  .account .who{
    font-family:'IBM Plex Mono', monospace;
    font-size:12.5px; color:var(--paper);
  }

  .live-status{
    font-family:'IBM Plex Mono', monospace;
    font-size:11.5px;
    padding:4px 9px;
    border:1px solid var(--line);
    white-space:nowrap;
  }
  .live-status.idle{ color:var(--slate); }
  .live-status.loading{ color:var(--ink); border-color:var(--ink); }
  .live-status.live{ color:var(--teal); border-color:var(--teal); }
  .live-status.error{ color:var(--rust); border-color:var(--rust); }

  /* ---------- Login screen ---------- */
  .login-screen{
    max-width:420px; margin:80px auto; padding:30px;
    background:var(--card); border:1px solid var(--ink);
  }
  .login-screen h2{
    font-family:'Space Grotesk', sans-serif; font-size:22px; margin:0 0 18px;
  }
  .login-screen label{
    display:block; margin-bottom:14px;
    font-family:'IBM Plex Mono', monospace; font-size:12px;
  }
  .login-screen input{
    width:100%; border:1px solid var(--line); background:var(--paper);
    padding:9px 11px; font-family:'IBM Plex Mono', monospace; font-size:13px; margin-top:5px;
  }

  /* ---------- Back link ---------- */
  .back-link{
    display:inline-block;
    font-family:'IBM Plex Mono', monospace;
    font-size:12.5px;
    color:var(--slate);
    margin-bottom:18px;
    text-decoration:none;
  }
  .back-link:hover{ color:var(--ink); }

  /* ---------- Hero / manifest stamp strip ---------- */
  .hero{
    padding:56px 24px 36px;
    max-width:1180px; margin:0 auto;
  }
  .hero-eyebrow{
    font-family:'IBM Plex Mono', monospace;
    font-size:12px; letter-spacing:0.18em; text-transform:uppercase;
    color:var(--rust);
    margin-bottom:10px;
  }
  .hero h1{
    font-family:'Space Grotesk', sans-serif;
    font-weight:700;
    font-size:clamp(28px, 4.4vw, 48px);
    line-height:1.08;
    margin:0 0 28px;
    max-width:820px;
  }
  .stamps{
    display:flex; gap:18px; flex-wrap:wrap;
  }
  .stamp{
    border:2px solid var(--ink);
    padding:14px 22px;
    background:var(--card);
    position:relative;
    min-width:150px;
  }
  .stamp:nth-child(2){ transform:rotate(-1.2deg); border-color:var(--teal); }
  .stamp:nth-child(3){ transform:rotate(1deg); border-color:var(--rust); }
  .stamp:nth-child(1){ transform:rotate(0.6deg); }
  .stamp .num{
    font-family:'Space Grotesk', sans-serif;
    font-weight:700;
    font-size:36px;
    line-height:1;
  }
  .stamp .lbl{
    font-family:'IBM Plex Mono', monospace;
    font-size:11px;
    letter-spacing:0.08em;
    text-transform:uppercase;
    color:var(--slate);
    margin-top:6px;
  }

  /* ---------- Section shell ---------- */
  section{
    max-width:1180px; margin:0 auto;
    padding:36px 24px;
  }
  .section-head{
    display:flex; align-items:baseline; justify-content:space-between;
    gap:16px; margin-bottom:22px; flex-wrap:wrap;
    border-bottom:1px solid var(--line);
    padding-bottom:12px;
  }
  .section-head h2{
    font-family:'Space Grotesk', sans-serif;
    font-size:22px; margin:0;
  }
  .section-head .tag{
    font-family:'IBM Plex Mono', monospace;
    font-size:12px; color:var(--slate);
  }

  /* ---------- Material bar chart ---------- */
  .chart-row{
    display:grid;
    grid-template-columns:150px 1fr 46px;
    align-items:center;
    gap:12px;
    padding:7px 0;
  }
  .chart-row .mname{
    font-family:'IBM Plex Mono', monospace;
    font-size:12.5px;
    white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
  }
  .bar-track{
    height:16px;
    background:var(--paper-2);
    position:relative;
  }
  .bar-fill{
    height:100%;
    background:var(--teal);
    transition:width .5s ease;
  }
  .chart-row .count{
    font-family:'IBM Plex Mono', monospace;
    font-size:12.5px; text-align:right; color:var(--slate);
  }

  /* ---------- Tier split ---------- */
  .tiersplit{ display:flex; gap:24px; flex-wrap:wrap; align-items:stretch; }
  .tier-block{
    flex:1; min-width:220px;
    border:1px solid var(--line);
    background:var(--card);
    padding:18px 20px;
  }
  .tier-block .tt{ display:flex; align-items:center; gap:8px; margin-bottom:10px;}
  .dot{ width:10px; height:10px; border-radius:50%; display:inline-block;}
  .dot.t1{ background:var(--rust);}
  .dot.t2{ background:var(--teal);}
  .tier-block .big{ font-family:'Space Grotesk', sans-serif; font-weight:700; font-size:30px;}
  .tier-block .desc{ font-family:'IBM Plex Mono', monospace; font-size:12px; color:var(--slate); margin-top:4px;}

  /* ---------- Filters ---------- */
  .filterbar{
    display:flex; gap:10px; flex-wrap:wrap; margin-bottom:24px;
  }
  .chip{
    font-family:'IBM Plex Mono', monospace;
    font-size:12.5px;
    padding:7px 14px;
    border:1px solid var(--ink);
    background:transparent;
    cursor:pointer;
    color:var(--ink);
    transition:background .15s, color .15s;
  }
  .chip:hover{ background:var(--paper-2); }
  .chip.active{ background:var(--ink); color:var(--paper); }
  .chip .n{ opacity:0.6; margin-left:4px; }

  /* ---------- School / warehouse grid (tags) ---------- */
  .grid{
    display:grid;
    grid-template-columns:repeat(auto-fill, minmax(250px, 1fr));
    gap:18px;
  }
  .card{
    background:var(--card);
    border:1px solid var(--ink);
    position:relative;
    cursor:pointer;
    padding:18px 18px 16px;
    transition:transform .15s ease, box-shadow .15s ease;
  }
  .card:hover{ transform:translateY(-3px); box-shadow:4px 4px 0 var(--ink); }
  .card::before{
    content:"";
    position:absolute; top:0; left:16px; right:16px; height:0;
    border-top:2px dashed var(--line);
  }
  .card .punch{
    position:absolute; top:-6px; left:50%; transform:translateX(-50%);
    width:12px; height:12px; border-radius:50%;
    background:var(--paper); border:1px solid var(--line);
  }
  .card .cname{
    font-family:'Space Grotesk', sans-serif;
    font-weight:600; font-size:17px;
    margin:6px 0 8px;
    padding-right:60px;
  }
  .tierbadge{
    position:absolute; top:16px; right:16px;
    font-family:'IBM Plex Mono', monospace;
    font-size:10.5px; letter-spacing:0.06em;
    padding:3px 8px;
    border:1.5px solid currentColor;
    transform:rotate(3deg);
  }
  .tierbadge.t1{ color:var(--rust); }
  .tierbadge.t2{ color:var(--teal); }
  .card .metaline{
    font-family:'IBM Plex Mono', monospace;
    font-size:11.5px; color:var(--slate);
    margin-bottom:10px;
  }
  .chiprow{ display:flex; gap:6px; flex-wrap:wrap; }
  .matchip{
    font-family:'IBM Plex Mono', monospace;
    font-size:10.5px;
    background:var(--paper-2);
    padding:3px 7px;
    border:1px solid var(--line);
  }
  .matchip.more{ color:var(--slate); }

  .empty-note{
    font-family:'IBM Plex Mono', monospace;
    font-size:13px; color:var(--slate);
    padding:30px 0; text-align:center;
  }

  /* ---------- Modal (schoolForm only) ---------- */
  .overlay{
    position:fixed; inset:0; background:rgba(28,35,51,0.55);
    display:none; align-items:flex-start; justify-content:center;
    padding:40px 20px; z-index:100; overflow-y:auto;
  }
  .overlay.open{ display:flex; }
  .modal{
    background:var(--card);
    border:2px solid var(--ink);
    max-width:640px; width:100%;
    padding:30px 30px 26px;
    position:relative;
    margin-top:10px;
  }
  .modal-close{
    position:absolute; top:14px; right:14px;
    background:none; border:1px solid var(--ink);
    width:30px; height:30px;
    font-size:16px; line-height:1; cursor:pointer;
    font-family:'IBM Plex Mono', monospace;
  }
  .modal-close:hover{ background:var(--ink); color:var(--paper); }

  /* ---------- Detail title / tier (modal AND full-page location detail) ---------- */
  .modal h3, .detail-title{
    font-family:'Space Grotesk', sans-serif;
    font-size:26px; margin:0 0 4px;
  }
  .modal h3{ padding-right:40px; }
  .modal-tier{
    font-family:'IBM Plex Mono', monospace;
    font-size:12px; margin-bottom:20px;
  }
  .modal-grid{
    display:grid; grid-template-columns:1fr 1fr; gap:14px;
    margin-bottom:22px;
  }
  .modal-stat{
    border:1px solid var(--line); padding:10px 14px;
  }
  .modal-stat .l{ font-family:'IBM Plex Mono', monospace; font-size:10.5px; text-transform:uppercase; color:var(--slate); letter-spacing:0.06em;}
  .modal-stat .v{ font-family:'Space Grotesk', sans-serif; font-weight:600; font-size:18px; margin-top:3px;}
  .manifest-title{
    font-family:'IBM Plex Mono', monospace;
    font-size:11.5px; text-transform:uppercase; letter-spacing:0.1em;
    color:var(--slate); margin:22px 0 10px;
    border-bottom:1px solid var(--line); padding-bottom:6px;
  }
  .manifest-line{
    display:flex; justify-content:space-between; align-items:baseline;
    gap:10px; padding:8px 0; border-bottom:1px dotted var(--line);
    font-size:14px;
  }
  .manifest-line .mn{ font-weight:600; }
  .manifest-line .ids{
    font-family:'IBM Plex Mono', monospace;
    font-size:12px; color:var(--slate); text-align:right;
  }
  .proposal-box{
    margin-top:18px; padding:12px 14px;
    background:var(--paper-2); border-left:3px solid var(--amber);
    font-size:13.5px;
  }
  .proposal-box .l{
    font-family:'IBM Plex Mono', monospace; font-size:10.5px;
    text-transform:uppercase; letter-spacing:0.08em; color:var(--slate);
    margin-bottom:4px;
  }

  footer{
    max-width:1180px; margin:0 auto; padding:30px 24px 60px;
    font-family:'IBM Plex Mono', monospace;
    font-size:11.5px; color:var(--slate);
    border-top:1px solid var(--line);
  }

  @media (max-width:640px){
    .modal-grid{ grid-template-columns:1fr; }
    .chart-row{ grid-template-columns:100px 1fr 36px; }
  }
  @media (prefers-reduced-motion: reduce){
    *{ transition:none !important; scroll-behavior:auto !important; }
  }
</style>
</head>
<body>

<header class="topbar">
  <div class="brand">
    <div class="mark">M26</div>
    <div class="brand-text">STOCK<span>·</span>MANIFEST</div>
  </div>
  <nav class="tabbar" id="tabBar" style="display:none;"></nav>
  <div class="account" id="accountArea"></div>
</header>

<main id="viewport"></main>

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

- [ ] **Step 2: Commit**

```bash
git add index.html
git commit -m "feat: restructure page shell for tabbed navigation"
```

(This step alone leaves the app visually broken — `main.js`, `schools.js`, etc. still reference
the old markup. That's expected; it's fixed by the time Task 10 lands. Manual verification is
Task 12, once every task is in.)

---

### Task 5: Shared add/edit-school modal

**Files:**
- Create: `js/schoolForm.js`

**Interfaces:**
- Consumes: `escapeHtml` from `js/schools.js`; the shared `ctx` contract (Global Constraints) —
  specifically `ctx.api` and `ctx.store` and `ctx.rerender`; the `#overlay`/`#modalContent`
  elements from `index.html` (Task 4).
- Produces: `openSchoolForm(existing: LocationView | null, ctx) -> void`, consumed by
  `js/schools.js` (Task 7, "+ Add school" button) and `js/locationDetail.js` (Task 8, "Edit
  school" button).

- [ ] **Step 1: Write `js/schoolForm.js`**

```js
// js/schoolForm.js
import { escapeHtml } from './schools.js';

export function openSchoolForm(existing, ctx) {
  const { api, store, rerender } = ctx;
  const modal = document.getElementById('modalContent');
  const overlay = document.getElementById('overlay');
  const formStyle = "display:block; margin-bottom:14px;";
  const inputStyle = "width:100%; border:1px solid var(--line); background:var(--card); padding:8px 10px; font-family:'IBM Plex Mono', monospace; font-size:13px; margin-top:4px;";

  modal.innerHTML = `
    <button class="modal-close" id="modalCloseBtn" aria-label="Close">✕</button>
    <h3>${existing ? 'Edit school' : 'Add school'}</h3>
    <form id="schoolForm">
      <label style="${formStyle}">Name
        <input name="name" required value="${existing ? escapeHtml(existing.name) : ''}" style="${inputStyle}">
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
        <textarea name="notes" rows="3" style="${inputStyle}">${existing && existing.notes ? escapeHtml(existing.notes) : ''}</textarea>
      </label>
      <div id="schoolFormError" class="live-status error" style="display:none; margin-bottom:10px;"></div>
      <button type="submit" class="chip">Save</button>
      <button type="button" id="schoolFormCancel" class="chip" style="margin-left:8px;">Cancel</button>
    </form>
  `;

  overlay.classList.add('open');
  function close() { overlay.classList.remove('open'); }
  document.getElementById('modalCloseBtn').addEventListener('click', close);
  document.getElementById('schoolFormCancel').addEventListener('click', close);
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
      close();
      await store.refresh();
      await rerender();
    } catch (err) {
      errorEl.textContent = 'Could not save: ' + err.message;
      errorEl.style.display = 'block';
    }
  });
}
```

> Note: `js/schools.js` (Task 7) imports `openSchoolForm` from this file, and this file imports
> `escapeHtml` from `js/schools.js` — a circular import. This is safe here because neither import
> is used at module top-level, only inside functions called later (same pattern already used by
> `js/items.js` importing from `js/schools.js` while `js/schools.js` imports from `js/items.js`).

- [ ] **Step 2: Syntax-check**

Run: `node --check js/schoolForm.js`
Expected: no output, exit code 0.

- [ ] **Step 3: Commit**

```bash
git add js/schoolForm.js
git commit -m "feat: extract shared add/edit-school modal into js/schoolForm.js"
```

---

### Task 6: Overview view

**Files:**
- Create: `js/overview.js`

**Interfaces:**
- Consumes: `escapeHtml` from `js/schools.js`; `ctx.store.computeSchools()` /
  `ctx.store.computeWarehouses()`; `ctx.navigate`.
- Produces: `renderOverview(container: HTMLElement, ctx) -> void`, consumed by `js/main.js`
  (Task 10) for the `#/overview` route.

- [ ] **Step 1: Write `js/overview.js`**

```js
// js/overview.js
import { escapeHtml } from './schools.js';

export function renderOverview(container, ctx) {
  const { store, navigate } = ctx;
  const schools = store.computeSchools();
  const warehouses = store.computeWarehouses();

  const totalUnits = schools.reduce((a, s) => a + s.totalUnits, 0);
  const matSet = new Set();
  schools.forEach(s => s.materials.forEach(m => matSet.add(m.name)));

  const totals = {};
  schools.forEach(s => s.materials.forEach(m => {
    totals[m.name] = (totals[m.name] || 0) + m.count;
  }));
  const totalsSorted = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  const max = totalsSorted.length ? totalsSorted[0][1] : 1;

  const t1 = schools.filter(s => s.tier === 'Tier1').length;
  const t2 = schools.filter(s => s.tier === 'Tier2').length;
  const other = schools.length - t1 - t2;

  container.innerHTML = `
    <div class="hero">
      <div class="hero-eyebrow">Material deployment · Course 26–27 prep</div>
      <h1>Where every kit, robot and box currently lives — school by school.</h1>
      <div class="stamps">
        <div class="stamp"><div class="num">${schools.length}</div><div class="lbl">Schools tracked</div></div>
        <div class="stamp"><div class="num">${totalUnits}</div><div class="lbl">Units deployed</div></div>
        <div class="stamp"><div class="num">${matSet.size}</div><div class="lbl">Material lines</div></div>
      </div>
    </div>

    <section>
      <div class="section-head">
        <h2>Material distribution</h2>
        <div class="tag">units in the field, by material line</div>
      </div>
      <div id="chartArea"></div>
    </section>

    <section>
      <div class="section-head">
        <h2>Tier split</h2>
        <div class="tag">school priority tier</div>
      </div>
      <div id="tierSplit"></div>
    </section>

    <section>
      <div class="section-head">
        <h2>Warehouses</h2>
        <div class="tag">central unassigned stock</div>
      </div>
      <div class="grid" id="warehouseGrid"></div>
    </section>
  `;

  const chartArea = container.querySelector('#chartArea');
  if (totalsSorted.length === 0) {
    chartArea.innerHTML = '<div class="empty-note">No material recorded across schools yet.</div>';
  } else {
    totalsSorted.forEach(([name, count]) => {
      const row = document.createElement('div');
      row.className = 'chart-row';
      const nameEsc = escapeHtml(name);
      row.innerHTML = `
        <div class="mname" title="${nameEsc}">${nameEsc}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${(count / max * 100).toFixed(1)}%"></div></div>
        <div class="count">${count}</div>
      `;
      chartArea.appendChild(row);
    });
  }

  const tierSplit = container.querySelector('#tierSplit');
  if (schools.length === 0) {
    tierSplit.innerHTML = '<div class="tier-block"><div class="desc">No schools yet.</div></div>';
  } else {
    tierSplit.innerHTML = `
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

  const warehouseGrid = container.querySelector('#warehouseGrid');
  if (warehouses.length === 0) {
    warehouseGrid.innerHTML = '<div class="empty-note">No warehouse locations found — check that the migration/schema seeded them.</div>';
  } else {
    warehouseGrid.innerHTML = '';
    warehouses.forEach(wh => {
      const card = document.createElement('div');
      card.className = 'card';
      const chipsHtml = wh.materials.slice(0, 6).map(m => `<span class="matchip">${escapeHtml(m.name)} ×${m.count}</span>`).join('');
      const moreHtml = wh.materials.length > 6 ? `<span class="matchip more">+${wh.materials.length - 6} more</span>` : '';
      card.innerHTML = `
        <div class="punch"></div>
        <div class="tierbadge" style="color:var(--slate);">WAREHOUSE</div>
        <div class="cname">${escapeHtml(wh.name)}</div>
        <div class="metaline">${wh.totalUnits} units in stock · ${wh.materials.length} material line${wh.materials.length === 1 ? '' : 's'}</div>
        <div class="chiprow">${chipsHtml || '<span class="matchip">no material recorded</span>'}${moreHtml}</div>
      `;
      card.addEventListener('click', () => navigate(`#/locations/${wh.id}`));
      warehouseGrid.appendChild(card);
    });
  }
}
```

- [ ] **Step 2: Syntax-check**

Run: `node --check js/overview.js`
Expected: no output, exit code 0.

- [ ] **Step 3: Commit**

```bash
git add js/overview.js
git commit -m "feat: add Overview route (stats, chart, tier split, warehouse grid)"
```

---

### Task 7: Trim `js/schools.js` to the Schools route

**Files:**
- Modify: `js/schools.js` (full replacement)

**Interfaces:**
- Keeps exporting: `escapeHtml(str) -> string` (unchanged — every other rendering module still
  imports it from here).
- Produces: `renderSchools(container: HTMLElement, ctx) -> void`, consumed by `js/main.js`
  (Task 10) for the `#/schools` route.
- Consumes: `openSchoolForm` from `js/schoolForm.js` (Task 5); `ctx.store.computeSchools()`;
  `ctx.navigate`; `ctx.isAdmin`.

- [ ] **Step 1: Replace `js/schools.js` in full**

```js
// js/schools.js
import { openSchoolForm } from './schoolForm.js';

export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

const state = { tier: 'ALL', query: '' };

function schoolMatchesFilters(s) {
  if (state.tier !== 'ALL' && s.tier !== state.tier) return false;
  if (state.query) {
    const q = state.query.toLowerCase();
    if (!s.name.toLowerCase().includes(q)) return false;
  }
  return true;
}

export function renderSchools(container, ctx) {
  const { store, isAdmin, navigate } = ctx;
  const schools = store.computeSchools();
  const t1 = schools.filter(s => s.tier === 'Tier1').length;
  const t2 = schools.filter(s => s.tier === 'Tier2').length;

  container.innerHTML = `
    <section>
      <div class="section-head">
        <h2>School manifest</h2>
        <div style="display:flex; align-items:center; gap:12px;">
          ${isAdmin ? '<button id="addSchoolBtn" class="chip">+ Add school</button>' : ''}
          <div class="tag" id="resultCount">0 schools</div>
        </div>
      </div>
      <div style="max-width:340px; margin-bottom:16px; background:var(--card); border:1px solid var(--line);">
        <input id="searchInput" type="text" placeholder="Search school name…" aria-label="Search schools"
          style="width:100%; border:none; background:none; padding:8px 12px; font-family:'IBM Plex Mono', monospace; font-size:14px; color:var(--ink);">
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
    ];
    tierFilterBar.innerHTML = '';
    chips.forEach(c => {
      const btn = document.createElement('button');
      btn.className = 'chip' + (state.tier === c.key ? ' active' : '');
      btn.innerHTML = `${c.label} <span class="n">${c.n}</span>`;
      btn.addEventListener('click', () => { state.tier = c.key; renderTierFilterBar(); renderGrid(); });
      tierFilterBar.appendChild(btn);
    });
  }

  const grid = container.querySelector('#schoolGrid');
  const emptyNote = container.querySelector('#emptyNote');
  function renderGrid() {
    const list = schools.filter(schoolMatchesFilters);
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
    emptyNote.textContent = 'No schools match this filter. Try clearing the search.';
    list.forEach(s => {
      const card = document.createElement('div');
      card.className = 'card';
      const tierClass = s.tier === 'Tier1' ? 't1' : 't2';
      const chipsHtml = s.materials.slice(0, 4).map(m => `<span class="matchip">${escapeHtml(m.name)} ×${m.count}</span>`).join('');
      const moreHtml = s.materials.length > 4 ? `<span class="matchip more">+${s.materials.length - 4} more</span>` : '';
      card.innerHTML = `
        <div class="punch"></div>
        <div class="tierbadge ${tierClass}">${s.tier || 'N/A'}</div>
        <div class="cname">${escapeHtml(s.name)}</div>
        <div class="metaline">${s.totalUnits} units · ${s.materials.length} material line${s.materials.length === 1 ? '' : 's'}</div>
        <div class="chiprow">${chipsHtml || '<span class="matchip">no material recorded</span>'}${moreHtml}</div>
      `;
      card.addEventListener('click', () => navigate(`#/locations/${s.id}`));
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

- [ ] **Step 2: Syntax-check**

Run: `node --check js/schools.js`
Expected: no output, exit code 0.

- [ ] **Step 3: Commit**

```bash
git add js/schools.js
git commit -m "refactor: trim js/schools.js to the Schools route only"
```

---

### Task 8: Location detail view

**Files:**
- Create: `js/locationDetail.js`

**Interfaces:**
- Consumes: `escapeHtml` from `js/schools.js`; `renderItemsSection` from `js/items.js`;
  `renderRequestSection` from `js/requests.js` (unchanged signature); `renderHistorySection` from
  `js/history.js`; `openSchoolForm` from `js/schoolForm.js`; `ctx.store.findLocationView(id)`;
  `ctx.locationId`.
- Produces: `renderLocationDetail(container: HTMLElement, ctx) -> void`, consumed by
  `js/main.js` (Task 10) for the `#/locations/:id` route.

- [ ] **Step 1: Write `js/locationDetail.js`**

```js
// js/locationDetail.js
import { escapeHtml } from './schools.js';
import { renderItemsSection } from './items.js';
import { renderRequestSection } from './requests.js';
import { renderHistorySection } from './history.js';
import { openSchoolForm } from './schoolForm.js';

function fmt(n) { return (n === null || n === undefined || n === '') ? '—' : n; }

export function renderLocationDetail(container, ctx) {
  const { store, isAdmin, currentUserId, locationId } = ctx;
  const loc = store.findLocationView(locationId);

  if (!loc) {
    container.innerHTML = `
      <section>
        <a href="#/schools" class="back-link">← Back to schools</a>
        <div class="empty-note">Location not found. It may have been removed.</div>
      </section>
    `;
    return;
  }

  const isWarehouse = loc.type === 'warehouse';
  const tierClass = loc.tier === 'Tier1' ? 't1' : 't2';
  const backHref = isWarehouse ? '#/overview' : '#/schools';
  const backLabel = isWarehouse ? '← Back to overview' : '← Back to schools';

  container.innerHTML = `
    <section>
      <a href="${backHref}" class="back-link">${backLabel}</a>
      <h3 class="detail-title">${escapeHtml(loc.name)}</h3>
      ${isWarehouse
        ? '<div class="modal-tier" style="color:var(--slate)">Warehouse</div>'
        : `<div class="modal-tier" style="color:var(--${tierClass === 't1' ? 'rust' : 'teal'})">${loc.tier || 'Tier not recorded'}</div>`
      }
      <div class="modal-grid">
        ${isWarehouse
          ? `<div class="modal-stat"><div class="l">Units in stock</div><div class="v">${loc.totalUnits}</div></div>
             <div class="modal-stat"><div class="l">Material lines</div><div class="v">${loc.materials.length}</div></div>`
          : `<div class="modal-stat"><div class="l">Students</div><div class="v">${fmt(loc.students)}</div></div>
             <div class="modal-stat"><div class="l">Units deployed</div><div class="v">${loc.totalUnits}</div></div>`
        }
      </div>
      <div class="manifest-title">Material manifest</div>
      <div id="itemsSection"></div>
      <div class="manifest-title">Movement history</div>
      <div id="movementHistorySection"></div>
      ${(!isWarehouse && !isAdmin) ? `
        <div class="manifest-title">Request materials</div>
        <div id="locationRequestsSection"></div>
      ` : ''}
      ${isWarehouse ? '' : `
        <div class="proposal-box">
          <div class="l">Notes</div>
          <div>${loc.notes ? escapeHtml(loc.notes) : 'No notes recorded.'}</div>
        </div>
      `}
      ${(!isWarehouse && isAdmin) ? '<button id="editSchoolBtn" class="chip" style="margin-top:16px;">Edit school</button>' : ''}
    </section>
  `;

  renderItemsSection(container.querySelector('#itemsSection'), {
    api: ctx.api, location: loc, materials: store.getMaterials(), items: store.getItems(),
    isAdmin, allLocations: store.getLocations(),
    onChange: async () => { await store.refresh(); await ctx.rerender(); },
  });

  const locationMovements = store.getMovements()
    .filter(mv => mv.from_location_id === loc.id || mv.to_location_id === loc.id)
    .sort((a, b) => new Date(b.moved_at) - new Date(a.moved_at));
  renderHistorySection(container.querySelector('#movementHistorySection'), {
    location: loc, movements: locationMovements, items: store.getItems(),
    materials: store.getMaterials(), locations: store.getLocations(),
  });

  if (!isWarehouse && !isAdmin) {
    const myRequests = store.getRequests().filter(r => r.location_id === loc.id && r.requested_by === currentUserId);
    renderRequestSection(container.querySelector('#locationRequestsSection'), {
      api: ctx.api, location: loc, materials: store.getMaterials(), myRequests,
      onChange: async () => { await store.refresh(); await ctx.rerender(); },
    });
  }

  if (!isWarehouse && isAdmin) {
    container.querySelector('#editSchoolBtn').addEventListener('click', () => {
      openSchoolForm(loc, ctx);
    });
  }
}
```

- [ ] **Step 2: Syntax-check**

Run: `node --check js/locationDetail.js`
Expected: no output, exit code 0.

- [ ] **Step 3: Commit**

```bash
git add js/locationDetail.js
git commit -m "feat: add location-detail route replacing the school-detail modal"
```

---

### Task 9: Requests route

**Files:**
- Modify: `js/requests.js` (bottom portion — `createRequestsView` becomes `renderRequests`;
  `renderRequestSection` and `renderApproveForm` at the top of the file are unchanged)

**Interfaces:**
- Keeps: `renderRequestSection(container, ctx)` — unchanged, still consumed by
  `js/locationDetail.js` (Task 8).
- Produces: `renderRequests(container: HTMLElement, ctx) -> void` (replaces
  `createRequestsView`), consumed by `js/main.js` (Task 10) for the `#/requests` route.

- [ ] **Step 1: Replace `js/requests.js` in full**

```js
// js/requests.js
import { escapeHtml } from './schools.js';

export function renderRequestSection(container, ctx) {
  const { api, location, materials, myRequests, onChange } = ctx;
  const pending = myRequests.filter(r => r.status === 'pending');

  const pendingHtml = pending.map(r => {
    const mat = materials.find(m => m.id === r.material_id);
    const name = mat ? mat.name : 'Unknown material';
    return `<div class="manifest-line"><div class="mn">${escapeHtml(name)} ×${r.quantity}</div><div class="ids">pending</div></div>`;
  }).join('');

  container.innerHTML = `
    ${pendingHtml}
    <form id="requestForm" style="margin-top:14px; display:flex; gap:8px; flex-wrap:wrap; align-items:flex-end;">
      <label style="flex:1; min-width:160px;">Material
        <input name="materialName" required list="requestMaterialOptions" style="width:100%; border:1px solid var(--line); background:var(--card); padding:7px 9px; font-family:'IBM Plex Mono', monospace; font-size:12.5px; margin-top:4px;">
        <datalist id="requestMaterialOptions">
          ${materials.map(m => `<option value="${escapeHtml(m.name)}">`).join('')}
        </datalist>
      </label>
      <label style="min-width:90px;">Quantity
        <input name="quantity" type="number" min="1" required style="width:100%; border:1px solid var(--line); background:var(--card); padding:7px 9px; font-family:'IBM Plex Mono', monospace; font-size:12.5px; margin-top:4px;">
      </label>
      <label style="flex:1; min-width:160px;">Note (optional)
        <input name="note" style="width:100%; border:1px solid var(--line); background:var(--card); padding:7px 9px; font-family:'IBM Plex Mono', monospace; font-size:12.5px; margin-top:4px;">
      </label>
      <button type="submit" class="chip">Request materials</button>
    </form>
    <div id="requestFormError" class="live-status error" style="display:none; margin-top:8px;"></div>
  `;

  const form = container.querySelector('#requestForm');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = container.querySelector('#requestFormError');
    errorEl.style.display = 'none';
    const materialName = form.materialName.value.trim();
    const quantity = Number(form.quantity.value);
    const note = form.note.value.trim() || null;
    const material = materials.find(m => m.name.toLowerCase() === materialName.toLowerCase());
    if (!material) {
      errorEl.textContent = 'Pick an existing material from the list.';
      errorEl.style.display = 'block';
      return;
    }
    if (!quantity || quantity < 1) {
      errorEl.textContent = 'Quantity must be at least 1.';
      errorEl.style.display = 'block';
      return;
    }
    try {
      await api.createRequest({ location_id: location.id, material_id: material.id, quantity, note });
      await onChange();
    } catch (err) {
      errorEl.textContent = 'Could not submit request: ' + err.message;
      errorEl.style.display = 'block';
    }
  });
}

function renderApproveForm(container, req, ctx) {
  const { api, locations, materials, items, onChange } = ctx;
  const material = materials.find(m => m.id === req.material_id);
  const materialName = material ? material.name : 'Unknown material';
  const requestingSchool = locations.find(l => l.id === req.location_id);
  const availableItems = items.filter(i => i.material_id === req.material_id && !i.retired && i.current_location_id !== req.location_id);
  const locationsById = new Map(locations.map(l => [l.id, l]));

  const byLocation = new Map();
  availableItems.forEach(i => {
    if (!byLocation.has(i.current_location_id)) byLocation.set(i.current_location_id, []);
    byLocation.get(i.current_location_id).push(i);
  });
  const orderedLocationIds = Array.from(byLocation.keys()).sort((a, b) => {
    const la = locationsById.get(a);
    const lb = locationsById.get(b);
    const aWh = (la && la.type === 'warehouse') ? 0 : 1;
    const bWh = (lb && lb.type === 'warehouse') ? 0 : 1;
    if (aWh !== bWh) return aWh - bWh;
    return (la ? la.name : '').localeCompare(lb ? lb.name : '');
  });

  const groupsHtml = orderedLocationIds.map(locId => {
    const loc = locationsById.get(locId);
    const locName = loc ? escapeHtml(loc.name) : 'Unknown location';
    const rows = byLocation.get(locId).map(i => `
      <label style="display:block; font-size:12.5px; margin:2px 0;">
        <input type="checkbox" class="approve-item-cb" data-item="${escapeHtml(i.id)}" data-location="${locId}">
        ${escapeHtml(i.id)}
      </label>
    `).join('');
    return `<div class="approve-group" style="margin-bottom:10px;"><div style="font-weight:600; font-size:12.5px;">${locName}</div>${rows}</div>`;
  }).join('') || '<div class="empty-note">No stock of this material anywhere — deny or wait for stock to arrive.</div>';

  container.innerHTML = `
    <div class="manifest-title">Approve: ${escapeHtml(materialName)} ×${req.quantity} for ${requestingSchool ? escapeHtml(requestingSchool.name) : 'Unknown school'}</div>
    ${groupsHtml}
    <label style="display:block; margin-top:10px;">Note (optional)
      <input name="note" style="width:100%; border:1px solid var(--line); background:var(--card); padding:7px 9px; font-family:'IBM Plex Mono', monospace; font-size:12.5px; margin-top:4px;">
    </label>
    <div id="approveError" class="live-status error" style="display:none; margin-top:8px;"></div>
    <button type="button" id="approveSubmitBtn" class="chip" style="margin-top:10px;" disabled>Approve</button>
  `;

  const submitBtn = container.querySelector('#approveSubmitBtn');
  const errorEl = container.querySelector('#approveError');
  const noteInput = container.querySelector('input[name="note"]');

  function updateSubmitState() {
    const checked = Array.from(container.querySelectorAll('.approve-item-cb:checked'));
    const locIds = new Set(checked.map(cb => cb.dataset.location));
    errorEl.style.display = 'none';
    if (checked.length === 0) {
      submitBtn.disabled = true;
    } else if (locIds.size > 1) {
      submitBtn.disabled = true;
      errorEl.textContent = 'Select items from only one location per approval.';
      errorEl.style.display = 'block';
    } else {
      submitBtn.disabled = false;
    }
  }

  container.querySelectorAll('.approve-item-cb').forEach(cb => {
    cb.addEventListener('change', updateSubmitState);
  });
  updateSubmitState();

  submitBtn.addEventListener('click', async () => {
    const checked = Array.from(container.querySelectorAll('.approve-item-cb:checked'));
    if (checked.length === 0) return;
    const itemIds = checked.map(cb => cb.dataset.item);
    const sourceLocationId = checked[0].dataset.location;
    errorEl.style.display = 'none';
    try {
      await api.performTransfer(itemIds, sourceLocationId, req.location_id, noteInput.value.trim() || null, req.id);
      await onChange();
    } catch (err) {
      errorEl.textContent = 'Could not approve: ' + err.message;
      errorEl.style.display = 'block';
    }
  });
}

export function renderRequests(container, ctx) {
  const { api, store, currentUserId } = ctx;
  const requests = store.getRequests();
  const locations = store.getLocations();
  const materials = store.getMaterials();
  const items = store.getItems();

  function locationName(id) {
    const loc = locations.find(l => l.id === id);
    return loc ? loc.name : 'Unknown location';
  }
  function materialName(id) {
    const mat = materials.find(m => m.id === id);
    return mat ? mat.name : 'Unknown material';
  }

  function renderPendingRow(req) {
    const row = document.createElement('div');
    row.className = 'card';
    const requesterEmail = req.requester ? req.requester.email : null;
    row.innerHTML = `
      <div class="cname">${escapeHtml(materialName(req.material_id))} ×${req.quantity} — ${escapeHtml(locationName(req.location_id))}</div>
      <div class="metaline">Requested by ${escapeHtml(requesterEmail || 'unknown')} · ${new Date(req.created_at).toLocaleDateString()}</div>
      ${req.note ? `<div class="metaline">Note: ${escapeHtml(req.note)}</div>` : ''}
      <div class="approve-area" style="margin-top:10px;"></div>
      <button type="button" class="chip deny-btn" style="margin-top:10px;">Deny</button>
    `;
    renderApproveForm(row.querySelector('.approve-area'), req, {
      api, locations, materials, items,
      onChange: async () => { await store.refresh(); await ctx.rerender(); },
    });
    row.querySelector('.deny-btn').addEventListener('click', async () => {
      if (!confirm('Deny this request?')) return;
      try {
        await api.updateRequest(req.id, {
          status: 'denied',
          resolved_by: currentUserId,
          resolved_at: new Date().toISOString(),
        });
        await store.refresh();
        await ctx.rerender();
      } catch (err) {
        alert('Could not deny: ' + err.message);
      }
    });
    return row;
  }

  function renderResolvedRow(req) {
    const row = document.createElement('div');
    row.className = 'card';
    const requesterEmail = req.requester ? req.requester.email : null;
    row.innerHTML = `
      <div class="cname">${escapeHtml(materialName(req.material_id))} ×${req.quantity} — ${escapeHtml(locationName(req.location_id))}</div>
      <div class="metaline">${req.status === 'approved' ? 'Approved' : 'Denied'} · requested by ${escapeHtml(requesterEmail || 'unknown')}</div>
    `;
    return row;
  }

  const pending = requests.filter(r => r.status === 'pending')
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const resolved = requests.filter(r => r.status !== 'pending')
    .sort((a, b) => new Date(b.resolved_at) - new Date(a.resolved_at))
    .slice(0, 10);

  container.innerHTML = `
    <section>
      <div class="section-head">
        <h2>Requests</h2>
        <div class="tag">pending material requests</div>
      </div>
      <div id="requestsSection"></div>
    </section>
  `;
  const section = container.querySelector('#requestsSection');
  if (pending.length === 0) {
    const note = document.createElement('div');
    note.className = 'empty-note';
    note.textContent = 'No pending requests.';
    section.appendChild(note);
  } else {
    pending.forEach(req => section.appendChild(renderPendingRow(req)));
  }
  if (resolved.length > 0) {
    const heading = document.createElement('div');
    heading.className = 'manifest-title';
    heading.textContent = 'Recently resolved';
    section.appendChild(heading);
    resolved.forEach(req => section.appendChild(renderResolvedRow(req)));
  }
}
```

- [ ] **Step 2: Syntax-check**

Run: `node --check js/requests.js`
Expected: no output, exit code 0.

- [ ] **Step 3: Commit**

```bash
git add js/requests.js
git commit -m "refactor: turn the admin requests dashboard into a route (renderRequests)"
```

---

### Task 10: `js/main.js` — router wiring, tab bar, login screen, auth flow

**Files:**
- Modify: `js/main.js` (full replacement)

**Interfaces:**
- Consumes everything produced so far: `createRouter`/`parseRoute` (Task 2), `createStore`
  (Task 3), `renderOverview` (Task 6), `renderSchools` (Task 7), `renderLocationDetail`
  (Task 8), `renderRequests` (Task 9), plus unchanged `createAuthModule` (`js/auth.js`) and
  `createApi` (`js/api.js`).
- Produces: the fully wired app — no other file consumes `main.js`.

- [ ] **Step 1: Replace `js/main.js` in full**

```js
// js/main.js
import { supabase } from './supabaseClient.js';
import { createAuthModule } from './auth.js';
import { createApi } from './api.js';
import { createStore } from './store.js';
import { createRouter } from './router.js';
import { renderOverview } from './overview.js';
import { renderSchools } from './schools.js';
import { renderLocationDetail } from './locationDetail.js';
import { renderRequests } from './requests.js';

const auth = createAuthModule(supabase);
const api = createApi(supabase);
const store = createStore(api);

const viewport = document.getElementById('viewport');
const tabBar = document.getElementById('tabBar');
const accountArea = document.getElementById('accountArea');

const TABS = [
  { name: 'overview', label: 'Overview', hash: '#/overview' },
  { name: 'schools', label: 'Schools', hash: '#/schools' },
  { name: 'requests', label: 'Requests', hash: '#/requests', adminOnly: true },
];

let isAdmin = false;
let currentUserId = null;

function renderTabBar(activeName) {
  tabBar.innerHTML = '';
  TABS.filter(t => !t.adminOnly || isAdmin).forEach(t => {
    const btn = document.createElement('button');
    btn.className = 'tab' + (t.name === activeName ? ' active' : '');
    btn.textContent = t.label;
    btn.addEventListener('click', () => router.navigate(t.hash));
    tabBar.appendChild(btn);
  });
}

async function renderRoute(route) {
  if (!currentUserId) return;

  if (route.name === 'requests' && !isAdmin) {
    router.navigate('#/overview');
    return;
  }

  renderTabBar(route.name);
  const ctx = {
    api, store, isAdmin, currentUserId,
    navigate: router.navigate,
    rerender: () => renderRoute(router.current()),
  };

  if (route.name === 'overview') {
    renderOverview(viewport, ctx);
  } else if (route.name === 'schools') {
    renderSchools(viewport, ctx);
  } else if (route.name === 'location') {
    renderLocationDetail(viewport, { ...ctx, locationId: route.params.id });
  } else if (route.name === 'requests') {
    renderRequests(viewport, ctx);
  }
}

const router = createRouter({ onChange: renderRoute });

function renderLoginScreen(message) {
  tabBar.style.display = 'none';
  tabBar.innerHTML = '';
  viewport.innerHTML = `
    <div class="login-screen">
      <h2>Stock Manifest — Sign in</h2>
      <form id="loginForm">
        <label>Email<input name="email" type="email" required></label>
        <label>Password<input name="password" type="password" required></label>
        <div id="loginError" class="live-status error" style="display:none; margin-bottom:12px;"></div>
        <button type="submit" class="chip">Log in</button>
      </form>
    </div>
  `;
  if (message) {
    const el = document.getElementById('loginError');
    el.textContent = message;
    el.style.display = 'block';
  }
  document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    try {
      await auth.signIn(form.email.value, form.password.value);
      await refreshAuthUI();
    } catch (err) {
      renderLoginScreen('Login failed: ' + err.message);
    }
  });
}

function renderAccountArea(profile) {
  accountArea.innerHTML = `
    <span class="who">Logged in as ${profile.role}</span>
    <button id="logoutBtn" class="chip">Log out</button>
  `;
  document.getElementById('logoutBtn').addEventListener('click', async () => {
    try {
      await auth.signOut();
      await refreshAuthUI();
    } catch (err) {
      alert('Logout failed: ' + err.message);
    }
  });
}

async function refreshAuthUI() {
  let profile;
  try {
    profile = await auth.getCurrentProfile();
  } catch (err) {
    accountArea.innerHTML = '';
    renderLoginScreen('Could not check session: ' + err.message);
    return;
  }

  if (!profile) {
    isAdmin = false;
    currentUserId = null;
    store.clear();
    accountArea.innerHTML = '';
    renderLoginScreen();
    return;
  }

  isAdmin = profile.role === 'admin';
  currentUserId = profile.id;
  renderAccountArea(profile);
  tabBar.style.display = '';

  try {
    await store.refresh();
  } catch (err) {
    // Data load failed, but the session itself is fine — show the error in the
    // viewport (tab bar/account area stay put), not the login screen.
    viewport.innerHTML = '<section><div class="empty-note" id="loadErrorNote"></div></section>';
    document.getElementById('loadErrorNote').textContent = 'Could not load data: ' + err.message;
    return;
  }

  if (!window.location.hash) window.location.hash = '#/overview';
  await renderRoute(router.current());
}

router.start();
refreshAuthUI();
```

- [ ] **Step 2: Syntax-check**

Run: `node --check js/main.js`
Expected: no output, exit code 0.

- [ ] **Step 3: Run the full test suite**

Run: `npm test`
Expected: PASS — all tests across `tests/*.test.js` green (router, store, api, auth, smoke).

- [ ] **Step 4: Commit**

```bash
git add js/main.js
git commit -m "feat: wire router, store, tab bar, and login screen into main.js"
```

---

### Task 11: Update `CLAUDE.md`

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update the "Architecture" section's module list**

In the numbered module list (currently items 1-7), update:
- Item 5 ("Rendering modules") to remove the "page-level view" framing for `js/schools.js` and
  instead describe: `js/router.js` (`parseRoute(hash)` + `createRouter`), `js/store.js`
  (`createStore(api)` — the five collections plus derived per-location computations), `js/overview.js`
  (`renderOverview`, the `#/overview` route), `js/schools.js` (trimmed to `renderSchools`, the
  `#/schools` route — still exports `escapeHtml()`), `js/locationDetail.js`
  (`renderLocationDetail`, the `#/locations/:id` route, replacing the old detail modal),
  `js/schoolForm.js` (`openSchoolForm`, the shared add/edit-school modal), `js/items.js`,
  `js/transfers.js`, `js/history.js` (unchanged), `js/requests.js` (`renderRequestSection`
  unchanged; `createRequestsView` renamed to `renderRequests`, the `#/requests` route).
- Item 6 ("`js/main.js`") to describe it as constructing `store`/`router` alongside
  `auth`/`api`, mapping routes to render functions, and rendering a login-only screen (no tabs)
  when logged out.
- Add a short new paragraph noting the app is hash-routed (`#/overview`, `#/schools`,
  `#/locations/:id`, `#/requests`) with `tests/router.test.js` covering `parseRoute` and
  `tests/store.test.js` covering `createStore`.
- Note there are now two warehouse locations (`Warehouse Madrid`, `Warehouse Barcelona`) —
  `computeWarehouses()` (plural) in `js/store.js`, not a single fixed warehouse.

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for the tabbed-navigation architecture"
```

---

### Task 12: Manual end-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Serve the site locally**

Run: `npx http-server -p 8080 .` (background/separate terminal)

- [ ] **Step 2: Open `http://localhost:8080` in a browser and verify the logged-out state**

Expected: only the brand + a centered login form is visible. No tab bar. No stray sections.

- [ ] **Step 3: Log in as an admin and verify Overview**

Expected: tab bar appears (Overview / Schools / Requests). Overview shows hero stats, the
material chart, tier split, and **two** warehouse cards: "Warehouse Madrid" and "Warehouse
Barcelona".

- [ ] **Step 4: Verify Schools tab**

Click the Schools tab. Expected: search box + tier filter chips + school grid, "+ Add school"
visible (admin). Type in the search box and click a tier chip — grid filters correctly.

- [ ] **Step 5: Verify location-detail drill-down and back navigation**

Click a school card. Expected: URL becomes `#/locations/<id>`, page shows manifest/history/notes
and an "Edit school" button. Click "← Back to schools" — returns to the Schools tab. Use the
browser's back button from a location-detail page — also returns correctly. Click a warehouse
card from Overview — same detail page renders, "← Back to overview" link shown instead.

- [ ] **Step 6: Verify a transfer end-to-end**

From a school's manifest, transfer a unit to "Warehouse Barcelona" (a destination that only
exists after the Task 1 migration ran). Confirm it disappears from the source location's manifest
and appears in Warehouse Barcelona's, and that the movement shows up in both locations' history.

- [ ] **Step 7: Verify Requests tab (admin)**

Click Requests tab. If there's a pending request, approve or deny it and confirm the list
updates. If admin-only guard needs checking, skip to Step 8.

- [ ] **Step 8: Verify a viewer account**

Log out, log in as a viewer. Expected: no Requests tab in the tab bar. Manually navigate to
`#/requests` in the address bar — expected: silently redirected to `#/overview`. Open a school's
detail page — expected: a "Request materials" form instead of an edit button.

- [ ] **Step 9: Verify logout**

Click "Log out". Expected: back to the login-only screen, tab bar hidden, `#viewport` shows only
the login form.

- [ ] **Step 10: Run the full test suite one last time**

Run: `npm test`
Expected: PASS, all suites green.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-15-nav-restructure.md`. Two execution
options:

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks,
   fast iteration.
2. **Inline Execution** — execute tasks in this session using executing-plans, batch execution
   with checkpoints.
