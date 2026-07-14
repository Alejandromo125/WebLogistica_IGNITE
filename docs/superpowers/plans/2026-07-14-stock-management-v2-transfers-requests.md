# Stock Management v2 — Transfers & Requests (Plan 3 of 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add admin direct transfers between locations and a viewer request → admin approval
workflow, both built on one new atomic `perform_transfer` Postgres RPC function, on top of the
`requests`/`movements` tables and RLS policies already live from Plan 1.

**Architecture:** A new Postgres RPC function (`perform_transfer`) does the move-item /
log-movement / resolve-request write atomically and enforces the "item hasn't moved since you
looked at it" concurrency check server-side, since there is no application server to coordinate a
multi-table write otherwise. `js/api.js` gains four thin wrapper functions
(`createRequest`, `listRequests`, `updateRequest`, `performTransfer`) following the exact
dependency-injection pattern already established. Two new DOM-rendering modules,
`js/transfers.js` (admin direct-transfer form, wired into `js/items.js`'s manifest) and
`js/requests.js` (viewer request form wired into `js/schools.js`'s school modal, plus a new
admin-only "Requests" dashboard section wired into `js/main.js`), follow the same
`renderX(container, ctx)` / `createXView({ api })` shapes Plan 2 established for
`js/items.js`/`js/schools.js`.

**Tech Stack:** Same as Plans 1-2 — Supabase (Postgres + Auth + RLS, plus one new `plpgsql` RPC
function), vanilla JS ES modules (no bundler), Node.js built-in test runner for dev-time unit
tests only.

## Global Constraints

- The deployed site remains a static site with zero build step. Node/npm are dev-time only.
- Any module whose logic needs the Supabase client receives it as a parameter (dependency
  injection), never importing `js/supabaseClient.js` directly — same rule Plan 1/2 established.
- `js/transfers.js` and `js/requests.js` are DOM-rendering modules with **no automated tests** —
  verified manually against the live Supabase project, exactly like `js/schools.js`/`js/items.js`
  from Plan 2. Only `js/api.js` (pure data-access functions, no DOM dependency) gets Node unit
  tests.
- Nothing in this plan hard-deletes any row. `items`/`locations`/`materials` still have no
  `DELETE` policy (unchanged from Plan 1/2). Denying a request does not delete it — it sets
  `status = 'denied'`.
- Roles are exactly the strings `admin` and `viewer` (unchanged).
- `perform_transfer` must be atomic: if any selected item no longer matches the expected
  `from_location_id` (moved elsewhere, or retired, since it was last read), the **entire call**
  rolls back and reports which item(s) failed — never a partial move of some items in the batch.
- Both resolution paths (RPC-driven approve, plain-update-driven deny) must reject acting on a
  request that is no longer `status = 'pending'`, so two admins/tabs can't both resolve the same
  request.
- User-entered free text rendered into `innerHTML` must go through the existing
  `escapeHtml()` helper (`js/schools.js`, exported) — same rule the Plan 2 final review
  established; do not reintroduce unescaped interpolation in the two new UI modules.
- `createRequestsView({ api })` and `createSchoolsView({ api })` are each constructed exactly once
  per page load (in `js/main.js`); their page-level DOM event listeners are registered exactly
  once, inside each factory, not per render — same rule Plan 2 established for `schoolsView`.

---

### Task 1: Schema migration — `profiles.email`, backfill, and the `perform_transfer` RPC

**Files:**
- Modify: `supabase/schema.sql`
- Create: `supabase/migrations/002_add_profiles_email_and_transfer_rpc.sql`

**Interfaces:**
- Produces: `profiles.email` (text, nullable — populated by `handle_new_user()` going forward, and
  backfilled once for existing rows). Produces `public.perform_transfer(item_ids text[],
  from_location_id uuid, to_location_id uuid, note text, request_id uuid) returns void` — Task 2's
  `js/api.js` calls this via `client.rpc('perform_transfer', {...})` with exactly these five
  parameter names.

- [ ] **Step 1: Modify `supabase/schema.sql`'s `profiles` table to add the `email` column**

Find this block in `supabase/schema.sql`:

```sql
-- ---------- profiles ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','viewer')),
  created_at timestamptz not null default now()
);
```

Replace it with:

```sql
-- ---------- profiles ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','viewer')),
  email text,
  created_at timestamptz not null default now()
);
```

- [ ] **Step 2: Modify `supabase/schema.sql`'s `handle_new_user()` to populate `email`**

Find this block in `supabase/schema.sql`:

```sql
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.profiles (id, role) values (new.id, 'viewer');
  return new;
end;
$$;
```

Replace it with:

```sql
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.profiles (id, role, email) values (new.id, 'viewer', new.email);
  return new;
end;
$$;
```

- [ ] **Step 3: Append the `perform_transfer` RPC function to the end of `supabase/schema.sql`**

Find the last block in the file:

```sql
create policy "movements: admin can insert"
  on public.movements for insert
  to authenticated
  with check (public.is_admin());
```

After it (at the very end of the file), add:

```sql

-- ---------- transfers ----------
create or replace function public.perform_transfer(
  item_ids text[],
  from_location_id uuid,
  to_location_id uuid,
  note text,
  request_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  found_ids text[];
  missing_ids text[];
  req_status text;
begin
  if not public.is_admin() then
    raise exception 'only an admin can perform a transfer';
  end if;

  select array_agg(i.id) into found_ids
  from public.items i
  where i.id = any(item_ids)
    and i.retired = false
    and i.current_location_id = from_location_id;

  select array_agg(x) into missing_ids
  from unnest(item_ids) as x
  where x <> all(coalesce(found_ids, array[]::text[]));

  if missing_ids is not null then
    raise exception 'item(s) not available at expected location: %', array_to_string(missing_ids, ', ');
  end if;

  insert into public.movements (item_id, from_location_id, to_location_id, moved_by, note, request_id)
  select id, from_location_id, to_location_id, auth.uid(), note, request_id
  from unnest(item_ids) as id;

  update public.items
  set current_location_id = to_location_id
  where id = any(item_ids);

  if request_id is not null then
    select status into req_status from public.requests where id = request_id for update;

    if req_status is null then
      raise exception 'request % not found', request_id;
    elsif req_status <> 'pending' then
      raise exception 'request % is already resolved', request_id;
    end if;

    update public.requests
    set status = 'approved', resolved_by = auth.uid(), resolved_at = now()
    where id = request_id;
  end if;
end;
$$;

grant execute on function public.perform_transfer(text[], uuid, uuid, text, uuid) to authenticated;
```

- [ ] **Step 4: Write `supabase/migrations/002_add_profiles_email_and_transfer_rpc.sql`**

This is what actually needs to run against the already-provisioned live project:

```sql
-- supabase/migrations/002_add_profiles_email_and_transfer_rpc.sql
alter table public.profiles add column if not exists email text;

update public.profiles p
set email = u.email
from auth.users u
where p.id = u.id and p.email is null;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.profiles (id, role, email) values (new.id, 'viewer', new.email);
  return new;
end;
$$;

create or replace function public.perform_transfer(
  item_ids text[],
  from_location_id uuid,
  to_location_id uuid,
  note text,
  request_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  found_ids text[];
  missing_ids text[];
  req_status text;
begin
  if not public.is_admin() then
    raise exception 'only an admin can perform a transfer';
  end if;

  select array_agg(i.id) into found_ids
  from public.items i
  where i.id = any(item_ids)
    and i.retired = false
    and i.current_location_id = from_location_id;

  select array_agg(x) into missing_ids
  from unnest(item_ids) as x
  where x <> all(coalesce(found_ids, array[]::text[]));

  if missing_ids is not null then
    raise exception 'item(s) not available at expected location: %', array_to_string(missing_ids, ', ');
  end if;

  insert into public.movements (item_id, from_location_id, to_location_id, moved_by, note, request_id)
  select id, from_location_id, to_location_id, auth.uid(), note, request_id
  from unnest(item_ids) as id;

  update public.items
  set current_location_id = to_location_id
  where id = any(item_ids);

  if request_id is not null then
    select status into req_status from public.requests where id = request_id for update;

    if req_status is null then
      raise exception 'request % not found', request_id;
    elsif req_status <> 'pending' then
      raise exception 'request % is already resolved', request_id;
    end if;

    update public.requests
    set status = 'approved', resolved_by = auth.uid(), resolved_at = now()
    where id = request_id;
  end if;
end;
$$;

grant execute on function public.perform_transfer(text[], uuid, uuid, text, uuid) to authenticated;
```

Every statement is idempotent (`add column if not exists`, `create or replace function`, and the
backfill's `p.email is null` guard means re-running it won't overwrite anything) — safe to run more
than once.

- [ ] **Step 5: USER ACTION — apply the migration to the live project**

In the Supabase dashboard, open SQL Editor → New Query, paste the entire contents of
`supabase/migrations/002_add_profiles_email_and_transfer_rpc.sql`, and run it. Expected:
"Success. No rows returned."

- [ ] **Step 6: USER ACTION — verify the migration**

Still in SQL Editor, run:

```sql
select id, role, email from public.profiles;
```

Expected: both existing rows (admin + viewer test account) now have their `email` populated.

Then run:

```sql
select proname from pg_proc where proname = 'perform_transfer';
```

Expected: one row, `perform_transfer`.

- [ ] **Step 7: Commit**

```bash
git add supabase/schema.sql supabase/migrations/002_add_profiles_email_and_transfer_rpc.sql
git commit -m "feat: add profiles.email and perform_transfer RPC for atomic transfers"
```

---

### Task 2: `js/api.js` — request and transfer query functions

**Files:**
- Modify: `js/api.js`
- Modify: `tests/api.test.js`

**Interfaces:**
- Consumes: a Supabase-like `client` (same dependency-injection pattern as the rest of `js/api.js`).
- Produces (added to the object `createApi(client)` already returns):
  `createRequest(request)`, `listRequests()`, `updateRequest(id, changes)`,
  `performTransfer(itemIds, fromLocationId, toLocationId, note, requestId)`. Every function returns
  the row(s)/RPC result on success or throws `Error(message)` on failure — same contract as every
  existing `js/api.js` function. `js/transfers.js` and `js/requests.js` (Tasks 3-5) consume this
  exact shape.

- [ ] **Step 1: Extend `tests/api.test.js`'s `makeFakeClient` helper**

`updateRequest` needs to chain two `.eq()` calls (`id` and `status`) before `.select().single()`,
and `performTransfer` needs a `.rpc()` method — neither exists on the current fake client. Find
this block in `tests/api.test.js`:

```javascript
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
```

Replace it with (this makes `.eq()` chainable any number of times, and adds `.rpc()` at the
top-level client, backward-compatible with every existing single-`.eq()` test):

```javascript
        update(changes) {
          calls.push(['update', table, changes]);
          const chain = {
            eq(col, val) {
              calls.push(['eq', col, val]);
              return chain;
            },
            select() {
              return {
                single() {
                  return Promise.resolve(behavior.update);
                },
              };
            },
          };
          return chain;
        },
      };
    },
    rpc(fn, params) {
      calls.push(['rpc', fn, params]);
      return Promise.resolve(responses.rpc);
    },
  };
}
```

- [ ] **Step 2: Write the failing tests**

Add these tests to the end of `tests/api.test.js` (after the existing `updateItem` tests, before
the final closing of the file — the file has no other content after the last test, so just append):

```javascript
test('createRequest inserts and returns the new row', async () => {
  const row = { id: 'req1', requested_by: 'u1', location_id: 'l1', material_id: 'm1', quantity: 3, status: 'pending' };
  const client = makeFakeClient({ requests: { insert: { data: row, error: null } } });
  const api = createApi(client);
  const result = await api.createRequest({ location_id: 'l1', material_id: 'm1', quantity: 3 });
  assert.deepEqual(result, row);
  assert.deepEqual(client.calls[0], ['insert', 'requests', { location_id: 'l1', material_id: 'm1', quantity: 3 }]);
});

test('createRequest throws with the Supabase error message on failure', async () => {
  const client = makeFakeClient({ requests: { insert: { data: null, error: { message: 'quantity must be positive' } } } });
  const api = createApi(client);
  await assert.rejects(
    () => api.createRequest({ location_id: 'l1', material_id: 'm1', quantity: 0 }),
    (err) => { assert.equal(err.message, 'quantity must be positive'); return true; }
  );
});

test('listRequests returns all requests', async () => {
  const rows = [{ id: 'req1', status: 'pending', profiles: { email: 'viewer@example.com' } }];
  const client = makeFakeClient({ requests: { select: { data: rows, error: null } } });
  const api = createApi(client);
  const result = await api.listRequests();
  assert.deepEqual(result, rows);
});

test('updateRequest updates a pending request by id and returns the updated row', async () => {
  const row = { id: 'req1', status: 'denied', resolved_by: 'admin1' };
  const client = makeFakeClient({ requests: { update: { data: row, error: null } } });
  const api = createApi(client);
  const result = await api.updateRequest('req1', { status: 'denied', resolved_by: 'admin1', resolved_at: '2026-07-14T00:00:00Z' });
  assert.deepEqual(result, row);
  assert.deepEqual(client.calls[0], ['update', 'requests', { status: 'denied', resolved_by: 'admin1', resolved_at: '2026-07-14T00:00:00Z' }]);
  assert.deepEqual(client.calls[1], ['eq', 'id', 'req1']);
  assert.deepEqual(client.calls[2], ['eq', 'status', 'pending']);
});

test('updateRequest throws when the request is no longer pending', async () => {
  const client = makeFakeClient({ requests: { update: { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned' } } } });
  const api = createApi(client);
  await assert.rejects(
    () => api.updateRequest('req1', { status: 'denied' }),
    (err) => { assert.equal(err.message, 'JSON object requested, multiple (or no) rows returned'); return true; }
  );
});

test('performTransfer calls the perform_transfer RPC with the expected params and returns its result', async () => {
  const client = makeFakeClient({ rpc: { data: null, error: null } });
  const api = createApi(client);
  const result = await api.performTransfer(['R-101', 'R-102'], 'loc-warehouse', 'loc-school1', 'restock', 'req1');
  assert.deepEqual(result, null);
  assert.deepEqual(client.calls[0], ['rpc', 'perform_transfer', {
    item_ids: ['R-101', 'R-102'],
    from_location_id: 'loc-warehouse',
    to_location_id: 'loc-school1',
    note: 'restock',
    request_id: 'req1',
  }]);
});

test('performTransfer throws with the Supabase error message on failure', async () => {
  const client = makeFakeClient({ rpc: { data: null, error: { message: 'item(s) not available at expected location: R-101' } } });
  const api = createApi(client);
  await assert.rejects(
    () => api.performTransfer(['R-101'], 'loc-warehouse', 'loc-school1', null, null),
    (err) => { assert.equal(err.message, 'item(s) not available at expected location: R-101'); return true; }
  );
});
```

- [ ] **Step 3: Run tests and confirm the new ones fail**

Run: `npm test`
Expected: fails with `api.createRequest is not a function` (or similar — the new functions don't
exist in `js/api.js` yet). The 17 pre-existing tests still pass.

- [ ] **Step 4: Implement the new functions in `js/api.js`**

Find the closing `return { ... }` block at the end of `createApi`:

```javascript
  return {
    listLocations, createLocation, updateLocation,
    listMaterials, createMaterial,
    listItems, createItem, updateItem,
  };
}
```

Replace it with:

```javascript
  async function createRequest(request) {
    const { data, error } = await client.from('requests').insert(request).select().single();
    if (error) throw new Error(error.message);
    return data;
  }

  async function listRequests() {
    const { data, error } = await client.from('requests').select('*, profiles(email)');
    if (error) throw new Error(error.message);
    return data;
  }

  async function updateRequest(id, changes) {
    const { data, error } = await client.from('requests').update(changes).eq('id', id).eq('status', 'pending').select().single();
    if (error) throw new Error(error.message);
    return data;
  }

  async function performTransfer(itemIds, fromLocationId, toLocationId, note, requestId) {
    const { data, error } = await client.rpc('perform_transfer', {
      item_ids: itemIds,
      from_location_id: fromLocationId,
      to_location_id: toLocationId,
      note,
      request_id: requestId,
    });
    if (error) throw new Error(error.message);
    return data;
  }

  return {
    listLocations, createLocation, updateLocation,
    listMaterials, createMaterial,
    listItems, createItem, updateItem,
    createRequest, listRequests, updateRequest, performTransfer,
  };
}
```

- [ ] **Step 5: Run tests and confirm they pass**

Run: `npm test`
Expected: `tests 24`, `pass 24`, `fail 0` (7 new tests in this task plus the 17 existing from
Plans 1-2).

- [ ] **Step 6: Commit**

```bash
git add js/api.js tests/api.test.js
git commit -m "feat: add request and transfer functions to js/api.js"
```

---

### Task 3: `js/transfers.js` — admin direct transfer

**Files:**
- Create: `js/transfers.js`
- Modify: `js/items.js`

**Interfaces:**
- Consumes: `api` (Task 2), a `location` object and `materials`/`items` arrays shaped like
  `js/schools.js`'s `computeLocationView`/raw API data (same shapes `js/items.js` already
  consumes).
- Produces: `renderTransferForm(container, ctx)` where
  `ctx = { api, location, materialName, itemIds, destinations, onChange }` —
  `destinations` is the array of `locations` rows excluding `location` itself; `onChange` is an
  async callback called after a successful transfer. `js/items.js` (this task) is the only
  consumer in this plan.

- [ ] **Step 1: Write `js/transfers.js`**

```javascript
// js/transfers.js
import { escapeHtml } from './schools.js';

export function renderTransferForm(container, ctx) {
  const { api, location, materialName, itemIds, destinations, onChange } = ctx;

  const checkboxesHtml = itemIds.map(id => `
    <label style="display:block; font-size:12.5px; margin:2px 0;">
      <input type="checkbox" class="transfer-item-cb" value="${escapeHtml(id)}"> ${escapeHtml(id)}
    </label>
  `).join('');

  const destOptionsHtml = destinations.map(d => `<option value="${d.id}">${escapeHtml(d.name)}</option>`).join('');

  container.innerHTML = `
    <div class="manifest-title">Transfer ${escapeHtml(materialName)}</div>
    ${checkboxesHtml}
    <label style="display:block; margin-top:10px;">Destination
      <select name="destination" style="width:100%; border:1px solid var(--line); background:var(--card); padding:7px 9px; font-family:'IBM Plex Mono', monospace; font-size:12.5px; margin-top:4px;">
        ${destOptionsHtml}
      </select>
    </label>
    <label style="display:block; margin-top:10px;">Note (optional)
      <input name="note" style="width:100%; border:1px solid var(--line); background:var(--card); padding:7px 9px; font-family:'IBM Plex Mono', monospace; font-size:12.5px; margin-top:4px;">
    </label>
    <div id="transferError" class="live-status error" style="display:none; margin-top:8px;"></div>
    <button type="button" id="transferSubmitBtn" class="chip" style="margin-top:10px;" disabled>Transfer</button>
    <button type="button" id="transferCancelBtn" class="chip" style="margin-top:10px; margin-left:8px;">Cancel</button>
  `;

  const submitBtn = container.querySelector('#transferSubmitBtn');
  const errorEl = container.querySelector('#transferError');
  const destSelect = container.querySelector('select[name="destination"]');
  const noteInput = container.querySelector('input[name="note"]');

  function updateSubmitState() {
    const checkedCount = container.querySelectorAll('.transfer-item-cb:checked').length;
    submitBtn.disabled = checkedCount === 0;
  }

  container.querySelectorAll('.transfer-item-cb').forEach(cb => {
    cb.addEventListener('change', updateSubmitState);
  });

  container.querySelector('#transferCancelBtn').addEventListener('click', () => {
    container.innerHTML = '';
  });

  submitBtn.addEventListener('click', async () => {
    const checked = Array.from(container.querySelectorAll('.transfer-item-cb:checked')).map(cb => cb.value);
    if (checked.length === 0) return;
    errorEl.style.display = 'none';
    try {
      await api.performTransfer(checked, location.id, destSelect.value, noteInput.value.trim() || null, null);
      await onChange();
    } catch (err) {
      errorEl.textContent = 'Could not transfer: ' + err.message;
      errorEl.style.display = 'block';
    }
  });
}
```

- [ ] **Step 2: Add a "Transfer" action per material line in `js/items.js`**

Find this block in `js/items.js` (the manifest-line template inside `renderItemsSection`):

```javascript
  const manifestHtml = Array.from(byMaterial.entries()).map(([name, itemsForMaterial]) => `
    <div class="manifest-line">
      <div class="mn">${escapeHtml(name)}</div>
      <div class="ids">
        ${itemsForMaterial.map(i => {
          const idEsc = escapeHtml(i.id);
          return `<span>${idEsc}${isAdmin ? ` <button type="button" class="retire-item-btn" data-item="${idEsc}" style="border:none; background:none; color:var(--rust); cursor:pointer; font-family:inherit;" title="Retire ${idEsc}">✕</button>` : ''}</span>`;
        }).join(', ')}
      </div>
    </div>
  `).join('') || '<div class="manifest-line"><div class="mn">No material currently recorded</div></div>';
```

Replace it with:

```javascript
  const manifestHtml = Array.from(byMaterial.entries()).map(([name, itemsForMaterial]) => `
    <div class="manifest-line">
      <div class="mn">
        ${escapeHtml(name)}
        ${isAdmin ? `<button type="button" class="transfer-material-btn" data-material="${escapeHtml(name)}" style="margin-left:8px; border:1px solid var(--line); background:none; cursor:pointer; font-family:inherit; font-size:11px; padding:1px 6px;">Transfer</button>` : ''}
      </div>
      <div class="ids">
        ${itemsForMaterial.map(i => {
          const idEsc = escapeHtml(i.id);
          return `<span>${idEsc}${isAdmin ? ` <button type="button" class="retire-item-btn" data-item="${idEsc}" style="border:none; background:none; color:var(--rust); cursor:pointer; font-family:inherit;" title="Retire ${idEsc}">✕</button>` : ''}</span>`;
        }).join(', ')}
      </div>
      <div class="transfer-form-area" data-material="${escapeHtml(name)}"></div>
    </div>
  `).join('') || '<div class="manifest-line"><div class="mn">No material currently recorded</div></div>';
```

- [ ] **Step 3: Import `renderTransferForm` and wire the button's click handler**

At the top of `js/items.js`, find:

```javascript
// js/items.js
import { escapeHtml } from './schools.js';
```

Replace it with:

```javascript
// js/items.js
import { escapeHtml } from './schools.js';
import { renderTransferForm } from './transfers.js';
```

Then find this block (the end of `renderItemsSection`, right after the `retire-item-btn` listeners
are wired):

```javascript
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
```

Immediately after it, add:

```javascript
  container.querySelectorAll('.transfer-material-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const name = btn.dataset.material;
      const area = container.querySelector(`.transfer-form-area[data-material="${CSS.escape(name)}"]`);
      if (area.innerHTML) {
        area.innerHTML = '';
        return;
      }
      const idsForMaterial = byMaterial.get(name).map(i => i.id);
      renderTransferForm(area, {
        api,
        location,
        materialName: name,
        itemIds: idsForMaterial,
        destinations: ctx.allLocations.filter(l => l.id !== location.id),
        onChange,
      });
    });
  });
```

- [ ] **Step 4: Thread `allLocations` into `ctx`**

`renderItemsSection`'s destructuring line currently reads:

```javascript
  const { api, location, materials, items, isAdmin, onChange } = ctx;
```

Replace it with:

```javascript
  const { api, location, materials, items, isAdmin, onChange, allLocations } = ctx;
```

- [ ] **Step 5: Pass `allLocations` from `js/schools.js`'s call site**

Find this block in `js/schools.js` (inside `openDetailModal`):

```javascript
    renderItemsSection(document.getElementById('itemsSection'), {
      api, location: s, materials, items, isAdmin,
      onChange: async () => {
        await refresh();
        const refreshed = isWarehouse ? computeWarehouse() : computeSchools().find(sch => sch.id === s.id);
        if (refreshed) openDetailModal(refreshed);
      },
    });
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
```

(`locations` here is `js/schools.js`'s existing module-level array populated by `refresh()` — the
same one `computeSchools()`/`computeWarehouse()` already read from.)

- [ ] **Step 6: Run existing tests to confirm nothing broke**

Run: `npm test`
Expected: still `tests 24`, `pass 24`, `fail 0` — this task touches no tested files
(`js/transfers.js` and `js/items.js` have no automated tests, and `js/api.js`/`tests/api.test.js`
are untouched by this task).

- [ ] **Step 7: USER ACTION — verify direct transfer end-to-end**

Serve the site locally (`npx http-server -p 8080 .`) and log in as admin. Add at least two items of
the same material to the Warehouse (via the existing "+ Add item" form from Plan 2) if none exist
yet. Open the Warehouse's detail modal, click "Transfer" next to that material's line. Expected: a
form appears with a checkbox per item id, a destination dropdown listing every location except
Warehouse, and a disabled "Transfer" button.

Check one item, pick a school as the destination, click "Transfer". Expected: the modal refreshes,
the checked item no longer appears under Warehouse's manifest for that material, and opening the
destination school's modal shows it under the same material there. The Warehouse card's and the
destination school's card's unit counts update accordingly once the modal is closed.

Open the Warehouse modal again, click "Transfer" on a material with a remaining item, check it,
but before submitting — in a second browser tab, log in as admin and retire or transfer that same
item away. Back in the first tab, submit the transfer. Expected: an inline error naming the item id
appears ("Could not transfer: item(s) not available at expected location: ..."), and no movement is
recorded (the item's location in the second tab's view is unaffected by the failed attempt in the
first).

- [ ] **Step 8: Commit**

```bash
git add js/transfers.js js/items.js js/schools.js
git commit -m "feat: add admin direct transfer via js/transfers.js"
```

---

### Task 4: Viewer request submission

**Files:**
- Create: `js/requests.js` (viewer-facing export only — Task 5 adds the admin-facing export to
  this same file)
- Modify: `js/schools.js`
- Modify: `js/main.js`

**Interfaces:**
- Consumes: `api` (Task 2), a `location` object, `materials` array, and `myRequests` array (a
  pre-filtered subset of `requests` rows — filtering by `location_id`/`requested_by` is the
  caller's job, matching the "caller passes exactly what's needed" shape `renderItemsSection`
  already established).
- Produces: `renderRequestSection(container, ctx)` where
  `ctx = { api, location, materials, myRequests, onChange }`. `js/schools.js` (this task) is the
  only consumer in this plan; Task 5 does not import this function.

- [ ] **Step 1: Write `js/requests.js` (viewer-facing part)**

```javascript
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
```

- [ ] **Step 2: Wire the viewer request form into `js/schools.js`**

Add the import at the top of `js/schools.js`. Find:

```javascript
// js/schools.js
import { renderItemsSection } from './items.js';
```

Replace it with:

```javascript
// js/schools.js
import { renderItemsSection } from './items.js';
import { renderRequestSection } from './requests.js';
```

- [ ] **Step 3: Add `requests` and `currentUserId` state**

Find:

```javascript
export function createSchoolsView({ api }) {
  let locations = [];
  let materials = [];
  let items = [];
  let isAdmin = false;
  const state = { tier: 'ALL', material: null, query: '' };
```

Replace it with:

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

- [ ] **Step 4: Fetch `requests` in `refresh()`**

Find:

```javascript
  async function refresh() {
    [locations, materials, items] = await Promise.all([
      api.listLocations(),
      api.listMaterials(),
      api.listItems(),
    ]);
    document.getElementById('addSchoolBtn').style.display = isAdmin ? '' : 'none';
    renderAll();
  }
```

Replace it with:

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

- [ ] **Step 5: Accept `userId` in `loadAndRender`**

Find:

```javascript
  async function loadAndRender(adminFlag) {
    isAdmin = adminFlag;
    try {
      await refresh();
    } catch (err) {
      showLoadError(err);
    }
  }
```

Replace it with:

```javascript
  async function loadAndRender(adminFlag, userId) {
    isAdmin = adminFlag;
    currentUserId = userId;
    try {
      await refresh();
    } catch (err) {
      showLoadError(err);
    }
  }
```

- [ ] **Step 6: Reset `requests`/`currentUserId` in `clear()`**

Find:

```javascript
  function clear() {
    isAdmin = false;
    locations = [];
    materials = [];
    items = [];
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
```

- [ ] **Step 7: Render the request section in `openDetailModal`**

Find:

```javascript
      <div class="manifest-title">Material manifest</div>
      <div id="itemsSection"></div>
      ${isWarehouse ? '' : `
        <div class="proposal-box">
          <div class="l">Notes</div>
          <div>${s.notes ? escapeHtml(s.notes) : 'No notes recorded.'}</div>
        </div>
      `}
      ${(!isWarehouse && isAdmin) ? '<button id="editSchoolBtn" class="chip" style="margin-top:16px;">Edit school</button>' : ''}
    `;
    document.getElementById('overlay').classList.add('open');
    document.getElementById('modalCloseBtn').addEventListener('click', closeModal);
    renderItemsSection(document.getElementById('itemsSection'), {
      api, location: s, materials, items, isAdmin, allLocations: locations,
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

Replace it with:

```javascript
      <div class="manifest-title">Material manifest</div>
      <div id="itemsSection"></div>
      ${(!isWarehouse && !isAdmin) ? `
        <div class="manifest-title">Request materials</div>
        <div id="modalRequestsSection"></div>
      ` : ''}
      ${isWarehouse ? '' : `
        <div class="proposal-box">
          <div class="l">Notes</div>
          <div>${s.notes ? escapeHtml(s.notes) : 'No notes recorded.'}</div>
        </div>
      `}
      ${(!isWarehouse && isAdmin) ? '<button id="editSchoolBtn" class="chip" style="margin-top:16px;">Edit school</button>' : ''}
    `;
    document.getElementById('overlay').classList.add('open');
    document.getElementById('modalCloseBtn').addEventListener('click', closeModal);
    renderItemsSection(document.getElementById('itemsSection'), {
      api, location: s, materials, items, isAdmin, allLocations: locations,
      onChange: async () => {
        await refresh();
        const refreshed = isWarehouse ? computeWarehouse() : computeSchools().find(sch => sch.id === s.id);
        if (refreshed) openDetailModal(refreshed);
      },
    });
    if (!isWarehouse && !isAdmin) {
      const myRequests = requests.filter(r => r.location_id === s.id && r.requested_by === currentUserId);
      renderRequestSection(document.getElementById('modalRequestsSection'), {
        api, location: s, materials, myRequests,
        onChange: async () => {
          await refresh();
          const refreshed = computeSchools().find(sch => sch.id === s.id);
          if (refreshed) openDetailModal(refreshed);
        },
      });
    }
    if (!isWarehouse && isAdmin) {
      document.getElementById('editSchoolBtn').addEventListener('click', () => openSchoolForm(s));
    }
  }
```

- [ ] **Step 8: Pass the current user's id from `js/main.js`**

Find:

```javascript
      await schoolsView.loadAndRender(profile.role === 'admin');
```

Replace it with:

```javascript
      await schoolsView.loadAndRender(profile.role === 'admin', profile.id);
```

- [ ] **Step 9: Run existing tests to confirm nothing broke**

Run: `npm test`
Expected: still `tests 24`, `pass 24`, `fail 0`.

- [ ] **Step 10: USER ACTION — verify viewer request submission end-to-end**

Serve the site locally, log in as the viewer test account. Open a school's detail modal (not the
Warehouse's — confirm the Warehouse modal has no "Request materials" section at all). Expected: a
"Request materials" form appears below the item manifest.

Submit a request for an existing material (use the datalist), quantity 2, with a note. Expected:
the form clears/the modal refreshes and shows "Material ×2 — pending" above the form. Close and
reopen the modal — the pending request is still listed.

Log in as admin, open the same school's modal. Expected: no "Request materials" section appears at
all for admin (matches the design: admins use direct transfer instead).

- [ ] **Step 11: Commit**

```bash
git add js/requests.js js/schools.js js/main.js
git commit -m "feat: add viewer material request submission"
```

---

### Task 5: Admin approval queue

**Files:**
- Modify: `js/requests.js` (adds the admin-facing export)
- Modify: `js/schools.js` (exports `refresh` so cross-view stock updates can trigger it)
- Modify: `index.html`
- Modify: `js/main.js`

**Interfaces:**
- Consumes: `api` (Task 2), and `onStockChange` — an async callback invoked after a successful
  approval (which moves stock), so the dashboard's own view (`schoolsView`'s stats/warehouse
  card/school grid) can refresh itself. Without this, approving a request from the Requests
  section would leave the rest of the dashboard showing stale counts until something else
  happened to trigger `schoolsView.refresh()`.
- Produces: `createRequestsView({ api, onStockChange })` returning
  `{ loadAndRender(isAdmin, userId), clear() }` — same shape as `createSchoolsView`. Constructed
  and wired in `js/main.js` alongside `schoolsView`.

- [ ] **Step 1: Export `refresh` from `js/schools.js`**

`schoolsView`'s `refresh()` is currently an internal closure function, not part of the object
`createSchoolsView` returns. `js/main.js` needs to call it directly after a stock-changing action
happens in the separate Requests view. Find:

```javascript
  return { loadAndRender, clear };
}
```

(this is the last block in `js/schools.js`, the return statement closing `createSchoolsView`).
Replace it with:

```javascript
  return { loadAndRender, clear, refresh };
}
```

- [ ] **Step 2: Add the admin-facing section to `index.html`**

Find this block in `index.html` (between the "School manifest" section and the footer):

```html
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
```

Replace it with:

```html
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

<section id="requestsSectionWrap" style="display:none;">
  <div class="section-head">
    <h2>Requests</h2>
    <div class="tag">pending material requests</div>
  </div>
  <div id="requestsSection"></div>
</section>

<footer>
```

- [ ] **Step 3: Add the admin-facing part to `js/requests.js`**

Append this to the end of `js/requests.js` (after the `renderRequestSection` function from Task 4):

```javascript
function renderApproveForm(container, req, ctx) {
  const { api, locations, materials, items, onChange } = ctx;
  const material = materials.find(m => m.id === req.material_id);
  const materialName = material ? material.name : 'Unknown material';
  const requestingSchool = locations.find(l => l.id === req.location_id);
  const availableItems = items.filter(i => i.material_id === req.material_id && !i.retired);
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

export function createRequestsView({ api, onStockChange }) {
  let requests = [];
  let locations = [];
  let materials = [];
  let items = [];
  let currentUserId = null;

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
    const requesterEmail = req.profiles ? req.profiles.email : null;
    row.innerHTML = `
      <div class="cname">${escapeHtml(materialName(req.material_id))} ×${req.quantity} — ${escapeHtml(locationName(req.location_id))}</div>
      <div class="metaline">Requested by ${escapeHtml(requesterEmail || 'unknown')} · ${new Date(req.created_at).toLocaleDateString()}</div>
      ${req.note ? `<div class="metaline">Note: ${escapeHtml(req.note)}</div>` : ''}
      <div class="approve-area" style="margin-top:10px;"></div>
      <button type="button" class="chip deny-btn" style="margin-top:10px;">Deny</button>
    `;
    renderApproveForm(row.querySelector('.approve-area'), req, {
      api, locations, materials, items,
      onChange: async () => {
        await refresh();
        await onStockChange();
      },
    });
    row.querySelector('.deny-btn').addEventListener('click', async () => {
      if (!confirm('Deny this request?')) return;
      try {
        await api.updateRequest(req.id, {
          status: 'denied',
          resolved_by: currentUserId,
          resolved_at: new Date().toISOString(),
        });
        await refresh();
      } catch (err) {
        alert('Could not deny: ' + err.message);
      }
    });
    return row;
  }

  function renderResolvedRow(req) {
    const row = document.createElement('div');
    row.className = 'card';
    const requesterEmail = req.profiles ? req.profiles.email : null;
    row.innerHTML = `
      <div class="cname">${escapeHtml(materialName(req.material_id))} ×${req.quantity} — ${escapeHtml(locationName(req.location_id))}</div>
      <div class="metaline">${req.status === 'approved' ? 'Approved' : 'Denied'} · requested by ${escapeHtml(requesterEmail || 'unknown')}</div>
    `;
    return row;
  }

  function renderAll() {
    const container = document.getElementById('requestsSection');
    const pending = requests.filter(r => r.status === 'pending')
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    const resolved = requests.filter(r => r.status !== 'pending')
      .sort((a, b) => new Date(b.resolved_at) - new Date(a.resolved_at))
      .slice(0, 10);
    container.innerHTML = '';
    if (pending.length === 0) {
      const note = document.createElement('div');
      note.className = 'empty-note';
      note.textContent = 'No pending requests.';
      container.appendChild(note);
    } else {
      pending.forEach(req => container.appendChild(renderPendingRow(req)));
    }
    if (resolved.length > 0) {
      const heading = document.createElement('div');
      heading.className = 'manifest-title';
      heading.textContent = 'Recently resolved';
      container.appendChild(heading);
      resolved.forEach(req => container.appendChild(renderResolvedRow(req)));
    }
  }

  async function refresh() {
    [requests, locations, materials, items] = await Promise.all([
      api.listRequests(),
      api.listLocations(),
      api.listMaterials(),
      api.listItems(),
    ]);
    renderAll();
  }

  async function loadAndRender(isAdminFlag, userId) {
    currentUserId = userId;
    const wrap = document.getElementById('requestsSectionWrap');
    if (!isAdminFlag) {
      wrap.style.display = 'none';
      return;
    }
    wrap.style.display = '';
    try {
      await refresh();
    } catch (err) {
      document.getElementById('requestsSection').innerHTML =
        `<div class="empty-note">Could not load requests: ${escapeHtml(err.message)}</div>`;
    }
  }

  function clear() {
    requests = [];
    locations = [];
    materials = [];
    items = [];
    currentUserId = null;
    document.getElementById('requestsSectionWrap').style.display = 'none';
  }

  return { loadAndRender, clear };
}
```

- [ ] **Step 4: Wire `requestsView` into `js/main.js`**

Find:

```javascript
import { createSchoolsView } from './schools.js';

const auth = createAuthModule(supabase);
const api = createApi(supabase);
const schoolsView = createSchoolsView({ api });
schoolsView.clear();
```

Replace it with:

```javascript
import { createSchoolsView } from './schools.js';
import { createRequestsView } from './requests.js';

const auth = createAuthModule(supabase);
const api = createApi(supabase);
const schoolsView = createSchoolsView({ api });
const requestsView = createRequestsView({ api, onStockChange: () => schoolsView.refresh() });
schoolsView.clear();
requestsView.clear();
```

Then find:

```javascript
      await schoolsView.loadAndRender(profile.role === 'admin', profile.id);
    } else {
      setAuthStatus('Not logged in.', 'idle');
      loginForm.style.display = '';
      logoutBtn.style.display = 'none';
      schoolsView.clear();
    }
```

Replace it with:

```javascript
      await schoolsView.loadAndRender(profile.role === 'admin', profile.id);
      await requestsView.loadAndRender(profile.role === 'admin', profile.id);
    } else {
      setAuthStatus('Not logged in.', 'idle');
      loginForm.style.display = '';
      logoutBtn.style.display = 'none';
      schoolsView.clear();
      requestsView.clear();
    }
```

- [ ] **Step 5: Run existing tests to confirm nothing broke**

Run: `npm test`
Expected: still `tests 24`, `pass 24`, `fail 0`.

- [ ] **Step 6: USER ACTION — verify the approval queue end-to-end**

Serve the site locally. As the viewer test account, submit a request for a material that has stock
in the Warehouse (from Task 4's verification, or add one now). Log out, log in as admin.

Expected: a new "Requests" section appears on the dashboard (below "School manifest") showing the
pending request with the requester's email, material, quantity, and note. Expand it — an "Approve"
area lists the Warehouse's available items of that material (grouped under a "Warehouse" heading),
with the "Approve" button disabled until at least one is checked.

Before approving, note the "Units deployed" stat in the hero section and the Warehouse card's
"units in stock" count. Check one item, click "Approve". Expected: the request disappears from the
pending list and reappears under "Recently resolved" as "Approved"; the requesting school's
manifest now shows that item; **without reloading the page**, the Warehouse card's unit count and
the hero "Units deployed" stat both update to reflect the move — this confirms `onStockChange`
correctly refreshes `schoolsView` from the separate Requests section.

Submit a second request as the viewer, log back in as admin, and click "Deny" on it (confirm the
dialog). Expected: it moves to "Recently resolved" as "Denied", no stock changes anywhere.

Log in as the viewer test account (not admin). Expected: no "Requests" section appears anywhere on
the dashboard.

- [ ] **Step 7: Commit**

```bash
git add js/requests.js js/schools.js index.html js/main.js
git commit -m "feat: add admin request approval queue"
```

---

## What this plan does not cover

Movement/request history views (per-item and per-school timelines reading the `movements` table)
are Plan 4. Viewers cancelling their own pending requests is not in scope — not part of the
original design, can be added later without a schema change if needed. Restricting a viewer's
visibility to one "home" school remains out of scope, same as it has been since Plan 1.
