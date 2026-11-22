# AVGOON — zero-cost deployment path

This configuration deliberately uses free tiers only. No paid Render plan or Render Postgres instance is required.

## Free hosting architecture

| Component | Provider | Free tier purpose |
|---|---|---|
| Storefront | Cloudflare Pages | Static files in `docs/`; production site at a `.pages.dev` address |
| API | Render Free Web Service | Node/Express API; sleeps after 15 minutes idle and may take about a minute to wake |
| PostgreSQL | Neon Free | Persistent hosted PostgreSQL; use the pooled connection string |
| Email OTP | Resend Free | HTTPS email API; up to 3,000 emails/month and 100/day; sender domain must be verified |
| Source and CI | GitHub Free | Repository and automated tests |

Do not use Render's Free Postgres for customer data: free databases expire after 30 days and have no backups. Use Neon for the persistent database instead.

## 1. Storefront — Cloudflare Pages

Connect the GitHub repository `saeed860/Avgoon` to Cloudflare Pages with:
- Production branch: `main` after the reviewed PR is merged.
- Root directory: `docs`
- Build command: leave empty (the storefront is static HTML/CSS/JS).
- Build output directory: `.`
- No build environment variables are needed for the static upload.

The Pages hostname is created by Cloudflare. After the API is deployed, set that exact origin as `WEB_ORIGIN` in Render and configure `docs/config.js` with the API's HTTPS base URL.

GitHub Pages is not the selected production host: GitHub's Pages policy says it is not intended for sites primarily facilitating commercial transactions.

## 2. Database — Neon Free

Create a PostgreSQL project on Neon's Free plan:
- Create a database named `avgoon`.
- Copy the pooled connection string (hostname commonly includes `-pooler`).
- Add `?sslmode=require` if it is not already included.
- Save it as Render's `DATABASE_URL` secret.

The Free plan currently includes 1 GB per project and 100 compute-hours per project per month. Compute scales to zero after inactivity. Monitor usage and keep independent backups/exports of important business data.

## 3. API — Render Free

The repository includes `render.yaml`. In Render, create a Blueprint from this repository and choose the free web-service plan. Confirm that no paid resources are selected.

The Blueprint configures:
- Root directory: `apps/api`
- Build: `npm install && npx prisma generate && npm run build`
- Start: `npx prisma migrate deploy && npm start`
- Health check: `/api/health`
- Region: Frankfurt
- Plan: Free

Render Free services sleep after 15 minutes without inbound traffic; the first request after sleep may take about a minute. The filesystem is ephemeral, so uploaded files must not be stored locally. Customer data belongs in Neon.

Render blocks outbound SMTP ports 25, 465 and 587 on Free web services. Email delivery therefore uses Resend's HTTPS API rather than SMTP.

## 4. Required secrets and settings

Render's Blueprint creates random values for `JWT_SECRET` and `ADMIN_BOOTSTRAP_TOKEN`. Set these remaining variables manually:
- `DATABASE_URL`: Neon pooled PostgreSQL connection string.
- `WEB_ORIGIN`: exact Cloudflare Pages origin, e.g. `https://avgoon.pages.dev` (replace with the actual assigned hostname).
- `RESEND_API_KEY`: Resend API key.
- `RESEND_FROM`: verified sender, e.g. `Avgoon <no-reply@your-verified-domain>`.
- `NODE_ENV=production` is already configured by the Blueprint.

Resend Free requires a verified sender domain for real customer delivery. Do not enable email login until the sender domain is verified and an actual message is tested. SMS login remains disabled until a free SMS provider is selected and a dedicated adapter is implemented.

## 5. Configure the storefront API URL

Edit `docs/config.js` after Render assigns the API hostname and set:
```js
window.AVGOON_API_URL = 'https://YOUR-AVGOON-API.onrender.com';
```
Then deploy the updated `docs/` directory to Cloudflare Pages. Never place secret keys in this file; it is public browser code.

## 6. First administrator

1. Deploy the storefront and API, and verify `/api/health`.
2. Configure and test real email OTP using the verified Resend sender.
3. Register the intended administrator account and verify its email.
4. Open `/first-admin.html`, enter the API URL, verified email and the one-time bootstrap token.
5. After success, remove `ADMIN_BOOTSTRAP_TOKEN` from Render environment variables and redeploy.

## 7. Release safety

The initial migration is in `prisma/migrations/20261122090000_init`. Render runs committed migrations on service start. Do not import live customer data or open real orders until the API, email delivery, backups, checkout/payment integration and end-to-end tests have been verified.

Free-tier services are suitable for development and a small pilot, not a high-availability commercial launch. Check the providers' current quotas regularly.
