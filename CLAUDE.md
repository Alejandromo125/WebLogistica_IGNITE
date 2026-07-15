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
