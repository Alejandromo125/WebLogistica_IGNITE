# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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
`tests/` — `js/api.js` and `js/auth.js` (pure functions taking a Supabase client as a parameter),
`js/router.js` (`parseRoute`, pure function, no DOM), and `js/store.js` (`createStore(api)`,
exercised against an injected fake api, no DOM) — plus one trivial harness sanity check. Every
DOM-rendering module has no automated tests and is verified manually in a browser. There is no CI.

## Architecture

1. **`index.html`**: the `<style>` block (all styling, using CSS custom properties on `:root` —
   `--ink`, `--paper`, `--amber`, `--teal`, `--rust`, `--slate`, `--line`, `--card` — as the color
   system; fonts are Space Grotesk for headings/display, IBM Plex Mono for labels/numbers/mono UI,
   and IBM Plex Sans for body, loaded from Google Fonts) and a persistent page shell rather than a
   set of named section containers. A `<header class="topbar">` holds the brand mark, `#tabBar` (a
   `<nav>` the router populates with tab buttons, hidden via inline `style="display:none"` until
   login) and `#accountArea` (the login form or logged-in account state, populated by
   `js/main.js`). Below that, a single `<main id="viewport">` is the one container every route's
   render function clears (`innerHTML = ''`) and repopulates — Overview, Schools, LocationDetail,
   and Requests content all live there, one route's markup at a time. An `#overlay`/`#modalContent`
   pair (now used only by `js/schoolForm.js`'s add/edit-school modal) rounds out the shell. All
   dynamic content is rendered into these containers entirely by JS — there's no server-rendered
   content to keep in sync with markup edits.

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
   the `profiles` table carrying `role` = `'admin'` or `'viewer'`). Also client-injected and
   unit-tested the same way as `js/api.js`.

5. **Routing, state, and rendering modules** — no automated tests except where noted, verified
   manually in the browser:
   - `js/router.js` — hash-route parsing (`parseRoute(hash)`) and router state management
     (`createRouter`).
   - `js/store.js` — shared data store (`createStore(api)`) managing the five collections
     (materials, locations, schools, items, requests) plus derived per-location computations.
   - `js/overview.js` — `renderOverview` for the `#/overview` route: hero stats, material
     distribution chart, tier split, and Warehouse card(s).
   - `js/schools.js` — `renderSchools` for the `#/schools` route: school grid and search/filter
     state. Exports `escapeHtml()`, used by every rendering module to safely interpolate
     user-entered text into `innerHTML`.
   - `js/locationDetail.js` — `renderLocationDetail` for the `#/locations/:id` route: replaces
     the old detail modal, rendering a single location's full inventory, actions, and history.
   - `js/schoolForm.js` — `openSchoolForm`: a shared add/edit-school modal used by overview and
     location-detail routes.
   - `js/items.js` — the material manifest inside location detail: admin add/retire items,
     the per-material-line "Transfer" action (admin only).
   - `js/transfers.js` — the transfer form (item checkboxes, destination, note), used by both
     `js/items.js`'s direct-transfer action and `js/requests.js`'s approval flow.
   - `js/history.js` — the read-only "Movement history" section inside every location detail,
     listing every `movements` row that touched it, newest first.
   - `js/requests.js` — `renderRequests` (replacing `createRequestsView`), the `#/requests`
     route: the viewer's "Request materials" form and the admin-only requests dashboard
     (approve/deny a pending request).

6. **`js/main.js`**: the app's single entry point. Constructs `store` and `router` alongside
   `auth` and `api`, maps hash-route changes to render functions, and renders a login-only screen
   (no tab bar) when logged out.

   The app uses hash-based routing (`#/overview`, `#/schools`, `#/locations/:id`, `#/requests`);
   `tests/router.test.js` covers `parseRoute` and `tests/store.test.js` covers `createStore`.
   Note: there are now two warehouse locations (`Warehouse Madrid`, `Warehouse Barcelona`) —
   `computeWarehouses()` (plural) in `js/store.js`, not a single fixed warehouse.

7. **`supabase/schema.sql`** is the fresh-install source of truth for the database (tables, RLS
   policies, the `perform_transfer` RPC); **`supabase/migrations/`** holds incremental changes
   applied by hand (paste into the Supabase SQL Editor) against the already-live project, in
   numeric order — there's no CLI/migration tooling wired up.

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
