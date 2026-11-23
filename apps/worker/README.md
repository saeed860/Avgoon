# AVGOON Cloudflare Worker API

Runtime: Cloudflare Workers + Cloudflare D1 (SQLite). Production uses D1; it does not require a paid database add-on.

## D1 binding and migrations
The `DB` binding and database ID are configured in `wrangler.jsonc`.
- Local development: `npm run db:migrate:local`
- Remote migrations: `npm run db:migrate:remote` only after reviewing the SQL and confirming the target database.

Migration 0009 explicitly rolls back the mistakenly introduced Caterpillar part-reference table from migration 0008. Caterpillar part-number data is not part of Avgoon's dry-construction catalog.

## Required Worker secrets and variables
- `JWT_SECRET`: random secret, at least 32 characters.
- `ADMIN_BOOTSTRAP_TOKEN`: one-time first-admin secret, at least 32 characters.
- `WEB_ORIGIN`: exact production storefront origin, `https://avgoon-store.pages.dev`.
- `RESEND_API_KEY`: Resend API key used for email OTP.
- `RESEND_FROM_EMAIL` (optional): verified sender identity. If omitted, the code uses Resend's onboarding sender, which is restricted to eligible recipients until a domain is verified.

Never commit secret values to the repository or frontend assets. Phone/SMS login is not implemented.

## Current API
Health, categories, public product list/detail, email OTP, first-admin bootstrap, customer profile/order history, order creation, admin summary/users/orders/status, product create/update/CSV import, and project inquiries with admin status management.

The storefront is connected to the Worker API. Demo catalog entries remain explicitly non-orderable. Payment gateway, shipping, returns, and financial/legal operations must be completed before accepting real paid orders.

## Checks
`npm run typecheck` validates the Worker TypeScript. GitHub Actions runs this check and a deployed smoke test against the production Pages origin and Worker API.
