PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS Address (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL REFERENCES User(id) ON DELETE CASCADE,
  recipientName TEXT NOT NULL,
  phone TEXT NOT NULL,
  province TEXT NOT NULL,
  city TEXT NOT NULL,
  postalCode TEXT NOT NULL,
  address TEXT NOT NULL,
  isDefault INTEGER NOT NULL DEFAULT 0 CHECK(isDefault IN (0,1)),
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS Address_userId_idx ON Address(userId);
CREATE UNIQUE INDEX IF NOT EXISTS Address_one_default_per_user_idx
  ON Address(userId) WHERE isDefault = 1;
