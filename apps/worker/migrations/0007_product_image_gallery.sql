CREATE TABLE IF NOT EXISTS ProductImage (
  id TEXT PRIMARY KEY,
  productId TEXT NOT NULL REFERENCES Product(id) ON DELETE CASCADE,
  url TEXT NOT NULL CHECK(url LIKE 'https://%'),
  alt TEXT,
  sortOrder INTEGER NOT NULL DEFAULT 0 CHECK(sortOrder >= 0),
  isPrimary INTEGER NOT NULL DEFAULT 0 CHECK(isPrimary IN (0,1)),
  createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ProductImage_product_sort_idx ON ProductImage(productId,sortOrder);
CREATE UNIQUE INDEX IF NOT EXISTS ProductImage_one_primary_idx ON ProductImage(productId) WHERE isPrimary=1;
INSERT INTO ProductImage(id,productId,url,alt,sortOrder,isPrimary,createdAt)
SELECT lower(hex(randomblob(16))),id,imageUrl,name,0,1,createdAt
FROM Product WHERE imageUrl IS NOT NULL AND imageUrl LIKE 'https://%'
  AND NOT EXISTS (SELECT 1 FROM ProductImage WHERE ProductImage.productId=Product.id);
