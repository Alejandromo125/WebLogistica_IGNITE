# Stock Management v2 — Design

## Context

The current site (`index.html`) is a static, read-only dashboard that fetches a snapshot from a
published Google Sheet CSV on demand. This design replaces it with a read/write application that
lets an admin manage schools and stock directly, lets a small group of trusted collaborators view
stock and submit material requests, and keeps a full history of every material movement between
locations (schools and a central warehouse).

## Goals

- Admin (owner) can add/edit schools, add/edit individual stock items, and move stock directly
  between locations.
- Collaborators ("viewers") can view all schools and stock, and submit material requests; they
  cannot edit stock directly.
- Every stock movement — whether a direct admin transfer or the result of an approved request —
  is logged with what moved, from where, to where, when, and by whom.
- The Google Sheet is retired; the new database is the single source of truth.
- No migration of existing sheet data — the new system launches empty.

## Non-goals

- Restricting a viewer's visibility to only their own school (not needed now; the data model
  supports adding this later without a schema rewrite — see Auth & Accounts).
- Public/self-service signup — accounts are admin-invited only.
- A custom backend server — no server code is written or deployed for this project.

## Architecture

- **Frontend**: static site, still deployed to GitHub Pages, still zero build tooling. Split from
  the current single `index.html` into ES modules loaded via `<script type="module">`:
  - `index.html` — shell markup + `<style>` (mostly unchanged from today).
  - `js/api.js` — Supabase client init and all table queries; single source of truth for reads/writes.
  - `js/auth.js` — login form, session handling, role-aware UI gating.
  - `js/schools.js` — render school grid/cards, admin add/edit.
  - `js/items.js` — item list within a school's detail view, admin add/edit.
  - `js/transfers.js` — admin direct-transfer UI.
  - `js/requests.js` — viewer "submit request" form, admin approval queue.
  - `js/history.js` — per-item and per-school movement timelines.
  - `js/main.js` — wires modules together, initial render.
- **Backend**: Supabase (hosted Postgres + Auth + Row Level Security). No custom server. Chosen
  over Firebase/Firestore because the data (locations, items, movements, requests) is inherently
  relational — Postgres avoids hand-rolled joins and denormalization a document store would need.
  Chosen over a custom Node/Express backend because it requires no server code to write, deploy,
  or maintain, matching the stated preference for a low/no-code backend.
- **Roles**: two roles, `admin` and `viewer`, stored per-user and enforced by Postgres Row Level
  Security policies — not just hidden in the UI. `admin` can write to every table; `viewer` can
  read every table and insert into `requests` only.
- The Supabase project URL and public (anon) key are embedded in client JS — this is the intended
  Supabase usage pattern; RLS policies are what actually protect the data, not the secrecy of the key.

## Data model

- **`locations`** — every place stock can be, including the warehouse (a location row with a type
  flag, not a separate concept).
  - `id`, `name`, `type` (`warehouse` | `school`), `tier`, `students`, notes.
- **`materials`** — the catalog of material types (e.g. "Robot Kit", "Box").
  - `id`, `name`.
- **`items`** — one row per physical unit, matching the existing per-unit ID tracking (e.g. `R-101`).
  - `id` (the unit's own ID), `material_id`, `current_location_id`.
- **`movements`** — the history log; every transfer, direct or request-originated, writes here.
  - `id`, `item_id`, `from_location_id`, `to_location_id`, `moved_by`, `moved_at`, `note` (optional),
    `request_id` (optional; set when the movement originated from an approved request).
- **`requests`** — the viewer demand queue.
  - `id`, `requested_by`, `location_id` (requesting school), `material_id`, `quantity`, `status`
    (`pending` | `approved` | `denied`), `created_at`, `resolved_at`, `resolved_by`.
- **`profiles`** — keyed to Supabase's built-in `auth.users`.
  - `role` (`admin` | `viewer`). Deliberately does not yet restrict a viewer to one school; that
    can be added later as an additional column without restructuring existing tables.

A transfer, whichever flow triggers it, is always the same underlying operation: pick item(s)
currently at location A, insert a `movements` row per item, update each item's
`current_location_id` to B.

## Core flows

- **Schools (`locations`)**: admin-only create/edit (name, tier, students, notes). Viewers get a
  read-only list/grid, matching today's card layout.
- **Items**: admin adds new items (unit ID, material type, starting location — typically the
  warehouse) and edits/retires existing ones. Viewers see items read-only as part of a school's
  manifest.
- **Direct transfer (admin only)**: pick one or more item IDs (optionally filtered by material or
  current location), pick a destination location, confirm. Writes one `movements` row per item and
  updates each item's `current_location_id`, as a single transaction.
- **Request → approval (viewer-facing)**:
  1. Viewer picks a material, quantity, and optional note, and submits it for their school →
     new `requests` row with `status = pending`.
  2. Admin sees a Requests queue (pending first): school, material, quantity, requester, note.
  3. **Approve**: admin selects which specific item IDs fulfill the request (the UI can suggest
     available ones from the warehouse or elsewhere); the same transfer logic runs, with
     `movements.request_id` set to this request and `requests.status = approved`.
  4. **Deny**: `status = denied`, no stock change.
  5. Either resolution stamps `resolved_by` and `resolved_at`.
- **History view**: per-item timeline (all its movements, oldest → newest) and per-school timeline
  (everything that moved in or out), both read as filtered joins over `movements`, `items`,
  `locations`, and `profiles`/`auth.users`.

## Auth & accounts

- Invite-only: no public signup form. The admin creates each collaborator's account from an admin
  screen (enter email → Supabase sends an invite/magic-link to set a password).
- Per-person accounts (not shared passwords), so requests and approvals are attributable to a
  specific person.
- `profiles.role` distinguishes `admin` from `viewer`; a future per-school restriction for viewers
  can be added as an additional column on `profiles` without a schema rewrite, since it's out of
  scope for this launch.

## Error handling & edge cases

- Row Level Security is the actual enforcement layer: a viewer's browser cannot write to `items`,
  `movements`, or `locations` even if the UI were bypassed — it can only insert into `requests`.
  UI-level role gating is for UX clarity, not security.
- Approving a request whose suggested item(s) were moved elsewhere in the meantime (e.g. two admin
  sessions, or the same admin in two tabs): the transfer step re-checks each item's
  `current_location_id` against the expected value immediately before writing; on a mismatch, that
  item shows an inline error instead of silently applying a stale move.
- Resolving an already-resolved request (approve or deny) is blocked by the same kind of status
  check before update.
- Network/auth failures (Supabase unreachable, expired session) surface as an inline status
  message, following the existing `.live-status` bar pattern in the current UI, rather than a hard
  failure.

## Migration

None. The Google Sheet is retired at launch; the new system starts with no schools, items, or
history. This should be called out (e.g. in the footer or a README) so nobody keeps editing the
old sheet by mistake after cutover.
