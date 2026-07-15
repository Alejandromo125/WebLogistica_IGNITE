import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRoute } from '../js/router.js';

test('parseRoute returns overview for an empty hash', () => {
  assert.deepEqual(parseRoute(''), { name: 'overview', params: {} });
});

test('parseRoute returns overview for a bare "#"', () => {
  assert.deepEqual(parseRoute('#'), { name: 'overview', params: {} });
});

test('parseRoute recognizes #/overview', () => {
  assert.deepEqual(parseRoute('#/overview'), { name: 'overview', params: {} });
});

test('parseRoute recognizes #/schools', () => {
  assert.deepEqual(parseRoute('#/schools'), { name: 'schools', params: {} });
});

test('parseRoute recognizes #/requests', () => {
  assert.deepEqual(parseRoute('#/requests'), { name: 'requests', params: {} });
});

test('parseRoute recognizes #/locations/:id and extracts the id', () => {
  assert.deepEqual(parseRoute('#/locations/abc-123'), { name: 'location', params: { id: 'abc-123' } });
});

test('parseRoute falls back to overview for #/locations with no id', () => {
  assert.deepEqual(parseRoute('#/locations'), { name: 'overview', params: {} });
});

test('parseRoute falls back to overview for an unknown route', () => {
  assert.deepEqual(parseRoute('#/nonsense'), { name: 'overview', params: {} });
});
