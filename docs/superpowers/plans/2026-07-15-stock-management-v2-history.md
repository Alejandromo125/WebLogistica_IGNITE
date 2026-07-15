# Stock Management v2 — Movement History (Plan 4 of 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only "Movement history" section to every school's and the Warehouse's detail
modal, showing every `movements` row that has touched that location, newest first — and bring
`CLAUDE.md` up to date with the Supabase-backed architecture that's existed since Plan 2.

**Architecture:** One new `js/api.js` function, `listMovements()`, fetches the whole `movements`
table with the mover's email embedded (a single, unambiguous foreign key — unlike `requests`,
`movements` has only one FK to `profiles`). A new DOM-rendering module, `js/history.js`, follows
the exact `renderX(container, ctx)` shape established by `js/items.js`/`js/transfers.js`/
`js/requests.js`: pure rendering, no API calls of its own, no automated tests (verified manually,
same as those three). `js/schools.js` fetches the full movement list once per `refresh()`, then
filters it down to the open location and sorts it before handing it to `renderHistorySection`.

**Tech Stack:** Same as Plans 1-3 — Supabase (Postgres + Auth + RLS, no new tables/columns/RPCs
needed — this plan is purely a new read path), vanilla JS ES modules (no bundler), Node.js
built-in test runner for dev-time unit tests only.

## Global Constraints

- The deployed site remains a static site with zero build step. Node/npm are dev-time only.
- Any module whose logic needs the Supabase client receives it as a parameter (dependency
  injection), never importing `js/supabaseClient.js` directly — same rule Plans 1-3 established.
  (`js/history.js` needs no client at all — it's pure rendering over data its caller already
  fetched.)
- No schema, RLS, or RPC changes. The `movements` table and its `using (true)` select policy are
  already live and unchanged by this plan.
- `js/history.js` is a DOM-rendering module with **no automated tests** — verified manually
  against the live Supabase project, exactly like `js/items.js`/`js/transfers.js`/`js/requests.js`
  from Plans 2-3.
- User-entered free text (a movement's `note`) rendered into `innerHTML` must go through the
  existing `escapeHtml()` helper (`js/schools.js`, exported) — no unescaped interpolation.
- Movement history is visible to both `admin` and `viewer` roles, for both schools and the
  Warehouse — same visibility as the existing material manifest section.
- No cap on history length; sorted newest-first by `moved_at`.

---

### Task 1: `js/api.js` — `listMovements()`

**Files:**
- Modify: `js/api.js`
- Modify: `tests/api.test.js`

**Interfaces:**
- Consumes: a Supabase-like `client` (same dependency-injection pattern as the rest of
  `js/api.js`).
- Produces: `listMovements()` added to the object `createApi(client)` returns. Returns an array of
  movement rows, each with a nested `mover: { email }` object, or throws `Error(message)` on
  failure — same contract as every existing `js/api.js` function. `js/schools.js` (Task 2) is the
  only consumer in this plan.

- [ ] **Step 1: Write the failing tests**

Add these tests to the end of `tests/api.test.js` (after the existing `performTransfer` tests, at
the end of the file — the file has no content after the last test, so just append):

```javascript
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
```

No changes to `makeFakeClient` are needed — its existing bare `select(cols)` path (used by
`listItems`/`listRequests`) already supports this shape via its `then(resolve, reject)` thenable.

- [ ] **Step 2: Run tests and confirm the new ones fail**

Run: `npm test`
Expected: fails with `api.listMovements is not a function` (or similar — the function doesn't
exist in `js/api.js` yet). The 24 pre-existing tests (from Plans 1-3) still pass — only the two new
`listMovements` tests fail.

- [ ] **Step 3: Implement `listMovements` in `js/api.js`**

Find the closing `return { ... }` block at the end of `createApi`:

```javascript
  return {
    listLocations, createLocation, updateLocation,
    listMaterials, createMaterial,
    listItems, createItem, updateItem,
    createRequest, listRequests, updateRequest, performTransfer,
  };
}
```

Replace it with:

```javascript
  async function listMovements() {
    const { data, error } = await client.from('movements').select('*, mover:moved_by(email)');
    if (error) throw new Error(error.message);
    return data;
  }

  return {
    listLocations, createLocation, updateLocation,
    listMaterials, createMaterial,
    listItems, createItem, updateItem,
    createRequest, listRequests, updateRequest, performTransfer,
    listMovements,
  };
}
```

- [ ] **Step 4: Run tests and confirm they pass**

Run: `npm test`
Expected: `tests 26`, `pass 26`, `fail 0` (2 new tests in this task plus the 24 existing from
Plans 1-3).

- [ ] **Step 5: Commit**

```bash
git add js/api.js tests/api.test.js
git commit -m "feat: add listMovements to js/api.js"
```

---

### Task 2: `js/history.js` — movement history section, wired into every location's modal

**Files:**
- Create: `js/history.js`
- Modify: `js/schools.js`

**Interfaces:**
- Consumes: `listMovements()` (Task 1).
- Produces: `renderHistorySection(container, ctx)` where
  `ctx = { location, movements, items, materials, locations }` — `movements` is the caller's
  pre-filtered (to this location) and pre-sorted (newest-first) array; `items`/`materials`/
  `locations` are the full raw arrays `js/schools.js` already loads (used to resolve names).
  `js/schools.js` (this task) is the only consumer in this plan.

- [ ] **Step 1: Write `js/history.js`**

```javascript
// js/history.js
import { escapeHtml } from './schools.js';

export function renderHistorySection(container, ctx) {
  const { location, movements, items, materials, locations } = ctx;

  if (movements.length === 0) {
    container.innerHTML = '<div class="empty-note">No movements recorded for this location yet.</div>';
    return;
  }

  const itemsById = new Map(items.map(i => [i.id, i]));
  const materialsById = new Map(materials.map(m => [m.id, m]));
  const locationsById = new Map(locations.map(l => [l.id, l]));

  function materialName(itemId) {
    const item = itemsById.get(itemId);
    const material = item ? materialsById.get(item.material_id) : null;
    return material ? material.name : 'Unknown material';
  }

  function locationName(id) {
    const loc = locationsById.get(id);
    return loc ? loc.name : 'Unknown location';
  }

  container.innerHTML = movements.map(mv => {
    const incoming = mv.to_location_id === location.id;
    const counterpartId = incoming ? mv.from_location_id : mv.to_location_id;
    const preposition = incoming ? 'from' : 'to';
    const directionLabel = incoming ? '↓ In' : '↑ Out';
    const verb = mv.request_id ? 'approved by' : 'moved by';
    const moverEmail = mv.mover ? mv.mover.email : 'unknown';
    const dateStr = new Date(mv.moved_at).toLocaleDateString();
    return `
      <div class="card">
        <div class="cname">${directionLabel} — ${escapeHtml(materialName(mv.item_id))} ${escapeHtml(mv.item_id)} ${preposition} ${escapeHtml(locationName(counterpartId))}</div>
        <div class="metaline">${escapeHtml(verb)} ${escapeHtml(moverEmail)} · ${dateStr}${mv.request_id ? ' · via request' : ''}</div>
        ${mv.note ? `<div class="metaline">Note: ${escapeHtml(mv.note)}</div>` : ''}
      </div>
    `;
  }).join('');
}
```

- [ ] **Step 2: Import `renderHistorySection` in `js/schools.js`**

Find:

```javascript
// js/schools.js
import { renderItemsSection } from './items.js';
import { renderRequestSection } from './requests.js';
```

Replace it with:

```javascript
// js/schools.js
import { renderItemsSection } from './items.js';
import { renderRequestSection } from './requests.js';
import { renderHistorySection } from './history.js';
```

- [ ] **Step 3: Add `movements` state**

Find:

```javascript
export function createSchoolsView({ api }) {
  let locations = [];
  let materials = [];
  let items = [];
  let requests = [];
  let isAdmin = false;
  let currentUserId = null;
  const state = { tier: 'ALL', material: null, query: '' };
```

Replace it with:

```javascript
export function createSchoolsView({ api }) {
  let locations = [];
  let materials = [];
  let items = [];
  let requests = [];
  let movements = [];
  let isAdmin = false;
  let currentUserId = null;
  const state = { tier: 'ALL', material: null, query: '' };
```

- [ ] **Step 4: Fetch `movements` in `refresh()`**

Find:

```javascript
  async function refresh() {
    [locations, materials, items, requests] = await Promise.all([
      api.listLocations(),
      api.listMaterials(),
      api.listItems(),
      api.listRequests(),
    ]);
    document.getElementById('addSchoolBtn').style.display = isAdmin ? '' : 'none';
    renderAll();
  }
```

Replace it with:

```javascript
  async function refresh() {
    [locations, materials, items, requests, movements] = await Promise.all([
      api.listLocations(),
      api.listMaterials(),
      api.listItems(),
      api.listRequests(),
      api.listMovements(),
    ]);
    document.getElementById('addSchoolBtn').style.display = isAdmin ? '' : 'none';
    renderAll();
  }
```

- [ ] **Step 5: Reset `movements` in `clear()`**

Find:

```javascript
  function clear() {
    isAdmin = false;
    currentUserId = null;
    locations = [];
    materials = [];
    items = [];
    requests = [];
```

Replace it with:

```javascript
  function clear() {
    isAdmin = false;
    currentUserId = null;
    locations = [];
    materials = [];
    items = [];
    requests = [];
    movements = [];
```

- [ ] **Step 6: Add the "Movement history" section markup in `openDetailModal`**

Find:

```javascript
      <div class="manifest-title">Material manifest</div>
      <div id="itemsSection"></div>
      ${(!isWarehouse && !isAdmin) ? `
```

Replace it with:

```javascript
      <div class="manifest-title">Material manifest</div>
      <div id="itemsSection"></div>
      <div class="manifest-title">Movement history</div>
      <div id="movementHistorySection"></div>
      ${(!isWarehouse && !isAdmin) ? `
```

- [ ] **Step 7: Filter, sort, and render the history section in `openDetailModal`**

Find:

```javascript
    renderItemsSection(document.getElementById('itemsSection'), {
      api, location: s, materials, items, isAdmin, allLocations: locations,
      onChange: async () => {
        await refresh();
        const refreshed = isWarehouse ? computeWarehouse() : computeSchools().find(sch => sch.id === s.id);
        if (refreshed) openDetailModal(refreshed);
      },
    });
    if (!isWarehouse && !isAdmin) {
```

Replace it with:

```javascript
    renderItemsSection(document.getElementById('itemsSection'), {
      api, location: s, materials, items, isAdmin, allLocations: locations,
      onChange: async () => {
        await refresh();
        const refreshed = isWarehouse ? computeWarehouse() : computeSchools().find(sch => sch.id === s.id);
        if (refreshed) openDetailModal(refreshed);
      },
    });
    const locationMovements = movements
      .filter(mv => mv.from_location_id === s.id || mv.to_location_id === s.id)
      .sort((a, b) => new Date(b.moved_at) - new Date(a.moved_at));
    renderHistorySection(document.getElementById('movementHistorySection'), {
      location: s, movements: locationMovements, items, materials, locations,
    });
    if (!isWarehouse && !isAdmin) {
```

- [ ] **Step 8: Run existing tests to confirm nothing broke**

Run: `npm test`
Expected: same pass count as the end of Task 1 — this task touches no tested files
(`js/history.js` and `js/schools.js` have no automated tests, and `js/api.js`/`tests/api.test.js`
are untouched by this task).

- [ ] **Step 9: USER ACTION — verify movement history end-to-end**

Serve the site locally (`npx http-server -p 8080 .`) and log in as admin. Open the Warehouse's
modal. Expected: below "Material manifest," a "Movement history" section appears. If no movements
exist yet for this location, it shows "No movements recorded for this location yet."

Perform a direct transfer of an item from the Warehouse to a school (using the existing Task-3
Transfer form from Plan 3). Reopen the Warehouse's modal. Expected: a new history row reads
`↑ Out — <Material> <item id> to <School name> — moved by <your email> · <today's date>`, with no
"via request" marker (this was a direct transfer, not an approved request). Open that school's
modal. Expected: the same movement appears there as
`↓ In — <Material> <item id> from Warehouse — moved by <your email> · <today's date>`.

As the viewer test account, submit a request for a material with existing stock, then approve it
as admin (Plan 3's flow). Reopen the requesting school's modal. Expected: the approval appears in
its history as `↓ In — ... — approved by <admin email> · <date> · via request`, and the *source*
location's modal shows the matching `↑ Out` row, also marked "via request."

Confirm both admin and viewer see the same "Movement history" content for the same location (log
in as each and compare) — no role-based restriction.

- [ ] **Step 10: Commit**

```bash
git add js/history.js js/schools.js
git commit -m "feat: add per-location movement history"
```

---

### Task 3: Rewrite `CLAUDE.md` for the current Supabase-backed architecture

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:** None — documentation only, no code interfaces produced or consumed.

- [ ] **Step 1: Replace `CLAUDE.md`'s stale "What this is" and "Architecture" sections**

Find the entire file content from the `## What this is` heading through the end of the
`## Architecture` section:

```markdown
## What this is

A single self-contained static HTML page (`index.html`) — "Stock Manifest" — a dashboard for tracking
material/equipment deployment (robotics kits, boxes, etc.) across schools for course 26-27. It is deployed
via GitHub Pages directly from `index.html` at the repo root (no build step, no bundler, no package.json).

## Running / testing

There is no build, lint, or test tooling in this repo. To view changes, just open `index.html` in a browser
(or serve the directory with any static file server). There is no CI.

## Architecture

Everything — CSS, JS, and markup — lives in the one file, `index.html`. It has three parts:

1. **`<style>` block**: all styling, using CSS custom properties defined on `:root` (`--ink`, `--paper`,
   `--amber`, `--teal`, `--rust`, `--slate`, `--line`, `--card`) as the color system. Fonts are Space Grotesk
   (headings/display), IBM Plex Mono (labels/numbers/mono UI), and IBM Plex Sans (body), loaded from Google Fonts.

2. **Markup**: static shell (header/search bar, live-data bar, hero stats, chart/tier/manifest sections,
   modal overlay). All dynamic content (stats, chart bars, tier cards, school grid, modal detail) is rendered
   into empty containers (`#chartArea`, `#tierSplit`, `#schoolGrid`, etc.) entirely by JS — there's no
   server-rendered content to keep in sync with markup edits.

3. **`<script>` block** (vanilla JS, no framework/dependencies):
   - **Data source**: a published Google Sheet (`SHEET_CSV_URL`), fetched as CSV on demand via the "Fetch
     latest data" button (`connectSheet`) — the page loads with zero data until the user triggers a fetch.
     Once live, it auto-refreshes every 5 minutes.
   - **CSV parsing** (`parseCSV`): hand-rolled RFC4180-ish parser (handles quoted fields, embedded commas/newlines).
   - **Sheet shape assumption** (`schoolsFromCSV`): scans all cells for a header literally equal to
     `"school list"` (case-insensitive) to locate the header row/column, then reads 4 fixed columns
     immediately to its right, in order: materials, students, tier, proposal. If the sheet's column layout
     changes, update the offsets here.
   - **Materials field format** (`parseMaterialsField`): each school's materials cell is a single string of
     the form `MaterialName(id1, id2, ...) OtherMaterial(id3, ...)`, parsed via regex into
     `{name, ids, count}` objects. Unit counts are derived from `ids.length`, not a separate quantity field.
   - **Render pipeline**: a single mutable `state` object (`{tier, material, query}`) drives filtering.
     `renderAll()` fans out to `renderStats/renderChart/renderTierSplit/renderTierFilterBar/renderGrid`,
     each of which fully re-renders its target container from `SCHOOLS` + `state` (no diffing/virtual DOM).
     Any state change (tier chip, material bar click, search input) mutates `state` then re-renders only the
     containers that could have changed.
   - Tier values are expected to be exactly `"Tier1"` / `"Tier2"` strings (from the sheet); anything else
     falls into an "Unclassified" bucket.
```

Replace it with:

```markdown
## What this is

"Stock Manifest" — a dashboard for tracking material/equipment deployment (robotics kits, boxes,
etc.) across schools for course 26-27, plus admin CRUD, a viewer request/approval workflow, and
movement history. It is deployed via GitHub Pages directly from `index.html` at the repo root
(no build step, no bundler). `index.html` holds markup and CSS; behavior lives in ES modules under
`js/`, loaded via a single `<script type="module" src="js/main.js">` tag. Data is a Supabase
project (Postgres + Auth + Row Level Security) — there is no Google Sheet involved anymore (it was
retired when the dashboard was cut over to Supabase).

## Running / testing

No build or lint tooling. To view changes, serve the directory with any static file server (e.g.
`npx http-server -p 8080 .`) and open it in a browser — opening `index.html` directly via
`file://` will not work, since ES modules require an HTTP origin. There is a small dev-time-only
unit test suite (Node's built-in test runner, no dependencies): `npm test` runs everything under
`tests/`. It only covers `js/api.js` and `js/auth.js` (pure functions taking a Supabase client as
a parameter) — every DOM-rendering module has no automated tests and is verified manually in a
browser. There is no CI.

## Architecture

1. **`index.html`**: the `<style>` block (all styling, using CSS custom properties on `:root` —
   `--ink`, `--paper`, `--amber`, `--teal`, `--rust`, `--slate`, `--line`, `--card` — as the color
   system; fonts are Space Grotesk for headings/display, IBM Plex Mono for labels/numbers/mono UI,
   and IBM Plex Sans for body, loaded from Google Fonts) and the static markup shell (header/search
   bar, hero stats, chart/tier/manifest/requests sections, modal overlay, login form). All dynamic
   content is rendered into empty containers (`#chartArea`, `#schoolGrid`, `#requestsSection`,
   the modal's `#itemsSection`/`#movementHistorySection`, etc.) entirely by JS — there's no
   server-rendered content to keep in sync with markup edits.

2. **`js/config.js`**: `SUPABASE_URL`/`SUPABASE_ANON_KEY` constants. The anon key is intentionally
   public client-side — Row Level Security policies are the actual protection layer, not key
   secrecy. `js/supabaseClient.js` constructs the shared client from these.

3. **`js/api.js`**: the only module that talks to Supabase's data tables directly. Every function
   takes no implicit dependencies — the client is injected via `createApi(client)` — and every
   function either returns data or throws `Error(message)` built from the Supabase error, giving
   every caller one consistent error-handling shape. This dependency-injection pattern (client
   passed as a parameter, never imported directly from `js/supabaseClient.js`) is what makes
   `js/api.js` unit-testable against a fake client (`tests/api.test.js`) without a real network
   call — every other module that needs data goes through this file, never `js/supabaseClient.js`
   directly.

4. **`js/auth.js`**: wraps Supabase Auth (sign in/out, current session, current profile — a row in
   the `profiles` table carrying `role` = `'admin'` or `'viewer'`, plus `email`). Also
   client-injected and unit-tested the same way as `js/api.js`.

5. **Rendering modules**, each `renderX(container, ctx)` (or, for the two page-level views,
   `createXView({ api, ... })` returning `{ loadAndRender, clear, ... }`) — no automated tests,
   verified manually in the browser:
   - `js/schools.js` — the page-level view (`createSchoolsView`): hero stats, material
     distribution chart, tier split, the Warehouse card, the school grid, search/filter state, and
     each location's detail modal. Exports `escapeHtml()`, used by every other rendering module to
     safely interpolate user-entered text into `innerHTML`. Constructed exactly once per page load
     (in `js/main.js`); its page-level DOM event listeners are registered exactly once, inside the
     factory, not per render.
   - `js/items.js` — the material manifest inside a location's modal: admin add/retire items,
     the per-material-line "Transfer" action (admin only).
   - `js/transfers.js` — the transfer form itself (item checkboxes, destination, note), used by
     both `js/items.js`'s direct-transfer action and `js/requests.js`'s approval flow.
   - `js/requests.js` — the viewer's "Request materials" form (inside a school's modal) and the
     admin-only "Requests" dashboard section (`createRequestsView`, a second page-level view,
     approve/deny a pending request).
   - `js/history.js` — the read-only "Movement history" section inside every location's modal,
     listing every `movements` row that touched it, newest first.

6. **`js/main.js`**: the app's single entry point. Wires up `js/auth.js` + `js/api.js`,
   constructs `schoolsView`/`requestsView`, and drives the login/logout UI — on every auth state
   change, calls each view's `loadAndRender(isAdmin, userId)` (logged in) or `clear()` (logged
   out).

7. **`supabase/schema.sql`** is the fresh-install source of truth for the database (tables, RLS
   policies, the `perform_transfer` RPC); **`supabase/migrations/`** holds incremental changes
   applied by hand (paste into the Supabase SQL Editor) against the already-live project, in
   numeric order — there's no CLI/migration tooling wired up.
```

- [ ] **Step 2: Update the "Working in this file" section**

Find:

```markdown
## Working in this file

- Keep everything inline — this project intentionally has no build step. Don't introduce a bundler,
  npm dependency, or split files unless asked.
- When editing rendering logic, remember containers are fully cleared and rebuilt on each render call
  (`innerHTML = ''` then repopulated) — there's no partial-update path to preserve.
- The live data contract (header name `"School List"`, column order, and the `Name(id, id, ...)` materials
  syntax) is defined by the linked Google Sheet, not by this code — if parsing changes are needed, confirm
  the actual sheet layout rather than guessing.
```

Replace it with:

```markdown
## Working in this file

- Keep this a build-step-free static site. Don't introduce a bundler or transpiler; ES modules
  loaded directly by the browser are the only "build" this project has.
- Any module whose logic needs the Supabase client receives it as a parameter (dependency
  injection) — never import `js/supabaseClient.js` directly from a new module. This is what keeps
  `js/api.js`/`js/auth.js` unit-testable and is a hard rule established across Plans 1-4.
- When editing rendering logic, remember containers are fully cleared and rebuilt on each render
  call (`innerHTML = ''`/`container.innerHTML = ...` then repopulated) — there's no partial-update
  path to preserve.
- User-entered free text must go through `escapeHtml()` (exported from `js/schools.js`) before
  being interpolated into `innerHTML` — never interpolate unescaped user input.
- Nothing in this app hard-deletes a row. `items`/`locations`/`materials` have no `DELETE` policy;
  denying a request sets `status = 'denied'`, it doesn't delete the row. If a feature seems to need
  deletion, that's a design question to raise, not something to add to the schema unilaterally.
- The live data contract (table shapes, RLS policies, the `perform_transfer` RPC's exact parameter
  names) is defined by `supabase/schema.sql` plus whatever's actually been applied via
  `supabase/migrations/` to the live project — if a change touches the database, confirm what's
  actually live rather than assuming `schema.sql` and production have never diverged.
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: rewrite CLAUDE.md for the Supabase-backed architecture"
```

---

## What this plan does not cover

Per-item movement timelines (clicking an individual item id to see its own history across
locations) are explicitly out of scope — item ids stay plain, non-interactive text in the manifest.
Pagination, date-range filtering, or search within a location's movement history are not included;
if history length becomes a real usability problem, that's a follow-up. No schema, RLS, or RPC
changes are made by this plan.
