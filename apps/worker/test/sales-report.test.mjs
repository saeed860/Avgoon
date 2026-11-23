import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const worker = await readFile(new URL('../src/index.ts', import.meta.url), 'utf8');
const page = await readFile(new URL('../../../docs/sales-report.html', import.meta.url), 'utf8');
const script = await readFile(new URL('../../../docs/js/sales-report.js', import.meta.url), 'utf8');

test('sales report route is behind the admin authentication middleware', () => {
  const guard = worker.indexOf("app.use('/api/admin/*',requireAdmin)");
  const route = worker.indexOf("app.get('/api/admin/reports/sales'");
  assert.notEqual(guard, -1);
  assert.notEqual(route, -1);
  assert.ok(guard < route);
});

test('sales report validates exact calendar dates and caps the requested range', () => {
  const route = worker.slice(worker.indexOf("app.get('/api/admin/reports/sales'"), worker.indexOf("app.get('/api/admin/products'"));
  assert.match(route, /\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$/);
  assert.match(route, /parsed\.toISOString\(\)\.slice\(0,10\)===value/);
  assert.match(route, /span>366/);
});

test('sales report uses bound date parameters and separates paid, pending and cancelled orders', () => {
  const route = worker.slice(worker.indexOf("app.get('/api/admin/reports/sales'"), worker.indexOf("app.get('/api/admin/products'"));
  assert.match(route, /date\(createdAt\)>=date\(\?\) AND date\(createdAt\)<=date\(\?\)/);
  assert.match(route, /PAID','PROCESSING','SHIPPED','COMPLETED/);
  assert.match(route, /status='PENDING'/);
  assert.match(route, /status='CANCELLED'/);
  assert.match(route, /GROUP BY status/);
});

test('report page requires an existing session and provides CSV export', () => {
  assert.match(page, /noindex,nofollow/);
  assert.match(page, /js\/sales-report\.js/);
  assert.match(script, /Authorization:'Bearer '\+\(session\?\.token\|\|''\)/);
  assert.match(script, /textContent=/);
  assert.match(script, /text\/csv;charset=utf-8/);
  assert.match(script, /revokeObjectURL/);
});
