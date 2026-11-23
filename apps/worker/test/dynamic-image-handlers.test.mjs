import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const product = readFileSync(resolve(here, '../../../docs/product.html'), 'utf8');
const index = readFileSync(resolve(here, '../../../docs/index.html'), 'utf8');

test('product gallery binds image URLs through escaped data attributes, not inline handlers', () => {
  assert.match(product, /data-image-index=/);
  assert.match(product, /button\.dataset\.imageIndex/);
  assert.match(product, /showImage\(images\[Number\(button\.dataset\.imageIndex\)\]\.url,button\)/);
  assert.doesNotMatch(product, /onclick=["']showImage/);
});

test('catalog thumbnails bind product image data without inline JavaScript', () => {
  assert.match(index, /data-product-id=/);
  assert.match(index, /data-product-image=/);
  assert.match(index, /img\.dataset\.productId,img\.dataset\.productImage/);
  assert.doesNotMatch(index, /onclick="setProductCardImage/);
});
