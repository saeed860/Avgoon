# AVGOON — zero-cost deployment plan

This project must remain on free tiers. No paid Render, Koyeb, or database resources should be created.

## Selected free stack

| Component | Provider | Free allowance / note |
|---|---|---|
| Storefront | Cloudflare Pages | Static files in `docs/`; `.pages.dev` hostname |
| API runtime | Cloudflare Workers Free | 100,000 requests/day; 10 ms CPU time per invocation |
| PostgreSQL | Neon Free | 1 GB per project and 100 compute-hours/month; compute scales to zero |
| Email OTP | Resend Free | 3,000 emails/month, 100/day; sender domain verification required |
| Source and CI | GitHub Free | Repository and automated tests |

Cloudflare Workers Free is available without a credit card. Neon and Resend have free plans, subject to their quotas and account verification requirements.

## Important deployment decision

The existing Express + Prisma API in `apps/api` is tested and remains the reference/local API. It cannot simply be uploaded as-is to Cloudflare Workers because Workers do not provide a normal persistent Node.js server process and Prisma's current PostgreSQL runtime is not the selected edge runtime.

The production API therefore needs a Worker-compatible adapter/runtime using the Neon serverless HTTPS driver while preserving the existing PostgreSQL schema and endpoint contracts. Do not point the storefront to a partially ported API. Keep the Express API and its passing CI intact until the Worker implementation passes equivalent tests.

Render's free Blueprint was evaluated but Render returned `need_payment_info` during planning for this account. No service or database was created. Since the requirement is zero cost and no payment method, Render has been removed from the deployment path.

## 1. Storefront — Cloudflare Pages

Connect repository `saeed860/Avgoon` to Cloudflare Pages:
- Production branch: `main` after the reviewed PR is merged.
- Root directory: `docs`
- Build command: leave empty.
- Build output directory: `.`

After the Worker API has been deployed, update `docs/config.js` with its public HTTPS URL:
```js
window.AVGOON_API_URL = 'https://YOUR-WORKER.YOUR-SUBDOMAIN.workers.dev';
```
This file is public browser code. Never place database URLs, API keys, JWT secrets or bootstrap tokens in it.

GitHub Pages is not selected for production because GitHub's Pages policy says it is not intended for sites primarily facilitating commercial transactions.

## 2. Database — Neon Free

Create a PostgreSQL project on Neon's Free plan:
- Create database `avgoon`.
- Copy the pooled connection string (hostname commonly includes `-pooler`).
- Use TLS (`sslmode=require`).
- Keep the connection string private; it will become a Worker secret named `DATABASE_URL`.

The current Free plan includes 1 GB per project and 100 compute-hours per project per month. Compute scales to zero after inactivity. It is not a substitute for backups: export important business data regularly.

## 3. API — Cloudflare Workers Free

The Worker implementation is a separate deployment target. It must:
- Preserve `/api/health`, categories/products, OTP auth and admin endpoints.
- Use Neon serverless HTTPS queries, not a long-lived TCP connection.
- Validate every request and keep secrets in Worker secrets.
- Use Web Crypto for OTP hashing and JWT signing/verification.
- Send OTP through Resend's HTTPS API (not SMTP).
- Keep the existing PostgreSQL tables and migrations compatible.

Cloudflare Workers Free currently allows 100,000 requests/day and 10 ms CPU time per invocation. Design expensive operations (especially spreadsheet parsing) outside the request CPU budget or retain them as a controlled administrative import process.

## 4. Email OTP — Resend Free

Resend's free tier currently allows 3,000 transactional emails/month and 100/day. Verify a sender domain before enabling customer OTP delivery. Configure only these secrets in the Worker:
- `RESEND_API_KEY`
- `RESEND_FROM`

SMS OTP remains disabled until a genuinely free provider and a secure provider-specific adapter are selected.

## 5. Required secrets

Set these as Worker secrets, never in source control:
- `DATABASE_URL`: Neon pooled PostgreSQL URL.
- `JWT_SECRET`: independent random secret of at least 32 characters.
- `ADMIN_BOOTSTRAP_TOKEN`: one-time random token of at least 32 characters.
- `RESEND_API_KEY`: Resend API key.
- `RESEND_FROM`: verified sender identity.
- `WEB_ORIGIN`: exact Cloudflare Pages origin.

## 6. First administrator

1. Deploy and test the full Worker API and verify `/api/health`.
2. Configure and test real email OTP.
3. Register the intended administrator account and verify its email.
4. Open `/first-admin.html`, enter the Worker API URL, verified email and one-time bootstrap token.
5. After success, remove `ADMIN_BOOTSTRAP_TOKEN` from Worker secrets.

## 7. Release safety

The initial PostgreSQL migration is in `prisma/migrations/20261122090000_init`. The Express CI on the feature branch has passed Prisma validation, client generation, PostgreSQL migration deployment and TypeScript build. These tests validate the reference API, not the future Worker adapter.

Do not accept real orders or payments until the Worker API, email delivery, backup/export process, checkout/payment integration and end-to-end tests have all passed.
