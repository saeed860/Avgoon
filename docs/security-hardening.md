# Security hardening

This project keeps executable JavaScript in external files under `docs/js/`.
HTML pages must not contain inline event-handler attributes or inline script blocks.

Interactive controls use `data-action-*` attributes. The storefront and admin scripts attach delegated event listeners and dispatch only known actions.

The Cloudflare Pages security headers intentionally omit `'unsafe-inline'` from both enforcing and Report-Only `script-src` policies.

## Regression checks

Run these checks from the repository root:

```sh
node scripts/check-csp.mjs
node --check docs/js/storefront.js
node --check docs/js/admin.js
```

The CSP regression check scans HTML and JavaScript files for inline handlers, inline script blocks, and `javascript:` URLs; it also verifies delegated event listeners and rejects `'unsafe-inline'` in script policies.
