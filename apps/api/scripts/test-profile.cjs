const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const assert = require('node:assert/strict');

const prisma = new PrismaClient();
const port = Number(process.env.API_PORT || 4100);
const base = `http://127.0.0.1:${port}`;
const secret = process.env.JWT_SECRET;
if (!secret) throw new Error('JWT_SECRET is required for profile integration tests');

const server = spawn(process.execPath, ['dist/index.js'], {
  env: { ...process.env, API_PORT: String(port) },
  stdio: 'inherit'
});
const ids = [];

async function waitForServer() {
  for (let i = 0; i < 40; i++) {
    if (server.exitCode !== null) throw new Error('API server exited before becoming ready');
    try {
      const response = await fetch(base + '/api/health');
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error('API server did not become ready');
}

async function request(path, token, method = 'GET', body) {
  return fetch(base + path, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
}

async function main() {
  await waitForServer();
  const user = await prisma.user.create({
    data: { id: randomUUID(), name: 'Profile Test', phone: '+989120000001' }
  });
  const other = await prisma.user.create({
    data: { id: randomUUID(), name: 'Other Test', phone: '+989120000002' }
  });
  ids.push(user.id, other.id);
  const token = jwt.sign({ sub: user.id, role: user.role }, secret, { expiresIn: '5m' });
  const otherToken = jwt.sign({ sub: other.id, role: other.role }, secret, { expiresIn: '5m' });

  let response = await request('/api/me', null);
  assert.equal(response.status, 401, 'unauthenticated profile request must be rejected');

  response = await request('/api/me', token);
  assert.equal(response.status, 200);
  let payload = await response.json();
  assert.equal(payload.user.id, user.id);
  assert.deepEqual(payload.user.addresses, []);

  response = await request('/api/me', token, 'PATCH', { name: 'Profile Updated' });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).user.name, 'Profile Updated');

  const firstAddress = {
    recipientName: 'Test Recipient',
    phone: '09120000001',
    province: 'تهران',
    city: 'تهران',
    postalCode: '1234567890',
    address: 'نشانی آزمایشی معتبر برای تست',
    isDefault: false
  };
  response = await request('/api/me/addresses', token, 'POST', firstAddress);
  assert.equal(response.status, 201);
  const first = (await response.json()).address;
  assert.equal(first.isDefault, true, 'first address must become default');

  const secondAddress = { ...firstAddress, recipientName: 'Second Recipient', postalCode: '1234567891' };
  response = await request('/api/me/addresses', token, 'POST', secondAddress);
  assert.equal(response.status, 201);
  const second = (await response.json()).address;
  assert.equal(second.isDefault, false);

  response = await request(`/api/me/addresses/${second.id}/default`, token, 'POST');
  assert.equal(response.status, 200);
  payload = await (await request('/api/me', token)).json();
  assert.equal(payload.user.addresses.find(a => a.id === second.id).isDefault, true);
  assert.equal(payload.user.addresses.find(a => a.id === first.id).isDefault, false);

  response = await request(`/api/me/addresses/${first.id}`, otherToken, 'PATCH', firstAddress);
  assert.equal(response.status, 404, 'another user must not edit this address');
  response = await request(`/api/me/addresses/${first.id}`, otherToken, 'DELETE');
  assert.equal(response.status, 404, 'another user must not delete this address');

  response = await request(`/api/me/addresses/${second.id}`, token, 'PATCH', {
    ...secondAddress, recipientName: 'Edited Recipient', isDefault: true
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).address.recipientName, 'Edited Recipient');

  response = await request(`/api/me/addresses/${second.id}`, token, 'DELETE');
  assert.equal(response.status, 200);
  payload = await (await request('/api/me', token)).json();
  assert.equal(payload.user.addresses.length, 1);
  assert.equal(payload.user.addresses[0].id, first.id);
  assert.equal(payload.user.addresses[0].isDefault, true, 'deleting the default must promote a remaining address');

  response = await request('/api/me/addresses', token, 'POST', { ...firstAddress, postalCode: 'invalid' });
  assert.equal(response.status, 400, 'invalid postal code must be rejected');

  console.log('PASS: profile read/update, address CRUD, default selection/fallback, validation, and ownership isolation');
}

main()
  .catch(error => {
    console.error('FAIL: profile integration tests');
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (ids.length) await prisma.user.deleteMany({ where: { id: { in: ids } } }).catch(() => {});
    await prisma.$disconnect();
    server.kill('SIGTERM');
  });
