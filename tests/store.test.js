import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../js/store.js';

function makeFakeApi(data) {
  return {
    listLocations: async () => data.locations,
    listMaterials: async () => data.materials,
    listItems: async () => data.items,
    listRequests: async () => data.requests,
    listMovements: async () => data.movements,
    listFavorites: async () => data.favorites,
  };
}

const sampleData = {
  locations: [
    { id: 'wh-mad', name: 'Warehouse Madrid', type: 'warehouse' },
    { id: 'wh-bcn', name: 'Warehouse Barcelona', type: 'warehouse' },
    { id: 'sch-1', name: 'BSB Cast', type: 'school', tier: 'Tier1', students: 200 },
    { id: 'sch-2', name: 'BSB Sitges', type: 'school', tier: 'Tier2', students: 150 },
    { id: 'per-1', name: 'Marc - Zona Nord', type: 'person' },
  ],
  materials: [{ id: 'm1', name: 'Robot Kit' }],
  items: [
    { id: 'R-1', material_id: 'm1', current_location_id: 'sch-1', retired: false },
    { id: 'R-2', material_id: 'm1', current_location_id: 'wh-mad', retired: false },
    { id: 'R-3', material_id: 'm1', current_location_id: 'wh-mad', retired: true },
    { id: 'R-4', material_id: 'm1', current_location_id: 'per-1', retired: false },
  ],
  requests: [],
  movements: [],
  favorites: [{ profile_id: 'admin1', location_id: 'sch-1' }],
};

test('refresh populates all six collections from the injected api', async () => {
  const store = createStore(makeFakeApi(sampleData));
  await store.refresh();
  assert.deepEqual(store.getLocations(), sampleData.locations);
  assert.deepEqual(store.getMaterials(), sampleData.materials);
  assert.deepEqual(store.getItems(), sampleData.items);
  assert.deepEqual(store.getFavorites(), sampleData.favorites);
});

test('clear empties all collections', async () => {
  const store = createStore(makeFakeApi(sampleData));
  await store.refresh();
  store.clear();
  assert.deepEqual(store.getLocations(), []);
  assert.deepEqual(store.getItems(), []);
  assert.deepEqual(store.getFavorites(), []);
});

test('computeSchools returns only school-type locations with computed material totals', async () => {
  const store = createStore(makeFakeApi(sampleData));
  await store.refresh();
  const schools = store.computeSchools();
  assert.equal(schools.length, 2);
  const cast = schools.find(s => s.id === 'sch-1');
  assert.equal(cast.totalUnits, 1);
  assert.deepEqual(cast.materials, [{ name: 'Robot Kit', ids: ['R-1'], count: 1 }]);
});

test('computeWarehouses returns both warehouses sorted by name, excluding retired items', async () => {
  const store = createStore(makeFakeApi(sampleData));
  await store.refresh();
  const warehouses = store.computeWarehouses();
  assert.equal(warehouses.length, 2);
  assert.deepEqual(warehouses.map(w => w.name), ['Warehouse Barcelona', 'Warehouse Madrid']);
  const madrid = warehouses.find(w => w.id === 'wh-mad');
  assert.equal(madrid.totalUnits, 1); // R-3 excluded because it's retired
});

test('computeTeam returns only person-type locations, sorted by name', async () => {
  const store = createStore(makeFakeApi(sampleData));
  await store.refresh();
  const team = store.computeTeam();
  assert.equal(team.length, 1);
  assert.equal(team[0].id, 'per-1');
  assert.equal(team[0].totalUnits, 1);
});

test('findLocationView returns null for an unknown id', async () => {
  const store = createStore(makeFakeApi(sampleData));
  await store.refresh();
  assert.equal(store.findLocationView('nope'), null);
});

test('findLocationView returns the computed view for a known id', async () => {
  const store = createStore(makeFakeApi(sampleData));
  await store.refresh();
  const view = store.findLocationView('sch-1');
  assert.equal(view.name, 'BSB Cast');
  assert.equal(view.totalUnits, 1);
});

test('isFavorite returns true for a favorited location', async () => {
  const store = createStore(makeFakeApi(sampleData));
  await store.refresh();
  assert.equal(store.isFavorite('sch-1'), true);
});

test('isFavorite returns false for a non-favorited location', async () => {
  const store = createStore(makeFakeApi(sampleData));
  await store.refresh();
  assert.equal(store.isFavorite('sch-2'), false);
});

test('isFavorite returns false before any refresh has happened', () => {
  const store = createStore(makeFakeApi(sampleData));
  assert.equal(store.isFavorite('sch-1'), false);
});
