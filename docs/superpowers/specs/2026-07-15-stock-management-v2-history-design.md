# Stock Management v2 — Movement History Design (Plan 4 of 4)

## Context

Plan 1 built auth + schema, including the `movements` table (already live with RLS, one row
written per item per transfer). Plan 2 cut the dashboard over to Supabase with admin CRUD. Plan 3
added admin direct transfer and the viewer request → admin approval workflow, both of which write
`movements` rows via the atomic `perform_transfer` RPC — but nothing reads that table for display
yet. This plan (Plan 4, the last of the four) builds the one remaining piece of the original
design: a view of that history, plus a documentation cutover that was left behind along the way.

`CLAUDE.md` (the repo's guidance file for AI coding assistants) still describes the pre-Plan-2
architecture — a read-only static page fetching a published Google Sheet as CSV. That's been wrong
since Plan 2 shipped; nobody circled back to update it. Rewriting it to describe the current
Supabase-backed app is a small, low-risk task bundled into this plan rather than left to drift
further.

## Goals

- Anyone viewing a school's or the Warehouse's detail modal (admin or viewer — same visibility as
  the existing material manifest) can see every movement that has touched that location: items
  that arrived, items that left, when, by whom, and why (direct transfer vs. an approved request).
- No cap on how far back the history goes; newest first.
- `CLAUDE.md` accurately describes the current architecture (Supabase auth/data, the `js/api.js`
  query layer, and the `js/schools.js`/`items.js`/`transfers.js`/`requests.js`/`history.js` module
  split) in place of the retired Google-Sheet/CSV description.

## Non-goals

- Per-item timelines (click an item id to see its own journey across locations). Item ids in the
  manifest stay plain text, not clickable, in this plan — the per-school view covers the primary
  use case ("what happened at this school"); per-item can be added later without a schema change
  if it turns out to be needed.
- Pagination, date filtering, or search within history. If a location's history grows long enough
  that "no cap" becomes a real problem, that's a follow-up, not part of this plan.
- Any change to how movements are written (`perform_transfer`, direct transfer, approve/deny from
  Plan 3) — this plan is read-only.
- Any other `CLAUDE.md`/README polish beyond replacing the stale architecture description.

## Data model changes

None. The `movements` table and its RLS policy (`movements: any authenticated user can read`,
already `using (true)`) were both put in place in Plan 1 and are unchanged by this plan. This is
purely a new read path over existing data.

## Core flow

### Per-location movement history

Each school's and the Warehouse's detail modal (`js/schools.js`'s `openDetailModal`) gets a new
**"Movement history"** section, below the existing material manifest, visible to both roles —
same visibility as the manifest itself.

A movement row is included for a given location if `from_location_id` or `to_location_id` on that
row equals the open location's id. Direction is relative to the open location:
`to_location_id === location.id` renders as **incoming** ("↓ In"), otherwise **outgoing**
("↑ Out") — a row touching a location is never ambiguous, since `perform_transfer` always sets
both a `from_location_id` and a `to_location_id` and never writes a self-transfer (Plan 3 already
guards against a request being fulfilled from the requesting school itself).

Each row reads, e.g.:

```
↓ In — Robot Kit R-201 from Warehouse — approved by admin@example.com · 15/7/2026
   Note: restock
```

- **Material** is resolved client-side: `movements.item_id → items[].material_id →
  materials[].name` (the `movements` table has no `material_id` column of its own).
- **Counterpart location** is the *other* end of the move (whichever of `from_location_id`/
  `to_location_id` isn't the open location), resolved via the already-loaded `locations[]`.
- **Who** is `mover.email` (the mover's profile), shown as "moved by" for a direct transfer or
  "approved by" when the row carries a `request_id` (a small "via request" indicator distinguishes
  the two, matching the original scoping decision to show this).
- **Note**, if present, renders as a second line under the row (same `note` field `perform_transfer`
  already accepts and records).
- Rows are sorted by `moved_at`, newest first. No cap.
- Empty state: "No movements recorded for this location yet." — matching the empty-state pattern
  already used elsewhere (`js/requests.js`'s "No pending requests.", `js/schools.js`'s "No schools
  yet.").

## Error handling & edge cases

- **Retired items still show correctly.** `movements` rows are immutable historical facts and are
  never deleted or altered when an item is later retired; material/location name resolution reads
  from the already-loaded `items`/`locations` arrays, which include retired items (Plan 2 never
  deletes rows, only sets `retired = true`), so a retired item's past movements still resolve to a
  real material name.
- **Load failure**: same inline error pattern as the rest of the app — the history section shows
  "Could not load history: `<message>`" instead of silently rendering nothing.
- **Network/auth failures**: no new pattern; consistent with every other read in the app.

## File/module structure

- `js/api.js` gains one new function: `listMovements()` —
  `client.from('movements').select('*, mover:moved_by(email)')`. One embed, one FK
  (`movements.moved_by → profiles.id` is the *only* foreign key from `movements` to `profiles`,
  unlike `requests`, which has two — so this embed is unambiguous by construction; no alias
  needed, though `mover:` is used anyway for a clearer consuming-code name). Fetches the whole
  table; per-location filtering happens in `js/schools.js`, matching the existing pattern
  (`listRequests()` also fetches everything and callers filter client-side).
- New `js/history.js` — `renderHistorySection(container, ctx)` where
  `ctx = { location, movements, items, materials, locations }`. Pure rendering, no `api` needed
  (history is read-only, nothing in this module writes). Follows the same
  `renderX(container, ctx)` shape as `renderItemsSection`/`renderRequestSection`. No automated
  tests — a DOM-rendering module verified manually, same as every other UI module since Plan 2.
- `js/schools.js`: `refresh()` adds `api.listMovements()` to its existing `Promise.all` (alongside
  locations/materials/items/requests); `openDetailModal` filters the full list to this location,
  sorts newest-first, and passes it to `renderHistorySection` in a new `#movementHistorySection`
  container added to the modal markup, below `#itemsSection` and above the viewer's
  "Request materials" section / the notes box.
- `CLAUDE.md`: rewritten "What this is" and "Architecture" sections to describe the current
  Supabase-backed app (auth via `js/auth.js`, data access via `js/api.js`, rendering split across
  `js/schools.js`/`items.js`/`transfers.js`/`requests.js`/`history.js`, wired together in
  `js/main.js`) in place of the retired Google-Sheet/CSV description. "Working in this file"
  guidance updated to match (no more "confirm the actual sheet layout" — there is no sheet).

## Migration

None. No schema changes.
