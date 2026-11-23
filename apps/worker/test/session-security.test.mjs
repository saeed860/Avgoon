import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SignJWT, jwtVerify } from 'jose';

const here = fileURLToPath(new URL('.', import.meta.url));
const worker = readFileSync(resolve(here, '../src/index.ts'), 'utf8');
const admin = readFileSync(resolve(here, '../../../docs/admin.html'), 'utf8');

test('API issues short-lived JWTs bound to the Avgoon issuer and audience', async () => {
  assert.match(worker, /setIssuer\('avgoon-api'\)/);
  assert.match(worker, /setAudience\('avgoon-web'\)/);
  assert.match(worker, /setExpirationTime\('12h'\)/);
  assert.equal((worker.match(/issuer:'avgoon-api',audience:'avgoon-web'/g) || []).length, 2);

  const key = new TextEncoder().encode('test-secret-with-enough-entropy-for-jwt');
  const token = await new SignJWT({ role: 'CUSTOMER' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject('test-user')
    .setIssuer('avgoon-api')
    .setAudience('avgoon-web')
    .setIssuedAt()
    .setExpirationTime('12h')
    .sign(key);
  const verified = await jwtVerify(token, key, { issuer: 'avgoon-api', audience: 'avgoon-web' });
  assert.equal(verified.payload.sub, 'test-user');
  await assert.rejects(jwtVerify(token, key, { issuer: 'untrusted-issuer', audience: 'avgoon-web' }));
  await assert.rejects(jwtVerify(token, key, { issuer: 'avgoon-api', audience: 'other-app' }));
});

test('admin clears expired sessions and exposes an explicit logout action', () => {
  assert.match(admin, /r\.status===401\)\{localStorage\.removeItem\('avgoon_session'\)/);
  assert.match(admin, /function logoutAdmin\(\)\{localStorage\.removeItem\('avgoon_session'\);location\.replace\('index\.html'\)\}/);
  assert.match(admin, /onclick="logoutAdmin\(\)"/);
  assert.match(admin, /catch\{localStorage\.removeItem\('avgoon_session'\);return null\}/);
});
