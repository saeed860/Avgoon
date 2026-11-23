import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const worker = await readFile(new URL('../src/index.ts', import.meta.url), 'utf8');
const migration = await readFile(new URL('../migrations/0011_address_map_coordinates.sql', import.meta.url), 'utf8');
const storefront = await readFile(new URL('../../../docs/js/storefront.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../../../docs/index.html', import.meta.url), 'utf8');
const headers = await readFile(new URL('../../../docs/_headers', import.meta.url), 'utf8');
const deployWorkflow = await readFile(new URL('../../../.github/workflows/worker-deploy.yml', import.meta.url), 'utf8');

test('address coordinate migration adds nullable, range-checked latitude and longitude', () => {
  assert.match(migration, /ADD COLUMN latitude REAL CHECK\(latitude IS NULL OR latitude BETWEEN -90 AND 90\)/);
  assert.match(migration, /ADD COLUMN longitude REAL CHECK\(longitude IS NULL OR longitude BETWEEN -180 AND 180\)/);
  const py = [
    'import sqlite3,sys',
    'db=sqlite3.connect(":memory:")',
    'db.execute("PRAGMA foreign_keys=ON")',
    'db.executescript(open(sys.argv[1],encoding="utf-8").read())',
    'db.executescript(open(sys.argv[2],encoding="utf-8").read())',
    'db.executescript(open(sys.argv[3],encoding="utf-8").read())',
    'db.execute("INSERT INTO User(id,createdAt) VALUES(?,?)",("u1","2026-01-01"))',
    'db.execute("INSERT INTO Address(id,userId,recipientName,phone,province,city,postalCode,address,latitude,longitude,isDefault,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",("a1","u1","گیرنده","09120000000","تهران","تهران","1234567890","نشانی معتبر برای آزمون",35.7,51.4,1,"now","now"))',
    'assert db.execute("SELECT latitude,longitude FROM Address WHERE id=\'a1\'").fetchone()==(35.7,51.4)',
    'try:',
    ' db.execute("UPDATE Address SET latitude=91 WHERE id=\'a1\'")',
    ' raise AssertionError("out-of-range latitude accepted")',
    'except sqlite3.IntegrityError: pass'
  ].join('\n');
  const result = spawnSync('python3',['-c',py,new URL('../migrations/0001_initial.sql',import.meta.url).pathname,new URL('../migrations/0010_user_profile_addresses.sql',import.meta.url).pathname,new URL('../migrations/0011_address_map_coordinates.sql',import.meta.url).pathname],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr||'map coordinate migration test failed');
});

test('address API validates phone numbers with optional plus prefix and coordinate pairing', () => {
  const phone = /^\+?[0-9]{10,15}$/;
  assert.equal(phone.test('09123456789'), true);
  assert.equal(phone.test('+4915123456789'), true);
  assert.equal(phone.test('09123 456789'), false);
  assert.ok(worker.includes("phone:z.string().trim().regex(/^\\+?[0-9]{10,15}$/"));
  assert.match(worker,/latitude:z\.number\(\)\.min\(-90\)\.max\(90\)\.nullable\(\)\.optional\(\)/);
  assert.match(worker,/longitude:z\.number\(\)\.min\(-180\)\.max\(180\)\.nullable\(\)\.optional\(\)/);
  assert.ok(worker.includes('v=>(v.latitude==null)===(v.longitude==null)'));
  assert.match(worker,/latitude,longitude,isDefault/);
});

test('account menu provides map click, device location, reverse lookup and saved coordinates', () => {
  for (const id of ['addressMap','addressLocate','addressMapLookup','addressMapClear','addressMapStatus']) assert.ok(html.includes('id="'+id+'"'));
  assert.match(storefront,/L\.tileLayer\('https:\/\/\{s\}\.tile\.openstreetmap\.org/);
  assert.match(storefront,/navigator\.geolocation\.getCurrentPosition/);
  assert.match(storefront,/nominatim\.openstreetmap\.org\/reverse/);
  assert.match(storefront,/latitude:selectedAddressPoint\?\.latitude/);
  assert.match(headers,/geolocation=\(self\)/);
  assert.match(headers,/https:\/\/nominatim\.openstreetmap\.org/);
});

test('storefront script passes JavaScript syntax check', () => {
  const result = spawnSync(process.execPath,['--check',new URL('../../../docs/js/storefront.js',import.meta.url).pathname],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr||'storefront script syntax check failed');
});

test('production deploy applies ordered D1 migrations before deploying the Worker', () => {
  const migration = deployWorkflow.indexOf('npm run db:migrate:remote');
  const deployment = deployWorkflow.indexOf('name: Deploy Worker to Cloudflare');
  assert.ok(migration >= 0 && deployment > migration);
});
