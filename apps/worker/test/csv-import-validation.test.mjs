import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidTomanPrice } from '../src/csv-import-validation.js';

test('accepts integer Toman prices from CSV', () => {
  assert.equal(isValidTomanPrice('125000'), true);
  assert.equal(isValidTomanPrice('0'), true);
});

test('rejects blank, decimal, signed, and non-numeric prices', () => {
  for (const value of ['', '12.5', '-10', '+10', '۱۲۳', 'abc']) {
    assert.equal(isValidTomanPrice(value), false, value);
  }
});
