PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS User (
  id TEXT PRIMARY KEY, name TEXT, phone TEXT UNIQUE, email TEXT UNIQUE,
  role TEXT NOT NULL DEFAULT 'CUSTOMER' CHECK(role IN ('CUSTOMER','ADMIN')),
  createdAt TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS OtpCode (
  id TEXT PRIMARY KEY, target TEXT NOT NULL, channel TEXT NOT NULL, codeHash TEXT NOT NULL,
  expiresAt TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, consumedAt TEXT, createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS OtpCode_target_channel_createdAt_idx ON OtpCode(target,channel,createdAt);
CREATE TABLE IF NOT EXISTS Category (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE, description TEXT, createdAt TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS Product (
  id TEXT PRIMARY KEY, sku TEXT NOT NULL UNIQUE, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE,
  description TEXT, technicalSpecs TEXT, priceToman TEXT, stock INTEGER NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'عدد', imageUrl TEXT, brand TEXT, isPublished INTEGER NOT NULL DEFAULT 0,
  categoryId TEXT REFERENCES Category(id), createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS Product_name_idx ON Product(name);
CREATE INDEX IF NOT EXISTS Product_isPublished_idx ON Product(isPublished);
CREATE TABLE IF NOT EXISTS "Order" (
  id TEXT PRIMARY KEY, userId TEXT NOT NULL REFERENCES User(id), status TEXT NOT NULL DEFAULT 'PENDING'
  CHECK(status IN ('PENDING','PAID','PROCESSING','SHIPPED','COMPLETED','CANCELLED')),
  totalToman TEXT NOT NULL, address TEXT, note TEXT, createdAt TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS OrderItem (
  id TEXT PRIMARY KEY, orderId TEXT NOT NULL REFERENCES "Order"(id),
  productId TEXT NOT NULL REFERENCES Product(id), quantity INTEGER NOT NULL,
  unitPriceToman TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS Order_userId_idx ON "Order"(userId);
CREATE INDEX IF NOT EXISTS Order_createdAt_idx ON "Order"(createdAt);
