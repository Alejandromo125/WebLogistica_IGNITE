# Navigation restructure — design spec

**Status:** approved for planning
**Scope:** restructure the single-page dashboard into tabbed navigation with a dedicated
location-detail page, and split the single warehouse into two (Madrid, Barcelona). Visual
redesign to the Ignite Nexus look is an explicit non-goal — that is a separate follow-up project
built on top of this one.

## 1. Routing & page structure

- A hash-based router (new `js/router.js`, wired from `js/main.js`) parses `location.hash` into
  routes:
  - `#/overview` (default when hash is empty or unrecognized)
  - `#/schools`
  - `#/locations/:id` — serves both schools and warehouses (any row in `locations`)
  - `#/requests` — admin only
  - Route parsing is a pure function, e.g. `parseRoute(hash) -> { name, params }`, so it can be
    unit tested without a DOM.
  - The router listens for `hashchange` and also runs once on initial load.
- **Auth guard:** if nobody is logged in, the router does not render any route — the app shows
  the login-only screen instead (see below). If a non-admin's hash resolves to `#/requests`, the
  router rewrites it to `#/overview` before rendering (mirrors the RLS-level restriction at the
  UI level).
- **Layout shell:** `index.html` keeps a persistent header (brand + tab bar + login/logout) and a
  single `<main id="viewport">` that the router clears (`innerHTML = ''`) and repopulates per
  route, replacing today's "every section stacked on one page" markup.
- **Tab bar:** Overview / Schools / Requests. The Requests tab element is only inserted into the
  DOM at all when `isAdmin` is true (not just hidden via CSS). The active tab is highlighted from
  the current route name.
- **Drill-down:** clicking a school card (Schools tab or Overview) or a warehouse card (Overview)
  navigates to `#/locations/<id>`. That page has a "← Back" link and browser back/forward also
  works correctly since each navigation is a real hash history entry.
- **Logged-out state:** before authentication, the header shows only the brand and a login form —
  no tab bar, nothing else to click. On successful login, default to `#/overview` if no hash is
  already set (e.g. from a bookmarked link).

## 2. Shared data layer

- New `js/store.js`: holds the five collections currently fetched ad hoc
  (`locations`, `materials`, `items`, `requests`, `movements`), exposes:
  - `refresh()` — re-fetches all five via injected `api.*` calls in parallel (same calls as
    today's `schoolsView.refresh()`), replacing internal state.
  - Plain getters for each collection, plus any derived helpers currently duplicated across
    views (e.g. `computeLocationView`, `computeSchools`, `computeWarehouses`) move here so
    Overview, Schools, and LocationDetail all compute from the same source instead of
    re-implementing.
  - No DOM access — constructed with `createStore(api)` the same way `createApi(client)` works,
    so it's unit-testable with a fake `api`.
- `main.js` constructs `store` once alongside `auth`/`api`. On login: `store.refresh()` once,
  then render whatever route is current. On logout: `store.clear()`.
- Any mutating action (transfer, approve/deny, add/edit school, retire item) calls
  `store.refresh()` via its existing `onChange`-style callback, then re-renders the *current*
  route — centralizing what's currently a per-view `refresh()` + `renderAll()` pattern.

## 3. View breakdown

`js/schools.js` currently does five jobs at once (stats/chart/tier, warehouse card, school grid,
location-detail modal, add/edit-school form). It splits along the new routes:

- **`js/overview.js`** (new, `createOverviewView`): hero stats, material distribution chart, tier
  split, and a grid of warehouse cards (now plural — Madrid + Barcelona). Each warehouse card
  routes to `#/locations/<id>`, same as a school card.
- **`js/schools.js`** (trimmed): search/filter bar, school grid, "+ Add school" button. Keeps
  exporting `escapeHtml()` since every other rendering module imports it from here.
- **`js/locationDetail.js`** (new, replaces `openDetailModal`): full-page view for one location
  (school or warehouse) — stats, material manifest (via `items.js`), movement history (via
  `history.js`), notes, request form for viewers (via `requests.js`) or an edit button for
  admins. Reads the id from route params, looks it up via the store.
- **`js/requests.js`**: internals unchanged; becomes the content of the `#/requests` route
  instead of an always-mounted section at the bottom of the page.
- **Add/Edit school form** stays a modal overlay (quick transient dialog, not a route) — same for
  the request-approval mini-forms inside Requests. Only the drill-down browsing views (Overview →
  detail, Schools → detail) get real routes.

## 4. Warehouse migration (Madrid + Barcelona)

There is no DB constraint limiting the app to one warehouse row — the "single warehouse" rule was
only ever an idempotent *seed* guard (`where not exists (select 1 from locations where
type='warehouse')`) in `schema.sql` / `migrations/001`. So this is a data change, not a
schema/RLS change:

- **New migration** `supabase/migrations/005_split_warehouse_madrid_barcelona.sql`:
  1. Renames the existing warehouse row's `name` to `Warehouse Madrid`, matched by
     `type = 'warehouse'` and guarded to be a no-op if a location already has that name (safe to
     re-run, consistent with existing migration style).
  2. Inserts a new `Warehouse Barcelona` row (`type = 'warehouse'`) if one doesn't already exist
     by that name.
  - Applied by hand via the Supabase SQL editor, same as existing migrations — there's no CLI
    wired up.
- **`schema.sql`** is updated so a *fresh* install seeds both Madrid and Barcelona directly,
  keeping it accurate as the fresh-install source of truth going forward.
- **App-side:** `computeWarehouse()` → `computeWarehouses()` (plural; filters
  `type === 'warehouse'`, returns an array sorted by name). Overview renders one card per
  warehouse instead of a single fixed card. No items move automatically — existing Madrid stock
  stays put, Barcelona starts empty, and stock reaches it only through the existing transfer flow.

## 5. Error handling

- **Bad/unknown location id** (`#/locations/<id>` where `<id>` isn't in the store): the detail
  view shows a "not found" empty-state with a link back to Schools, rather than a blank page or
  thrown error.
- **Load failures:** same pattern as today — each view renders its own error message
  (`err.message`) into its empty-state area; nothing throws unhandled to the console only.

## 6. Testing

- **Unit tests** (Node's built-in test runner, no dependencies, consistent with
  `tests/api.test.js` / `tests/auth.test.js`):
  - `tests/router.test.js` — `parseRoute(hash)` against valid routes, unknown routes (falls back
    to overview), and `#/locations/:id` param extraction.
  - `tests/store.test.js` — fake `api` client, assert `refresh()` populates getters correctly and
    derived computations (`computeSchools`, `computeWarehouses`) are correct.
- **Rendering modules** (Overview, Schools, LocationDetail, Requests, the tab bar itself) have no
  automated tests and are verified manually in a browser, consistent with every other
  DOM-rendering module in this app.

## Non-goals

- No visual/styling changes — same paper/ink/amber/rust/teal CSS system, just reorganized into
  tabs and routes. The Ignite Nexus reskin is a separate follow-up project, designed and planned
  after this one ships.
- No change to RLS policies, auth flow, or the `perform_transfer` RPC's contract.
