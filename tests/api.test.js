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
