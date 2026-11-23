import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const storefront = readFileSync(resolve(here, '../../../docs/js/storefront.js'), 'utf8');

test('storefront safely clears malformed persisted sessions', () => {
  assert.match(storefront, /function readAccountSession\(\)\{try\{return JSON\.parse\(localStorage\.getItem\('avgoon_session'\)\|\|'null'\)\}catch\{localStorage\.removeItem\('avgoon_session'\);return null\}\}/);
  assert.match(storefront, /accountSession=readAccountSession\(\)/);
});

test('storefront clears expired sessions on protected account and checkout requests', () => {
  assert.match(storefront, /if\(r\.status===401\)\{clearExpiredAccountSession\(\);return\}/);
  assert.match(storefront, /if\(r\.status===401\)\{clearExpiredAccountSession\(\);throw Error\('نشست شما منقضی شده است؛ دوباره وارد شوید.'\)\}/);
  assert.match(storefront, /function clearExpiredAccountSession\(/);
});
