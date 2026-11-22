-- Idempotent checkout and inventory-safe order item insertion.
ALTER TABLE "Order" ADD COLUMN idempotencyKey TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS Order_idempotencyKey_uq ON "Order"(idempotencyKey) WHERE idempotencyKey IS NOT NULL;

CREATE TRIGGER IF NOT EXISTS OrderItem_validate_stock
BEFORE INSERT ON OrderItem
BEGIN
  SELECT CASE
    WHEN NEW.quantity <= 0 THEN RAISE(ABORT, 'INVALID_QUANTITY')
    WHEN NOT EXISTS (
      SELECT 1 FROM Product
      WHERE id = NEW.productId AND isPublished = 1 AND stock >= NEW.quantity
    ) THEN RAISE(ABORT, 'INSUFFICIENT_STOCK')
  END;
END;

CREATE TRIGGER IF NOT EXISTS OrderItem_decrement_stock
AFTER INSERT ON OrderItem
BEGIN
  UPDATE Product SET stock = stock - NEW.quantity, updatedAt = datetime('now')
  WHERE id = NEW.productId;
END;
