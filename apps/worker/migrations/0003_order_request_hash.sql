-- Bind an idempotency key to the exact normalized checkout payload.
ALTER TABLE "Order" ADD COLUMN requestHash TEXT;
