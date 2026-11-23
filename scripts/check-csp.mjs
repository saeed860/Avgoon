import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve('docs');
const htmlFiles = [];
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(file);
    else if (entry.isFile() && file.endsWith('.html')) htmlFiles.push(file);
  }
}
await walk(root);
const failures = [];
for (const file of htmlFiles) {
  const html = await readFile(file, 'utf8');
  if (/\\son[a-z][a-z0-9_-]*\\s*=/i.test(html)) failures.push(\`${file}: inline event handler\`);
}
const headers = await readFile(path.join(root, '_headers'), 'utf8');
for (const line of headers.split(/\r?\n/).filter(x => /Content-Security-Policy(?:-Report-Only)?:/i.test(x))) {
  const scriptSrc = line.match(/script-src([^;]*)/i)?.[1] || '';
  if (/'unsafe-inline'/i.test(scriptSrc)) failures.push('docs/_headers: unsafe-inline remains in script-src');
}
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(\`CSP regression PASS: ${htmlFiles.length} HTML pages have no inline event handlers; script-src excludes unsafe-inline.\`);
