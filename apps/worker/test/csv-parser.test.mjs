import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv } from '../src/csv-parser.js';

test('parses comma-separated rows and CRLF endings', () => {
  assert.deepEqual(parseCsv('sku,name\r\nA-1,Panel\r\nB-2,Board\r\n'), [
    ['sku', 'name'], ['A-1', 'Panel'], ['B-2', 'Board']
  ]);
});

test('supports quoted commas, escaped quotes, and embedded newlines', () => {
  assert.deepEqual(parseCsv('sku,description\nA-1,"panel, ""premium""\nsecond line"'), [
    ['sku', 'description'], ['A-1', 'panel, "premium"\nsecond line']
  ]);
});

test('preserves empty cells including trailing empty columns', () => {
  assert.deepEqual(parseCsv('a,,c\n1,2,'), [['a', '', 'c'], ['1', '2', '']]);
});

test('accepts Persian text and a UTF-8 BOM in the first header', () => {
  assert.deepEqual(parseCsv('\uFEFFکد,نام\n۱,صفحه گچی'), [['\uFEFFکد', 'نام'], ['۱', 'صفحه گچی']]);
});

test('rejects unterminated quoted fields', () => {
  assert.throws(() => parseCsv('sku,name\nA-1,"unfinished'), /CSV_INVALID_QUOTES/);
});

test('rejects quotes embedded in unquoted fields', () => {
  assert.throws(() => parseCsv('sku,na"me'), /CSV_INVALID_QUOTES/);
});

test('rejects non-delimiter characters after a closing quote', () => {
  assert.throws(() => parseCsv('sku,name\nA-1,"Panel"x'), /CSV_INVALID_QUOTES/);
});
