# AVGOON API deployment checklist

## Required environment
- `DATABASE_URL`: PostgreSQL connection string for the API database.
- `JWT_SECRET`: random secret with at least 32 characters.
- `ADMIN_BOOTSTRAP_TOKEN`: one-time first-admin setup secret with at least 32 characters.
- `WEB_ORIGIN`: exact HTTPS origin of the deployed storefront.
- `NODE_ENV=production`.

## Database release
Run the committed Prisma migrations before starting the API:

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
The API intentionally does not deliver OTP messages yet. Production OTP remains disabled until an actual SMS or SMTP delivery adapter is implemented and tested. Merely setting provider environment variables does not enable delivery.

## Release safety
Do not point the storefront at the API until CI passes, a hosted PostgreSQL database is provisioned, migrations have been applied, and the health endpoint returns `ok: true`.
