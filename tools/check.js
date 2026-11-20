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
const money0 = (v) => '$' + Math.round(v).toLocaleString('en-US');
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
    if (p && p.tokens.includes('--accent')) fail('chart.pie: the example holdings are neutral, so none may be red (--accent)');
  }
  // Chapter 1 figures.
  if (typeof chart.roundTrip !== 'function') fail('js/chart.js: must export roundTrip');
  else {
    if (!near(chart.roundTrip(0.1), 0.99)) fail('chart.roundTrip: up 10% then down 10% leaves 0.99');
    if (!near(chart.roundTrip(0.5), 0.75)) fail('chart.roundTrip: up 50% then down 50% leaves 0.75');
  }
  if (typeof chart.lossPath !== 'function') fail('js/chart.js: must export lossPath');
  else {
    if (!near(chart.lossPath(10000, 0.07, 9, 10, 0.5), 10000 * Math.pow(1.07, 9))) fail('chart.lossPath: before the fall it compounds untouched');
    if (chart.lossPath(10000, 0.07, 30, 10, 0.5).toFixed(0) !== '38061') fail('chart.lossPath: Fig. 1.3 ends at $38,061 with the fall');
    if (chart.lossPath(10000, 0.07, 30, 99, 0.5).toFixed(0) !== '76123') fail('chart.lossPath: Fig. 1.3 ends at $76,123 without it');
  }
  // Chapter 14 figures.
  if (typeof chart.lossCarry !== 'function' || typeof chart.split6040 !== 'function') fail('js/chart.js: must export lossCarry and split6040');
  else {
    if (chart.lossCarry(10000, 3000).join() !== '3000,3000,3000,1000') fail('chart.lossCarry: $10,000 at $3,000 a year is 3,000 x3 then 1,000');
    if (chart.lossCarry(2000, 3000).join() !== '2000') fail('chart.lossCarry: a loss under the limit is used in one year');
    if (chart.split6040(1000).join() !== '600,400') fail('chart.split6040: $1,000 splits $600 long-term, $400 short-term');
  }
  // Chapter 13 figures: the column counts come from the matrix data.
  if (typeof chart.builtForCounts !== 'function') fail('js/chart.js: must export builtForCounts');
  else {
    const fitData = JSON.parse(read('content/data/platform-fit.json'));
    const counts = chart.builtForCounts(fitData.platforms.map((p) => p.scores));
    if (counts.length !== fitData.strategies.length) fail('chart.builtForCounts: one count per strategy');
    fitData.strategies.forEach((st, j) => {
      const expect = fitData.platforms.filter((p) => p.scores[j] === 3).length;
      if (counts[j] !== expect) fail(`chart.builtForCounts: ${st.name} should have ${expect} platforms scored 3`);
    });
  }
  // Chapter 12 figures.
  if (typeof chart.rMultiple !== 'function' || !Array.isArray(chart.journalRows)) fail('js/chart.js: must export rMultiple and journalRows');
  else {
    if (!near(chart.rMultiple(297, 99), 3)) fail('chart.rMultiple: $297 on $99 at risk is 3R');
    const rows = chart.journalRows, avgR = rows.reduce((s, r) => s + r.r, 0) / rows.length;
    if (avgR.toFixed(2) !== '0.83') fail('chart.journalRows: the example rows average +0.83R');
    if (!near(chart.adherence(rows.map((r) => r.ok)), 5 / 6)) fail('chart.journalRows: 5 of 6 example rows followed the rules');
  }
  // Chapter 11 figures.
  if (typeof chart.sizedPath !== 'function' || typeof chart.adherence !== 'function') fail('js/chart.js: must export sizedPath and adherence');
  else {
    const rules = chart.sizedPath([0.01, 0.01, 0.01]), revenge = chart.sizedPath([0.01, 0.02, 0.04, 0.08]);
    if ((1 - rules[3]).toFixed(3) !== '0.030') fail('chart.sizedPath: three 1% losses cost about 3%');
    if ((1 - revenge[4]).toFixed(3) !== '0.143') fail('chart.sizedPath: losses of 1, 2, 4, and 8% cost about 14.3%');
    if (!near(chart.adherence([1, 1, 0, 1]), 0.75)) fail('chart.adherence: 3 of 4 trades by the rules is 75%');
  }
  // Chapter 10 figures: the streak arithmetic, and the four sized trades must match the table.
  if (typeof chart.streakLeft !== 'function' || !Array.isArray(chart.sizedTrades)) fail('js/chart.js: must export streakLeft and sizedTrades');
  else {
    if (chart.streakLeft(0.01, 10).toFixed(3) !== '0.904') fail('chart.streakLeft: ten 1% losses leave about 0.904');
    if (chart.streakLeft(0.1, 10).toFixed(3) !== '0.349') fail('chart.streakLeft: ten 10% losses leave about a third');
    const ch10 = read('content/chapters/10-risk-and-sizing.html');
    for (const t of chart.sizedTrades) {
      const shares = chart.positionSize(10000, 0.01, t.entry, t.stop);
      const row = `<tr><td>$${t.entry.toFixed(2)}</td><td>$${t.stop.toFixed(2)}</td><td>$${(t.entry - t.stop).toFixed(2)}</td><td>${shares}</td>` +
        `<td>${money0(shares * t.entry)}</td><td>${money0(shares * (t.entry - t.stop))}</td></tr>`;
      if (!ch10.includes(row)) fail(`chart.sizedTrades: the $${t.entry} trade does not match a row in the Chapter 10 table`);
    }
  }
  // Chapter 9 figures.
  if (typeof chart.longCallPL !== 'function' || typeof chart.tuitionPath !== 'function') fail('js/chart.js: must export longCallPL and tuitionPath');
  else {
    if (!near(chart.longCallPL(60, 50, 2), 800) || !near(chart.longCallPL(51, 50, 2), -100) || !near(chart.longCallPL(40, 50, 2), -200)) {
      fail('chart.longCallPL: a $50 call bought for $2 makes $800 at $60, loses $100 at $51, and at most $200');
    }
    const t = chart.tuitionPath(100, [-30, 10, -50, -40, 20]);
    if (t.path.join() !== '100,70,80,30,0' || t.over !== 4) fail('chart.tuitionPath: the budget stops at zero, and the month is over');
    if (chart.tuitionPath(100, [-10, 5]).over !== -1) fail('chart.tuitionPath: a month that never hits zero is not over');
  }
  // Chapter 8 figures: the payoffs, and the Wheel table's own numbers.
  if (typeof chart.coveredCallPL !== 'function' || typeof chart.shortPutPL !== 'function' || !Array.isArray(chart.wheel)) {
    fail('js/chart.js: must export coveredCallPL, shortPutPL, and wheel');
  } else {
    if (!near(chart.coveredCallPL(70, 50, 55, 1), 600)) fail('chart.coveredCallPL: called away at $55 with a $1 premium is +$600');
    if (!near(chart.coveredCallPL(40, 50, 55, 1), -900)) fail('chart.coveredCallPL: at $40 the shares lose $1,000, less $100 premium');
    if (!near(chart.shortPutPL(60, 50, 1.5), 150)) fail('chart.shortPutPL: above the strike you keep the $150');
    if (!near(chart.shortPutPL(40, 50, 1.5), -850)) fail('chart.shortPutPL: at $40 you lose $1,000, less the $150 premium');
    const net = chart.wheel.reduce((s, st) => s + st.cash, 0);
    if (net !== 750) fail('chart.wheel: one turn nets +$750, as in the Chapter 8 table');
    const ch8 = read('content/chapters/08-options-from-the-sellers-side.html');
    for (const st of chart.wheel) {
      const shown = (st.cash < 0 ? '-$' : '+$') + Math.abs(st.cash).toLocaleString('en-US');
      if (!ch8.includes('<td>' + shown + '</td>')) fail(`chart.wheel: ${shown} is not in the Chapter 8 table`);
    }
  }
  // Chapter 7 figures.
  if (typeof chart.rewardRisk !== 'function' || typeof chart.positionSize !== 'function' || typeof chart.runningAverage !== 'function') {
    fail('js/chart.js: must export rewardRisk, positionSize, and runningAverage');
  } else {
    if (!near(chart.rewardRisk(50, 47, 59), 3)) fail('chart.rewardRisk: entry 50, stop 47, target 59 is 3 to 1');
    if (chart.positionSize(10000, 0.01, 50, 47) !== 33) fail('chart.positionSize: $100 at risk with a $3 stop is 33 shares');
    if (chart.positionSize(10000, 0.01, 50, 49) !== 100 || chart.positionSize(10000, 0.01, 50, 45) !== 20) {
      fail('chart.positionSize: a $1 stop allows 100 shares, a $5 stop 20');
    }
    const a = chart.traderA;
    if (!Array.isArray(a) || a.length !== 50 || a.filter((v) => v > 0).length !== 20 || a.reduce((s, v) => s + v, 0) !== 3000) {
      fail('chart.traderA: 50 trades, 20 wins of $300 and 30 losses of $100, netting $3,000');
    } else {
      const run = chart.runningAverage(a);
      if (!near(run[49], 60)) fail('chart.runningAverage: Trader A settles at +$60 a trade after 50');
      if (!near(run[4], -20)) fail('chart.runningAverage: Trader A averages -$20 after the first 5 trades');
    }
  }
  // Chapter 5 figures.
  if (typeof chart.timeValueLeft !== 'function') fail('js/chart.js: must export timeValueLeft');
  else {
    if (!near(chart.timeValueLeft(15, 60), 0.5)) fail('chart.timeValueLeft: a quarter of the time left keeps half the time value');
    if (!near(chart.timeValueLeft(60, 60), 1) || !near(chart.timeValueLeft(0, 60), 0)) fail('chart.timeValueLeft: all at the start, none at expiry');
  }
  if (typeof chart.promoted !== 'function') fail('js/chart.js: must export promoted');
  else {
    if (!chart.promoted(5, 0.9) || chart.promoted(5, 0.89) || chart.promoted(0, 1) || chart.promoted(-1, 0.95)) {
      fail('chart.promoted: needs positive expectancy and at least 90% adherence');
    }
  }
  // Chapter 6, Fig. 6.5: the hedge floor.
  if (typeof chart.hedgedValue !== 'function') fail('js/chart.js: must export hedgedValue');
  else {
    if (!near(chart.hedgedValue(-0.4, 0.9, 0.02), 0.88)) fail('chart.hedgedValue: a 40% fall with a 90% floor and 2% premium leaves 0.88');
    if (!near(chart.hedgedValue(0.2, 0.9, 0.02), 1.18)) fail('chart.hedgedValue: a 20% rise less the 2% premium is 1.18');
  }
  // Chapter 4 figures: the strategy data drawn in Fig. 4.2 must match the table in the chapter.
  if (!Array.isArray(chart.strategies) || chart.strategies.length !== 13) fail('chart.strategies: must list all 13 strategies');
  else {
    const ch4 = read('content/chapters/04-the-strategy-menu.html').replace(/&rsquo;/g, '’');
    const rows = [...ch4.matchAll(/<tr><td>(\d+)<\/td><td>([^<]+)<\/td><td>[^<]*<\/td><td>([^<]+)<\/td><td>([^<]+)<\/td><\/tr>/g)];
    if (rows.length !== 13) fail('content/chapters/04: expected 13 strategy rows in the table');
    for (const [, num, name, risk, effort] of rows) {
      const s = chart.strategies[Number(num) - 1];
      if (!s || s.name !== name || s.risk !== risk || s.effort !== effort) fail(`chart.strategies: #${num} ${name} does not match the table (${risk}, ${effort})`);
    }
  }
  if (typeof chart.attentionShare !== 'function' || !near(chart.attentionShare(4), 0.25)) fail('chart.attentionShare: 4 strategies get 25% each');
  if (typeof chart.concentrationHit !== 'function' || !near(chart.concentrationHit(500), 0.002)) fail('chart.concentrationHit: 1 of 500 equal holdings is 0.2%');
  // Chapter 3 figures.
  if (typeof chart.expectancy !== 'function' || typeof chart.breakevenPayoff !== 'function' || typeof chart.netAfterCosts !== 'function') {
    fail('js/chart.js: must export expectancy, breakevenPayoff, and netAfterCosts');
  } else {
    if (!near(chart.expectancy(0.4, 300, 100), 60)) fail('chart.expectancy: Trader A is +$60 a trade');
    if (!near(chart.expectancy(0.6, 100, 200), -20)) fail('chart.expectancy: Trader B is -$20 a trade');
    if (!near(chart.breakevenPayoff(0.5), 1)) fail('chart.breakevenPayoff: at a 50% win rate, wins must equal losses');
    if (!near(chart.breakevenPayoff(0.25), 3)) fail('chart.breakevenPayoff: at a 25% win rate, wins must be 3 times losses');
    if (!near(chart.netAfterCosts(40, [15, 10, 20]), -5)) fail('chart.netAfterCosts: Fig. 3.2 nets to -$5');
    const seq = chart.traderB;
    if (!Array.isArray(seq) || seq.length !== 20 || seq.filter((v) => v > 0).length !== 12 || seq.reduce((a, b) => a + b, 0) !== -400) {
      fail('chart.traderB: 20 trades, 12 wins of $100 and 8 losses of $200, netting -$400');
    }
  }
  // Chapter 2 figures.
  if (typeof chart.recoveryYears !== 'function') fail('js/chart.js: must export recoveryYears');
  else {
    if (chart.recoveryYears(0.5, 0.07).toFixed(1) !== '10.2') fail('chart.recoveryYears: a 50% fall at 7% a year takes 10.2 years');
    if (chart.recoveryYears(0.3, 0.07).toFixed(1) !== '5.3') fail('chart.recoveryYears: a 30% fall at 7% a year takes 5.3 years');
    if (!near(chart.recoveryYears(0.5, 1), 1)) fail('chart.recoveryYears: a 50% fall at 100% a year takes 1 year');
  }
  if (typeof chart.forcedSale !== 'function') fail('js/chart.js: must export forcedSale');
  else if (chart.forcedSale(10000, 0.3).toFixed(2) !== '14285.71') fail('chart.forcedSale: $10,000 after a 30% fall uses shares worth $14,285.71 before it');
  if (typeof chart.portfolioHit !== 'function') fail('js/chart.js: must export portfolioHit');
  else if (!near(chart.portfolioHit(0.1, 0.5), 0.05)) fail('chart.portfolioHit: a 10% satellite losing half costs 5% of the total');
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
