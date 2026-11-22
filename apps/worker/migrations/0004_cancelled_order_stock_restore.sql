-- Restore reserved stock exactly once when an eligible order is cancelled.
CREATE TRIGGER IF NOT EXISTS Order_restore_stock_on_cancel
AFTER UPDATE OF status ON "Order"
WHEN OLD.status IN ('PENDING','PAID','PROCESSING') AND NEW.status = 'CANCELLED'
BEGIN
  UPDATE Product
  SET stock = stock + (
    SELECT COALESCE(SUM(oi.quantity), 0)
    FROM OrderItem oi
    WHERE oi.orderId = NEW.id AND oi.productId = Product.id
  ),
  updatedAt = datetime('now')
  WHERE id IN (SELECT productId FROM OrderItem WHERE orderId = NEW.id);
END;
