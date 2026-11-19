#!/usr/bin/env node
// Deploy gate. Run: node tools/check.js
// No dependencies, no network. Exits 1 on the first set of failures.
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const failures = [];
const fail = (msg) => failures.push(msg);

function walk(dir, out = []) {
  for (const name of fs.readdirSync(path.join(root, dir))) {
    if (name.startsWith('.') || name === 'node_modules') continue;
    const rel = path.join(dir, name);
    if (fs.statSync(path.join(root, rel)).isDirectory()) walk(rel, out);
    else out.push(rel);
  }
  return out;
}
const files = walk('.');
const htmlFiles = files.filter((f) => f.endsWith('.html'));

// 1. The version in js/version.js has a changelog entry.
const versionMatch = read('js/version.js').match(/RETURN_OF_VERSION\s*=\s*'(\d+\.\d+\.\d+)'/);
if (!versionMatch) fail('js/version.js: no RETURN_OF_VERSION = \'x.y.z\' found');
else if (!read('CHANGELOG.md').includes(`## [${versionMatch[1]}]`)) {
  fail(`CHANGELOG.md: no "## [${versionMatch[1]}]" entry for the current version`);
}

// 2. Every local link and asset in every page resolves to a real file.
for (const file of htmlFiles) {
  const html = read(file);
  for (const m of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const ref = m[1];
    if (/^(https?:|mailto:|#|data:)/.test(ref)) continue;
    let target = path.join(path.dirname(file), ref.split(/[?#]/)[0]);
    if (ref.endsWith('/') || (fs.existsSync(path.join(root, target)) && fs.statSync(path.join(root, target)).isDirectory())) {
      target = path.join(target, 'index.html');
    }
    if (!fs.existsSync(path.join(root, target))) fail(`${file}: broken link "${ref}"`);
  }
}

// 3. Every style used in a page is defined in css/themes.css.
const themes = read('css/themes.css');
for (const file of htmlFiles) {
  for (const m of read(file).matchAll(/<[a-z][^>]*\sdata-style="([^"]+)"/g)) {
    if (!themes.includes(`[data-style="${m[1]}"] {`)) fail(`${file}: style "${m[1]}" is not defined in css/themes.css`);
  }
}

// 4. Every page is mobile-ready and shows the version.
for (const file of htmlFiles) {
  const html = read(file);
  if (!html.includes('name="viewport"')) fail(`${file}: missing viewport meta tag`);
  if (!html.includes('data-version')) fail(`${file}: does not show the version`);
}

// 5. The welcome page says its name and has a chart.
const home = read('index.html');
if (!/<h1[^>]*>.*Return.*Of.*<\/h1>/s.test(home)) fail('index.html: the "Return Of" title is missing');
if (!home.includes('data-chart=')) fail('index.html: no chart on the welcome page');

// 6. No em dashes in anything a person reads.
for (const file of files.filter((f) => /\.(html|md|css|js|yml)$/.test(f))) {
  if (read(file).includes(String.fromCharCode(8212))) fail(`${file}: contains an em dash`);
}

if (failures.length) {
  console.error(`FAIL (${failures.length})`);
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
console.log(`OK: v${versionMatch[1]}, ${htmlFiles.length} pages, ${files.length} files checked`);
