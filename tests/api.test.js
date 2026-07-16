// tests/api.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApi } from '../js/api.js';

function makeFakeClient(responses) {
  const calls = [];
  return {
    calls,
    from(table) {
      const behavior = responses[table] || {};
      return {
        select(cols) {
          calls.push(['select', table, cols]);
          return {
            order(col) {
              calls.push(['order', table, col]);
              return Promise.resolve(behavior.selectOrder);
            },
            then(resolve, reject) {
              return Promise.resolve(behavior.select).then(resolve, reject);
            },
          };
        },
        insert(payload) {
          calls.push(['insert', table, payload]);
          return {
            select() {
              return {
                single() {
                  return Promise.resolve(behavior.insert);
                },
              };
            },
          };
        },
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
        delete() {
          calls.push(['delete', table]);
          return {
            eq(col, val) {
              calls.push(['eq', col, val]);
              return Promise.resolve(behavior.delete || { error: null });
            },
          };
        },
      };
    },
    rpc(fn, params) {
      calls.push(['rpc', fn, params]);
      return Promise.resolve(responses.rpc);
    },
  };
}

test('listLocations returns locations ordered by name', async () => {
  const rows = [{ id: '1', name: 'BSB Cast', type: 'school' }];
  const client = makeFakeClient({ locations: { selectOrder: { data: rows, error: null } } });
  const api = createApi(client);
  const result = await api.listLocations();
  assert.deepEqual(result, rows);
  assert.deepEqual(client.calls[0], ['select', 'locations', '*']);
  assert.deepEqual(client.calls[1], ['order', 'locations', 'name']);
});

test('listLocations throws with the Supabase error message on failure', async () => {
  const client = makeFakeClient({ locations: { selectOrder: { data: null, error: { message: 'boom' } } } });
  const api = createApi(client);
  await assert.rejects(() => api.listLocations(), (err) => { assert.equal(err.message, 'boom'); return true; });
});

test('createLocation inserts and returns the new row', async () => {
  const row = { id: '2', name: 'BSB Sitges', type: 'school' };
  const client = makeFakeClient({ locations: { insert: { data: row, error: null } } });
  const api = createApi(client);
  const result = await api.createLocation({ name: 'BSB Sitges', type: 'school' });
  assert.deepEqual(result, row);
  assert.deepEqual(client.calls[0], ['insert', 'locations', { name: 'BSB Sitges', type: 'school' }]);
});

test('createLocation throws with the Supabase error message on failure', async () => {
  const client = makeFakeClient({ locations: { insert: { data: null, error: { message: 'insert failed' } } } });
  const api = createApi(client);
  await assert.rejects(
    () => api.createLocation({ name: 'X', type: 'school' }),
    (err) => { assert.equal(err.message, 'insert failed'); return true; }
  );
});

test('updateLocation updates by id and returns the updated row', async () => {
  const row = { id: '2', name: 'BSB Sitges Updated', type: 'school' };
  const client = makeFakeClient({ locations: { update: { data: row, error: null } } });
  const api = createApi(client);
  const result = await api.updateLocation('2', { name: 'BSB Sitges Updated' });
  assert.deepEqual(result, row);
  assert.deepEqual(client.calls[0], ['update', 'locations', { name: 'BSB Sitges Updated' }]);
  assert.deepEqual(client.calls[1], ['eq', 'id', '2']);
});

test('listMaterials returns materials ordered by name', async () => {
  const rows = [{ id: 'm1', name: 'Robot Kit' }];
  const client = makeFakeClient({ materials: { selectOrder: { data: rows, error: null } } });
  const api = createApi(client);
  const result = await api.listMaterials();
  assert.deepEqual(result, rows);
});

test('createMaterial inserts by name and returns the new row', async () => {
  const row = { id: 'm2', name: 'Box' };
  const client = makeFakeClient({ materials: { insert: { data: row, error: null } } });
  const api = createApi(client);
  const result = await api.createMaterial('Box');
  assert.deepEqual(result, row);
  assert.deepEqual(client.calls[0], ['insert', 'materials', { name: 'Box' }]);
});

test('listItems returns all items', async () => {
  const rows = [{ id: 'R-101', material_id: 'm1', current_location_id: 'l1', retired: false }];
  const client = makeFakeClient({ items: { select: { data: rows, error: null } } });
  const api = createApi(client);
  const result = await api.listItems();
  assert.deepEqual(result, rows);
});

test('createItem inserts and returns the new row', async () => {
  const row = { id: 'R-102', material_id: 'm1', current_location_id: 'l1', retired: false };
  const client = makeFakeClient({ items: { insert: { data: row, error: null } } });
  const api = createApi(client);
  const result = await api.createItem({ id: 'R-102', material_id: 'm1', current_location_id: 'l1' });
  assert.deepEqual(result, row);
});

test('updateItem updates by id and returns the updated row (used for retiring)', async () => {
  const row = { id: 'R-102', material_id: 'm1', current_location_id: 'l1', retired: true };
  const client = makeFakeClient({ items: { update: { data: row, error: null } } });
  const api = createApi(client);
  const result = await api.updateItem('R-102', { retired: true });
  assert.deepEqual(result, row);
  assert.deepEqual(client.calls[0], ['update', 'items', { retired: true }]);
  assert.deepEqual(client.calls[1], ['eq', 'id', 'R-102']);
});

test('updateItem throws with the Supabase error message on failure', async () => {
  const client = makeFakeClient({ items: { update: { data: null, error: { message: 'update failed' } } } });
  const api = createApi(client);
  await assert.rejects(
    () => api.updateItem('R-102', { retired: true }),
    (err) => { assert.equal(err.message, 'update failed'); return true; }
  );
});

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

test('listFavorites returns the caller\'s favorite rows', async () => {
  const rows = [{ location_id: 'sch-1' }, { location_id: 'sch-2' }];
  const client = makeFakeClient({ favorites: { select: { data: rows, error: null } } });
  const api = createApi(client);
  const result = await api.listFavorites();
  assert.deepEqual(result, rows);
  assert.deepEqual(client.calls[0], ['select', 'favorites', 'location_id']);
});

test('listFavorites throws with the Supabase error message on failure', async () => {
  const client = makeFakeClient({ favorites: { select: { data: null, error: { message: 'boom' } } } });
  const api = createApi(client);
  await assert.rejects(() => api.listFavorites(), (err) => { assert.equal(err.message, 'boom'); return true; });
});

test('addFavorite inserts by location_id (profile_id defaults server-side) and returns the new row', async () => {
  const row = { profile_id: 'u1', location_id: 'sch-1', created_at: '2026-07-16T00:00:00Z' };
  const client = makeFakeClient({ favorites: { insert: { data: row, error: null } } });
  const api = createApi(client);
  const result = await api.addFavorite('sch-1');
  assert.deepEqual(result, row);
  assert.deepEqual(client.calls[0], ['insert', 'favorites', { location_id: 'sch-1' }]);
});

test('addFavorite throws with the Supabase error message on failure', async () => {
  const client = makeFakeClient({ favorites: { insert: { data: null, error: { message: 'duplicate key value' } } } });
  const api = createApi(client);
  await assert.rejects(
    () => api.addFavorite('sch-1'),
    (err) => { assert.equal(err.message, 'duplicate key value'); return true; }
  );
});

test('removeFavorite deletes by location_id', async () => {
  const client = makeFakeClient({ favorites: { delete: { error: null } } });
  const api = createApi(client);
  await api.removeFavorite('sch-1');
  assert.deepEqual(client.calls[0], ['delete', 'favorites']);
  assert.deepEqual(client.calls[1], ['eq', 'location_id', 'sch-1']);
});

test('removeFavorite throws with the Supabase error message on failure', async () => {
  const client = makeFakeClient({ favorites: { delete: { error: { message: 'boom' } } } });
  const api = createApi(client);
  await assert.rejects(() => api.removeFavorite('sch-1'), (err) => { assert.equal(err.message, 'boom'); return true; });
});
