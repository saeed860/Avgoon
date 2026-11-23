import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const read = path => readFileSync(resolve(here, path), 'utf8');
const product = read('../../../docs/js/product.js');
const storefront = read('../../../docs/js/storefront.js');

test('product gallery binds image URLs through escaped data attributes, not inline handlers', () => {
  assert.match(product, /data-image-index=/);
  assert.match(product, /button\.dataset\.imageIndex/);
  assert.match(product, /showImage\(images\[Number\(button\.dataset\.imageIndex\)\]\.url,button\)/);
  assert.doesNotMatch(product, /onclick=["']showImage/);
});

test('catalog thumbnails bind product image data without inline JavaScript', () => {
  assert.match(storefront, /data-product-id=/);
  assert.match(storefront, /data-product-image=/);
  assert.match(storefront, /img\.dataset\.productId,img\.dataset\.productImage/);
  assert.doesNotMatch(storefront, /onclick="setProductCardImage/);
});
