import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const headers = readFileSync(new URL('../../../docs/_headers', import.meta.url), 'utf8');
const storefront = readFileSync(new URL('../../../docs/index.html', import.meta.url), 'utf8');
const admin = readFileSync(new URL('../../../docs/admin.html', import.meta.url), 'utf8');
const product = readFileSync(new URL('../../../docs/product.html', import.meta.url), 'utf8');

test('strict script policy is introduced in report-only mode without changing enforcement', () => {
  assert.match(headers, /Content-Security-Policy-Report-Only:.*script-src 'self' https:\/\/cdn\.jsdelivr\.net;/);
  assert.match(headers, /Content-Security-Policy:.*script-src 'self' 'unsafe-inline' https:\/\/cdn\.jsdelivr\.net;/);
});

test('dynamic product, cart, admin and detail images do not use inline error handlers', () => {
  for (const [name, html] of [['storefront', storefront], ['admin', admin], ['product', product]]) {
    assert.doesNotMatch(html, /\sonerror\s*=/i, name + ' must not emit inline image error handlers');
  }
  assert.match(storefront, /data-hide-on-error="true"/);
  assert.match(storefront, /\[data-hide-on-error\].*addEventListener\('error'/);
  assert.match(admin, /data-dim-on-error="true"/);
  assert.match(admin, /\[data-dim-on-error\].*addEventListener\('error'/);
  assert.match(product, /data-hide-on-error="true"/);
  assert.match(product, /getElementById\('mainImage'\)\?\.addEventListener\('error'/);
});

const firstAdmin = readFileSync(new URL('../../../docs/first-admin.html', import.meta.url), 'utf8');

test('application pages load executable code from same-origin external scripts', () => {
  for (const [name, html] of [
    ['storefront', storefront],
    ['admin', admin],
    ['product', product],
    ['first-admin', firstAdmin],
  ]) {
    assert.doesNotMatch(
      html,
      /<script\\b(?![^>]*\\bsrc\\s*=)[^>]*>[\\s\\S]*?\\S[\\s\\S]*?<\\/script>/i,
      name + ' must not contain inline executable scripts',
    );
    assert.match(html, /<script\\b[^>]*\\bsrc="js\\//i, name + ' must load a same-origin external script');
  }
});
