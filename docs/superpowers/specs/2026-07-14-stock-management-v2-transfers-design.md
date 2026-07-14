# Stock Management v2 — Transfers & Requests Design (Plan 3 of 4)

## Context

Plan 1 built auth + schema (including the `requests` and `movements` tables, already live with RLS
policies, though nothing writes to them yet). Plan 2 retired the Google Sheet and cut the dashboard
over to Supabase with admin CRUD for schools and items. This plan (Plan 3) adds the two flows the
original design spec (`docs/superpowers/specs/2026-07-12-stock-management-v2-design.md`) grouped
together because they share one underlying operation — moving stock between locations and logging
it:

- **Direct transfer**: an admin moves item(s) from one location to another immediately.
- **Request → approval**: a viewer asks for material at their school; an admin approves (fulfilling
  it with specific items, which runs the same underlying transfer) or denies it.

Plan 4 (per-item/per-school movement history timelines) is out of scope here — this plan produces
the `movements` rows Plan 4 will read, but doesn't build any view of that history yet.

## Goals

- Admin can transfer one or more items of a single material line from their current location to any
  other location, in one action.
- Viewer can submit a material request for a specific school (material, quantity, optional note)
  from that school's existing detail modal.
- Admin has a dedicated queue of pending requests and can approve (choosing which specific items —
  from any location, not just the warehouse — fulfill it, partial fulfillment allowed) or deny.
- Every transfer, whichever flow triggered it, writes one `movements` row per item moved and updates
  that item's `current_location_id` — atomically, with a concurrency check that rejects (the whole
  batch, not a silent partial move) if any selected item was moved elsewhere in the meantime.
- Requests and movements are attributable to a specific person by email, not just a role.

## Non-goals

- Movement/request history views (per-item or per-school timelines) — Plan 4.
- Viewers cancelling their own pending requests — not in the original spec; can be added later
  without a schema change if it turns out to be needed.
- Restricting a viewer's visibility or request-eligibility to one "home" school — still explicitly
  deferred (per Plan 1's design), a viewer can view and request for any school.
- Any change to the existing schools/items CRUD from Plan 2.

## Data model changes

Building on the schema already live from Plan 1 (`requests`, `movements` tables and their RLS
policies already exist and are unchanged by this plan):

- **`profiles.email text`** (new column). Populated going forward by extending the existing
  `handle_new_user()` trigger to also set `email = new.email` (available on the `auth.users` row the
  trigger already fires from — no new permission needed). The migration backfills it once for the
  two existing accounts (admin + the Plan 1 viewer test account) via a one-off `update ... from
  auth.users where profiles.id = auth.users.id`.
- **`perform_transfer(item_ids text[], from_location_id uuid, to_location_id uuid, note text,
  request_id uuid)`** — a new Postgres RPC function (`security definer`, `set search_path = ''`,
  matching the existing `is_admin()` function's style). Behavior, all inside one transaction:
  1. Raise an exception immediately if `not is_admin()` (RLS is bypassed inside a `security definer`
     function, so the function must enforce this itself, the same reason `is_admin()` exists).
  2. For every id in `item_ids`, verify the item exists, `retired = false`, and
     `current_location_id = from_location_id`. If any item fails this check, raise an exception
     naming the failing item id(s) — the whole call rolls back, nothing is partially applied.
  3. Insert one `movements` row per item (`item_id`, `from_location_id`, `to_location_id`,
     `moved_by = auth.uid()`, `note`, `request_id`).
  4. Update each item's `current_location_id` to `to_location_id`.
  5. If `request_id` is not null: update that request to `status = 'approved'`,
     `resolved_by = auth.uid()`, `resolved_at = now()` — but only if it is still `status = 'pending'`
     (otherwise raise an exception; blocks two admins/tabs from both resolving the same request).
- **Deny does not need the RPC.** It's a single-table write, done as a plain `js/api.js` call:
  `update requests set status = 'denied', resolved_by = auth.uid(), resolved_at = now() where id =
  :id and status = 'pending'` — the existing admin-update RLS policy already covers this; the
  `status = 'pending'` guard in the `where` clause (checked via "was a row actually returned")
  provides the same already-resolved protection as the RPC's internal check.

No changes to `items`, `locations`, `materials`, or their existing RLS policies.

## Core flows

### Admin direct transfer

In `js/items.js`'s manifest (used both in school and warehouse detail modals), each material line
(e.g. "Robot Kit ×15") gets a **"Transfer"** action next to it, admin-only, alongside the existing
per-item ✕ retire button. Clicking it opens a form: a checkbox per item id under that material line
(none pre-checked), a destination-location dropdown (every location except the one currently open),
an optional note, and a "Transfer" submit button.

On submit: `api.performTransfer(selectedItemIds, currentLocationId, destinationId, note, null)`.
Success re-runs the same `onChange` refresh-and-reopen cycle `js/items.js` already uses for
add/retire (Plan 2). A stale-item failure surfaces as an inline form error naming the specific
item id(s) that moved elsewhere since the modal was opened; the admin can close and reopen to see
current state and retry.

### Viewer request submission

Each school's detail modal (not the warehouse's — requesting stock *for* the warehouse doesn't make
sense) gets a **"Request materials"** button, visible to viewers only — matching the original
design's framing of requests as the viewer-facing counterpart to admin direct transfer (an admin who
wants stock moved already has the direct-transfer action from Section "Admin direct transfer" and
doesn't need the request/approval round-trip). The underlying RLS policy technically permits any
authenticated user to insert their own request, so this is a UI-visibility choice, not a new
database restriction. Form: material (datalist of existing `materials` rows, same pattern as the
admin add-item form in Plan 2 — a request can't invent a new material, since it's demand for
something that should already exist in the catalog), quantity (integer, min 1), optional note.
Submits via `api.createRequest({ location_id, material_id, quantity, note })`; `requested_by` is
implicit (`auth.uid()`, enforced by the existing RLS `with check (requested_by = auth.uid())`).

After submitting, the modal shows a brief confirmation and lists the viewer's own pending requests
for that school, read-only (no cancel action in this plan).

### Admin approval queue

A new **"Requests"** dashboard section (same visual pattern as "Warehouse"/"School manifest" from
Plan 2), admin-only, positioned after "School manifest" in `index.html`. Pending requests list first
(oldest first): school, material, quantity, requester's email, note, submitted date. Resolved
requests (approved/denied) collapse into a smaller "Recently resolved" list below them — this is
just enough to keep the queue usable, not a history view (that's Plan 4).

Each pending request expands to:
- **Approve**: lists every non-retired item of the requested material across all locations
  (Warehouse's items listed first, then others, grouped by location), admin checks which unit ids to
  send. If checked items span more than one location, the form requires narrowing to a single
  location before submitting (`perform_transfer` moves from exactly one `from_location_id` at a
  time). Confirm calls `api.performTransfer(itemIds, sourceLocationId, request.location_id, note,
  request.id)`. The checked count does not have to equal the requested quantity — partial
  fulfillment is allowed, matching the original spec.
- **Deny**: single confirm button, calls `api.updateRequest(id, { status: 'denied', ... })` as
  described above.

Viewers do not see the Requests section at all (mirrors how "+ Add school" is hidden from them
today).

## Error handling & edge cases

- **Stale item on transfer/approval**: `perform_transfer` rolls back the entire call and reports
  which item(s) no longer match the expected `from_location_id` — an inline error, never a silent
  partial move.
- **Double-resolving a request**: both the RPC's internal `pending` check (approve) and the plain
  update's `status = 'pending'` guard (deny) mean a second admin acting on an already-resolved
  request fails cleanly with "already resolved" instead of corrupting `resolved_by`/`resolved_at`.
- **No pending requests**: "No pending requests." empty-note, matching existing empty-state patterns
  from Plan 2.
- **No stock available to fulfill**: if no non-retired item of the requested material exists
  anywhere, the approve form shows "No stock of this material anywhere — deny or wait for stock to
  arrive," and the approve action is disabled (deny remains available).
- **Network/auth failures**: same inline `.live-status`-style error pattern used everywhere else in
  the app (login, add school, add item) — no new error-handling pattern introduced.

## File/module structure

- `js/api.js` gains: `createRequest`, `listRequests`, `updateRequest`, `performTransfer` (wraps the
  RPC call via `client.rpc('perform_transfer', {...})`). `listMovements` is **not** added — movement
  history is Plan 4.
- New `js/transfers.js` — the per-material-line "Transfer" form (both the admin direct-transfer flow
  and the approve-fulfillment picker in the Requests section reuse this same form component, since
  both are "pick items of a material, pick/confirm a destination" at their core), imported by
  `js/items.js` and by the new `js/requests.js`.
- New `js/requests.js` — the viewer's "Request materials" form (rendered inside the school modal,
  imported by `js/schools.js`) and the admin's "Requests" dashboard section (rendered into a new
  `#requestsSection` container in `index.html`, wired from `js/main.js`).
- `index.html` gets one new top-level section ("Requests"). `js/main.js` gets one more
  `loadAndRender`-style call for it, following the exact pattern `schoolsView` already establishes.

## Migration

- New file: `supabase/migrations/002_add_profiles_email_and_transfer_rpc.sql` — adds
  `profiles.email`, extends `handle_new_user()`, backfills existing rows, and creates
  `perform_transfer(...)`. Applied the same manual paste-into-SQL-Editor way as migration 001.
- `supabase/schema.sql` updated in parallel so a brand-new project already has all of this.
