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
// Pages are full HTML documents. Files under content/ are fragments, checked separately.
const htmlFiles = files.filter((f) => f.endsWith('.html') && !f.startsWith('content' + path.sep));

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

// 5. The welcome page says its name, carries the epigraph with an honest
//    attribution, and shows the two thesis figures in order: return on, return of.
const home = read('index.html');
if (!/<h1[^>]*>.*Return.*Of.*<\/h1>/s.test(home)) fail('index.html: the "Return Of" title is missing');
if (!home.includes('Often attributed to Will Rogers')) fail('index.html: epigraph must say "Often attributed to Will Rogers"');
if (!home.includes('https://quoteinvestigator.com/2025/06/27/return-money/')) fail('index.html: epigraph note must link to its source');
const onAt = home.indexOf('data-chart="compound"');
const ofAt = home.indexOf('data-chart="breakeven"');
if (onAt < 0) fail('index.html: Fig. 1 (compound) is missing');
if (ofAt < 0) fail('index.html: Fig. 2 (breakeven) is missing');
if (onAt >= 0 && ofAt >= 0 && onAt > ofAt) fail('index.html: Fig. 1 must come before Fig. 2');

// 6. Chart arithmetic is right, and every chart a page asks for exists.
const chart = require('../js/chart.js');
const near = (a, b) => Math.abs(a - b) < 1e-9;
if (typeof chart.grow !== 'function' || typeof chart.breakeven !== 'function' || !Array.isArray(chart.charts)) {
  fail('js/chart.js: must export grow, breakeven, and the list of chart names');
} else {
  if (!near(chart.grow(0.10, 2), 1.21)) fail('chart.grow: 10% for 2 years should be 1.21');
  if (chart.grow(0.10, 30).toFixed(2) !== '17.45') fail('chart.grow: 10% for 30 years should be 17.45');
  if (!near(chart.breakeven(0.5), 1)) fail('chart.breakeven: a 50% loss needs a 100% gain');
  if (!near(chart.breakeven(0.9), 9)) fail('chart.breakeven: a 90% loss needs a 900% gain');
  if (!near(chart.breakeven(0.1), 1 / 9)) fail('chart.breakeven: a 10% loss needs an 11.1% gain');
  for (const file of htmlFiles) {
    for (const m of read(file).matchAll(/<[a-z][^>]*\sdata-chart="([^"]+)"/g)) {
      if (!chart.charts.includes(m[1])) fail(`${file}: chart "${m[1]}" is not defined in js/chart.js`);
    }
  }
}

// 8. Chapters: every chapter in the manifest has content, the content follows
//    the fragment rules, and the generated pages are fresh.
const { build } = require('./build.js');
const { out, list } = build();
for (const ch of list) {
  const src = 'content/chapters/' + ch.file;
  if (!fs.existsSync(path.join(root, src))) { fail(`${src}: chapter ${ch.number} has no content file`); continue; }
  const frag = read(src);
  if (/<(html|head|body|h1|script|style)[\s>]/i.test(frag)) fail(`${src}: fragments hold body content only (no html, head, body, h1, script, or style)`);
  if (!frag.includes('class="lead"')) fail(`${src}: missing the opening <p class="lead">`);
  if (/\sstyle="/.test(frag)) fail(`${src}: no inline styles; use theme tokens and classes`);
}
for (const [file, content] of Object.entries(out)) {
  if (!fs.existsSync(path.join(root, file)) || read(file) !== content) fail(`${file}: stale, run "node tools/build.js"`);
}
for (const f of files.filter((f) => f.startsWith('chapters' + path.sep))) {
  if (!(f in out)) fail(`${f}: not in content/chapters.json, delete it`);
}
for (const f of files.filter((f) => f.startsWith(path.join('content', 'chapters') + path.sep))) {
  if (!list.some((ch) => 'content/chapters/' + ch.file === f)) fail(`${f}: not in content/chapters.json`);
}
if (!read('index.html').includes('id="contents"')) fail('index.html: the contents list is missing');

// 7. No em dashes in anything a person reads.
for (const file of files.filter((f) => /\.(html|md|css|js|yml)$/.test(f))) {
  if (read(file).includes(String.fromCharCode(8212))) fail(`${file}: contains an em dash`);
}

if (failures.length) {
  console.error(`FAIL (${failures.length})`);
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
console.log(`OK: v${versionMatch[1]}, ${htmlFiles.length} pages, ${files.length} files checked`);
