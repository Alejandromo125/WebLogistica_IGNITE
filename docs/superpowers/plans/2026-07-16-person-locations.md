# Person Locations (Custody Tracking) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let circulating equipment (robots, Elecfreaks consoles, Oculus headsets, etc.) be tracked
as being in a specific staff member's custody, not tied to a school or warehouse — reusing the
existing location detail/manifest/transfer/history UI as-is, since a "person location" is just a
third `locations.type`.

**Architecture:** Add `'person'` to the `locations.type` check constraint and a nullable
`owner_profile_id` column binding a person-location to an existing `profiles` row. Every rendering
module that already operates generically on "a location" (`locationDetail.js`, `items.js`,
`transfers.js`, `history.js`) needs zero or near-zero changes. Only three things are genuinely new:
a small admin-only "create person location" modal (`js/personForm.js`, mirroring
`js/schoolForm.js`), a "Team custody" grid on the Overview route (mirroring the existing
Warehouses grid), and `store.js` learning to fetch `profiles` and compute a `computeTeam()` view.

**Tech Stack:** Vanilla ES modules (no bundler), Supabase JS client, Node's built-in test runner
(`node --test`) for `js/api.js` and `js/store.js`.

## Global Constraints

- No build step, no bundler — every new/modified file is a plain ES module loaded by the browser
  exactly like the existing ones.
- `js/api.js` is the only module that imports `js/supabaseClient.js` indirectly (via the injected
  `client` parameter) — new API functions receive the client as a parameter via `createApi(client)`,
  never import the client module directly.
- `escapeHtml()` continues to live in and be exported from `js/schools.js` — every other rendering
  module imports it from there.
- User-entered free text must go through `escapeHtml()` before being interpolated into `innerHTML`.
- Containers are fully cleared and rebuilt on each render (`innerHTML = ''` then repopulated) — no
  partial-update path. New rendering code follows the same pattern already used everywhere else.
- Nothing hard-deletes a row — this plan adds no new delete paths (a person-location, once
  created, is edited/retired the same way a school is: never removed via the UI).
- **Shared `ctx` contract** (unchanged, defined in `js/main.js`): every route-rendering function
  receives `{ api, store, isAdmin, currentUserId, navigate, rerender }`; `renderLocationDetail`
  additionally gets `locationId`. Any mutating action follows `await ctx.store.refresh()` then
  `await ctx.rerender()`.
- RLS is **not** modified by this plan — `locations`/`items`/`movements` insert/update policies
  already gate on `public.is_admin()`, and select policies already allow any authenticated user to
  read, which is exactly the access a person-location needs (admin manages it, its owner and
  everyone else can view it read-only).
- Every new/modified `.js` file must pass `node --check <path>` before it's considered done.

---

## File Structure

**Create:**
- `supabase/migrations/006_add_person_locations.sql` — live-DB migration
- `js/personForm.js` — `openPersonForm(ctx)`: admin-only modal binding a new `'person'` location to
  an existing profile

**Modify:**
- `supabase/schema.sql` — `locations` table: widen the `type` check, add `owner_profile_id` column
  + unique partial index
- `js/api.js` — add `listProfiles()`
- `js/store.js` — add the `profiles` collection, `getProfiles()`, `computeTeam()`, and an
  `ownerProfileId` field on every computed location view
- `js/overview.js` — add a "Team custody" grid section (mirrors the existing Warehouses section)
- `js/locationDetail.js` — render a `'person'`-type location: hide tier/students/notes/request-form,
  show a custody-appropriate stat pair
- `tests/api.test.js` — cover `listProfiles`
- `tests/store.test.js` — cover `profiles`, `computeTeam`, and `ownerProfileId`
- `CLAUDE.md` — document the new module and location type

**Unchanged:** `js/auth.js`, `js/items.js`, `js/transfers.js`, `js/history.js`, `js/requests.js`,
`js/schools.js`, `js/schoolForm.js`, `js/router.js`, `js/main.js`, `js/config.js`,
`js/supabaseClient.js`, `index.html` (no new CSS needed — the Team grid reuses `.grid`/`.card`/
`.tierbadge`/`.cname`/`.metaline`/`.chiprow` exactly like the Warehouses grid).

---

### Task 1: Schema change — `'person'` location type + migration

**Files:**
- Modify: `supabase/schema.sql:49-58`
- Create: `supabase/migrations/006_add_person_locations.sql`

**Interfaces:**
- Produces: `locations` rows may now have `type = 'person'` with a non-null `owner_profile_id`
  referencing `profiles(id)`, at most one person-location per profile. Consumed by `js/api.js`
  Task 2 (`listProfiles`) is unrelated to this table, but `js/store.js` Task 3 and `js/personForm.js`
  Task 4 both rely on `owner_profile_id` existing.

- [ ] **Step 1: Update `supabase/schema.sql`'s `locations` table**

Replace `supabase/schema.sql:49-58`:

```sql
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
```

with:

```sql
-- ---------- locations ----------
create table public.locations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null check (type in ('warehouse','school','person')),
  tier text,
  students integer,
  notes text,
  owner_profile_id uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

-- A 'person' location is a staff member's custody bucket for circulating
-- equipment (robots, consoles, Oculus...). At most one per profile.
create unique index locations_owner_profile_id_key
  on public.locations(owner_profile_id)
  where owner_profile_id is not null;
```

- [ ] **Step 2: Write the migration file**

```sql
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
```

- [ ] **Step 3: Commit**

```bash
git add supabase/schema.sql supabase/migrations/006_add_person_locations.sql
git commit -m "feat: add 'person' location type for custody tracking"
```

(The live database isn't touched yet — that's Task 8, once every task is in.)

---

### Task 2: `js/api.js` — `listProfiles()`

**Files:**
- Modify: `js/api.js` (add one function + export)
- Test: `tests/api.test.js` (add two tests)

**Interfaces:**
- Produces: `listProfiles() -> Promise<Array<{ id, email, role }>>`, ordered by email. Consumed by
  `js/store.js` Task 3 (`refresh()`) and `js/personForm.js` Task 4 (profile picker).

- [ ] **Step 1: Write the failing tests**

Append to `tests/api.test.js` (after the last `listMovements` test):

```js
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `api.listProfiles is not a function`.

- [ ] **Step 3: Add `listProfiles` to `js/api.js`**

Insert this function into `js/api.js` right after `listMovements` (before the `return { ... }`
statement):

```js
  async function listProfiles() {
    const { data, error } = await client.from('profiles').select('id, email, role').order('email');
    if (error) throw new Error(error.message);
    return data;
  }
```

Then add `listProfiles,` to the returned object, so it reads:

```js
  return {
    listLocations, createLocation, updateLocation,
    listMaterials, createMaterial,
    listItems, createItem, updateItem,
    createRequest, listRequests, updateRequest, performTransfer,
    listMovements,
    listProfiles,
  };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS — all existing `api.test.js` tests plus the 2 new ones green.

- [ ] **Step 5: Syntax-check**

Run: `node --check js/api.js`
Expected: no output, exit code 0.

- [ ] **Step 6: Commit**

```bash
git add js/api.js tests/api.test.js
git commit -m "feat: add listProfiles to js/api.js"
```

---

### Task 3: `js/store.js` — profiles collection + `computeTeam()`

**Files:**
- Modify: `js/store.js` (full replacement)
- Test: `tests/store.test.js` (full replacement)

**Interfaces:**
- Consumes: `api.listProfiles()` from Task 2.
- Produces: `getProfiles() -> Array<{id, email, role}>`; `computeTeam() -> Array<LocationView &
  { ownerEmail: string|null }>`, sorted by `ownerEmail` (falling back to `name`); every
  `LocationView` (from `computeSchools`, `computeWarehouses`, `computeTeam`, `findLocationView`) now
  also carries `ownerProfileId: string|null`. Consumed by `js/overview.js` (Task 5) and
  `js/locationDetail.js` (Task 6).

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
  };
}

const sampleData = {
  locations: [
    { id: 'wh-mad', name: 'Warehouse Madrid', type: 'warehouse' },
    { id: 'wh-bcn', name: 'Warehouse Barcelona', type: 'warehouse' },
    { id: 'sch-1', name: 'BSB Cast', type: 'school', tier: 'Tier1', students: 200 },
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
};

test('refresh populates all six collections from the injected api', async () => {
  const store = createStore(makeFakeApi(sampleData));
  await store.refresh();
  assert.deepEqual(store.getLocations(), sampleData.locations);
  assert.deepEqual(store.getMaterials(), sampleData.materials);
  assert.deepEqual(store.getItems(), sampleData.items);
  assert.deepEqual(store.getProfiles(), sampleData.profiles);
});

test('clear empties all collections', async () => {
  const store = createStore(makeFakeApi(sampleData));
  await store.refresh();
  store.clear();
  assert.deepEqual(store.getLocations(), []);
  assert.deepEqual(store.getItems(), []);
  assert.deepEqual(store.getProfiles(), []);
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

test('computeTeam returns only person-type locations with resolved owner email', async () => {
  const store = createStore(makeFakeApi(sampleData));
  await store.refresh();
  const team = store.computeTeam();
  assert.equal(team.length, 1);
  assert.equal(team[0].id, 'per-1');
  assert.equal(team[0].ownerEmail, 'monitor1@example.com');
  assert.equal(team[0].totalUnits, 1);
});

test('computeTeam falls back to null ownerEmail when the owning profile is missing', async () => {
  const data = {
    ...sampleData,
    locations: [...sampleData.locations, { id: 'per-2', name: 'Orphan custody', type: 'person', owner_profile_id: 'ghost' }],
  };
  const store = createStore(makeFakeApi(data));
  await store.refresh();
  const orphan = store.computeTeam().find(t => t.id === 'per-2');
  assert.equal(orphan.ownerEmail, null);
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

test('findLocationView includes ownerProfileId for a person-type location', async () => {
  const store = createStore(makeFakeApi(sampleData));
  await store.refresh();
  const view = store.findLocationView('per-1');
  assert.equal(view.ownerProfileId, 'mon1');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `store.getProfiles is not a function` / `store.computeTeam is not a function`.

- [ ] **Step 3: Replace `js/store.js` in full**

```js
export function createStore(api) {
  let locations = [];
  let materials = [];
  let items = [];
  let requests = [];
  let movements = [];
  let profiles = [];

  async function refresh() {
    [locations, materials, items, requests, movements, profiles] = await Promise.all([
      api.listLocations(),
      api.listMaterials(),
      api.listItems(),
      api.listRequests(),
      api.listMovements(),
      api.listProfiles(),
    ]);
  }

  function clear() {
    locations = [];
    materials = [];
    items = [];
    requests = [];
    movements = [];
    profiles = [];
  }

  function getLocations() { return locations; }
  function getMaterials() { return materials; }
  function getItems() { return items; }
  function getRequests() { return requests; }
  function getMovements() { return movements; }
  function getProfiles() { return profiles; }

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
    getLocations, getMaterials, getItems, getRequests, getMovements, getProfiles,
    computeSchools, computeWarehouses, computeTeam, findLocationView,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS — all store tests green (9 tests), plus everything from Task 2 still green.

- [ ] **Step 5: Syntax-check**

Run: `node --check js/store.js`
Expected: no output, exit code 0.

- [ ] **Step 6: Commit**

```bash
git add js/store.js tests/store.test.js
git commit -m "feat: add profiles collection and computeTeam() to the store"
```

---

### Task 4: `js/personForm.js` — admin modal to create a person location

**Files:**
- Create: `js/personForm.js`

**Interfaces:**
- Consumes: `escapeHtml` from `js/schools.js`; the shared `ctx` contract — specifically
  `ctx.api`, `ctx.store` (`getLocations()`, `getProfiles()`, `refresh()`), `ctx.rerender`; the
  `#overlay`/`#modalContent` elements from `index.html` (already present, used today by
  `js/schoolForm.js`).
- Produces: `openPersonForm(ctx) -> void`, consumed by `js/overview.js` (Task 5, "+ Add team
  member" button).

- [ ] **Step 1: Write `js/personForm.js`**

```js
// js/personForm.js
import { escapeHtml } from './schools.js';

export function openPersonForm(ctx) {
  const { api, store, rerender } = ctx;
  const modal = document.getElementById('modalContent');
  const overlay = document.getElementById('overlay');
  const formStyle = "display:block; margin-bottom:14px;";
  const inputStyle = "width:100%; border:none; background:var(--surface-muted); border-radius:8px; padding:9px 11px; font-family:'Poppins', sans-serif; font-size:13px; margin-top:4px; color:var(--text);";

  const existingOwnerIds = new Set(
    store.getLocations().filter(l => l.type === 'person' && l.owner_profile_id).map(l => l.owner_profile_id)
  );
  const availableProfiles = store.getProfiles().filter(p => !existingOwnerIds.has(p.id));

  const profileOptionsHtml = availableProfiles.map(p =>
    `<option value="${p.id}">${escapeHtml(p.email || p.id)} (${escapeHtml(p.role)})</option>`
  ).join('');

  modal.innerHTML = `
    <button class="modal-close" id="modalCloseBtn" aria-label="Close">✕</button>
    <h3>Add team member</h3>
    <form id="personForm">
      <label style="${formStyle}">Account
        <select name="profileId" required style="${inputStyle}">
          <option value="">— select —</option>
          ${profileOptionsHtml}
        </select>
      </label>
      <label style="${formStyle}">Label
        <input name="name" required placeholder="e.g. Marc — Zona Nord" style="${inputStyle}">
      </label>
      <div id="personFormError" class="live-status error" style="display:none; margin-bottom:10px;"></div>
      <button type="submit" class="chip">Save</button>
      <button type="button" id="personFormCancel" class="chip" style="margin-left:8px;">Cancel</button>
    </form>
  `;

  overlay.classList.add('open');
  function close() {
    overlay.classList.remove('open');
    overlay.removeEventListener('click', onOverlayClick);
    document.removeEventListener('keydown', onKeydown);
  }
  function onOverlayClick(e) {
    if (e.target === overlay) close();
  }
  function onKeydown(e) {
    if (e.key === 'Escape') close();
  }
  overlay.addEventListener('click', onOverlayClick);
  document.addEventListener('keydown', onKeydown);
  document.getElementById('modalCloseBtn').addEventListener('click', close);
  document.getElementById('personFormCancel').addEventListener('click', close);
  document.getElementById('personForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const errorEl = document.getElementById('personFormError');
    errorEl.style.display = 'none';
    const profileId = form.profileId.value;
    const name = form.name.value.trim();
    if (!profileId) {
      errorEl.textContent = 'Pick an account.';
      errorEl.style.display = 'block';
      return;
    }
    try {
      await api.createLocation({ name, type: 'person', owner_profile_id: profileId });
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

> Note: if `availableProfiles` is empty (every profile already has a person-location), the
> `<select>` still renders with just the placeholder option; submitting with no selection is
> caught by the `if (!profileId)` guard, so this is a soft, message-driven dead end rather than a
> crash. Good enough for v1 — every profile getting a custody bucket eventually is a fine outcome.

- [ ] **Step 2: Syntax-check**

Run: `node --check js/personForm.js`
Expected: no output, exit code 0.

- [ ] **Step 3: Commit**

```bash
git add js/personForm.js
git commit -m "feat: add admin modal to create person-type custody locations"
```

---

### Task 5: `js/overview.js` — Team custody grid

**Files:**
- Modify: `js/overview.js` (full replacement)

**Interfaces:**
- Consumes: `store.computeTeam()` (Task 3), `openPersonForm` (Task 4), `ctx.isAdmin`.
- Produces: the Overview route now also renders a "Team custody" grid; no exported-signature
  change (`renderOverview(container, ctx)` unchanged).

- [ ] **Step 1: Replace `js/overview.js` in full**

```js
// js/overview.js
import { escapeHtml } from './schools.js';
import { openPersonForm } from './personForm.js';

export function renderOverview(container, ctx) {
  const { store, navigate, isAdmin } = ctx;
  const schools = store.computeSchools();
  const warehouses = store.computeWarehouses();
  const team = store.computeTeam();

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
      <div class="hero-eyebrow">Material deployment</div>
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

    <section>
      <div class="section-head">
        <h2>Team custody</h2>
        <div style="display:flex; align-items:center; gap:12px;">
          ${isAdmin ? '<button id="addPersonBtn" class="chip">+ Add team member</button>' : ''}
          <div class="tag">circulating equipment held by staff</div>
        </div>
      </div>
      <div class="grid" id="teamGrid"></div>
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
        <div class="tierbadge" style="background:var(--surface-muted); color:var(--text-muted);">WAREHOUSE</div>
        <div class="cname">${escapeHtml(wh.name)}</div>
        <div class="metaline">${wh.totalUnits} units in stock · ${wh.materials.length} material line${wh.materials.length === 1 ? '' : 's'}</div>
        <div class="chiprow">${chipsHtml || '<span class="matchip">no material recorded</span>'}${moreHtml}</div>
      `;
      card.addEventListener('click', () => navigate(`#/locations/${wh.id}`));
      warehouseGrid.appendChild(card);
    });
  }

  const teamGrid = container.querySelector('#teamGrid');
  if (team.length === 0) {
    teamGrid.innerHTML = '<div class="empty-note">No team members added yet.</div>';
  } else {
    teamGrid.innerHTML = '';
    team.forEach(person => {
      const card = document.createElement('div');
      card.className = 'card';
      const chipsHtml = person.materials.slice(0, 6).map(m => `<span class="matchip">${escapeHtml(m.name)} ×${m.count}</span>`).join('');
      const moreHtml = person.materials.length > 6 ? `<span class="matchip more">+${person.materials.length - 6} more</span>` : '';
      card.innerHTML = `
        <div class="punch"></div>
        <div class="tierbadge" style="background:var(--surface-muted); color:var(--text-muted);">TEAM</div>
        <div class="cname">${escapeHtml(person.ownerEmail || person.name)}</div>
        <div class="metaline">${person.totalUnits} units in custody · ${person.materials.length} material line${person.materials.length === 1 ? '' : 's'}</div>
        <div class="chiprow">${chipsHtml || '<span class="matchip">no material recorded</span>'}${moreHtml}</div>
      `;
      card.addEventListener('click', () => navigate(`#/locations/${person.id}`));
      teamGrid.appendChild(card);
    });
  }

  if (isAdmin) {
    const addPersonBtn = container.querySelector('#addPersonBtn');
    if (addPersonBtn) addPersonBtn.addEventListener('click', () => openPersonForm(ctx));
  }
}
```

- [ ] **Step 2: Syntax-check**

Run: `node --check js/overview.js`
Expected: no output, exit code 0.

- [ ] **Step 3: Commit**

```bash
git add js/overview.js
git commit -m "feat: add Team custody grid to the Overview route"
```

---

### Task 6: `js/locationDetail.js` — render person-type locations

**Files:**
- Modify: `js/locationDetail.js` (full replacement)

**Interfaces:**
- Consumes: `loc.ownerProfileId` and `loc.type === 'person'` from `store.findLocationView()`
  (Task 3); `store.getProfiles()` to resolve the owner's email for the page title.
- Produces: no exported-signature change (`renderLocationDetail(container, ctx)` unchanged) — a
  person-type location now renders its manifest/history like any other location, but without
  tier/students/notes, the request-materials form, or the "Edit school" button.

- [ ] **Step 1: Replace `js/locationDetail.js` in full**

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
  const isPerson = loc.type === 'person';
  const tierClass = loc.tier === 'Tier1' ? 't1' : 't2';
  const backHref = (isWarehouse || isPerson) ? '#/overview' : '#/schools';
  const backLabel = (isWarehouse || isPerson) ? '← Back to overview' : '← Back to schools';
  const owner = isPerson ? store.getProfiles().find(p => p.id === loc.ownerProfileId) : null;

  container.innerHTML = `
    <section>
      <a href="${backHref}" class="back-link">${backLabel}</a>
      <h3 class="detail-title">${escapeHtml(isPerson ? (owner ? owner.email : loc.name) : loc.name)}</h3>
      ${isWarehouse
        ? '<div class="modal-tier" style="color:var(--text-muted)">Warehouse</div>'
        : isPerson
        ? '<div class="modal-tier" style="color:var(--text-muted)">Team custody</div>'
        : `<div class="modal-tier" style="color:var(--${tierClass === 't1' ? 'primary' : 'text-muted'})">${loc.tier || 'Tier not recorded'}</div>`
      }
      <div class="modal-grid">
        ${isWarehouse
          ? `<div class="modal-stat"><div class="l">Units in stock</div><div class="v">${loc.totalUnits}</div></div>
             <div class="modal-stat"><div class="l">Material lines</div><div class="v">${loc.materials.length}</div></div>`
          : isPerson
          ? `<div class="modal-stat"><div class="l">Label</div><div class="v" style="font-size:14px;">${escapeHtml(loc.name)}</div></div>
             <div class="modal-stat"><div class="l">Units in custody</div><div class="v">${loc.totalUnits}</div></div>`
          : `<div class="modal-stat"><div class="l">Students</div><div class="v">${fmt(loc.students)}</div></div>
             <div class="modal-stat"><div class="l">Units deployed</div><div class="v">${loc.totalUnits}</div></div>`
        }
      </div>
      <div class="manifest-title">Material manifest</div>
      <div id="itemsSection"></div>
      <div class="manifest-title">Movement history</div>
      <div id="movementHistorySection"></div>
      ${(!isWarehouse && !isPerson && !isAdmin) ? `
        <div class="manifest-title">Request materials</div>
        <div id="locationRequestsSection"></div>
      ` : ''}
      ${(isWarehouse || isPerson) ? '' : `
        <div class="proposal-box">
          <div class="l">Notes</div>
          <div>${loc.notes ? escapeHtml(loc.notes) : 'No notes recorded.'}</div>
        </div>
      `}
      ${(!isWarehouse && !isPerson && isAdmin) ? '<button id="editSchoolBtn" class="chip" style="margin-top:16px;">Edit school</button>' : ''}
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

  if (!isWarehouse && !isPerson && !isAdmin) {
    const myRequests = store.getRequests().filter(r => r.location_id === loc.id && r.requested_by === currentUserId);
    renderRequestSection(container.querySelector('#locationRequestsSection'), {
      api: ctx.api, location: loc, materials: store.getMaterials(), myRequests,
      onChange: async () => { await store.refresh(); await ctx.rerender(); },
    });
  }

  if (!isWarehouse && !isPerson && isAdmin) {
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
git commit -m "feat: render person-type locations in the location detail route"
```

---

### Task 7: `CLAUDE.md` documentation

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Document the new module in the architecture list**

Find this bullet in the "Architecture" section (module 5's list):

```markdown
   - `js/schoolForm.js` — a shared add/edit-school modal used by overview and
     location-detail routes.
```

Replace it with:

```markdown
   - `js/schoolForm.js` — a shared add/edit-school modal used by overview and
     location-detail routes.
   - `js/personForm.js` — `openPersonForm`: admin-only modal that creates a `'person'`-type
     location bound to an existing profile, used by the Overview route's Team custody section.
```

- [ ] **Step 2: Document the widened `js/store.js` collection list**

Find:

```markdown
   - `js/store.js` — shared data store (`createStore(api)`) managing the five collections
     (materials, locations, schools, items, requests) plus derived per-location computations.
```

Replace with:

```markdown
   - `js/store.js` — shared data store (`createStore(api)`) managing the six collections
     (locations, materials, items, requests, movements, profiles) plus derived per-location/team
     computations (`computeSchools`, `computeWarehouses`, `computeTeam`, `findLocationView`).
```

- [ ] **Step 3: Document the `'person'` location type note**

Find (in module 6, `js/main.js`'s description):

```markdown
   The app uses hash-based routing (`#/overview`, `#/schools`, `#/locations/:id`, `#/requests`);
   `tests/router.test.js` covers `parseRoute` and `tests/store.test.js` covers `createStore`.
   Note: there are now two warehouse locations (`Warehouse Madrid`, `Warehouse Barcelona`) —
   `computeWarehouses()` (plural) in `js/store.js`, not a single fixed warehouse.
```

Replace with:

```markdown
   The app uses hash-based routing (`#/overview`, `#/schools`, `#/locations/:id`, `#/requests`);
   `tests/router.test.js` covers `parseRoute` and `tests/store.test.js` covers `createStore`.
   Note: there are now two warehouse locations (`Warehouse Madrid`, `Warehouse Barcelona`) —
   `computeWarehouses()` (plural) in `js/store.js`, not a single fixed warehouse. Locations also
   include a third type, `'person'` — a staff member's custody bucket for circulating equipment
   (robots, consoles, Oculus...), created via `js/personForm.js`'s `openPersonForm` (admin-only,
   binds to an existing `profiles` row via `owner_profile_id`) and listed by `computeTeam()` in
   the Overview route's Team custody section. `js/locationDetail.js` renders a person-type
   location like any other, minus the school-only fields (tier, students, notes) and the
   request-materials form.
```

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document person-type locations and computeTeam()"
```

---

### Task 8: Apply migration to the live database + manual verification

**Files:** none (operational task)

- [ ] **Step 1: Apply the migration**

Paste the contents of `supabase/migrations/006_add_person_locations.sql` into the Supabase SQL
editor for the live project and run it. Confirm afterward with:

```sql
select conname, pg_get_constraintdef(oid) from pg_constraint where conname = 'locations_type_check';
select column_name from information_schema.columns where table_name = 'locations' and column_name = 'owner_profile_id';
```

Expected: the constraint definition includes `'person'::text`, and the column exists.

- [ ] **Step 2: Serve the app locally**

Run: `npx http-server -p 8080 .`
Open `http://localhost:8080` and log in as an admin.

- [ ] **Step 3: Create a person location**

Go to Overview → "Team custody" → "+ Add team member". Pick an existing viewer profile, give it a
label (e.g. "Marc — Zona Nord"), save. Confirm it appears as a card in the Team custody grid,
showing the profile's email.

- [ ] **Step 4: Add an item to it and verify the manifest**

Click into the new team card. Confirm: no tier/students shown, a "Label"/"Units in custody" stat
pair instead, no "Request materials" section, no "Edit school" button. As admin, use the manifest's
"+ Add item" form to add a test item (e.g. `TEST-CUSTODY-1` / material `Robot Kit`). Confirm it
shows up in the manifest.

- [ ] **Step 5: Transfer an item into/out of custody**

From a warehouse or school's item manifest, use "Transfer" and pick the new team member as the
destination. Confirm the transfer succeeds, the item now shows in the team member's manifest, and
both locations' Movement history sections show the transfer.

- [ ] **Step 6: Verify a second profile can't be double-assigned**

Try "+ Add team member" again — confirm the profile you already assigned no longer appears in the
Account dropdown.

- [ ] **Step 7: Run the full test suite one more time**

Run: `npm test`
Expected: PASS, no regressions.
