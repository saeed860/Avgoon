import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const here = dirname(fileURLToPath(import.meta.url));
const migrationDir = resolve(here, '../migrations');
const migrations = [
  '0001_initial.sql',
  '0002_checkout_inventory.sql',
  '0003_order_request_hash.sql',
  '0004_cancelled_order_stock_restore.sql'
];

function fixture({ stock = 10, published = 1 } = {}) {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  for (const file of migrations) db.exec(readFileSync(resolve(migrationDir, file), 'utf8'));
  db.prepare("INSERT INTO User(id,name,email,role,createdAt) VALUES('u1','Test','test@example.invalid','CUSTOMER',datetime('now'))").run();
  db.prepare("INSERT INTO Product(id,sku,name,slug,priceToman,stock,isPublished,createdAt,updatedAt) VALUES('p1','SKU-1','Panel','panel','125000',?, ?,datetime('now'),datetime('now'))").run(stock, published);
  return db;
}

function insertOrder(db, id = 'o1', key = 'u1:checkout-key-001') {
  db.prepare('INSERT INTO "Order"(id,userId,status,totalToman,createdAt,idempotencyKey,requestHash) VALUES(?,?,\'PENDING\',?,?,?,?)')
    .run(id, 'u1', '250000', new Date().toISOString(), key, 'request-hash');
}

test('checkout reserves stock once for each inserted order item', () => {
  const db = fixture({ stock: 10 });
  insertOrder(db);
  db.prepare('INSERT INTO OrderItem(id,orderId,productId,quantity,unitPriceToman) VALUES(?,?,?,?,?)')
    .run('i1', 'o1', 'p1', 3, '125000');
  assert.equal(db.prepare("SELECT stock FROM Product WHERE id='p1'").get().stock, 7);
  db.close();
});

test('a failed multi-item checkout rolls back the order and every stock change', () => {
  const db = fixture({ stock: 4 });
  db.prepare("INSERT INTO Product(id,sku,name,slug,priceToman,stock,isPublished,createdAt,updatedAt) VALUES('p2','SKU-2','Board','board','50000',1,1,datetime('now'),datetime('now'))").run();
  db.exec('BEGIN');
  try {
    insertOrder(db);
    db.prepare('INSERT INTO OrderItem(id,orderId,productId,quantity,unitPriceToman) VALUES(?,?,?,?,?)')
      .run('i1', 'o1', 'p1', 2, '125000');
    db.prepare('INSERT INTO OrderItem(id,orderId,productId,quantity,unitPriceToman) VALUES(?,?,?,?,?)')
      .run('i2', 'o1', 'p2', 2, '50000');
    db.exec('COMMIT');
  } catch {
    db.exec('ROLLBACK');
  }
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM "Order"').get().n, 0);
  assert.equal(db.prepare("SELECT stock FROM Product WHERE id='p1'").get().stock, 4);
  assert.equal(db.prepare("SELECT stock FROM Product WHERE id='p2'").get().stock, 1);
  db.close();
});

test('cancelling an eligible order restores reserved stock exactly once', () => {
  const db = fixture({ stock: 10 });
  insertOrder(db);
  db.prepare('INSERT INTO OrderItem(id,orderId,productId,quantity,unitPriceToman) VALUES(?,?,?,?,?)')
    .run('i1', 'o1', 'p1', 4, '125000');
  assert.equal(db.prepare("SELECT stock FROM Product WHERE id='p1'").get().stock, 6);
  db.prepare('UPDATE "Order" SET status=? WHERE id=?').run('CANCELLED', 'o1');
  assert.equal(db.prepare("SELECT stock FROM Product WHERE id='p1'").get().stock, 10);
  db.prepare('UPDATE "Order" SET status=? WHERE id=?').run('CANCELLED', 'o1');
  assert.equal(db.prepare("SELECT stock FROM Product WHERE id='p1'").get().stock, 10);
  db.close();
});

test('database rejects unlisted products, insufficient stock, and non-positive quantities', () => {
  const unpublished = fixture({ stock: 10, published: 0 });
  insertOrder(unpublished);
  assert.throws(() => unpublished.prepare('INSERT INTO OrderItem(id,orderId,productId,quantity,unitPriceToman) VALUES(?,?,?,?,?)')
    .run('i1', 'o1', 'p1', 1, '125000'), /INSUFFICIENT_STOCK/);
  unpublished.close();

  const insufficient = fixture({ stock: 1 });
  insertOrder(insufficient);
  assert.throws(() => insufficient.prepare('INSERT INTO OrderItem(id,orderId,productId,quantity,unitPriceToman) VALUES(?,?,?,?,?)')
    .run('i1', 'o1', 'p1', 2, '125000'), /INSUFFICIENT_STOCK/);
  assert.throws(() => insufficient.prepare('INSERT INTO OrderItem(id,orderId,productId,quantity,unitPriceToman) VALUES(?,?,?,?,?)')
    .run('i2', 'o1', 'p1', 0, '125000'), /INVALID_QUANTITY/);
  insufficient.close();
});

test('idempotency keys cannot be reused for a second order', () => {
  const db = fixture();
  insertOrder(db);
  assert.throws(() => insertOrder(db, 'o2'), /UNIQUE constraint failed/);
  db.close();
});
