import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve('docs');
const htmlFiles = [];
const jsFiles = [];
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(file);
    else if (entry.isFile() && file.endsWith('.html')) htmlFiles.push(file);
    else if (entry.isFile() && file.endsWith('.js')) jsFiles.push(file);
  }
}
await walk(root);
const failures = [];
const htmlSources = new Map();
for (const file of htmlFiles) {
  const source = await readFile(file, 'utf8');
  htmlSources.set(file, source);
  if (/\son[a-z][a-z0-9_-]*\s*=/i.test(source)) failures.push(file + ': inline event handler');
  if (/<script\b(?![^>]*\bsrc\s*=)[^>]*>/i.test(source)) failures.push(file + ': inline script block');
  if (/javascript\s*:/i.test(source)) failures.push(file + ': javascript: URL');
}
for (const file of jsFiles) {
  const source = await readFile(file, 'utf8');
  if (/\son[a-z][a-z0-9_-]*\s*=/i.test(source)) failures.push(file + ': inline event handler in generated markup');
}
const headers = await readFile(path.join(root, '_headers'), 'utf8');
for (const line of headers.split(/\r?\n/).filter(x => /Content-Security-Policy(?:-Report-Only)?:/i.test(x))) {
  const scriptSrc = line.match(/script-src([^;]*)/i)?.[1] || '';
  if (/'unsafe-inline'/i.test(scriptSrc)) failures.push('docs/_headers: unsafe-inline remains in script-src');
}
const allHtml = [...htmlSources.values()].join('\n');
const jsSources = await Promise.all(jsFiles.map(file => readFile(file, 'utf8')));
const allJs = jsSources.join('\n');
const delegatedChecks = [
  ['click', 'data-action-click', "addEventListener('click'"],
  ['input', 'data-action-input', "addEventListener('input'"],
  ['change', 'data-action-change', "addEventListener('change'"]
];
for (const [type, actionMarker, listenerMarker] of delegatedChecks) {
  if ((allHtml + allJs).includes(actionMarker) && !allJs.includes(listenerMarker)) {
    failures.push('missing delegated ' + type + ' event listener');
  }
}

if (/\[data-action-overlay\]/.test(allJs) && !/event\.target\s*===\s*overlay/.test(allJs)) {
  failures.push('overlay action lacks backdrop target guard');
}
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('CSP regression PASS: ' + htmlFiles.length + ' HTML pages, ' + jsFiles.length + ' JS files; no inline scripts/handlers or javascript: URLs; delegated event listeners and CSP verified.');
