// Writes server/web/vendor/fa/icons.json: the icons of the vendored Font Awesome (the ones its
// stylesheet has), each with its styles and search words, for the admin panel's icon picker.
// The words come from the Font Awesome package in node_modules (the same version), nothing is downloaded.
// Run after updating Font Awesome: node scripts/make-fa-icons.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const faDir = path.join(root, 'server/web/vendor/fa');
const css = readFileSync(path.join(faDir, 'css/all.min.css'), 'utf8');
const pkg = path.join(root, 'node_modules/@fortawesome/fontawesome-free');
const meta = JSON.parse(readFileSync(path.join(pkg, 'metadata/icon-families.json'), 'utf8'));
const version = JSON.parse(readFileSync(path.join(pkg, 'package.json'), 'utf8')).version;

// the names the stylesheet draws (same reading as iconNames in server/src/home/routes.ts)
const inCss = new Set();
for (const rule of css.split('}')) {
  const brace = rule.indexOf('{');
  if (brace < 0 || !rule.startsWith('--fa:', brace + 1)) continue;
  for (const m of rule.slice(0, brace).matchAll(/\.fa-([a-z0-9-]+)/g)) inCss.add(m[1]);
}

const icons = [];
for (const [name, v] of Object.entries(meta)) {
  if (!inCss.has(name)) continue;
  const styles = Object.keys(v.svgs?.classic ?? {});
  const code = ['solid', 'regular', 'brands'].filter((s) => styles.includes(s)).map((s) => s[0]).join('');
  if (!code) continue;
  const words = new Set([...(v.search?.terms ?? []), ...(v.aliases?.names ?? [])].map((w) => String(w).toLowerCase()));
  words.delete(name);
  icons.push([name, code, [...words].slice(0, 12).join(' ')]);
}
icons.sort((a, b) => a[0].localeCompare(b[0]));
writeFileSync(path.join(faDir, 'icons.json'), `${JSON.stringify({ version, icons })}\n`);
console.log(`${icons.length} icons (Font Awesome ${version})`);
