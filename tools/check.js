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
  // Chapter 6 figures.
  if (typeof chart.futureValue !== 'function') fail('js/chart.js: must export futureValue');
  else {
    if (!near(chart.futureValue(100, 0, 0, 12), 1200)) fail('chart.futureValue: with no growth, 12 deposits of $100 are $1,200');
    if (!near(chart.futureValue(100, 0.12, 0, 2), 201)) fail('chart.futureValue: $100 at 1% a month for 2 months is $201');
    if (chart.futureValue(500, 0.07, 0.0003, 360).toFixed(0) !== '606387') fail('chart.futureValue: Fig. 6.1 low-fee end should be $606,387');
    if (chart.futureValue(500, 0.07, 0.01, 360).toFixed(0) !== '502258') fail('chart.futureValue: Fig. 6.1 high-fee end should be $502,258');
  }
  if (typeof chart.drift !== 'function' || typeof chart.mostUnderweight !== 'function') fail('js/chart.js: must export drift and mostUnderweight');
  else {
    if (chart.drift([60, 30, 10], [67, 24, 9]).join() !== '7,-6,-1') fail('chart.drift: 60/30/10 to 67/24/9 is +7, -6, -1');
    if (chart.mostUnderweight([60, 30, 10], [67, 24, 9]) !== 1) fail('chart.mostUnderweight: the example pie should buy international');
    if (chart.mostUnderweight([50, 50], [40, 60]) !== 0) fail('chart.mostUnderweight: 50/50 at 40/60 should buy the first');
    const p = chart.pie;
    if (!p || p.target.reduce((a, b) => a + b, 0) !== 100 || p.now.reduce((a, b) => a + b, 0) !== 100) fail('chart.pie: target and now must each sum to 100');
  }
  if (typeof chart.dividendIncome !== 'function') fail('js/chart.js: must export dividendIncome');
  else {
    const y1 = chart.dividendIncome(5000, 0.03, 0.06, 1), y20 = chart.dividendIncome(5000, 0.03, 0.06, 20);
    if (!near(y1.cash, 150) || !near(y1.reinvested, 150)) fail('chart.dividendIncome: year 1 pays $150 either way');
    if (y20.cash.toFixed(2) !== '453.84' || y20.reinvested.toFixed(2) !== '795.81') fail('chart.dividendIncome: year 20 should be $453.84 cash, $795.81 reinvested');
  }
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

// 9. The platform fit matrix: the data has only public fields, the scores are
//    valid, the weighted fit matches the source sheet, and Chapter 13 shows it
//    with a private placeholder for the personal parts.
const fitPath = 'content/data/platform-fit.json';
if (!fs.existsSync(path.join(root, fitPath))) fail(`${fitPath}: missing`);
else {
  const fit = JSON.parse(read(fitPath));
  const { weightedFit } = require('./build.js');
  const allowedTop = ['asOf', 'scale', 'strategies', 'platforms'];
  for (const k of Object.keys(fit)) if (!allowedTop.includes(k)) fail(`${fitPath}: unexpected field "${k}" (public fields only)`);
  for (const st of fit.strategies) {
    for (const k of Object.keys(st)) if (!['name', 'weight'].includes(k)) fail(`${fitPath}: strategy field "${k}" is not allowed`);
    if (![0, 1, 2, 3].includes(st.weight)) fail(`${fitPath}: weight for ${st.name} must be 0 to 3`);
  }
  for (const pl of fit.platforms) {
    for (const k of Object.keys(pl)) if (!['name', 'role', 'scores'].includes(k)) fail(`${fitPath}: platform field "${k}" is not allowed (public fields only)`);
    if (pl.scores.length !== fit.strategies.length) fail(`${fitPath}: ${pl.name} needs ${fit.strategies.length} scores`);
    if (!pl.scores.every((v) => [0, 1, 2, 3].includes(v))) fail(`${fitPath}: ${pl.name} has a score outside 0 to 3`);
  }
  // Weighted fit under the default weights, as the source sheet shows it.
  const expected = { 'Schwab (thinkorswim)': '2.79', 'Interactive Brokers': '2.36', 'Fidelity': '2.29', 'E*Trade': '2.14',
    'Webull': '1.93', 'Moomoo': '1.93', 'TradeStation': '1.93', 'Robinhood': '1.79', 'Public': '1.64', 'tastytrade': '1.50',
    'SoFi': '1.36', 'Merrill Edge': '1.29', 'M1': '1.21', 'Composer': '1.21', 'Alpaca': '1.21', 'Vanguard': '0.93',
    'Betterment / Wealthfront': '0.79' };
  const weights = fit.strategies.map((st) => st.weight);
  if (fit.platforms.length !== Object.keys(expected).length) fail(`${fitPath}: expected ${Object.keys(expected).length} platforms`);
  for (const pl of fit.platforms) {
    const got = weightedFit(pl.scores, weights).toFixed(2);
    if (expected[pl.name] !== got) fail(`${fitPath}: ${pl.name} weighted fit is ${got}, the sheet says ${expected[pl.name]}`);
  }
  const ch13 = fs.existsSync(path.join(root, 'chapters/13-own-the-process-rent-the-tools.html')) ? read('chapters/13-own-the-process-rent-the-tools.html') : '';
  if (!ch13.includes('data-matrix')) fail('chapters/13: the platform fit matrix is missing');
  if (!ch13.includes('data-style="private"')) fail('chapters/13: the private placeholder is missing');
  if (!ch13.includes('js/matrix.js')) fail('chapters/13: js/matrix.js is not loaded');
}

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
