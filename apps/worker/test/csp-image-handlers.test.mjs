import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const headers = read('../../../docs/_headers');
const pages = {
  storefront: read('../../../docs/index.html'),
  admin: read('../../../docs/admin.html'),
  product: read('../../../docs/product.html'),
  firstAdmin: read('../../../docs/first-admin.html'),
};
const scripts = {
  storefront: read('../../../docs/js/storefront.js'),
  admin: read('../../../docs/js/admin.js'),
  product: read('../../../docs/js/product.js'),
  firstAdmin: read('../../../docs/js/first-admin.js'),
};

test('enforcing and report-only script policies reject inline scripts and allow Leaflet assets', () => {
  assert.match(headers, /Content-Security-Policy-Report-Only:.*script-src 'self' https:\/\/cdn\.jsdelivr\.net;/);
  assert.match(headers, /Content-Security-Policy:.*script-src 'self' https:\/\/cdn\.jsdelivr\.net;/);
  assert.match(headers, /style-src[^;]*https:\/\/cdn\.jsdelivr\.net/);
  assert.doesNotMatch(headers.split('Content-Security-Policy:')[1], /script-src[^;]*'unsafe-inline'/);
});
test('dynamic product, cart, admin and detail images do not use inline error handlers', () => {
  for (const [name, html] of Object.entries(pages)) {
    assert.doesNotMatch(html, /\sonerror\s*=/i, name + ' must not emit inline image error handlers');
  }
  assert.match(scripts.storefront, /\[data-hide-on-error\].*addEventListener\('error'/);
  assert.match(scripts.admin, /\[data-dim-on-error\].*addEventListener\('error'/);
  assert.match(scripts.product, /getElementById\('mainImage'\)\?\.addEventListener\('error'/);
});

test('application pages load executable code from same-origin external scripts', () => {
  for (const [name, html] of Object.entries(pages)) {
    assert.doesNotMatch(html, /<script\b(?![^>]*\bsrc\s*=)[^>]*>[\s\S]*?\S[\s\S]*?<\/script>/i,
      name + ' must not contain inline executable scripts');
    assert.match(html, /<script\b[^>]*\bsrc="js\//i,
      name + ' must load a same-origin external script');
  }
});
