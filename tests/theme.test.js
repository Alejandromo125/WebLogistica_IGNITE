// tests/theme.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getInitialTheme } from '../js/theme.js';

test('getInitialTheme returns light when stored value is exactly "light"', () => {
  assert.equal(getInitialTheme('light'), 'light');
});

test('getInitialTheme returns dark when stored value is "dark"', () => {
  assert.equal(getInitialTheme('dark'), 'dark');
});

test('getInitialTheme returns dark for null (no stored preference)', () => {
  assert.equal(getInitialTheme(null), 'dark');
});

test('getInitialTheme returns dark for an empty string', () => {
  assert.equal(getInitialTheme(''), 'dark');
});

test('getInitialTheme returns dark for garbage input', () => {
  assert.equal(getInitialTheme('sepia'), 'dark');
});
