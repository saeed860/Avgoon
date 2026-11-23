import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const worker = await readFile(new URL('../src/index.ts', import.meta.url), 'utf8');
const migration = await readFile(new URL('../migrations/0010_user_profile_addresses.sql', import.meta.url), 'utf8');
const storefront = await readFile(new URL('../../../docs/js/storefront.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../../../docs/index.html', import.meta.url), 'utf8');

test('profile and address routes require an authenticated user', () => {
  for (const route of [
    "app.get('/api/me',requireUser",
    "app.patch('/api/me',requireUser",
    "app.post('/api/me/addresses',requireUser",
    "app.patch('/api/me/addresses/:id',requireUser",
    "app.post('/api/me/addresses/:id/default',requireUser",
    "app.delete('/api/me/addresses/:id',requireUser"
  ]) assert.ok(worker.includes(route), 'missing authenticated route: '+route);
});

test('address mutations are scoped to the authenticated owner', () => {
  assert.match(worker, /WHERE id=\? AND userId=\?/);
  assert.match(worker, /WHERE userId=\? AND isDefault=1/);
});

test('address migration enforces ownership, cascade deletion and one default address', () => {
  assert.match(migration, /REFERENCES User\(id\) ON DELETE CASCADE/);
  assert.match(migration, /WHERE isDefault = 1/);
  const py = [
    'import sqlite3,sys',
    'db=sqlite3.connect(":memory:")',
    'db.execute("PRAGMA foreign_keys=ON")',
    'db.executescript(open(sys.argv[1],encoding="utf-8").read())',
    'db.executescript(open(sys.argv[2],encoding="utf-8").read())',
    'db.execute("INSERT INTO User(id,createdAt) VALUES(?,?)",("u1","2026-01-01T00:00:00Z"))',
    'base=("u1","گیرنده","09120000000","تهران","تهران","1234567890","نشانی معتبر برای آزمون")',
    'db.execute("INSERT INTO Address(id,userId,recipientName,phone,province,city,postalCode,address,isDefault,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?,?,1,?,?)",("a1",)+base+("2026-01-01","2026-01-01"))',
    'try:',
    ' db.execute("INSERT INTO Address(id,userId,recipientName,phone,province,city,postalCode,address,isDefault,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?,?,1,?,?)",("a2",)+base+("2026-01-02","2026-01-02"))',
    ' raise AssertionError("second default address was accepted")',
    'except sqlite3.IntegrityError: pass',
    'db.execute("UPDATE Address SET isDefault=0 WHERE id=\'a1\'")',
    'db.execute("INSERT INTO Address(id,userId,recipientName,phone,province,city,postalCode,address,isDefault,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?,?,1,?,?)",("a2",)+base+("2026-01-02","2026-01-02"))',
    'assert db.execute("SELECT COUNT(*) FROM Address WHERE userId=\'u1\' AND isDefault=1").fetchone()[0]==1',
    'db.execute("DELETE FROM User WHERE id=\'u1\'")',
    'assert db.execute("SELECT COUNT(*) FROM Address").fetchone()[0]==0'
  ].join('\n');
  const result = spawnSync('python3',['-c',py,new URL('../migrations/0001_initial.sql',import.meta.url).pathname,new URL('../migrations/0010_user_profile_addresses.sql',import.meta.url).pathname],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr||'SQLite migration test failed');
});

test('customer profile and address UI uses external script and safe text rendering', () => {
  for (const id of ['accountNameSave','addressForm','addressList','addressRecipient','addressPhone','addressProvince','addressCity','addressPostal','addressDetails']) assert.ok(html.includes('id="'+id+'"'));
  assert.match(storefront,/function loadMyAddresses\(\)/);
  assert.match(storefront,/detail\.textContent=/);
  assert.match(storefront,/function saveAddress\(event\)/);
  assert.match(storefront,/function deleteAddress\(id\)/);
});

test('storefront script has valid JavaScript syntax', () => {
  const result = spawnSync(process.execPath,['--check',new URL('../../../docs/js/storefront.js',import.meta.url).pathname],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr||'storefront script syntax check failed');
});
