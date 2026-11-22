# AVGOON Cloudflare Worker API

Runtime: Cloudflare Workers + Cloudflare D1 (SQLite). No Neon, PostgreSQL, or paid database dependency.

## D1 binding
The `DB` binding and database ID are configured in `wrangler.jsonc`.

## Migrations
Run `npm run db:migrate:local` for local development and `npm run db:migrate:remote` only after reviewing the migration. The migration creates the application tables; it does not import old PostgreSQL records.

## Required Worker secrets/variables
- `JWT_SECRET`: random secret, at least 32 characters.
- `ADMIN_BOOTSTRAP_TOKEN`: one-time first-admin secret, at least 32 characters.
- `WEB_ORIGIN`: exact deployed storefront origin.
- `BREVO_API_KEY` and `BREVO_SENDER_EMAIL`: email OTP delivery. Phone/SMS login is not implemented.

## Current API
Health, categories, product list/detail, email OTP, first-admin bootstrap, admin summary/users/orders/status and product creation.

Still required before public launch: checkout/order creation, product update and CSV/XLSX import, storefront integration, rate-limit hardening, end-to-end tests, and email provider configuration. Do not connect the public storefront until these are complete.

Use Cloudflare Free plan only. Do not enable paid add-ons or automatic upgrades.
