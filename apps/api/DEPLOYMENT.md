# AVGOON API deployment checklist

## Required environment
- `DATABASE_URL`: PostgreSQL connection string for the API database.
- `JWT_SECRET`: random secret with at least 32 characters.
- `ADMIN_BOOTSTRAP_TOKEN`: one-time first-admin setup secret with at least 32 characters.
- `WEB_ORIGIN`: exact HTTPS origin of the deployed storefront.
- `SMTP_HOST`, `SMTP_PORT` (default 587), `SMTP_SECURE` (`true` for implicit TLS), `SMTP_USER`, `SMTP_PASS`, and `SMTP_FROM`: required for real email OTP delivery.
- `NODE_ENV=production`.

## Render web service settings
- Root directory: `apps/api`
- Build command: `npm install && npx prisma generate && npm run build`
- Start command: `npm start`
- Health check path: `/api/health`
- Set `WEB_ORIGIN` to the exact storefront origin (for GitHub Pages, `https://saeed860.github.io`, without the repository path).
- Render provides `PORT`; the API binds to it on `0.0.0.0`.

## Database release
Configure the database connection and run the committed Prisma migrations before starting the API:

```sh
npx prisma migrate deploy
npx prisma generate
npm run build
npm start
```

The initial migration is in `prisma/migrations/20261122090000_init`. It creates the schema only; it does not create a first administrator or insert product data.

## First administrator
1. Register and verify the intended account after a real OTP delivery adapter has been configured.
2. Open `/first-admin.html` over HTTPS.
3. Supply the API HTTPS base URL, the account's verified email or phone, and the one-time bootstrap token.
4. Remove `ADMIN_BOOTSTRAP_TOKEN` from the service environment after the first administrator is created.

## OTP production gate
Email OTP is delivered through SMTP when all SMTP variables above are configured. SMS OTP remains disabled until a provider-specific adapter is implemented. Test SMTP delivery before enabling customer sign-in.

## Release safety
Do not point the storefront at the API until CI passes, a hosted PostgreSQL database is provisioned, migrations have been applied, and the health endpoint returns `ok: true`.
