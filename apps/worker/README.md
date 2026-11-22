# AVGOON Cloudflare Worker API

This is the zero-cost edge deployment adapter for the existing PostgreSQL schema.

## Status

The initial adapter currently implements:
- Health check
- Public category and product listing/detail
- Email OTP request/verification through Resend HTTPS
- First-admin bootstrap
- Admin summary, user list, order list and order-status update
- Admin product creation

Still required before production:
- Product update and spreadsheet import endpoints
- End-to-end tests against a disposable Neon database
- Migration automation and rate-limit review
- Storefront checkout/order creation and payment integration
- Final CORS and email sender verification

Do not point the public storefront to this Worker until all remaining endpoints and tests are complete.

## Cloudflare dashboard deployment

After the code is ready and a Cloudflare account is available:
1. Workers & Pages → Create → Worker → Connect to Git.
2. Select `saeed860/Avgoon` and branch `feature/admin-users-orders` for preview.
3. Set the root directory to `apps/worker`.
4. Build command: `npm install && npm run typecheck`.
5. Deploy command: `npm run deploy`.
6. Add Worker secrets/vars from `apps/api/DEPLOYMENT.md`.

Use only the Free plan. Cloudflare Workers Free currently has a 100,000 requests/day allowance and 10 ms CPU per invocation.

The database URL must be the Neon pooled PostgreSQL HTTPS-compatible connection string. Do not expose it to the browser.
