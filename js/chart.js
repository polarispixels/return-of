// Charts. One file, one registry: an element with data-chart="<name>" gets the
// chart registered under that name. To add a chart, write a draw function and
// add it to CHARTS.
//
// Every chart is sized to its container in real pixels (so labels stay readable
// on a phone) and redrawn on resize. Colors and fonts come from the theme tokens
// of the nearest [data-style] ancestor, so a chart restyles with its theme.
//
// The arithmetic is exported for tools/check.js, which tests it in Node.
(function () {
  // ---- Arithmetic (pure) ----

  // Value of 1 after compounding yearly at `rate` for `years`.
  function grow(rate, years) { return Math.pow(1 + rate, years); }

  // Gain needed to get back to even after losing the fraction `loss`.
  function breakeven(loss) { return loss / (1 - loss); }

  // Value after `months` monthly deposits (made at month end), growing at the
  // yearly `rate` minus the yearly `fee`, compounded monthly.
  function futureValue(deposit, rate, fee, months) {
    var r = (rate - fee) / 12;
    if (r === 0) return deposit * months;
    return deposit * (Math.pow(1 + r, months) - 1) / r;
  }

  // Each holding's distance from its target, in percentage points (now minus target).
  function drift(target, now) { return now.map(function (v, i) { return v - target[i]; }); }

  // Index of the holding furthest below its target, in percentage points.
  function mostUnderweight(target, now) {
    var d = drift(target, now), best = 0;
    for (var i = 1; i < d.length; i++) if (d[i] < d[best]) best = i;
    return best;
  }

  // Dividend income in `year` (1 = first year) from `start` dollars invested at a
  // yield of `yieldRate`, with the payout growing `growth` a year. The yield is
  // held steady (the price grows with the payout), so reinvesting adds
  // `yieldRate` more shares each year.
  function dividendIncome(start, yieldRate, growth, year) {
    var cash = start * yieldRate * Math.pow(1 + growth, year - 1);
    return { cash: cash, reinvested: cash * Math.pow(1 + yieldRate, year - 1) };
  }

  // The thirteen strategies from the Chapter 4 table, word for word (tools/check.js
  // compares them). `group` names the slice from "How the strategies group".
  var STRATEGIES = [
    ['Index Core', 'Low', 'Low', 'core'], ['Custom Pie', 'Low to Med', 'Low', 'core'],
    ['Dividend Growth', 'Low to Med', 'Low', 'core'], ['Value', 'Med', 'High upfront, low ongoing', 'patient'],
    ['Growth Momentum', 'Med to High', 'High', 'satellite'], ['Covered Calls', 'Low to Med', 'Med', 'seller'],
    ['The Wheel', 'Med', 'Med', 'seller'], ['Protective Hedge', 'Lowers risk', 'Low to Med', 'insurance'],
    ['Swing Trading', 'High', 'Med to High', 'satellite'], ['Long Options', 'High', 'Med', 'casino'],
    ['Day Trading', 'High', 'Very High', 'casino'], ['0DTE Scalping', 'Very High', 'Very High', 'casino'],
    ['Systematic', 'Depends on rules', 'High upfront, low ongoing', 'systematic']
  ].map(function (r, i) { return { num: i + 1, name: r[0], risk: r[1], effort: r[2], group: r[3] }; });

  // For each strategy (column), how many platforms score 3, "built for it". `rows` is one
  // array of scores per platform.
  function builtForCounts(rows) {
    return rows[0].map(function (_, j) { return rows.filter(function (r) { return r[j] === 3; }).length; });
  }

  // A result as a multiple of the dollars put at risk (an "R").
  function rMultiple(result, risk) { return result / risk; }

  // Six made-up journal rows for Fig. 12.4: result in R, and whether the rules were followed.
  var JOURNAL_ROWS = [{ r: 3, ok: 1 }, { r: -1, ok: 1 }, { r: -1, ok: 0 }, { r: 2, ok: 1 }, { r: -1, ok: 1 }, { r: 3, ok: 1 }];

  // What is left of 1 after a run of losses, each costing its own share of what remains.
  // The first entry is the start.
  function sizedPath(risks) {
    var left = 1, path = [1];
    risks.forEach(function (r) { left *= 1 - r; path.push(left); });
    return path;
  }

  // Share of trades that followed the rules (1 = followed, 0 = broke one).
  function adherence(marks) { return marks.reduce(function (s, v) { return s + v; }, 0) / marks.length; }

  // What is left after `n` losses in a row, each costing `risk` of what remains.
  function streakLeft(risk, n) { return Math.pow(1 - risk, n); }

  // The four hypothetical trades from the Chapter 10 sizing table (tools/check.js confirms
  // each matches a row), sized at 1% of a $10,000 satellite.
  var SIZED = [{ entry: 50, stop: 47 }, { entry: 20, stop: 18 }, { entry: 100, stop: 90 }, { entry: 8, stop: 7.5 }];

  // Profit or loss at expiration on one call bought at `strike` for `premium` per share.
  function longCallPL(price, strike, premium) { return (Math.max(0, price - strike) - premium) * 100; }

  // A month of tuition: the budget at the start, then after each day's result, stopping at
  // zero. `over` is the index in `path` where it hit zero (the month ends there), or -1.
  function tuitionPath(start, changes) {
    var left = start, path = [start], over = -1;
    for (var i = 0; i < changes.length && over < 0; i++) {
      left = Math.max(0, left + changes[i]);
      path.push(left);
      if (left === 0) over = path.length - 1;
    }
    return { path: path, over: over };
  }

  // Profit or loss at expiration on 100 shares bought at `basis`, with one call sold at
  // `strike` for `premium` per share. Above the strike, the shares are called away.
  function coveredCallPL(price, basis, strike, premium) { return (Math.min(price, strike) - basis + premium) * 100; }

  // Profit or loss at expiration on one put sold at `strike` for `premium` per share.
  function shortPutPL(price, strike, premium) { return (premium - Math.max(0, strike - price)) * 100; }

  // One turn of the Wheel, the Chapter 8 table's hypothetical numbers (tools/check.js
  // confirms each cash flow appears in that table).
  var WHEEL = [
    { lines: ['1. Sell one $50 put', 'Premium +$150'], cash: 150, holding: 'cash' },
    { lines: ['2. Assigned: buy 100 at $50', 'Pay $5,000'], cash: -5000, holding: 'shares' },
    { lines: ['3. Sell one $55 call', 'Premium +$100'], cash: 100, holding: 'shares' },
    { lines: ['4. Called away at $55', 'Receive $5,500'], cash: 5500, holding: 'cash' }
  ];

  // Reward per dollar of risk, from the three written numbers of a trade.
  function rewardRisk(entry, stop, target) { return (target - entry) / (entry - stop); }

  // Whole shares that put `riskShare` of `capital` at risk if the stop is hit.
  function positionSize(capital, riskShare, entry, stop) { return Math.floor(capital * riskShare / (entry - stop) + 1e-9); }

  // Average result so far, after each trade.
  function runningAverage(results) {
    var sum = 0;
    return results.map(function (v, i) { sum += v; return sum / (i + 1); });
  }

  // Trader A from the Chapter 3 table (40% wins of $300, 60% losses of $100), as 50 trades
  // in a made-up order.
  var TRADER_A = 'LLWLLWLLWLLLWWLLWLLWLWLLLWWLLWLLWLWLLLWWLWLLWWLWLW'.split('').map(function (k) { return k === 'W' ? 300 : -100; });

  // Share of an at-the-money option's time value left with `daysLeft` of `daysTotal`, under
  // the standard approximation that time value scales with the square root of time left.
  function timeValueLeft(daysLeft, daysTotal) { return Math.sqrt(daysLeft / daysTotal); }

  // The Ladder's promotion rule: positive expectancy and at least 90% adherence.
  function promoted(expectancyPerTrade, adherence) { return expectancyPerTrade > 0 && adherence >= 0.9; }

  // Value of a core worth 1 after a market `move`, hedged by a put covering all of it:
  // never below `floor`, always less the `premium`.
  function hedgedValue(move, floor, premium) { return Math.max(1 + move, floor) - premium; }

  // Share of a fixed attention budget each strategy gets when split evenly across `n`.
  function attentionShare(n) { return 1 / n; }

  // Share of an equal-weight fund lost when one of `n` holdings goes to zero.
  function concentrationHit(n) { return 1 / n; }

  // Average result per trade.
  function expectancy(winRate, avgWin, avgLoss) { return winRate * avgWin - (1 - winRate) * avgLoss; }

  // Average win, as a multiple of the average loss, needed to break even at `winRate`.
  function breakevenPayoff(winRate) { return (1 - winRate) / winRate; }

  // What a gross edge per trade leaves after a list of costs per trade.
  function netAfterCosts(gross, costs) { return costs.reduce(function (n, c) { return n - c; }, gross); }

  // Trader B from the Chapter 3 table, as 20 trades in a made-up order: wins of $100
  // and losses of $200, three wins to two losses, repeated.
  var TRADER_B = [];
  for (var t = 0; t < 4; t++) TRADER_B.push(100, 100, -200, 100, -200);

  // What is left of 1 after a gain of `p` and then a loss of `p` (either order).
  function roundTrip(p) { return (1 + p) * (1 - p); }

  // Value in `year` of `start` growing at `rate`, with one fall of `loss` at `lossYear`
  // (the fall lands at the start of that year, so the year's value is already cut).
  function lossPath(start, rate, year, lossYear, loss) {
    return start * Math.pow(1 + rate, year) * (year >= lossYear ? 1 - loss : 1);
  }

  // Years to get back to even after falling by the fraction `loss`, growing at `rate` a year.
  function recoveryYears(loss, rate) { return Math.log(1 / (1 - loss)) / Math.log(1 + rate); }

  // To raise `cash` after a fall of `drop`, you sell shares that were worth this much before it.
  function forcedSale(cash, drop) { return cash / (1 - drop); }

  // Fraction of the whole portfolio lost when a slice of `share` loses the fraction `loss`.
  function portfolioHit(share, loss) { return share * loss; }

  // The example pie used across Chapter 6: one set of holdings, one set of colors.
  // Neutral holdings stay out of red, which the book keeps for loss, cost, risk, and the active slice.
  var PIE = {
    names: ['U.S. stocks', 'International stocks', 'Bonds'],
    target: [60, 30, 10],
    now: [67, 24, 9],
    tokens: ['--fg', '--accent-2', '--accent-2-soft'],
    opacity: [1, 1, 1]
  };

  // ---- Shared drawing helpers ----

  function context(el) {
    var css = getComputedStyle(el);
    // A stylesheet cached from before --accent-2 existed would leave the blues empty, which SVG
    // paints black. Fall back to the gray they replaced until the new stylesheet loads.
    var token = function (name) {
      var v = css.getPropertyValue(name).trim();
      return v || (name.indexOf('--accent-2') === 0 ? css.getPropertyValue('--muted').trim() : v);
    };
    return {
      token: token,
      width: Math.max(260, el.clientWidth),
      font: 'font-family="' + token('--font-body').replace(/"/g, "'") + '" font-size="12"'
    };
  }

  function mount(el, w, h, label, parts) {
    el.innerHTML = '<svg viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h +
      '" role="img" aria-label="' + label + '">' + parts.join('') + '</svg>';
  }

  // ---- Fig. 1: compound growth of one dollar ----

  function drawCompound(el) {
    var SERIES = [
      { rate: 0.04, token: '--accent-2', width: 1.5 },
      { rate: 0.07, token: '--fg', width: 2 },
      { rate: 0.10, token: '--accent', width: 3 }
    ];
    var YEARS = 30, Y_MAX = 18, Y_TICKS = [0, 5, 10, 15], X_TICKS = [0, 10, 20, 30];
    var c = context(el), token = c.token, font = c.font, w = c.width;
    var h = Math.round(Math.max(240, Math.min(440, w * 0.56)));
    var m = { top: 12, right: 92, bottom: 30, left: 34 };
    var x = function (yr) { return m.left + (yr / YEARS) * (w - m.left - m.right); };
    var y = function (v) { return h - m.bottom - (v / Y_MAX) * (h - m.top - m.bottom); };
    var out = [];

    Y_TICKS.forEach(function (t) {
      out.push('<line x1="' + m.left + '" x2="' + (w - m.right) + '" y1="' + y(t) + '" y2="' + y(t) +
        '" stroke="' + token(t === 0 ? '--fg' : '--muted') + '" stroke-width="' + (t === 0 ? 2 : 0.5) + '"/>');
      out.push('<text x="' + (m.left - 8) + '" y="' + (y(t) + 4) + '" text-anchor="end" fill="' + token('--muted') +
        '" ' + font + '>$' + t + '</text>');
    });
    X_TICKS.forEach(function (t) {
      out.push('<text x="' + x(t) + '" y="' + (h - 8) + '" text-anchor="' + (t === 0 ? 'start' : 'middle') +
        '" fill="' + token('--muted') + '" ' + font + '>' + (t === 0 ? 'Year 0' : t) + '</text>');
    });

    SERIES.forEach(function (s) {
      var pts = [];
      for (var yr = 0; yr <= YEARS; yr++) pts.push(x(yr).toFixed(1) + ',' + y(grow(s.rate, yr)).toFixed(1));
      var end = grow(s.rate, YEARS);
      var color = token(s.token);
      out.push('<polyline fill="none" stroke="' + color + '" stroke-width="' + s.width +
        '" stroke-linejoin="round" points="' + pts.join(' ') + '"/>');
      out.push('<circle cx="' + x(YEARS) + '" cy="' + y(end) + '" r="3.5" fill="' + color + '"/>');
      out.push('<text x="' + (x(YEARS) + 10) + '" y="' + (y(end) + 4) + '" fill="' + color + '" ' + font +
        ' font-weight="700">' + Math.round(s.rate * 100) + '%  $' + end.toFixed(2) + '</text>');
    });

    mount(el, w, h, 'Line chart: one dollar compounding for 30 years grows to $3.24 at 4 percent, ' +
      '$7.61 at 7 percent, and $17.45 at 10 percent.', out);
  }

  // ---- Fig. 2: the gain needed to recover from a loss ----
  // One row per loss. Two bars on the same scale: what was lost, and the gain
  // needed to get back to even. The loss bars barely move; the gain bars run away.

  function drawBreakeven(el) {
    var LOSSES = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
    var ROW = 34, BAR = 9, GAP = 2;
    var c = context(el), token = c.token, font = c.font, w = c.width;
    var m = { top: 30, right: 54, bottom: 4, left: 40 };
    var h = m.top + LOSSES.length * ROW + m.bottom;
    var max = breakeven(LOSSES[LOSSES.length - 1]);
    var plot = w - m.left - m.right;
    var len = function (v) { return Math.max(2, (v / max) * plot); };
    var pct = function (v) { return Math.round(v * 100) + '%'; };
    var out = [];

    // Legend: the two bars are also told apart by position and by their labels.
    out.push('<rect x="' + m.left + '" y="4" width="10" height="10" fill="' + token('--fg') + '"/>');
    out.push('<text x="' + (m.left + 16) + '" y="13" fill="' + token('--fg') + '" ' + font + '>You lose</text>');
    out.push('<rect x="' + (m.left + 82) + '" y="4" width="10" height="10" fill="' + token('--accent') + '"/>');
    out.push('<text x="' + (m.left + 98) + '" y="13" fill="' + token('--fg') + '" ' + font + '>You need to gain</text>');

    LOSSES.forEach(function (loss, i) {
      var top = m.top + i * ROW + (ROW - (BAR * 2 + GAP)) / 2;
      var need = breakeven(loss);
      out.push('<text x="' + (m.left - 8) + '" y="' + (top + BAR + GAP / 2 + 4) + '" text-anchor="end" fill="' +
        token('--fg') + '" ' + font + ' font-weight="700">' + pct(loss) + '</text>');
      out.push('<rect x="' + m.left + '" y="' + top + '" width="' + len(loss).toFixed(1) + '" height="' + BAR +
        '" fill="' + token('--fg') + '"/>');
      out.push('<rect x="' + m.left + '" y="' + (top + BAR + GAP) + '" width="' + len(need).toFixed(1) +
        '" height="' + BAR + '" fill="' + token('--accent') + '"/>');
      out.push('<text x="' + (m.left + len(need) + 6).toFixed(1) + '" y="' + (top + BAR * 2 + GAP - 0.5) +
        '" fill="' + token('--accent') + '" ' + font + ' font-weight="700">+' + pct(need) + '</text>');
    });
    out.push('<line x1="' + m.left + '" x2="' + m.left + '" y1="' + (m.top - 4) + '" y2="' + (h - m.bottom) +
      '" stroke="' + token('--fg') + '" stroke-width="2"/>');

    mount(el, w, h, 'Bar chart: the gain needed to get back to even after a loss. ' +
      LOSSES.map(function (l) { return 'Lose ' + pct(l) + ', need ' + pct(breakeven(l)); }).join('. ') + '.', out);
  }

  // ---- Kit: small pieces shared by the charts and diagrams below ----

  var f1 = function (n) { return (Math.round(n * 10) / 10).toString(); };
  var money = function (v) { return '$' + Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','); };
  var clamp = function (v, lo, hi) { return Math.max(lo, Math.min(hi, v)); };

  // Text. `lines` may be a string or an array (one line per entry, 15px apart).
  function text(c, x, y, lines, fill, attrs) {
    lines = [].concat(lines);
    return lines.map(function (s, i) {
      return '<text x="' + f1(x) + '" y="' + f1(y + i * 15) + '" fill="' + c.token(fill) + '" ' + c.font +
        (attrs ? ' ' + attrs : '') + '>' + s + '</text>';
    }).join('');
  }

  // A filled triangle with its tip at (x, y), pointing along the angle `dir` (radians).
  function arrowhead(x, y, dir, color) {
    var bx = x - 9 * Math.cos(dir), by = y - 9 * Math.sin(dir);
    var nx = 4.5 * Math.cos(dir + Math.PI / 2), ny = 4.5 * Math.sin(dir + Math.PI / 2);
    return '<path d="M' + f1(x) + ',' + f1(y) + ' L' + f1(bx + nx) + ',' + f1(by + ny) + ' L' + f1(bx - nx) + ',' +
      f1(by - ny) + ' Z" fill="' + color + '"/>';
  }

  // A straight arrow from (x1, y1) to (x2, y2).
  function arrow(x1, y1, x2, y2, color) {
    return '<line x1="' + f1(x1) + '" y1="' + f1(y1) + '" x2="' + f1(x2) + '" y2="' + f1(y2) + '" stroke="' + color +
      '" stroke-width="2"/>' + arrowhead(x2, y2, Math.atan2(y2 - y1, x2 - x1), color);
  }

  // A donut. Slices start at twelve o'clock and run clockwise, with a 2px gap
  // between them painted in the surface color.
  function donut(c, cx, cy, R, values, tokens, opacity) {
    var r = R * 0.58, a = -Math.PI / 2, out = [];
    var pt = function (rad, ang) { return f1(cx + rad * Math.cos(ang)) + ',' + f1(cy + rad * Math.sin(ang)); };
    values.forEach(function (v, i) {
      var b = a + (v / 100) * 2 * Math.PI, big = b - a > Math.PI ? 1 : 0;
      out.push('<path d="M' + pt(R, a) + ' A' + f1(R) + ',' + f1(R) + ' 0 ' + big + ' 1 ' + pt(R, b) + ' L' + pt(r, b) +
        ' A' + f1(r) + ',' + f1(r) + ' 0 ' + big + ' 0 ' + pt(r, a) + ' Z" fill="' + c.token(tokens[i]) +
        '" fill-opacity="' + (opacity ? opacity[i] : 1) + '" stroke="' + c.token('--bg') + '" stroke-width="2"/>');
      a = b;
    });
    return out.join('');
  }

  // ---- Fig. 6.1: what a fee costs over 30 years ----
  // Same deposits, same assumed return, two fees. The shaded gap is the fee's
  // cost: the fee itself plus everything it would have earned.

  function drawFees(el) {
    var DEPOSIT = 500, RATE = 0.07, LOW = 0.0003, HIGH = 0.01, YEARS = 30, Y_MAX = 650000;
    var Y_TICKS = [0, 200000, 400000, 600000], X_TICKS = [0, 10, 20, 30];
    var c = context(el), token = c.token, w = c.width;
    var h = Math.round(clamp(w * 0.62, 280, 440));
    var m = { top: 44, right: 98, bottom: 30, left: 46 };
    var x = function (yr) { return m.left + (yr / YEARS) * (w - m.left - m.right); };
    var y = function (v) { return h - m.bottom - (v / Y_MAX) * (h - m.top - m.bottom); };
    var at = function (fee) { return function (yr) { return futureValue(DEPOSIT, RATE, fee, yr * 12); }; };
    var low = at(LOW), high = at(HIGH), paid = function (yr) { return DEPOSIT * 12 * yr; };
    var pts = function (fn) {
      var p = [];
      for (var yr = 0; yr <= YEARS; yr++) p.push(f1(x(yr)) + ',' + f1(y(fn(yr))));
      return p;
    };
    var out = [];

    hGrid(c, out, m, w, y, Y_TICKS, function (t) { return t === 0 ? '$0' : '$' + t / 1000 + 'k'; });
    X_TICKS.forEach(function (t) {
      out.push(text(c, x(t), h - 8, t === 0 ? 'Year 0' : String(t), '--muted', 'text-anchor="' + (t === 0 ? 'start' : 'middle') + '"'));
    });

    // The gap between the two fee lines.
    out.push('<polygon points="' + pts(low).concat(pts(high).reverse()).join(' ') + '" fill="' + token('--accent') +
      '" fill-opacity="0.16"/>');
    out.push(polyline(pts(paid), token('--accent-2'), 2, 'stroke-dasharray="4 4"'));
    out.push(polyline(pts(high), token('--accent'), 2));
    out.push(polyline(pts(low), token('--fg'), 3));

    [{ fn: low, name: '0.03% fee', token: '--fg' }, { fn: high, name: '1.00% fee', token: '--accent' },
      { fn: paid, name: 'You put in', token: '--accent-2' }].forEach(function (s) {
      var end = s.fn(YEARS);
      out.push('<circle cx="' + f1(x(YEARS)) + '" cy="' + f1(y(end)) + '" r="3.5" fill="' + token(s.token) + '"/>');
      out.push(text(c, x(YEARS) + 10, y(end) - 2, s.name, '--fg', 'font-weight="700"'));
      out.push(text(c, x(YEARS) + 10, y(end) + 13, money(end), '--muted'));
    });

    // Key for the shaded gap.
    var cost = low(YEARS) - high(YEARS);
    out.push('<rect x="' + m.left + '" y="6" width="12" height="12" fill="' + token('--accent') + '" fill-opacity="0.16" stroke="' +
      token('--accent') + '" stroke-width="1"/>');
    out.push(text(c, m.left + 20, 16, 'Lost to the higher fee: <tspan font-weight="700">' + money(cost) + '</tspan>', '--fg'));

    mount(el, w, h, 'Line chart: $500 a month for 30 years at an assumed 7% return. With a 0.03% fee it grows to ' +
      money(low(YEARS)) + '; with a 1.00% fee, ' + money(high(YEARS)) + '. The higher fee costs ' + money(cost) +
      '. Total deposits are ' + money(paid(YEARS)) + '.', out);
  }

  // ---- Fig. 6.2: a pie, its targets, and where the next deposit goes ----

  function drawPie(el) {
    var c = context(el), token = c.token, w = c.width;
    var R = clamp((w - 48) / 4.4, 50, 96), gap = clamp(w * 0.12, 36, 96);
    var cx1 = w / 2 - gap / 2 - R, cx2 = w / 2 + gap / 2 + R, cy = 48 + R;
    var k = mostUnderweight(PIE.target, PIE.now), out = [];

    out.push(donut(c, cx1, cy, R, PIE.target, PIE.tokens, PIE.opacity));
    out.push(donut(c, cx2, cy, R, PIE.now, PIE.tokens, PIE.opacity));
    out.push(text(c, cx1, cy + 4, 'Target', '--fg', 'text-anchor="middle" font-weight="700"'));
    out.push(text(c, cx2, cy + 4, 'Today', '--fg', 'text-anchor="middle" font-weight="700"'));

    // Arrow from a label above into the middle of the most underweight slice.
    var before = PIE.now.slice(0, k).reduce(function (s, v) { return s + v; }, 0);
    var ang = -Math.PI / 2 + ((before + PIE.now[k] / 2) / 100) * 2 * Math.PI;
    var tx = cx2 + (R + 3) * Math.cos(ang), ty = cy + (R + 3) * Math.sin(ang);
    out.push(text(c, w / 2, 14, 'The next deposit buys this', '--fg', 'text-anchor="middle" font-weight="700"'));
    out.push(arrow(w / 2, 22, tx, ty, token('--fg')));

    // Legend: identity is never color alone.
    var lx = Math.max(4, w / 2 - 130), vx = lx + 176, ly = cy + R + 30;
    out.push(text(c, vx, ly, 'Target, today', '--muted'));
    PIE.names.forEach(function (name, i) {
      var yy = ly + 22 + i * 22;
      out.push('<rect x="' + f1(lx) + '" y="' + f1(yy - 10) + '" width="10" height="10" fill="' + token(PIE.tokens[i]) +
        '" fill-opacity="' + PIE.opacity[i] + '"/>');
      out.push(text(c, lx + 16, yy, name, '--fg', i === k ? 'font-weight="700"' : ''));
      out.push(text(c, vx, yy, PIE.target[i] + '% &rarr; ' + PIE.now[i] + '%', '--fg', i === k ? 'font-weight="700"' : ''));
    });

    mount(el, w, Math.round(ly + 22 * 3 + 8), 'Two donut charts of an example pie. Target: ' +
      PIE.names.map(function (n, i) { return n + ' ' + PIE.target[i] + '%'; }).join(', ') + '. Today: ' +
      PIE.names.map(function (n, i) { return n + ' ' + PIE.now[i] + '%'; }).join(', ') + '. The next deposit buys ' +
      PIE.names[k] + ', the furthest below target.', out);
  }

  // ---- Fig. 6.3 (left): the reinvestment loop ----

  function drawDividendLoop(el) {
    var STEPS = [['A dividend', 'is paid'], ['It buys', 'more shares'], ['More shares,', 'a larger payout']];
    var c = context(el), token = c.token, w = c.width;
    var r = clamp(w * 0.2, 56, 96), cx = w / 2, cy = r + 50, NODE = 13, out = [];
    var angles = [-90, 30, 150].map(function (d) { return d * Math.PI / 180; });
    var px = function (a) { return cx + r * Math.cos(a); }, py = function (a) { return cy + r * Math.sin(a); };

    // Arcs, clockwise, each ending in an arrowhead tangent to the circle.
    angles.forEach(function (a, i) {
      var pad = (NODE + 7) / r, a0 = a + pad, a1 = angles[(i + 1) % 3] + (i === 2 ? 2 * Math.PI : 0) - pad;
      out.push('<path d="M' + f1(px(a0)) + ',' + f1(py(a0)) + ' A' + f1(r) + ',' + f1(r) + ' 0 0 1 ' + f1(px(a1)) + ',' +
        f1(py(a1)) + '" fill="none" stroke="' + token('--fg') + '" stroke-width="2"/>');
      out.push(arrowhead(px(a1), py(a1), a1 + Math.PI / 2, token('--fg')));
    });
    angles.forEach(function (a, i) {
      out.push('<circle cx="' + f1(px(a)) + '" cy="' + f1(py(a)) + '" r="' + NODE + '" fill="' + token('--fg') + '"/>');
      out.push(text(c, px(a), py(a) + 4, String(i + 1), '--bg', 'text-anchor="middle" font-weight="700"'));
      // The top label sits above its node; the bottom two hang outward, clear of the arc.
      if (Math.sin(a) < 0) out.push(text(c, px(a), py(a) - NODE - 26, STEPS[i], '--fg', 'text-anchor="middle"'));
      else {
        var right = Math.cos(a) > 0;
        out.push(text(c, px(a) + (right ? -8 : -4), py(a) + NODE + 16, STEPS[i], '--fg',
          'text-anchor="' + (right ? 'start' : 'end') + '"'));
      }
    });
    out.push(text(c, cx, cy + 4, 'Repeat', '--muted', 'text-anchor="middle" font-weight="700"'));

    mount(el, w, Math.round(cy + r / 2 + NODE + 48), 'Cycle diagram: ' +
      STEPS.map(function (s, i) { return (i + 1) + ', ' + s.join(' '); }).join('; ') + '; then repeat.', out);
  }

  // ---- Fig. 6.3 (right): yearly income, taking cash vs reinvesting ----

  function drawDividendIncome(el) {
    var START = 5000, YIELD = 0.03, GROWTH = 0.06, YEARS = [1, 5, 10, 15, 20], Y_MAX = 800, Y_TICKS = [0, 200, 400, 600, 800];
    var c = context(el), token = c.token, w = c.width;
    var h = Math.round(clamp(w * 0.62, 260, 360));
    var m = { top: 34, right: 40, bottom: 28, left: 40 };
    var y = function (v) { return h - m.bottom - (v / Y_MAX) * (h - m.top - m.bottom); };
    var group = (w - m.left - m.right) / YEARS.length, bar = clamp(group * 0.3, 8, 24), out = [];

    hGrid(c, out, m, w, y, Y_TICKS, function (t) { return '$' + t; });
    out.push('<rect x="' + m.left + '" y="4" width="10" height="10" fill="' + token('--accent-2-soft') + '"/>');
    out.push(text(c, m.left + 16, 13, 'Taking cash', '--fg'));
    out.push('<rect x="' + (m.left + 104) + '" y="4" width="10" height="10" fill="' + token('--fg') + '"/>');
    out.push(text(c, m.left + 120, 13, 'Reinvesting', '--fg'));

    YEARS.forEach(function (yr, i) {
      var mid = m.left + group * (i + 0.5), inc = dividendIncome(START, YIELD, GROWTH, yr);
      out.push('<rect x="' + f1(mid - bar - 1) + '" y="' + f1(y(inc.cash)) + '" width="' + f1(bar) + '" height="' +
        f1(y(0) - y(inc.cash)) + '" fill="' + token('--accent-2-soft') + '"/>');
      out.push('<rect x="' + f1(mid + 1) + '" y="' + f1(y(inc.reinvested)) + '" width="' + f1(bar) + '" height="' +
        f1(y(0) - y(inc.reinvested)) + '" fill="' + token('--fg') + '"/>');
      out.push(text(c, mid, h - 8, i === 0 ? 'Year 1' : String(yr), '--muted', 'text-anchor="middle"'));
      if (i === YEARS.length - 1) {
        // Year 20 values sit in the right margin, level with the top of each bar.
        out.push(text(c, mid + bar + 6, y(inc.reinvested) + 4, money(inc.reinvested), '--fg', 'font-weight="700"'));
        out.push(text(c, mid + bar + 6, y(inc.cash) + 4, money(inc.cash), '--fg', 'font-weight="700"'));
      }
    });

    mount(el, w, h, 'Bar chart: yearly dividend income from $5,000 at a 3% yield with payouts growing 6% a year. ' +
      YEARS.map(function (yr) {
        var inc = dividendIncome(START, YIELD, GROWTH, yr);
        return 'Year ' + yr + ': ' + money(inc.cash) + ' taking cash, ' + money(inc.reinvested) + ' reinvesting';
      }).join('. ') + '.', out);
  }

  // ---- Fig. 6.4: drift from target, against a rebalancing band ----

  function drawDrift(el) {
    var BAND = 5, X_MAX = 10, ROW = 50;
    var c = context(el), token = c.token, w = c.width;
    var m = { top: 30, right: 8, bottom: 26, left: 8 };
    var half = (w - m.left - m.right) / 2, x0 = m.left + half;
    var sx = function (v) { return x0 + (v / X_MAX) * half; };
    var d = drift(PIE.target, PIE.now), h = m.top + PIE.names.length * ROW + m.bottom;
    var signed = function (v) { return (v > 0 ? '+' : v < 0 ? '&minus;' : '') + Math.abs(v); };
    var out = [];

    out.push('<rect x="' + f1(sx(-BAND)) + '" y="' + m.top + '" width="' + f1(sx(BAND) - sx(-BAND)) + '" height="' +
      (PIE.names.length * ROW) + '" fill="' + token('--muted') + '" fill-opacity="0.12"/>');
    out.push(text(c, x0, 14, 'Band: within ' + BAND + ' points of target', '--muted', 'text-anchor="middle"'));

    PIE.names.forEach(function (name, i) {
      var top = m.top + i * ROW, v = d[i], outside = Math.abs(v) > BAND;
      var action = outside ? (v > 0 ? 'trim' : 'add') : 'hold';
      out.push(text(c, m.left + 4, top + 18, name, '--fg', 'font-weight="700"'));
      out.push(text(c, w - m.right - 4, top + 18, signed(v) + (Math.abs(v) === 1 ? ' pt: ' : ' pts: ') + action, '--fg',
        'text-anchor="end"' + (outside ? ' font-weight="700"' : '')));
      out.push('<rect x="' + f1(Math.min(sx(0), sx(v))) + '" y="' + (top + 26) + '" width="' + f1(Math.max(2, Math.abs(sx(v) - sx(0)))) +
        '" height="14" fill="' + token(PIE.tokens[i]) + '" fill-opacity="' + PIE.opacity[i] + '"/>');
    });
    out.push('<line x1="' + f1(x0) + '" x2="' + f1(x0) + '" y1="' + (m.top - 4) + '" y2="' + (h - m.bottom) + '" stroke="' +
      token('--fg') + '" stroke-width="2"/>');
    [-10, -5, 0, 5, 10].forEach(function (t) {
      out.push(text(c, sx(t), h - 8, t === 0 ? 'Target' : signed(t), '--muted',
        'text-anchor="' + (t === -10 ? 'start' : t === 10 ? 'end' : 'middle') + '"'));
    });

    mount(el, w, h, 'Bar chart of drift from target, in percentage points, against a band of ' + BAND + ' points. ' +
      PIE.names.map(function (n, i) { return n + ': ' + (d[i] > 0 ? '+' : '') + d[i]; }).join(', ') + '.', out);
  }

  // ---- Fig. 6.5: why the core is the default ----
  // Two panels: the routine running, then lapsed. Blocks are not to scale.

  function drawCoreDefault(el) {
    var c = context(el), token = c.token, w = c.width;
    var side = w >= 560, pw = side ? (w - 32) / 2 : w, PH = 200, out = [];

    function panel(ox, oy, lapsed) {
      var satW = Math.max(84, pw * 0.3), satY = oy + 30, satH = 46, coreY = satY + satH + 30, coreH = 84;
      out.push(text(c, ox, oy + 14, lapsed ? '2. The routine lapses' : '1. The routine runs', '--muted', 'font-weight="700"'));
      if (lapsed) {
        out.push('<rect x="' + f1(ox + 1) + '" y="' + satY + '" width="' + f1(satW - 2) + '" height="' + satH + '" fill="none" stroke="' +
          token('--muted') + '" stroke-width="1.5" stroke-dasharray="5 4"/>');
        out.push(text(c, ox + satW / 2, satY + satH / 2 + 4, 'Empty', '--muted', 'text-anchor="middle"'));
        out.push(arrow(ox + satW / 2, satY + satH + 2, ox + satW / 2, coreY - 3, token('--accent')));
        out.push(text(c, ox + satW + 12, satY + 18, ['The slice goes', 'back to the core.'], '--fg'));
      } else {
        out.push(block(c, ox, satY, satW, satH, BUCKETS[3], ['Satellite']));
        out.push(text(c, ox + satW + 12, satY + 18, ['Active work.', 'Needs the routine.'], '--fg'));
      }
      out.push(block(c, ox, coreY, pw, coreH, BUCKETS[2], ['Core', ['Index funds, pies, dividends.', 'Runs without attention.']]));
      if (lapsed) {
        out.push('<rect x="' + f1(ox) + '" y="' + coreY + '" width="' + f1(satW) + '" height="5" fill="' + token('--accent') + '"/>');
      }
      // Strategies 1 to 3 live in the core: hollow chips read on the dark block.
      [3, 2, 1].forEach(function (n, k) { out.push(chip(c, ox + pw - 18 - k * 24, coreY + 18, n, 9, true)); });
    }

    panel(0, 0, false);
    if (side) panel(pw + 32, 0, true);
    else panel(0, PH + 16, true);

    mount(el, w, side ? PH : PH * 2 + 16, 'Diagram in two panels. First, the routine runs: a small satellite of active ' +
      'work sits on top of a large automated core. Second, the routine lapses: the satellite is empty and its money ' +
      'goes back to the core. Not to scale.', out);
  }

  // ---- Bucket colors, used in Chapters 2 and 6: core --fg, satellite --accent, cushion and reserve --muted ----

  var BUCKETS = [
    { name: 'Cushion', lines: ['Emergencies and', 'near-term bills'], token: '--accent-2', opacity: 1, dark: true },
    { name: 'Opportunity reserve', lines: ['Cash ready for', 'a setup'], token: '--accent-2-soft', opacity: 1, dark: false },
    { name: 'Core', lines: ['Long-term growth,', 'little attention'], token: '--fg', opacity: 1, dark: true },
    { name: 'Satellite', lines: ['Active work,', 'capped small'], token: '--accent', opacity: 1, dark: true }
  ];

  function block(c, x, y, bw, bh, b, labels) {
    var dark = b.dark !== false;
    return '<rect x="' + f1(x) + '" y="' + f1(y) + '" width="' + f1(bw) + '" height="' + bh + '" fill="' + c.token(b.token) +
      '" fill-opacity="' + b.opacity + '"/>' +
      text(c, x + 10, y + 22, labels[0], dark ? '--bg' : '--fg', 'font-weight="700"') +
      (labels[1] ? text(c, x + 10, y + 40, labels[1], dark ? '--bg' : '--fg') : '');
  }

  // ---- Fig. 2.1: how long a fall takes to recover ----

  function drawRecovery(el) {
    var LOSSES = [0.1, 0.2, 0.3, 0.4, 0.5], RATE = 0.07, NEED = 2, X_MAX = 12, ROW = 30, BAR = 14;
    var c = context(el), token = c.token, w = c.width;
    var m = { top: 30, right: 64, bottom: 26, left: 48 };
    var h = m.top + LOSSES.length * ROW + m.bottom;
    var sx = function (v) { return m.left + (v / X_MAX) * (w - m.left - m.right); };
    var out = [];

    out.push('<rect x="' + f1(sx(0)) + '" y="' + m.top + '" width="' + f1(sx(NEED) - sx(0)) + '" height="' + LOSSES.length * ROW +
      '" fill="' + token('--accent') + '" fill-opacity="0.14"/>');
    out.push('<rect x="' + m.left + '" y="4" width="12" height="12" fill="' + token('--accent') + '" fill-opacity="0.14" stroke="' +
      token('--accent') + '" stroke-width="1"/>');
    out.push(text(c, m.left + 20, 14, 'Money you may need within ' + NEED + ' years', '--fg'));
    (w < 420 ? [0, 4, 8, 12] : [0, 2, 4, 6, 8, 10, 12]).forEach(function (t) {
      out.push('<line x1="' + f1(sx(t)) + '" x2="' + f1(sx(t)) + '" y1="' + m.top + '" y2="' + (h - m.bottom) + '" stroke="' +
        token('--muted') + '" stroke-width="0.5"/>');
      out.push(text(c, sx(t), h - 8, t === X_MAX ? t + ' yrs' : String(t), '--muted', 'text-anchor="middle"'));
    });
    LOSSES.forEach(function (loss, i) {
      var top = m.top + i * ROW + (ROW - BAR) / 2, yrs = recoveryYears(loss, RATE);
      out.push(text(c, m.left - 8, top + BAR - 2, '&minus;' + Math.round(loss * 100) + '%', '--fg', 'text-anchor="end" font-weight="700"'));
      out.push('<rect x="' + f1(sx(0)) + '" y="' + f1(top) + '" width="' + f1(sx(yrs) - sx(0)) + '" height="' + BAR + '" fill="' + token('--fg') + '"/>');
      out.push(text(c, sx(yrs) + 6, top + BAR - 2, yrs.toFixed(1) + ' yrs', '--fg'));
    });
    out.push('<line x1="' + m.left + '" x2="' + m.left + '" y1="' + (m.top - 4) + '" y2="' + (h - m.bottom) + '" stroke="' +
      token('--fg') + '" stroke-width="2"/>');

    mount(el, w, h, 'Bar chart: years to get back to even after a fall, growing at an assumed 7% a year. ' +
      LOSSES.map(function (l) { return 'Down ' + Math.round(l * 100) + '%: ' + recoveryYears(l, RATE).toFixed(1) + ' years'; }).join('. ') +
      '. Money needed within 2 years cannot wait that long.', out);
  }

  // ---- Fig. 2.2: fill the buckets in order ----
  // A staircase of buckets. New money pours into the first; each overflows into the next.

  function drawBuckets(el) {
    var FILL = [1, 1, 0.7, 0.35], CAP = 0.5;
    var c = context(el), token = c.token, w = c.width;
    var bw = clamp(w * 0.16, 56, 90), bh = 48, row = 66, step = clamp(w * 0.1, 34, 110), y0 = 44, out = [];
    var bx = function (i) { return i * step; }, by = function (i) { return y0 + i * row; };

    out.push(text(c, 0, 14, 'New money', '--fg', 'font-weight="700"'));
    out.push(arrow(bw / 2, 20, bw / 2, y0 - 4, token('--fg')));

    BUCKETS.forEach(function (b, i) {
      var x = bx(i), y = by(i), fh = (bh - 4) * FILL[i];
      out.push('<rect x="' + f1(x + 3) + '" y="' + f1(y + bh - 2 - fh) + '" width="' + f1(bw - 6) + '" height="' + f1(fh) + '" fill="' +
        token(b.token) + '" fill-opacity="' + b.opacity + '"/>');
      out.push('<path d="M' + f1(x) + ',' + y + ' v' + bh + ' h' + f1(bw) + ' v-' + bh + '" fill="none" stroke="' + token('--fg') +
        '" stroke-width="2"/>');
      if (i === BUCKETS.length - 1) {
        var cy = y + bh - 2 - (bh - 4) * CAP;
        out.push('<line x1="' + f1(x - 4) + '" x2="' + f1(x + bw + 4) + '" y1="' + f1(cy) + '" y2="' + f1(cy) + '" stroke="' +
          token('--fg') + '" stroke-width="1.5" stroke-dasharray="4 3"/>');
      }
      var lx = x + step + bw / 2 + 14;
      out.push(text(c, lx, y + 12, (i + 1) + '. ' + b.name, '--fg', 'font-weight="700"'));
      out.push(text(c, lx, y + 28, b.lines, '--fg'));
      // Overflow: from the right lip of this bucket into the next one.
      if (i < BUCKETS.length - 1) {
        var nx = bx(i + 1) + bw / 2;
        out.push('<path d="M' + f1(x + bw) + ',' + (y - 2) + ' H' + f1(nx) + ' V' + (by(i + 1) - 10) + '" fill="none" stroke="' +
          token('--fg') + '" stroke-width="2"/>');
        out.push(arrowhead(nx, by(i + 1) - 3, Math.PI / 2, token('--fg')));
      }
    });

    mount(el, w, by(3) + bh + 6, 'Diagram: new money fills four buckets in order, each overflowing into the next. ' +
      BUCKETS.map(function (b, i) { return (i + 1) + ', ' + b.name + ': ' + b.lines.join(' '); }).join('. ') +
      '. The satellite has a cap.', out);
  }

  // ---- Fig. 2.3: a $10,000 bill, without and with a cushion ----

  function drawCushion(el) {
    var BILL = 10000, DROP = 0.3;
    var c = context(el), token = c.token, w = c.width;
    var side = w >= 560, pw = side ? (w - 32) / 2 : w, PH = 226, out = [];

    function panel(ox, oy, cushion) {
      var billW = 120, billX = ox + pw / 2 - billW / 2, billY = oy + 28, rowY = oy + 112, bh = 64;
      out.push(text(c, ox, oy + 14, cushion ? '2. With a cushion' : '1. Without a cushion', '--muted', 'font-weight="700"'));
      out.push('<rect x="' + f1(billX) + '" y="' + billY + '" width="' + billW + '" height="34" fill="none" stroke="' +
        token('--fg') + '" stroke-width="2"/>');
      out.push(text(c, billX + billW / 2, billY + 22, money(BILL) + ' bill', '--fg', 'text-anchor="middle" font-weight="700"'));
      if (!cushion) {
        var cw = pw * 0.62;
        out.push(block(c, ox, rowY, cw, bh, BUCKETS[2], ['Core', 'Down ' + Math.round(DROP * 100) + '% this year']));
        out.push(arrow(ox + cw / 2, rowY - 4, billX + billW / 2, billY + 40, token('--accent')));
        out.push(text(c, ox, rowY + bh + 22, ['Sells shares that were worth', money(forcedSale(BILL, DROP)) + ' before the drop.'], '--fg'));
      } else {
        var third = (pw - 12) / 3;
        out.push(block(c, ox, rowY, third, bh, BUCKETS[0], ['Cushion']));
        out.push(block(c, ox + third + 6, rowY, third, bh, BUCKETS[1], ['Reserve']));
        out.push(block(c, ox + 2 * (third + 6), rowY, third, bh, BUCKETS[2], ['Core']));
        out.push(arrow(ox + third / 2, rowY - 4, billX + billW / 2, billY + 40, token('--accent')));
        out.push(text(c, ox, rowY + bh + 22, ['Paid from the cushion.', 'Reserve and core untouched.'], '--fg'));
      }
    }

    panel(0, 0, false);
    if (side) panel(pw + 32, 0, true);
    else panel(0, PH + 16, true);

    mount(el, w, side ? PH : PH * 2 + 16, 'Diagram in two panels. Without a cushion, a ' + money(BILL) +
      ' bill is paid by selling core shares after a 30% fall, using shares that were worth ' + money(forcedSale(BILL, DROP)) +
      '. With a cushion, the bill is paid from the cushion and the reserve and core are untouched.', out);
  }

  // ---- Fig. 2.4: a capped satellite cannot sink the whole ----
  // Three 10 by 10 grids, each the whole portfolio. Satellite cells sit at the end;
  // the half it loses is drawn hollow.

  function drawSatelliteCap(el) {
    var SHARES = [0.05, 0.1, 0.2], LOSS = 0.5;
    var c = context(el), token = c.token, w = c.width;
    var gap = 16, pw = Math.min(200, (w - gap * 2) / 3), cell = pw / 10, top = 30, out = [];
    var start = (w - (pw * 3 + gap * 2)) / 2;

    out.push('<rect x="' + f1(start) + '" y="4" width="10" height="10" fill="' + token('--accent') + '"/>');
    out.push(text(c, start + 15, 13, 'Satellite', '--fg'));
    out.push('<rect x="' + f1(start + 82.5) + '" y="4.5" width="9" height="9" fill="none" stroke="' + token('--accent') + '" stroke-width="1.5"/>');
    out.push(text(c, start + 97, 13, 'Lost', '--fg'));
    out.push('<rect x="' + f1(start + 140) + '" y="4" width="10" height="10" fill="' + token('--accent-2-soft') + '"/>');
    out.push(text(c, start + 155, 13, 'Everything else', '--fg'));

    SHARES.forEach(function (share, k) {
      var ox = start + k * (pw + gap), n = Math.round(share * 100), lost = Math.round(n * LOSS);
      for (var i = 0; i < 100; i++) {
        var x = ox + (i % 10) * cell + 0.75, y = top + Math.floor(i / 10) * cell + 0.75, s = cell - 1.5;
        var sat = i >= 100 - n, gone = i >= 100 - lost;
        out.push(gone
          ? '<rect x="' + f1(x + 0.75) + '" y="' + f1(y + 0.75) + '" width="' + f1(s - 1.5) + '" height="' + f1(s - 1.5) +
            '" fill="none" stroke="' + token('--accent') + '" stroke-width="1.5"/>'
          : '<rect x="' + f1(x) + '" y="' + f1(y) + '" width="' + f1(s) + '" height="' + f1(s) + '" fill="' +
            token(sat ? '--accent' : '--accent-2-soft') + '"/>');
      }
      var ly = top + pw + 20;
      out.push(text(c, ox, ly, n + '% satellite', '--fg', 'font-weight="700"'));
      out.push(text(c, ox, ly + 16, ['loses half:', 'total &minus;' + f1(portfolioHit(share, LOSS) * 100) + '%'], '--fg'));
    });

    mount(el, w, Math.round(top + pw + 20 + 16 + 15 + 8), 'Three grids of 100 squares, each the whole portfolio. ' +
      SHARES.map(function (s) {
        return 'A ' + Math.round(s * 100) + '% satellite that loses half costs ' + f1(portfolioHit(s, LOSS) * 100) + '% of the total';
      }).join('. ') + '.', out);
  }

  // ---- Chart frame: horizontal gridlines with labels (shared by the line charts below) ----

  function hGrid(c, out, m, w, y, ticks, label) {
    ticks.forEach(function (t, i) {
      out.push('<line x1="' + m.left + '" x2="' + f1(w - m.right) + '" y1="' + f1(y(t)) + '" y2="' + f1(y(t)) + '" stroke="' +
        c.token(i === 0 ? '--fg' : '--muted') + '" stroke-width="' + (i === 0 ? 2 : 0.5) + '"/>');
      out.push(text(c, m.left - 8, y(t) + 4, label(t), '--muted', 'text-anchor="end"'));
    });
  }

  // Spread label positions (y values) so no two sit closer than `gap`, keeping their order.
  function spread(ys, gap) {
    var order = ys.map(function (v, i) { return i; }).sort(function (a, b) { return ys[a] - ys[b]; });
    var out = ys.slice();
    for (var k = 1; k < order.length; k++) {
      if (out[order[k]] - out[order[k - 1]] < gap) out[order[k]] = out[order[k - 1]] + gap;
    }
    return out;
  }

  function polyline(points, color, width, extra) {
    return '<polyline fill="none" stroke="' + color + '" stroke-width="' + width + '" stroke-linejoin="round"' +
      (extra ? ' ' + extra : '') + ' points="' + points.join(' ') + '"/>';
  }

  // ---- Fig. 1.1: equal ups and downs do not cancel ----

  function drawRoundTrip(el) {
    var SERIES = [{ p: 0.1, token: '--accent-2', width: 1.5 }, { p: 0.25, token: '--fg', width: 2 }, { p: 0.5, token: '--accent', width: 3 }];
    var STEPS = ['Start', 'After the gain', 'After the loss'], Y_MIN = 60, Y_MAX = 160;
    var c = context(el), token = c.token, w = c.width;
    var h = Math.round(clamp(w * 0.55, 260, 380));
    var m = { top: 14, right: 96, bottom: 30, left: 46 };
    var x = function (i) { return m.left + 8 + i * (w - m.left - m.right - 16) / 2; };
    var y = function (v) { return h - m.bottom - ((v - Y_MIN) / (Y_MAX - Y_MIN)) * (h - m.top - m.bottom); };
    var out = [];

    hGrid(c, out, m, w, y, [60, 80, 100, 120, 140, 160], function (t) { return '$' + t; });
    out.push('<line x1="' + m.left + '" x2="' + f1(w - m.right) + '" y1="' + f1(y(100)) + '" y2="' + f1(y(100)) + '" stroke="' +
      token('--fg') + '" stroke-width="1.5" stroke-dasharray="5 4"/>');
    STEPS.forEach(function (s, i) {
      out.push(text(c, x(i), h - 8, w < 420 && i === 1 ? 'Gain' : w < 420 && i === 2 ? 'Loss' : s, '--muted',
        'text-anchor="' + (i === 0 ? 'start' : i === 2 ? 'end' : 'middle') + '"'));
    });
    var labelY = spread(SERIES.map(function (s) { return y(100 * roundTrip(s.p)) + 4; }), 16);
    SERIES.forEach(function (s, k) {
      var vals = [100, 100 * (1 + s.p), 100 * roundTrip(s.p)], color = token(s.token);
      out.push(polyline(vals.map(function (v, i) { return f1(x(i)) + ',' + f1(y(v)); }), color, s.width));
      vals.forEach(function (v, i) { out.push('<circle cx="' + f1(x(i)) + '" cy="' + f1(y(v)) + '" r="3.5" fill="' + color + '"/>'); });
      out.push(text(c, x(2) + 10, labelY[k], '&plusmn;' + Math.round(s.p * 100) + '%: <tspan font-weight="700">$' +
        (Math.round(vals[2] * 100) / 100).toFixed(Math.round(vals[2] * 100) % 100 ? 2 : 0) + '</tspan>', '--fg'));
    });

    mount(el, w, h, 'Slope chart: $100 rises and then falls by the same percentage. Up and down 10% leaves $99; ' +
      '25% leaves $93.75; 50% leaves $75. The dashed line is the $100 start.', out);
  }

  // ---- Fig. 1.2: the gain needed, as a curve ----

  function drawBreakevenCurve(el) {
    var MARKS = [0.1, 0.25, 0.5, 0.75, 0.9], Y_MAX = 9, X_MAX = 0.9;
    var c = context(el), token = c.token, w = c.width;
    var h = Math.round(clamp(w * 0.6, 280, 420));
    var m = { top: 22, right: 20, bottom: 30, left: 50 };
    var x = function (l) { return m.left + (l / X_MAX) * (w - m.left - m.right); };
    var y = function (g) { return h - m.bottom - (g / Y_MAX) * (h - m.top - m.bottom); };
    var pct = function (v) { return Math.round(v * 100) + '%'; };
    var out = [], curve = [], narrow = w < 420;

    hGrid(c, out, m, w, y, [0, 3, 6, 9], function (t) { return pct(t); });
    (narrow ? [0, 0.5, 0.9] : [0, 0.25, 0.5, 0.75, 0.9]).forEach(function (t) {
      out.push(text(c, x(t), h - 8, t === 0 ? 'Loss 0%' : pct(t), '--muted', 'text-anchor="' + (t === 0 ? 'start' : t === 0.9 ? 'end' : 'middle') + '"'));
    });
    // Where the curve would be if a loss and an equal gain cancelled.
    out.push('<line x1="' + f1(x(0)) + '" y1="' + f1(y(0)) + '" x2="' + f1(x(X_MAX)) + '" y2="' + f1(y(X_MAX)) + '" stroke="' +
      token('--fg') + '" stroke-width="1.5" stroke-dasharray="5 4"/>');
    if (!narrow) out.push(text(c, x(X_MAX), y(X_MAX) + 16, 'If they cancelled', '--muted', 'text-anchor="end"'));
    for (var l = 0; l <= X_MAX + 1e-9; l += 0.01) curve.push(f1(x(l)) + ',' + f1(y(breakeven(l))));
    out.push(polyline(curve, token('--accent'), 3));
    MARKS.forEach(function (l) {
      var g = breakeven(l);
      if (narrow && l < 0.5) { out.push('<circle cx="' + f1(x(l)) + '" cy="' + f1(y(g)) + '" r="4" fill="' + token('--accent') + '"/>'); return; }
      out.push('<circle cx="' + f1(x(l)) + '" cy="' + f1(y(g)) + '" r="4" fill="' + token('--accent') + '"/>');
      out.push(text(c, x(l) - 8, y(g) - 6, '+' + pct(g), '--fg', 'text-anchor="end" font-weight="700"'));
    });
    if (!narrow) out.push(text(c, m.left + 6, m.top - 8, 'Gain needed to get back to even', '--fg', 'font-weight="700"'));

    mount(el, w, h, 'Line chart: the gain needed to get back to even rises slowly and then turns vertical. ' +
      MARKS.map(function (l) { return 'Lose ' + pct(l) + ', need ' + pct(breakeven(l)); }).join('. ') +
      '. A dashed line shows where it would be if equal gains and losses cancelled.', out);
  }

  // ---- Fig. 1.3: one deep fall resets the clock ----

  function drawSurvivors(el) {
    var START = 10000, RATE = 0.07, YEARS = 30, FALL_YEAR = 10, FALL = 0.5, Y_MAX = 80000;
    var c = context(el), token = c.token, w = c.width;
    var h = Math.round(clamp(w * 0.58, 280, 420));
    var m = { top: 40, right: 96, bottom: 30, left: 46 };
    var x = function (yr) { return m.left + (yr / YEARS) * (w - m.left - m.right); };
    var y = function (v) { return h - m.bottom - (v / Y_MAX) * (h - m.top - m.bottom); };
    var steady = [], fell = [], out = [];

    hGrid(c, out, m, w, y, [0, 20000, 40000, 60000, 80000], function (t) { return t === 0 ? '$0' : '$' + t / 1000 + 'k'; });
    var narrow = w < 420;
    [0, 10, 20, 30].forEach(function (t) {
      out.push(text(c, x(t), h - 8, t === 0 && !narrow ? 'Year 0' : String(t), '--muted', 'text-anchor="' + (t === 0 ? 'start' : 'middle') + '"'));
    });
    for (var yr = 0; yr <= YEARS; yr++) {
      steady.push(f1(x(yr)) + ',' + f1(y(lossPath(START, RATE, yr, YEARS + 1, 0))));
      if (yr === FALL_YEAR) fell.push(f1(x(yr)) + ',' + f1(y(lossPath(START, RATE, yr, YEARS + 1, 0))));
      fell.push(f1(x(yr)) + ',' + f1(y(lossPath(START, RATE, yr, FALL_YEAR, FALL))));
    }
    out.push(polyline(steady, token('--fg'), 2));
    out.push(polyline(fell, token('--accent'), 3));

    // Where the fallen path gets back to its pre-fall peak.
    var peak = lossPath(START, RATE, FALL_YEAR, YEARS + 1, 0), back = FALL_YEAR + recoveryYears(FALL, RATE);
    out.push('<line x1="' + f1(x(FALL_YEAR)) + '" x2="' + f1(x(back)) + '" y1="' + f1(y(peak)) + '" y2="' + f1(y(peak)) + '" stroke="' +
      token('--muted') + '" stroke-width="1.5" stroke-dasharray="3 3"/>');
    out.push('<circle cx="' + f1(x(back)) + '" cy="' + f1(y(peak)) + '" r="4" fill="' + token('--accent') + '"/>');
    out.push(text(c, x(back) + 8, y(peak) + 16, ['Back to even', 'in year ' + back.toFixed(0)], '--fg'));
    out.push(text(c, x(FALL_YEAR) + 6, y(peak / 2) + 16, '&minus;50%' + (narrow ? '' : ' in year ' + FALL_YEAR), '--fg', 'font-weight="700"'));

    [{ v: lossPath(START, RATE, YEARS, YEARS + 1, 0), name: 'No fall', token: '--fg' },
      { v: lossPath(START, RATE, YEARS, FALL_YEAR, FALL), name: 'One fall', token: '--accent' }].forEach(function (s) {
      out.push('<circle cx="' + f1(x(YEARS)) + '" cy="' + f1(y(s.v)) + '" r="3.5" fill="' + token(s.token) + '"/>');
      out.push(text(c, x(YEARS) + 10, y(s.v) - 2, s.name, '--fg', 'font-weight="700"'));
      out.push(text(c, x(YEARS) + 10, y(s.v) + 13, money(s.v), '--muted'));
    });
    out.push(text(c, m.left, 14, 'Same 7% every year, except one', '--fg', 'font-weight="700"'));

    mount(el, w, h, 'Line chart: $10,000 growing at an assumed 7% a year for 30 years ends at ' +
      money(lossPath(START, RATE, YEARS, YEARS + 1, 0)) + '. With one 50% fall in year 10 it ends at ' +
      money(lossPath(START, RATE, YEARS, FALL_YEAR, FALL)) + ', and only gets back to its year 10 value in year ' +
      back.toFixed(0) + '.', out);
  }

  // ---- Fig. 1.4: each habit stops one way to lose big ----

  function drawHabits(el) {
    var ROWS = [
      { threat: 'One holding grows big enough to hurt', habit: ['Position limits'] },
      { threat: 'One mistake keeps running', habit: ['Stops'] },
      { threat: 'A bill forces a sale at a bad price', habit: ['Cash for', 'known needs'] },
      { threat: 'Money drifts while you look away', habit: ['A passive', 'default'] }
    ];
    var c = context(el), token = c.token, w = c.width;
    var ROW = 64, wall = Math.round(clamp(w * 0.55, 150, 420)), out = [];

    ROWS.forEach(function (r, i) {
      var top = i * ROW, ay = top + 34;
      out.push(text(c, 0, top + 14, r.threat, '--fg'));
      out.push(arrow(0, ay, wall - 2, ay, token('--accent')));
      out.push('<rect x="' + wall + '" y="' + (ay - 14) + '" width="8" height="28" fill="' + token('--fg') + '"/>');
      out.push(text(c, wall + 18, ay + (r.habit.length > 1 ? -3 : 5), r.habit, '--fg', 'font-weight="700"'));
    });

    mount(el, w, ROWS.length * ROW, 'Diagram: four threats, each stopped by a habit. ' +
      ROWS.map(function (r) { return r.threat + ': stopped by ' + r.habit.join(' ').toLowerCase(); }).join('. ') + '.', out);
  }

  // ---- Fig. 1.5: the order of questions ----

  function drawQuestions(el) {
    var c = context(el), token = c.token, w = c.width;
    var bw = Math.min(360, w), x0 = (w - bw) / 2, cx = w / 2, BH = 40, out = [];
    var half = (bw - 12) / 2, lx = x0 + half / 2, rx = x0 + half + 12 + half / 2;

    function box(x, y, bwid, lines, filled, stroke) {
      out.push('<rect x="' + f1(x) + '" y="' + y + '" width="' + f1(bwid) + '" height="' + (lines.length > 1 ? 50 : BH) + '" fill="' +
        (filled ? token('--fg') : 'none') + '" stroke="' + token(stroke || '--fg') + '" stroke-width="2"/>');
      out.push(text(c, x + bwid / 2, y + (lines.length > 1 ? 21 : 25), lines, filled ? '--bg' : '--fg', 'text-anchor="middle" font-weight="700"'));
    }

    box(x0, 0, bw, ['1. How much could it lose?']);
    out.push(arrow(cx, BH + 2, cx, 62, token('--fg')));
    box(x0, 64, bw, ['2. Could you live with that?']);
    out.push('<path d="M' + f1(cx) + ',' + (64 + BH + 2) + ' V122 M' + f1(lx) + ',122 H' + f1(rx) + '" fill="none" stroke="' +
      token('--fg') + '" stroke-width="2"/>');
    out.push(arrow(lx, 121, lx, 148, token('--fg')));
    out.push(arrow(rx, 121, rx, 148, token('--accent')));
    out.push(text(c, lx + 8, 140, 'Yes', '--fg', 'font-weight="700"'));
    out.push(text(c, rx + 8, 140, 'No', '--accent', 'font-weight="700"'));
    box(x0, 150, half, ['3. Now ask what', 'it could make'], true);
    box(x0 + half + 12, 150, half, ['Smaller size, or', 'not ready yet'], false, '--accent');

    mount(el, w, 202, 'Flowchart: first ask how much a position could lose. Then ask whether you could live with that. ' +
      'If yes, ask what it could make. If no, make it smaller or wait until the idea is ready.', out);
  }

  // ---- Kit: a labeled box for flow diagrams. One line is 40px tall, two lines 50px. ----
  // opts.fill: a token to fill with (text turns to --bg); opts.stroke: outline token.

  function box(c, x, y, bw, lines, opts) {
    opts = opts || {};
    lines = [].concat(lines);
    var bh = lines.length > 1 ? 50 : 40;
    return '<rect x="' + f1(x) + '" y="' + f1(y) + '" width="' + f1(bw) + '" height="' + bh + '" fill="' +
      (opts.fill ? c.token(opts.fill) : 'none') + '" stroke="' + c.token(opts.fill || opts.stroke || '--fg') + '" stroke-width="2"/>' +
      text(c, x + bw / 2, y + (lines.length > 1 ? 21 : 25), lines, opts.fill ? '--bg' : '--fg', 'text-anchor="middle" font-weight="700"');
  }

  // ---- Fig. 3.1: a method is not an edge until results say so ----

  function drawEdgeChain(el) {
    var STEPS = [
      { lines: ['Information, analysis, discipline,', 'low costs, or patience'], opts: { stroke: '--accent-2' }, note: 'Where an edge can come from' },
      { lines: ['A written method'], opts: { fill: '--fg' }, note: 'Entry, stop, and target' },
      { lines: ['Many trades, after costs'], opts: {}, note: 'Not one big win' },
      { lines: ['Edge, or no edge'], opts: { fill: '--accent' }, note: 'Only results can say' }
    ];
    var c = context(el), token = c.token, w = c.width;
    var wide = w >= 560, bw = wide ? Math.min(340, w * 0.5) : w, gap = 26, y = 0, out = [];

    STEPS.forEach(function (s, i) {
      var bh = s.lines.length > 1 ? 50 : 40;
      out.push(box(c, 0, y, bw, s.lines, s.opts));
      if (wide) out.push(text(c, bw + 16, y + bh / 2 + 4, s.note, '--muted'));
      if (i < STEPS.length - 1) out.push(arrow(bw / 2, y + bh + 2, bw / 2, y + bh + gap - 2, token('--fg')));
      y += bh + gap;
    });

    mount(el, w, y - gap + 2, 'Diagram: ' + STEPS.map(function (s) { return s.lines.join(' '); }).join(', then ') +
      '. A method is not an edge until results over many trades, after costs, show one.', out);
  }

  // ---- Fig. 3.2: costs can turn a small edge negative ----

  function drawCostWaterfall(el) {
    var GROSS = 40, COSTS = [{ name: ['Spreads,', 'fees'], short: 'Fees', v: 15 }, { name: ['Taxes'], short: 'Tax', v: 10 },
      { name: ['Your', 'time'], short: 'Time', v: 20 }];
    var Y_MIN = -10, Y_MAX = 45;
    var c = context(el), token = c.token, w = c.width;
    var h = Math.round(clamp(w * 0.5, 260, 340));
    var m = { top: 20, right: 8, bottom: 44, left: 44 };
    var cols = COSTS.length + 2, col = (w - m.left - m.right) / cols, bar = clamp(col * 0.5, 22, 70);
    var y = function (v) { return h - m.bottom - ((v - Y_MIN) / (Y_MAX - Y_MIN)) * (h - m.top - m.bottom); };
    var cx = function (i) { return m.left + col * (i + 0.5); };
    var signed = function (v) { return (v < 0 ? '&minus;$' : '+$') + Math.abs(v); };
    var out = [], level = GROSS, net = netAfterCosts(GROSS, COSTS.map(function (k) { return k.v; }));

    [-10, 0, 10, 20, 30, 40].forEach(function (t) {
      out.push('<line x1="' + m.left + '" x2="' + f1(w - m.right) + '" y1="' + f1(y(t)) + '" y2="' + f1(y(t)) + '" stroke="' +
        token(t === 0 ? '--fg' : '--muted') + '" stroke-width="' + (t === 0 ? 2 : 0.5) + '"/>');
      out.push(text(c, m.left - 8, y(t) + 4, (t < 0 ? '&minus;$' : '$') + Math.abs(t), '--muted', 'text-anchor="end"'));
    });
    function column(i, from, to, fill, label, name) {
      var top = Math.min(y(from), y(to)), ht = Math.max(2, Math.abs(y(from) - y(to)));
      out.push('<rect x="' + f1(cx(i) - bar / 2) + '" y="' + f1(top) + '" width="' + f1(bar) + '" height="' + f1(ht) + '" fill="' + token(fill) + '"/>');
      out.push(text(c, cx(i), (to < from ? Math.max(y(from), y(to)) + 15 : top - 6), label, '--fg', 'text-anchor="middle" font-weight="700"'));
      out.push(text(c, cx(i), h - m.bottom + 18, w < 420 ? name[0] === 'Gross' ? 'Gross' : name.short || name[0] : name, '--muted',
        'text-anchor="middle"'));
    }
    column(0, 0, GROSS, '--fg', signed(GROSS), ['Gross', 'edge']);
    COSTS.forEach(function (k, i) {
      out.push('<line x1="' + f1(cx(i) + bar / 2) + '" x2="' + f1(cx(i + 1) - bar / 2) + '" y1="' + f1(y(level)) + '" y2="' + f1(y(level)) +
        '" stroke="' + token('--muted') + '" stroke-width="1" stroke-dasharray="3 3"/>');
      column(i + 1, level, level - k.v, '--accent', signed(-k.v), Object.assign(k.name.slice(), { short: k.short }));
      level -= k.v;
    });
    out.push('<line x1="' + f1(cx(COSTS.length) + bar / 2) + '" x2="' + f1(cx(cols - 1) - bar / 2) + '" y1="' + f1(y(level)) + '" y2="' +
      f1(y(level)) + '" stroke="' + token('--muted') + '" stroke-width="1" stroke-dasharray="3 3"/>');
    column(cols - 1, 0, net, net < 0 ? '--accent' : '--fg', signed(net), ['Net']);

    mount(el, w, h, 'Waterfall chart of hypothetical round numbers per trade: a gross edge of $' + GROSS + ', less ' +
      COSTS.map(function (k) { return '$' + k.v + ' for ' + k.name.join(' ').toLowerCase(); }).join(', ') +
      ', leaves ' + (net < 0 ? 'minus ' : '') + '$' + Math.abs(net) + ' a trade.', out);
  }

  // ---- Fig. 3.3: what memory keeps, and what the journal shows ----

  function drawMemory(el) {
    var c = context(el), token = c.token, w = c.width;
    var m = { left: 4, right: 92 }, ROW = 110, HALF = 34, MAX = 200;
    var step = (w - m.left - m.right) / TRADER_B.length, bw = Math.max(3, step - 2), out = [];
    var wins = TRADER_B.filter(function (v) { return v > 0; });
    var total = TRADER_B.reduce(function (a, b) { return a + b; }, 0);

    [{ title: 'What you remember', memory: true }, { title: 'What the journal shows', memory: false }].forEach(function (r, k) {
      var top = k * ROW, zero = top + 22 + HALF;
      out.push(text(c, m.left, top + 14, r.title, '--fg', 'font-weight="700"'));
      TRADER_B.forEach(function (v, i) {
        var ht = (Math.abs(v) / MAX) * HALF, x = m.left + i * step + 1;
        var win = v > 0, fill = win ? '--fg' : '--accent', faded = r.memory && !win;
        out.push('<rect x="' + f1(x) + '" y="' + f1(win ? zero - ht : zero) + '" width="' + f1(bw) + '" height="' + f1(ht) + '" fill="' +
          token(fill) + '"' + (faded ? ' fill-opacity="0.18"' : '') + '/>');
      });
      out.push('<line x1="' + m.left + '" x2="' + f1(w - m.right + 4) + '" y1="' + zero + '" y2="' + zero + '" stroke="' + token('--fg') + '" stroke-width="1"/>');
      var lx = w - m.right + 12;
      if (r.memory) out.push(text(c, lx, zero - 4, [wins.length + ' wins', 'stand out'], '--fg', 'font-weight="700"'));
      else out.push(text(c, lx, zero - 4, ['Net', (total < 0 ? '&minus;' : '+') + money(Math.abs(total))], '--fg', 'font-weight="700"'));
    });

    mount(el, w, 2 * ROW - 12, 'Two rows of the same 20 trades, one bar per trade: wins of $100 up, losses of $200 down. ' +
      'In the remembered row the losses are faded and the ' + wins.length + ' wins stand out. The journal row shows them all: net ' +
      (total < 0 ? 'minus ' : '') + money(Math.abs(total)) + '.', out);
  }

  // ---- Fig. 3.4: the expectancy map ----
  // Win rate across, average win as a multiple of average loss up. Above the curve,
  // a method makes money on average; below it, it loses.

  function drawExpectancyMap(el) {
    var TRADERS = [{ name: 'A', p: 0.4, win: 300, loss: 100 }, { name: 'B', p: 0.6, win: 100, loss: 200 }];
    var X_MIN = 0.1, X_MAX = 0.9, Y_MAX = 4;
    var c = context(el), token = c.token, w = c.width;
    var h = Math.round(clamp(w * 0.6, 280, 420));
    var m = { top: 26, right: 12, bottom: 30, left: 34 };
    var x = function (p) { return m.left + ((p - X_MIN) / (X_MAX - X_MIN)) * (w - m.left - m.right); };
    var y = function (r) { return h - m.bottom - (Math.min(r, Y_MAX) / Y_MAX) * (h - m.top - m.bottom); };
    var curve = [], out = [];

    for (var p = X_MIN; p <= X_MAX + 1e-9; p += 0.01) curve.push(f1(x(p)) + ',' + f1(y(breakevenPayoff(p))));
    // Shade the money-making region: above the curve, up to the top of the chart.
    out.push('<polygon points="' + f1(x(X_MIN)) + ',' + f1(y(Y_MAX)) + ' ' + curve.join(' ') + ' ' + f1(x(X_MAX)) + ',' + f1(y(Y_MAX)) +
      '" fill="' + token('--fg') + '" fill-opacity="0.07"/>');
    [0, 1, 2, 3, 4].forEach(function (t) {
      out.push('<line x1="' + m.left + '" x2="' + f1(w - m.right) + '" y1="' + f1(y(t)) + '" y2="' + f1(y(t)) + '" stroke="' +
        token(t === 0 ? '--fg' : '--muted') + '" stroke-width="' + (t === 0 ? 2 : 0.5) + '"/>');
      out.push(text(c, m.left - 8, y(t) + 4, t + '&times;', '--muted', 'text-anchor="end"'));
    });
    [0.1, 0.3, 0.5, 0.7, 0.9].forEach(function (t) {
      out.push(text(c, x(t), h - 8, (t === 0.1 && w >= 420 ? 'Win rate ' : '') + Math.round(t * 100) + '%', '--muted',
        'text-anchor="' + (t === 0.1 ? 'start' : t === 0.9 ? 'end' : 'middle') + '"'));
    });
    out.push(polyline(curve, token('--fg'), 2));
    out.push(text(c, x(0.62), y(3.2), 'Makes money', '--fg', 'font-weight="700"'));
    out.push(text(c, x(0.16), y(0.35), 'Loses money', '--accent', 'font-weight="700"'));
    out.push(text(c, m.left, 12, 'Average win &divide; average loss', '--fg', 'font-weight="700"'));

    TRADERS.forEach(function (t) {
      var r = t.win / t.loss, e = expectancy(t.p, t.win, t.loss), color = token(e >= 0 ? '--fg' : '--accent');
      out.push('<circle cx="' + f1(x(t.p)) + '" cy="' + f1(y(r)) + '" r="6" fill="' + color + '" stroke="' + token('--bg') + '" stroke-width="2"/>');
      // A loser sits just under the curve, so its label goes below the dot, clear of the line.
      var below = e < 0;
      out.push(text(c, below ? x(t.p) : x(t.p) + 10, below ? y(r) + 20 : y(r) + 4, 'Trader ' + t.name + ': ' + (e < 0 ? '&minus;' : '+') +
        money(Math.abs(e)), '--fg', 'font-weight="700"' + (below ? ' text-anchor="middle"' : '')));
    });

    mount(el, w, h, 'Chart of win rate against average win divided by average loss. A curve marks break-even: ' +
      'at 50% wins, wins must equal losses; at 25%, wins must be 3 times losses. Trader A, 40% wins at 3 times, sits above the curve ' +
      'and makes $60 a trade. Trader B, 60% wins at half, sits below it and loses $20 a trade.', out);
  }

  // ---- Fig. 3.5: the core is the default; the satellite earns its place ----

  function drawEdgeLoop(el) {
    var c = context(el), token = c.token, w = c.width;
    var x0 = 24, bw = Math.min(360, w - 30), cx = x0 + bw / 2, out = [];
    var half = (bw - 12) / 2, lx = x0 + half / 2, rx = x0 + half + 12 + half / 2;

    out.push(box(c, x0, 0, bw, 'Every dollar starts in the core', { fill: '--fg' }));
    out.push(arrow(cx, 42, cx, 62, token('--fg')));
    out.push(box(c, x0, 64, bw, 'A small satellite tests a method', { fill: '--accent' }));
    out.push(arrow(cx, 106, cx, 126, token('--fg')));
    out.push(box(c, x0, 128, bw, ['The journal measures', 'expectancy and adherence']));
    out.push('<path d="M' + f1(cx) + ',180 V196 M' + f1(lx) + ',196 H' + f1(rx) + '" fill="none" stroke="' + token('--fg') + '" stroke-width="2"/>');
    out.push(arrow(lx, 195, lx, 222, token('--fg')));
    out.push(arrow(rx, 195, rx, 222, token('--accent')));
    out.push(text(c, lx + 8, 214, 'Edge shown', '--fg', 'font-weight="700"'));
    out.push(text(c, rx + 8, 214, 'No edge', '--accent', 'font-weight="700"'));
    out.push(box(c, x0, 224, half, ['The satellite may', 'grow, within rules']));
    out.push(box(c, x0 + half + 12, 224, half, ['The money goes', 'back to the core'], { stroke: '--accent' }));
    // Loop back: from the "no edge" box, under the diagram and up the left side to the core.
    out.push('<path d="M' + f1(rx) + ',276 V290 H' + f1(x0 - 14) + ' V20 H' + f1(x0 - 3) + '" fill="none" stroke="' + token('--accent') +
      '" stroke-width="2"/>');
    out.push(arrowhead(x0 - 1, 20, 0, token('--accent')));

    mount(el, w, 294, 'Flowchart: every dollar starts in the core. A small satellite tests a method. The journal measures ' +
      'expectancy and adherence. If it shows an edge, the satellite may grow within the rules. If not, the money goes back to the core.', out);
  }

  // ---- Fig. 13.1: strategy first, tool second ----

  function drawToolOrder(el) {
    var c = context(el), token = c.token, w = c.width, narrow = w < 480, out = [];
    var gap = narrow ? 8 : 34, bw = (w - 2 * gap) / 3;

    function row(y, labels, opts, crossed) {
      labels.forEach(function (l, i) {
        var x = i * (bw + gap);
        out.push(box(c, x, y, bw, l, opts[i]));
        if (i < 2) out.push(arrow(x + bw + 2, y + 25, x + bw + gap - 2, y + 25, token(crossed ? '--accent' : '--fg')));
      });
    }
    out.push(text(c, 0, 14, 'The right order', '--fg', 'font-weight="700"'));
    row(24, [['Strategy'], ['Rules'], ['Tool']],
      [{ fill: '--fg' }, { fill: '--fg' }, { stroke: '--accent-2' }]);
    out.push(text(c, 0, 102, 'Backwards', '--accent', 'font-weight="700"'));
    row(112, narrow ? [['Open an', 'account'], ['Features', 'nudge you'], ['A strategy', 'by accident']]
      : [['Open an account'], ['Its features nudge you'], ['A strategy by accident']], [{ stroke: '--accent' }, { stroke: '--accent' }, { stroke: '--accent' }], true);
    var y = 137;
    out.push('<line x1="0" x2="' + f1(w) + '" y1="' + y + '" y2="' + y + '" stroke="' + token('--accent') + '" stroke-width="2.5" stroke-opacity="0.8"/>');

    mount(el, w, narrow ? 168 : 158, 'Two rows. The right order: strategy, then rules, then the tool. Backwards, crossed out: open an account, ' +
      'let its features nudge you, and end up with a strategy by accident.', out);
  }

  // ---- Fig. 13.2: where the text says each dimension matters most ----

  function drawDimensions(el) {
    var COLS = ['Core', 'Swing', 'Journal, Systematic'];
    var ROWS = [['Cost', []], ['What you can trade', []], ['Portfolio construction', [0]], ['Research and analysis', []],
      ['Execution', [1]], ['Automation', [2]], ['Accounts and taxes', []], ['Trust', [0, 1, 2]]];
    var c = context(el), token = c.token, w = c.width, narrow = w < 420, out = [];
    var left = narrow ? 130 : 190, col = Math.min(110, (w - left) / COLS.length), ROW = 26, top = narrow ? 40 : 30;

    COLS.forEach(function (name, j) {
      var cx = left + col * (j + 0.5);
      if (narrow && j === 2) out.push(text(c, w - 1, 14, ['Journal,', 'Systematic'], '--fg', 'text-anchor="end" font-weight="700"'));
      else out.push(text(c, cx, narrow ? 14 : 18, name, '--fg', 'text-anchor="middle" font-weight="700"'));
    });
    ROWS.forEach(function (r, i) {
      var y = top + i * ROW;
      out.push('<line x1="0" x2="' + f1(left + col * COLS.length) + '" y1="' + (y + ROW) + '" y2="' + (y + ROW) + '" stroke="' + token('--muted') + '" stroke-width="0.5"/>');
      out.push(text(c, 0, y + 17, r[0], '--fg', (r[1].length ? 'font-weight="700"' : '') + (narrow ? ' font-size="11"' : '')));
      COLS.forEach(function (_, j) {
        var on = r[1].indexOf(j) >= 0, cx = left + col * (j + 0.5);
        out.push('<circle cx="' + f1(cx) + '" cy="' + (y + 13) + '" r="' + (on ? 7 : 3) + '" fill="' + token(on ? (r[0] === 'Trust' ? '--accent' : '--accent-2') : '--muted') +
          '"' + (on ? '' : ' fill-opacity="0.35"') + '/>');
      });
    });

    mount(el, w, top + ROWS.length * ROW + 4, 'Grid of the eight tool dimensions against three uses. Large dots mark where the text says a dimension ' +
      'matters most: portfolio construction for the core, execution for swing trading, automation for the journal and systematic work, ' +
      'and trust for all three.', out);
  }

  // ---- Fig. 13.3: yours, and rented ----

  function drawPortable(el) {
    var c = context(el), token = c.token, w = c.width, wide = w >= 560, out = [];
    var bw = wide ? (w - 90) / 2 : w;

    out.push(text(c, 0, 14, 'Yours: kept in files you control', '--fg', 'font-weight="700"'));
    out.push(box(c, 0, 24, bw, ['Rules', 'Investment Policy Statement'], { fill: '--fg' }));
    out.push(box(c, 0, 84, bw, ['History', 'the journal'], { fill: '--fg' }));
    var rx = wide ? bw + 90 : 0, ry = wide ? 0 : 196;
    out.push(text(c, rx, ry + 14, 'Rented: replaceable', '--fg', 'font-weight="700"'));
    out.push(box(c, rx, ry + 24, bw, ['Platform A', 'orders and positions'], { stroke: '--accent-2' }));
    out.push('<rect x="' + f1(rx + 1) + '" y="' + (ry + 85) + '" width="' + f1(bw - 2) + '" height="48" fill="none" stroke="' + token('--accent-2') +
      '" stroke-width="1.5" stroke-dasharray="5 4"/>');
    out.push(text(c, rx + bw / 2, ry + 114, 'Platform B, any time', '--accent-2', 'text-anchor="middle" font-weight="700"'));
    // CSV export: from the platform into the journal.
    if (wide) {
      out.push(arrow(rx - 4, 49, bw + 6, 109, token('--accent-2')));
      out.push(text(c, bw + 45, 70, 'CSV export', '--accent-2', 'text-anchor="middle" font-weight="700"'));
    } else {
      out.push(arrow(w * 0.7, ry + 22, w * 0.7, 136, token('--accent-2')));
      out.push(text(c, w * 0.7 + 8, ry - 20, 'CSV export', '--accent-2', 'font-weight="700"'));
    }

    mount(el, w, wide ? 140 : ry + 140, 'Diagram. Yours, in files you control: the rules in the Investment Policy Statement and the history in ' +
      'the journal. Rented and replaceable: platform A, holding orders and positions, with platform B able to take its place. A CSV export ' +
      'carries trades from the platform into the journal.', out);
  }

  // ---- Fig. 13.4: built for it, column by column ----
  // Reads the fit matrix on the same page, so it always matches the table.

  function drawFitColumns(el) {
    var table = el.ownerDocument.querySelector('table[data-matrix]');
    if (!table) return;
    var names = [].map.call(table.querySelectorAll('th.matrix-strategy span'), function (s) { return s.textContent; });
    var rows = [].map.call(table.querySelectorAll('tbody tr'), function (tr) {
      return [].map.call(tr.querySelectorAll('td.matrix-score'), function (td) { return Number(td.getAttribute('data-score')); });
    }).filter(function (r) { return r.length === names.length; });
    var counts = builtForCounts(rows), total = rows.length;
    var c = context(el), token = c.token, w = c.width, left = w < 420 ? 120 : 150, ROW = 26, top = 24, out = [];
    var len = function (v) { return (v / total) * (w - left - 40); };

    out.push(text(c, 0, 14, 'Platforms scored 3, built for it, out of ' + total, '--fg', 'font-weight="700"'));
    names.forEach(function (n, j) {
      var y = top + j * ROW;
      out.push(text(c, left - 10, y + 16, n, '--fg', 'text-anchor="end"'));
      out.push('<rect x="' + left + '" y="' + (y + 6) + '" width="' + f1(len(total)) + '" height="12" fill="' + token('--muted') + '" fill-opacity="0.12"/>');
      out.push('<rect x="' + left + '" y="' + (y + 6) + '" width="' + f1(Math.max(2, len(counts[j]))) + '" height="12" fill="' + token('--accent-2') + '"/>');
      out.push(text(c, left + len(counts[j]) + 6, y + 16, String(counts[j]), '--fg', 'font-weight="700"'));
    });

    mount(el, w, top + names.length * ROW + 4, 'Bar chart from the fit matrix: for each strategy, how many of the ' + total + ' platforms score 3. ' +
      names.map(function (n, j) { return n + ': ' + counts[j]; }).join(', ') + '.', out);
  }

  // ---- Fig. 12.1: thirty minutes out of a day ----

  function drawDayRing(el) {
    var MIN = 30, DAY = 24 * 60, AWAKE = 16 * 60;
    var c = context(el), token = c.token, w = c.width, wide = w >= 480, out = [];
    var R = clamp(w * 0.16, 60, 92), cx = R + 6, cy = R + 10;
    var share = MIN / DAY, a0 = -Math.PI / 2, a1 = a0 + share * 2 * Math.PI, r = R * 0.62;
    var pt = function (rad, ang) { return f1(cx + rad * Math.cos(ang)) + ',' + f1(cy + rad * Math.sin(ang)); };

    out.push('<circle cx="' + cx + '" cy="' + cy + '" r="' + f1((R + r) / 2) + '" fill="none" stroke="' + token('--accent-2-soft') + '" stroke-width="' + f1(R - r) + '"/>');
    out.push('<path d="M' + pt(R + 4, a0) + ' A' + f1(R + 4) + ',' + f1(R + 4) + ' 0 0 1 ' + pt(R + 4, a1) + ' L' + pt(r - 4, a1) + ' A' + f1(r - 4) + ',' +
      f1(r - 4) + ' 0 0 0 ' + pt(r - 4, a0) + ' Z" fill="' + token('--accent') + '"/>');
    out.push(text(c, cx, cy - 2, '24 hours', '--fg', 'text-anchor="middle" font-weight="700"'));
    out.push(text(c, cx, cy + 14, 'one day', '--muted', 'text-anchor="middle"'));
    var tx = wide ? 2 * R + 40 : 0, ty = wide ? cy - 34 : 2 * R + 40;
    out.push(text(c, tx, ty, MIN + ' minutes of routine', '--accent', 'font-weight="700"'));
    out.push(text(c, tx, ty + 18, ['About ' + f1(share * 100) + '% of the day, ' + f1(MIN / AWAKE * 100) + '% of 16 waking hours.',
      'Not heroic effort: the same short slot, every day.'], '--fg'));

    mount(el, w, wide ? 2 * R + 24 : ty + 44, 'Ring of a 24-hour day with a thin red slice for 30 minutes of routine: about ' + f1(share * 100) +
      '% of the day, or ' + f1(MIN / AWAKE * 100) + '% of 16 waking hours.', out);
  }

  // ---- Fig. 12.2: the checklist, and the morning with nothing to do ----

  function drawChecklist(el) {
    var c = context(el), token = c.token, w = c.width, out = [];
    var x0 = 0, bw = Math.min(300, w * (w < 480 ? 0.62 : 0.5)), cx = bw / 2, ROW = 66;
    var STEPS = [['1. Review open positions', 'and stops'], ['2. Check the watchlist', 'for setups'], ['3. Place or adjust orders'],
      ['4. Log it in the journal']];
    var tops = [0, ROW, 2 * ROW + 14, 3 * ROW + 14];

    STEPS.forEach(function (s, i) {
      out.push(box(c, x0, tops[i], bw, s, i === 3 ? { fill: '--fg' } : {}));
      var bh = s.length > 1 ? 50 : 40;
      if (i < 3) out.push(arrow(cx, tops[i] + bh + 2, cx, tops[i + 1] - 2, token('--fg')));
    });
    // No setups: skip step 3, straight to the log.
    var sx = bw + 14, from = tops[1] + 25, to = tops[3] + 20;
    out.push('<path d="M' + f1(bw + 2) + ',' + from + ' H' + f1(sx) + ' V' + to + ' H' + f1(bw + 10) + '" fill="none" stroke="' + token('--accent-2') +
      '" stroke-width="2" stroke-dasharray="5 4"/>');
    out.push(arrowhead(bw + 3, to, Math.PI, token('--accent-2')));
    out.push(text(c, sx + 10, (from + to) / 2 - 8, ['No setups,', 'no changes:', 'still counts'], '--accent-2', 'font-weight="700"'));

    mount(el, w, tops[3] + 46, 'Flow of the four-step routine: review positions and stops, check the watchlist, place or adjust orders, ' +
      'log it. A dashed path skips from the watchlist straight to the log when there are no setups; that morning still counts.', out);
  }

  // ---- Fig. 12.3: one journal entry, written at the time ----

  function drawJournalEntry(el) {
    var PLAN = [['Date', 'Day 1'], ['Strategy', '9, Swing Trading'], ['Setup', 'Pullback to a rising average'], ['Entry', '$50.00'],
      ['Stop', '$47.00'], ['Target', '$59.00'], ['Size', '33 shares, $99 at risk']];
    var AFTER = [['Exit', '$59.00 on day 9, target hit'], ['Result', '+$297, or ' + rMultiple(297, 99).toFixed(1) + 'R'], ['Rules followed', 'Yes'],
      ['Note', function (w0) { return w0 < 420 ? 'Waited; did not chase' : 'Waited for the pullback; did not chase'; }]];
    var c = context(el), token = c.token, w = c.width, wide = w >= 600, out = [];
    var pw = wide ? (w - 24) / 2 : w, LINE = 22, labelW = 104;

    function card(ox, oy, title, tok, rows) {
      var h = 34 + rows.length * LINE + 8;
      out.push('<rect x="' + f1(ox + 1) + '" y="' + (oy + 1) + '" width="' + f1(pw - 2) + '" height="' + (h - 2) + '" fill="none" stroke="' + token(tok) + '" stroke-width="2"/>');
      out.push('<rect x="' + f1(ox) + '" y="' + oy + '" width="' + f1(pw) + '" height="26" fill="' + token(tok) + '"/>');
      out.push(text(c, ox + 10, oy + 18, title, '--bg', 'font-weight="700"'));
      rows.forEach(function (r, i) {
        var y = oy + 48 + i * LINE;
        out.push(text(c, ox + 10, y, r[0], '--muted'));
        out.push(text(c, ox + labelW, y, typeof r[1] === 'function' ? r[1](w) : r[1], '--fg', 'font-weight="700"'));
      });
      return h;
    }
    var h1 = card(0, 0, 'Written before the trade', '--accent-2', PLAN);
    var h2 = card(wide ? pw + 24 : 0, wide ? 0 : h1 + 14, 'Written after the exit', '--fg', AFTER);

    mount(el, w, wide ? Math.max(h1, h2) : h1 + 14 + h2, 'An example journal entry. Before the trade: day 1, strategy 9 swing trading, ' +
      'a pullback to a rising average, entry $50, stop $47, target $59, 33 shares with $99 at risk. After the exit: $59 on day 9, ' +
      'plus $297 or 3R, rules followed, and a note.', out);
  }

  // ---- Fig. 12.4: the two numbers the journal computes ----

  function drawJournalMath(el) {
    var c = context(el), token = c.token, w = c.width, wide = w >= 560, out = [];
    var rows = JOURNAL_ROWS, n = rows.length, avgR = rows.reduce(function (s, r) { return s + r.r; }, 0) / n, adh = adherence(rows.map(function (r) { return r.ok; }));
    var tw = wide ? 200 : w, RH = 24, top = 26;

    out.push(text(c, 0, 14, 'Journal', '--fg', 'font-weight="700"'));
    out.push(text(c, 0, top + 14, 'Trade', '--muted'));
    out.push(text(c, tw * 0.45, top + 14, 'Result', '--muted', 'text-anchor="end"'));
    out.push(text(c, tw - 4, top + 14, 'Rules', '--muted', 'text-anchor="end"'));
    rows.forEach(function (r, i) {
      var y = top + 22 + i * RH;
      out.push('<line x1="0" x2="' + f1(tw) + '" y1="' + y + '" y2="' + y + '" stroke="' + token('--muted') + '" stroke-width="0.5"/>');
      out.push(text(c, 0, y + 16, String(i + 1), '--fg'));
      out.push(text(c, tw * 0.45, y + 16, (r.r > 0 ? '+' : '&minus;') + Math.abs(r.r) + 'R', r.r > 0 ? '--fg' : '--accent', 'text-anchor="end" font-weight="700"'));
      out.push(text(c, tw - 4, y + 16, r.ok ? 'Yes' : 'No', r.ok ? '--fg' : '--accent', 'text-anchor="end" font-weight="700"'));
    });
    var tableBottom = top + 22 + n * RH;

    var ox = wide ? tw + 50 : 0, oy = wide ? top + 4 : tableBottom + 40, bw = wide ? Math.min(260, w - ox) : w;
    if (wide) out.push(arrow(tw + 8, top + 22 + n * RH / 2, ox - 6, top + 22 + n * RH / 2, token('--fg')));
    else out.push(arrow(w / 2, tableBottom + 6, w / 2, oy - 4, token('--fg')));
    out.push(box(c, ox, oy, bw, ['Expectancy: +' + avgR.toFixed(2) + 'R a trade', 'positive'], { fill: '--fg' }));
    out.push(box(c, ox, oy + 62, bw, ['Adherence: ' + Math.round(adh * 100) + '%', 'under the 90% bar'], { stroke: '--accent' }));
    out.push(text(c, ox, oy + 136, ['Promotion needs both.', 'Not yet: fix the habit first.'], '--fg', 'font-weight="700"'));

    mount(el, w, wide ? Math.max(tableBottom + 6, oy + 166) : oy + 166, 'Six made-up journal rows with results of plus 3R, minus 1R, minus 1R, ' +
      'plus 2R, minus 1R, and plus 3R, and one rule broken. Expectancy is plus ' + avgR.toFixed(2) + 'R a trade, which is positive; adherence is ' +
      Math.round(adh * 100) + '%, under the 90% bar, so no promotion yet.', out);
  }

  // ---- Fig. 12.5: watched, or sent home ----

  function drawWatched(el) {
    var c = context(el), token = c.token, w = c.width, wide = w >= 560, out = [];
    var bw = wide ? (w - 120) / 2 : w;

    out.push(box(c, 0, 0, bw, ['Routine running:', 'the active slice is managed'], { fill: '--accent' }));
    var ox = wide ? bw + 120 : 0, oy = wide ? 0 : 120;
    out.push(box(c, ox, oy, bw, ['No routine:', 'the slice is back in the core'], { fill: '--fg' }));
    if (wide) {
      out.push(arrow(bw + 6, 18, ox - 6, 18, token('--fg')));
      out.push(text(c, bw + 60, 10, '10 trading days', '--fg', 'text-anchor="middle" font-weight="700"'));
      out.push(text(c, bw + 60, 44, 'without it', '--fg', 'text-anchor="middle"'));
      out.push('<path d="M' + f1(ox + bw / 2) + ',52 V82 H' + f1(bw / 2) + ' V58" fill="none" stroke="' + token('--muted') + '" stroke-width="1.5" stroke-dasharray="4 3"/>');
      out.push(arrowhead(bw / 2, 54, -Math.PI / 2, token('--muted')));
      out.push(text(c, w / 2, 100, 'Earning the way back up: an open question in Chapter 5', '--muted', 'text-anchor="middle"'));
    } else {
      out.push(arrow(w / 2, 54, w / 2, oy - 6, token('--fg')));
      out.push(text(c, w / 2 + 10, 80, ['10 trading days', 'without it'], '--fg', 'font-weight="700"'));
      out.push(text(c, 0, oy + 70, ['Earning the way back up is', 'an open question in Chapter 5.'], '--muted'));
    }

    mount(el, w, wide ? 108 : oy + 95, 'Two states. While the routine runs, the active slice is managed. After 10 trading days without it, the ' +
      'slice goes back into the core, built to be left alone. How to earn the way back up is an open question in Chapter 5.', out);
  }

  // ---- Fig. 11.1: decide while calm, check under pressure ----

  function drawCalmCheck(el) {
    var c = context(el), token = c.token, w = c.width, narrow = w < 480, out = [];
    var split = narrow ? w : w * 0.46, gap = narrow ? 0 : 12;

    function zone(x, y, zw, tok, title, lines, cross) {
      out.push('<rect x="' + f1(x) + '" y="' + y + '" width="' + f1(zw) + '" height="30" fill="' + token(tok) + '"/>');
      out.push(text(c, x + 10, y + 20, title, '--bg', 'font-weight="700"'));
      out.push(text(c, x, y + 50, lines, '--fg'));
      if (cross) {
        out.push(text(c, x, y + 50 + lines.length * 15 + 6, cross, '--accent'));
        out.push('<line x1="' + f1(x) + '" x2="' + f1(x + 150) + '" y1="' + f1(y + 50 + lines.length * 15 + 2) + '" y2="' + f1(y + 50 + lines.length * 15 + 2) +
          '" stroke="' + token('--accent') + '" stroke-width="1.5"/>');
      }
    }
    zone(0, 0, split - gap / 2, '--accent-2', 'Before the trade: calm', ['Write the rules down:', 'entry, stop, target, size, cap.', 'This is when you decide.']);
    var ox = narrow ? 0 : split + gap / 2, oy = narrow ? 110 : 0;
    if (narrow) out.push(arrow(w / 2, 82, w / 2, oy - 6, token('--fg')));
    else out.push(arrow(split - gap / 2 - 6, 15, split + gap / 2 + 2, 15, token('--bg')));
    zone(ox, oy, w - ox, '--accent', 'During the trade: pressure', ['Check the moment against the plan.', 'The written version is the boss.'],
      'Deciding fresh, in the moment');

    mount(el, w, oy + 112, 'Timeline of two zones. Before the trade, while calm, write the rules down; that is when you decide. ' +
      'During the trade, under pressure, only check the moment against the plan. Deciding fresh in the moment is crossed out.', out);
  }

  // ---- Fig. 11.2: each trap has a rule in its way ----

  function drawTraps(el) {
    var ROWS = [
      { trap: 'Loss aversion', does: 'You will not close a loser', rule: ['A stop written', 'before entry'] },
      { trap: 'Selling winners, holding losers', does: 'Small wins, large losses', rule: ['Target and stop', 'in the plan'] },
      { trap: 'Overconfidence', does: 'You size up, skip the stop', rule: ['The 1% rule'] },
      { trap: 'Fear of missing out', does: 'You buy after the move', rule: ['No written entry,', 'no trade'] }
    ];
    var c = context(el), token = c.token, w = c.width, ROW = 76, wall = Math.round(clamp(w * 0.55, 150, 440)), out = [];

    ROWS.forEach(function (r, i) {
      var top = i * ROW, ay = top + 46;
      out.push(text(c, 0, top + 14, r.trap, '--fg', 'font-weight="700"'));
      out.push(text(c, 0, top + 30, r.does, '--muted'));
      out.push(arrow(0, ay, wall - 2, ay, token('--accent')));
      out.push('<rect x="' + wall + '" y="' + (ay - 15) + '" width="8" height="30" fill="' + token('--fg') + '"/>');
      out.push(text(c, wall + 18, ay + (r.rule.length > 1 ? -3 : 5), r.rule, '--fg', 'font-weight="700"'));
    });

    mount(el, w, ROWS.length * ROW - 12, 'Diagram: four traps, each stopped by a rule. ' + ROWS.map(function (r) {
      return r.trap + ' (' + r.does.toLowerCase() + '): stopped by ' + r.rule.join(' ').toLowerCase();
    }).join('. ') + '.', out);
  }

  // ---- Fig. 11.3: revenge sizing against the rules ----

  function drawRevenge(el) {
    var RULES = [0.01, 0.01, 0.01], REVENGE = [0.01, 0.02, 0.04, 0.08], CAP = 3;
    var c = context(el), token = c.token, w = c.width, narrow = w < 420;
    var h = Math.round(clamp(w * 0.5, 250, 340));
    var m = { top: narrow ? 44 : 26, right: narrow ? 12 : 200, bottom: 30, left: 44 };
    var x = function (k) { return m.left + (k / REVENGE.length) * (w - m.left - m.right); };
    var y = function (v) { return h - m.bottom - ((v - 0.84) / 0.16) * (h - m.top - m.bottom); };
    var rules = sizedPath(RULES), revenge = sizedPath(REVENGE), out = [];
    var steps = function (path) {
      var pts = [];
      path.forEach(function (v, k) { if (k) pts.push(f1(x(k)) + ',' + f1(y(path[k - 1]))); pts.push(f1(x(k)) + ',' + f1(y(v))); });
      return pts;
    };

    hGrid(c, out, m, w, y, [0.85, 0.9, 0.95, 1], function (t) { return Math.round(t * 100) + '%'; });
    for (var k = 1; k <= REVENGE.length; k++) out.push(text(c, x(k), h - 8, (k === 1 && !narrow ? 'Loss ' : '') + k, '--muted', 'text-anchor="middle"'));
    out.push(text(c, 0, 14, 'Satellite left after a run of losses', '--fg', 'font-weight="700"'));
    out.push(polyline(steps(revenge), token('--accent'), 3));
    out.push(polyline(steps(rules), token('--fg'), 3));
    out.push('<line x1="' + f1(x(CAP)) + '" x2="' + f1(x(CAP)) + '" y1="' + m.top + '" y2="' + f1(h - m.bottom) + '" stroke="' + token('--muted') +
      '" stroke-width="1" stroke-dasharray="2 3"/>');
    out.push(text(c, x(CAP) + 4, m.top + 12, narrow ? 'Cap' : 'Cap reached: done', '--muted'));
    var lost = function (p) { return '&minus;' + (Math.round((1 - p[p.length - 1]) * 1000) / 10) + '%'; };
    if (narrow) {
      out.push('<line x1="0" x2="18" y1="26" y2="26" stroke="' + token('--fg') + '" stroke-width="3"/>');
      out.push(text(c, 24, 30, 'Rules: ' + lost(rules), '--fg', 'font-weight="700"'));
      out.push('<line x1="130" x2="148" y1="26" y2="26" stroke="' + token('--accent') + '" stroke-width="3"/>');
      out.push(text(c, 154, 30, 'Revenge: ' + lost(revenge), '--accent', 'font-weight="700"'));
    } else {
      out.push(text(c, x(CAP) + 10, y(rules[CAP]) + 18, ['Rules: 1% a trade,', 'stop at the cap: ' + lost(rules)], '--fg', 'font-weight="700"'));
      out.push(text(c, x(REVENGE.length) + 10, y(revenge[REVENGE.length]) + 4, ['Revenge: double', 'after each loss: ' + lost(revenge)], '--accent', 'font-weight="700"'));
    }

    mount(el, w, h, 'Step chart of the satellite after a run of losses. Following the rules, each loss costs 1% and the cap stops the day after ' +
      'three: about 3% down. Doubling after each loss (1, 2, 4, then 8%) costs about 14% after four.', out);
  }

  // ---- Fig. 11.4: the routine every day, an order only with a setup ----

  function drawRestraint(el) {
    var DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
    var ROWS = [
      { name: 'Morning routine', on: [1, 1, 1, 1, 1], token: '--fg' },
      { name: 'A valid setup', on: [0, 0, 1, 0, 0], token: '--accent-2' },
      { name: 'Orders placed', on: [0, 0, 1, 0, 0], token: '--accent' },
      { name: 'Changes to the core', on: [0, 0, 0, 0, 0], token: '--fg' }
    ];
    var c = context(el), token = c.token, w = c.width, left = w < 420 ? 128 : 170, ROW = 36, top = 22, out = [];
    var cell = Math.min(56, (w - left) / DAYS.length), size = Math.min(26, cell - 8);

    DAYS.forEach(function (d, j) { out.push(text(c, left + j * cell + cell / 2, 12, d, '--muted', 'text-anchor="middle"')); });
    ROWS.forEach(function (r, i) {
      var cy = top + i * ROW;
      out.push(text(c, 0, cy + size / 2 + 4, r.name, '--fg', 'font-weight="700"'));
      r.on.forEach(function (v, j) {
        var x = left + j * cell + (cell - size) / 2;
        out.push('<rect x="' + f1(x) + '" y="' + cy + '" width="' + f1(size) + '" height="' + f1(size) + '" fill="' + (v ? token(r.token) : 'none') +
          '" stroke="' + token(v ? r.token : '--muted') + '" stroke-width="' + (v ? 0 : 1) + '"' + (v ? '' : ' stroke-opacity="0.45"') + '/>');
      });
    });
    var ny = top + ROWS.length * ROW + 10;
    var note = w < 420 ? ['Four days with no setup:', 'the correct trade is none. The routine', 'still happens. The core is left alone.']
      : ['Four days with no setup: the correct trade is none.', 'The routine still happens. The core is left alone.'];
    out.push(text(c, 0, ny, note, '--muted'));

    mount(el, w, ny + note.length * 15 + 7, 'A made-up week. The morning routine happens all five days. A valid setup appears on Wednesday only, so ' +
      'an order is placed only then. The core is not changed at all.', out);
  }

  // ---- Fig. 11.5: two months, measured by adherence ----

  var MONTHS_ADHERENCE = [
    { name: 'Month A: profitable', marks: [1, 1, 0, 1, 1, 0, 1, 1, 1, 0, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1] },
    { name: 'Month B', marks: [1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] }
  ];

  function drawAdherence(el) {
    var BAR = 0.9, c = context(el), token = c.token, w = c.width, ROW = 84, out = [];
    var n = MONTHS_ADHERENCE[0].marks.length, cell = Math.min(24, (w - 2) / n), size = cell - 3;

    MONTHS_ADHERENCE.forEach(function (mo, i) {
      var top = i * ROW, a = adherence(mo.marks), ok = a >= BAR;
      out.push(text(c, 0, top + 14, mo.name + ', ' + Math.round(a * 100) + '% by the rules', '--fg', 'font-weight="700"'));
      mo.marks.forEach(function (v, k) {
        var x = k * cell + 1, y = top + 24;
        out.push(v
          ? '<rect x="' + f1(x) + '" y="' + y + '" width="' + f1(size) + '" height="' + f1(size) + '" fill="' + token('--fg') + '"/>'
          : '<rect x="' + f1(x + 0.75) + '" y="' + (y + 0.75) + '" width="' + f1(size - 1.5) + '" height="' + f1(size - 1.5) + '" fill="none" stroke="' +
            token('--accent') + '" stroke-width="1.5"/><path d="M' + f1(x + 4) + ',' + (y + 4) + ' l' + f1(size - 8) + ',' + f1(size - 8) + ' m0,-' +
            f1(size - 8) + ' l-' + f1(size - 8) + ',' + f1(size - 8) + '" stroke="' + token('--accent') + '" stroke-width="1.5"/>');
      });
      out.push(text(c, 0, top + 24 + size + 18, ok ? 'Meets the ' + BAR * 100 + '% bar: counts toward promotion' : 'Under ' + BAR * 100 +
        '%: does not count, however it paid', ok ? '--fg' : '--accent', 'font-weight="700"'));
    });

    mount(el, w, 2 * ROW - 10, 'Two made-up months of 20 trades. Month A was profitable but only ' +
      Math.round(adherence(MONTHS_ADHERENCE[0].marks) * 100) + '% of its trades followed the rules, so it does not count. Month B followed the rules on ' +
      Math.round(adherence(MONTHS_ADHERENCE[1].marks) * 100) + '%, which meets the 90% bar.', out);
  }

  // ---- Fig. 10.1: the planned exit and the exit with no plan ----
  // A sketch: one falling price on a 0 to 1 grid, with a stop written down before entry.

  function drawExitPlan(el) {
    var PRICE = [[0, 0.62], [0.08, 0.66], [0.16, 0.6], [0.24, 0.55], [0.3, 0.5], [0.36, 0.52], [0.42, 0.44], [0.5, 0.4],
      [0.56, 0.42], [0.64, 0.33], [0.72, 0.28], [0.8, 0.22], [0.88, 0.18], [1, 0.12]];
    var ENTRY = 0.62, STOP = 0.47, c = context(el), token = c.token, w = c.width, out = [];
    var m = { top: 26, right: w < 420 ? 8 : 150, bottom: 14, left: 8 }, PH = 200;
    var x = function (v) { return m.left + v * (w - m.left - m.right); }, y = function (v) { return m.top + (1 - v) * PH; };
    var hitAt = 0.395, hitY = y(STOP), lastX = x(1), lastY = y(PRICE[PRICE.length - 1][1]);

    out.push('<line x1="' + f1(x(0)) + '" x2="' + f1(x(1)) + '" y1="' + f1(y(STOP)) + '" y2="' + f1(y(STOP)) + '" stroke="' + token('--accent') +
      '" stroke-width="1.5" stroke-dasharray="5 3"/>');
    out.push(text(c, x(0), y(STOP) + 16, w < 420 ? 'Stop' : 'Stop, written before entry', '--accent'));
    out.push(polyline(PRICE.map(function (p) { return f1(x(p[0])) + ',' + f1(y(p[1])); }), token('--fg'), 2));
    out.push('<circle cx="' + f1(x(0)) + '" cy="' + f1(y(ENTRY)) + '" r="5" fill="' + token('--fg') + '"/>');
    out.push(text(c, x(0) + 10, y(ENTRY) - 8, 'Entry', '--fg', 'font-weight="700"'));
    // The planned exit: at the stop. The unplanned one: wherever the mood breaks.
    out.push('<circle cx="' + f1(x(hitAt)) + '" cy="' + f1(hitY) + '" r="7" fill="' + token('--accent-2') + '" stroke="' + token('--bg') + '" stroke-width="2"/>');
    out.push('<circle cx="' + f1(lastX) + '" cy="' + f1(lastY) + '" r="7" fill="' + token('--accent') + '" stroke="' + token('--bg') + '" stroke-width="2"/>');
    out.push('<rect x="' + f1(x(hitAt)) + '" y="' + f1(hitY) + '" width="' + f1(lastX - x(hitAt)) + '" height="' + f1(lastY - hitY) +
      '" fill="' + token('--accent') + '" fill-opacity="0.1"/>');
    if (w >= 420) {
      out.push(text(c, x(hitAt) + 12, hitY - 12, 'Planned exit: the loss you chose', '--accent-2', 'font-weight="700"'));
      out.push(text(c, lastX + 12, lastY - 4, ['The exit with no plan:', 'hope fills the gap'], '--accent', 'font-weight="700"'));
    } else {
      out.push(text(c, x(hitAt) + 12, hitY - 12, 'Planned exit', '--accent-2', 'font-weight="700"'));
      out.push(text(c, lastX - 4, lastY + 22, 'No plan', '--accent', 'text-anchor="end" font-weight="700"'));
    }

    mount(el, w, m.top + PH + m.bottom + 10, 'Sketch of one losing trade. The price falls through a stop written before entry; the planned ' +
      'exit is there. With no plan, the trade drifts much lower before the exit, and the extra loss is shaded.', out);
  }

  // ---- Fig. 10.2: tighten, never loosen ----

  function drawRatchet(el) {
    var PRICE = [[0, 0.3], [0.1, 0.36], [0.18, 0.33], [0.28, 0.45], [0.36, 0.42], [0.46, 0.56], [0.54, 0.52], [0.64, 0.66], [0.72, 0.62],
      [0.82, 0.74], [0.9, 0.7], [1, 0.8]];
    var STEPS = [[0, 0.2], [0.3, 0.3], [0.48, 0.42], [0.66, 0.53], [0.84, 0.62]];
    var c = context(el), token = c.token, w = c.width, out = [];
    var m = { top: 24, right: w < 420 ? 8 : 140, left: 8 }, PH = 190;
    var x = function (v) { return m.left + v * (w - m.left - m.right); }, y = function (v) { return m.top + (1 - v) * PH; };

    out.push(text(c, 0, 14, 'A stop on a working trade', '--fg', 'font-weight="700"'));
    out.push(polyline(PRICE.map(function (p) { return f1(x(p[0])) + ',' + f1(y(p[1])); }), token('--fg'), 2));
    var pts = [];
    STEPS.forEach(function (s, i) {
      var next = i < STEPS.length - 1 ? STEPS[i + 1][0] : 1;
      pts.push(f1(x(s[0])) + ',' + f1(y(s[1])), f1(x(next)) + ',' + f1(y(s[1])));
    });
    out.push(polyline(pts, token('--accent'), 2.5));
    // The step that is not allowed: from the last level down.
    var lx = x(0.9), ly = y(STEPS[STEPS.length - 1][1]);
    out.push('<path d="M' + f1(lx) + ',' + f1(ly) + ' V' + f1(ly + 44) + ' H' + f1(x(1)) + '" fill="none" stroke="' + token('--accent') +
      '" stroke-width="1.5" stroke-dasharray="4 3" stroke-opacity="0.6"/>');
    out.push('<path d="M' + f1(lx - 7) + ',' + f1(ly + 15) + ' l14,14 m0,-14 l-14,14" stroke="' + token('--accent') + '" stroke-width="2.5"/>');
    if (w >= 420) {
      out.push(text(c, x(1) + 10, y(0.8) + 4, 'Price', '--fg', 'font-weight="700"'));
      out.push(text(c, x(1) + 10, ly + 4, ['Stop: steps up', 'as the trade works'], '--accent', 'font-weight="700"'));
      out.push(text(c, x(1) + 10, ly + 48, ['Never steps', 'back down'], '--accent'));
    } else {
      out.push(text(c, x(0.02), y(0.12), 'Stop steps up, never down', '--accent', 'font-weight="700"'));
    }

    mount(el, w, m.top + PH + 16, 'Sketch of a rising price with its stop. The stop steps up as the trade works. A dashed step back ' +
      'down is crossed out: a stop may be tightened, never loosened.', out);
  }

  // ---- Fig. 10.3: four trades, one risk ----
  // Each rectangle is shares wide and risk per share tall, so its area is the dollars at risk.

  function drawSizedTrades(el) {
    var CAPITAL = 10000, RISK = 0.01;
    var c = context(el), token = c.token, w = c.width, wide = w >= 560, out = [];
    var perShare = Math.min(1.2, ((wide ? (w - 40) / 2 : w) - 90) / 200), perDollar = 9, y = 26;

    out.push(text(c, 0, 14, '1% of a ' + money(CAPITAL) + ' satellite: ' + money(CAPITAL * RISK) + ' at risk on each', '--fg', 'font-weight="700"'));
    SIZED.forEach(function (t, i) {
      var risk = t.entry - t.stop, shares = positionSize(CAPITAL, RISK, t.entry, t.stop);
      var rw = shares * perShare, rh = risk * perDollar;
      var ox = wide ? (i % 2) * ((w - 40) / 2 + 40) : 0, oy = wide ? 26 + Math.floor(i / 2) * 150 : y;
      out.push(text(c, ox, oy + 14, '$' + t.entry + ' entry, stop $' + t.stop.toFixed(2).replace(/\.00$/, ''), '--fg', 'font-weight="700"'));
      out.push(text(c, ox, oy + 29, shares + ' shares, ' + money(shares * t.entry) + ' position', '--muted'));
      out.push('<rect x="' + f1(ox) + '" y="' + (oy + 38) + '" width="' + f1(rw) + '" height="' + f1(rh) + '" fill="' + token('--accent') + '"/>');
      out.push(text(c, ox + rw + 8, oy + 38 + rh / 2 + 4, money(shares * risk), '--fg', 'font-weight="700"'));
      if (!wide) y += 38 + rh + 26;
    });
    var bottom = wide ? 26 + 2 * 150 : y;
    out.push(text(c, 0, bottom + 4, ['Width is shares, height is risk per share.', 'Every red area is about ' + money(CAPITAL * RISK) + '.'], '--muted'));

    mount(el, w, bottom + 30, 'Four hypothetical trades sized to risk $100 each: ' + SIZED.map(function (t) {
      var s = positionSize(CAPITAL, RISK, t.entry, t.stop);
      return 'entry $' + t.entry + ', stop $' + t.stop + ', ' + s + ' shares, ' + money(s * (t.entry - t.stop)) + ' at risk';
    }).join('; ') + '. The share counts and position costs differ; the risk stays the same.', out);
  }

  // ---- Fig. 10.4: expectancy as a tug of war ----

  function drawTugOfWar(el) {
    var SYSTEMS = [{ name: 'Wins 40% of the time', p: 0.4, win: 300, loss: 100 }, { name: 'Wins 60% of the time', p: 0.6, win: 100, loss: 300 }];
    var c = context(el), token = c.token, w = c.width, MAX = 140, ROW = 92, out = [];
    var mid = w / 2, half = (w / 2) - 8, sx = function (v) { return mid + (v / MAX) * half; };

    out.push(text(c, mid - 8, 14, 'Losses pull this way', '--accent', 'text-anchor="end" font-weight="700"'));
    out.push(text(c, mid + 8, 14, 'Wins pull this way', '--fg', 'font-weight="700"'));
    SYSTEMS.forEach(function (s, i) {
      var top = 28 + i * ROW, plus = s.p * s.win, minus = (1 - s.p) * s.loss, net = expectancy(s.p, s.win, s.loss);
      out.push(text(c, 0, top + 12, w < 420
        ? Math.round(s.p * 100) + '% wins: ' + money(s.win) + ' win, ' + money(s.loss) + ' loss'
        : s.name + ': average win ' + money(s.win) + ', loss ' + money(s.loss), '--fg'));
      out.push('<rect x="' + f1(sx(-minus)) + '" y="' + (top + 20) + '" width="' + f1(sx(0) - sx(-minus)) + '" height="18" fill="' + token('--accent') + '"/>');
      out.push('<rect x="' + f1(sx(0)) + '" y="' + (top + 20) + '" width="' + f1(sx(plus) - sx(0)) + '" height="18" fill="' + token('--fg') + '"/>');
      out.push(text(c, sx(-minus) + 6, top + 33, '&minus;' + money(minus), '--bg', 'font-weight="700"'));
      out.push(text(c, sx(plus) - 6, top + 33, '+' + money(plus), '--bg', 'text-anchor="end" font-weight="700"'));
      out.push('<line x1="' + f1(mid) + '" x2="' + f1(mid) + '" y1="' + (top + 16) + '" y2="' + (top + 42) + '" stroke="' + token('--fg') + '" stroke-width="2"/>');
      out.push(text(c, mid, top + 58, 'Expectancy: ' + (net < 0 ? '&minus;' : '+') + money(Math.abs(net)) + ' a trade', net < 0 ? '--accent' : '--fg',
        'text-anchor="middle" font-weight="700"'));
    });

    mount(el, w, 28 + 2 * ROW - 10, 'Two systems as a tug of war. Winning 40% at $300 against 60% losing $100: wins pull $120, losses $60, ' +
      'expectancy plus $60. Winning 60% at $100 against 40% losing $300: wins pull $60, losses $120, expectancy minus $60.', out);
  }

  // ---- Fig. 10.5: ten losses in a row, at four sizes ----

  function drawStreaks(el) {
    var SERIES = [{ r: 0.01, token: '--fg', width: 3 }, { r: 0.02, token: '--accent-2', width: 2 }, { r: 0.05, token: '--accent-2-soft', width: 2 },
      { r: 0.1, token: '--accent', width: 3 }];
    var N = 10, c = context(el), token = c.token, w = c.width, narrow = w < 420;
    var h = Math.round(clamp(w * 0.55, 260, 380));
    var m = { top: 26, right: narrow ? 70 : 170, bottom: 30, left: 44 };
    var x = function (k) { return m.left + (k / N) * (w - m.left - m.right); };
    var y = function (v) { return h - m.bottom - v * (h - m.top - m.bottom); };
    var out = [];

    hGrid(c, out, m, w, y, [0, 0.25, 0.5, 0.75, 1], function (t) { return Math.round(t * 100) + '%'; });
    [0, 5, 10].forEach(function (k) { out.push(text(c, x(k), h - 8, k === 0 ? 'Start' : k + ' losses', '--muted', 'text-anchor="' + (k === 0 ? 'start' : k === N ? 'end' : 'middle') + '"')); });
    out.push(text(c, m.left, 14, 'Satellite left after a losing streak', '--fg', 'font-weight="700"'));
    var ends = SERIES.map(function (s) { return y(streakLeft(s.r, N)) + 4; }), ly = spread(ends, narrow ? 16 : 18);
    SERIES.forEach(function (s, i) {
      var pts = [];
      for (var k = 0; k <= N; k++) pts.push(f1(x(k)) + ',' + f1(y(streakLeft(s.r, k))));
      out.push(polyline(pts, token(s.token), s.width));
      var left = streakLeft(s.r, N), need = breakeven(1 - left);
      out.push(text(c, x(N) + 8, ly[i], narrow
        ? Math.round(s.r * 100) + '%: ' + Math.round(left * 100) + '%'
        : Math.round(s.r * 100) + '% a trade: ' + Math.round(left * 100) + '% left, needs +' + Math.round(need * 100) + '%', '--fg',
        i === 0 || i === 3 ? 'font-weight="700"' : ''));
    });

    mount(el, w, h, 'Line chart: what is left after ten losses in a row. ' + SERIES.map(function (s) {
      var left = streakLeft(s.r, N);
      return 'At ' + Math.round(s.r * 100) + '% a trade, ' + Math.round(left * 100) + '% left, needing a ' + Math.round(breakeven(1 - left) * 100) + '% gain to recover';
    }).join('. ') + '.', out);
  }

  // ---- Fig. 9.1: how long each strategy holds, on one time scale ----
  // A log scale of seconds, from one second to thirty years.

  function drawHoldingPeriods(el) {
    var MIN = 60, HOUR = 3600, DAY = 86400, WEEK = 7 * DAY, MONTH = 30 * DAY, YEAR = 365 * DAY;
    var ROWS = [
      { num: 12, name: '0DTE Scalping', range: 'Seconds to minutes', from: 5, to: 30 * MIN },
      { num: 11, name: 'Day Trading', range: 'Within the day', from: MIN, to: 6.5 * HOUR },
      { num: 9, name: 'Swing Trading', range: 'Days to weeks', from: DAY, to: 4 * WEEK },
      { num: 10, name: 'Long Options', range: 'Weeks to months', from: WEEK, to: 6 * MONTH },
      { num: 1, name: 'Index Core', range: 'Many years', from: 3 * YEAR, to: 30 * YEAR, open: true }
    ];
    var TICKS = [[1, '1 sec'], [MIN, '1 min'], [HOUR, '1 hour'], [DAY, '1 day'], [WEEK, '1 week'], [MONTH, '1 month'], [YEAR, '1 year'], [10 * YEAR, '10 yrs']];
    var c = context(el), token = c.token, w = c.width, narrow = w < 480, ROW = 46, top = 6, out = [];
    var lo = Math.log(1), hi = Math.log(30 * YEAR);
    var x = function (sec) { return 4 + ((Math.log(sec) - lo) / (hi - lo)) * (w - 8); };

    ROWS.forEach(function (r, i) {
      var y = top + i * ROW, tok = GROUP_TOKEN[STRATEGIES[r.num - 1].group] || '--accent-2';
      out.push(chip(c, 10, y + 10, r.num, 9));
      out.push(text(c, 26, y + 14, r.name + ' <tspan fill="' + token('--muted') + '" font-weight="400">' + r.range + '</tspan>', '--fg', 'font-weight="700"'));
      out.push('<rect x="' + f1(x(r.from)) + '" y="' + (y + 22) + '" width="' + f1(x(r.to) - x(r.from)) + '" height="12" fill="' + token(tok) + '"/>');
      if (r.open) out.push(arrowhead(x(r.to) + 1, y + 28, 0, token(tok)));
    });
    var axisY = top + ROWS.length * ROW + 4;
    out.push('<line x1="4" x2="' + f1(w - 4) + '" y1="' + axisY + '" y2="' + axisY + '" stroke="' + token('--fg') + '" stroke-width="1.5"/>');
    TICKS.forEach(function (t, k) {
      if (narrow && k % 2) return;
      out.push('<line x1="' + f1(x(t[0])) + '" x2="' + f1(x(t[0])) + '" y1="' + top + '" y2="' + (axisY + 4) + '" stroke="' + token('--muted') +
        '" stroke-width="0.5"/>');
      out.push(text(c, x(t[0]), axisY + 18, t[1], '--muted', 'text-anchor="' + (k === 0 ? 'start' : k === TICKS.length - 1 ? 'end' : 'middle') + '"'));
    });

    mount(el, w, axisY + 26, 'Holding periods on a time scale from one second to thirty years: ' + ROWS.map(function (r) {
      return r.name + ', ' + r.range.toLowerCase();
    }).join('; ') + '. The three casino strategies sit far to the left of the core.', out);
  }

  // ---- Fig. 9.2: a long call can be right and still lose ----

  function drawLongCall(el) {
    var STRIKE = 50, PREMIUM = 2, X_MIN = 40, X_MAX = 65, BE = STRIKE + PREMIUM;
    var f = payoffFrame(el, X_MIN, X_MAX, -500, 1500, [-500, 0, 500, 1000, 1500]), c = f.c, token = c.token, out = f.out;
    var call = function (p) { return longCallPL(p, STRIKE, PREMIUM); };

    // Right about the direction (above today's $50), and still a loss: from the strike to break-even.
    out.push('<rect x="' + f1(f.x(STRIKE)) + '" y="' + f1(f.y(0)) + '" width="' + f1(f.x(BE) - f.x(STRIKE)) + '" height="' +
      f1(f.y(-PREMIUM * 100) - f.y(0)) + '" fill="' + token('--accent') + '" fill-opacity="0.3"/>');
    out.push('<rect x="' + f1(f.x(X_MIN)) + '" y="' + f1(f.y(0)) + '" width="' + f1(f.x(STRIKE) - f.x(X_MIN)) + '" height="' +
      f1(f.y(-PREMIUM * 100) - f.y(0)) + '" fill="' + token('--accent') + '" fill-opacity="0.1"/>');
    out.push(polyline(f.curve(call), token('--fg'), 3));
    out.push('<line x1="' + f1(f.x(BE)) + '" x2="' + f1(f.x(BE)) + '" y1="' + f.m.top + '" y2="' + f1(f.h - f.m.bottom) + '" stroke="' +
      token('--muted') + '" stroke-width="1" stroke-dasharray="2 3"/>');
    out.push(text(c, f.x(BE) + 4, f.m.top + 12, (f.narrow ? '' : 'Break-even ') + '$' + BE, '--muted'));
    if (f.narrow) {
      f.legend([{ name: 'Long call', token: '--fg' }, { name: 'Right, and still lose', token: '--accent', area: true }]);
    } else {
      out.push(text(c, f.x(X_MAX) + 8, f.y(call(X_MAX)) + 4, ['Long call:', 'bought $' + STRIKE + ' for $' + PREMIUM], '--fg', 'font-weight="700"'));
      out.push(text(c, f.x(X_MIN) + 6, f.y(-PREMIUM * 100) + 18, 'Most it can lose: the $' + PREMIUM * 100 + ' premium', '--accent', 'font-weight="700"'));
      out.push(text(c, f.x(STRIKE + 1), f.y(600), ['Right about the', 'direction, and', 'still a loss'], '--accent', 'text-anchor="middle" font-weight="700"'));
      out.push('<line x1="' + f1(f.x(STRIKE + 1)) + '" x2="' + f1(f.x(STRIKE + 1)) + '" y1="' + f1(f.y(600) + 34) + '" y2="' + f1(f.y(-60)) + '" stroke="' +
        token('--accent') + '" stroke-width="1.5"/>');
    }

    mount(el, f.w, f.h, 'Payoff chart at expiration for one $50 call bought for $2, with the stock at $50 today. Below $50 it loses ' +
      'the whole $200. Between $50 and $52 the stock rose, and the call still loses. Above $52 it makes money.', out);
  }

  // ---- Fig. 9.3: two months of tuition ----

  var TUITION = [
    [-12, 4, -18, -6, 8, -15, -22, 5, -14, -10, -20],
    [-6, 9, -12, 14, -5, -8, 11, -9, -4, 7, -6, 5, -8, 3, -3, 6, -7, 2, -5, 4, -2]
  ];

  function drawTuitionMonths(el) {
    var DAYS = 21;
    var c = context(el), token = c.token, w = c.width;
    var h = Math.round(clamp(w * 0.45, 230, 320));
    var m = { top: 30, right: 10, bottom: 30, left: 44 };
    var months = TUITION.map(function (ch) { return tuitionPath(100, ch); });
    var span = (w - m.left - m.right) / 2;
    var x = function (k, d) { return m.left + k * span + (d / DAYS) * (span - 12); };
    var y = function (v) { return h - m.bottom - (v / 120) * (h - m.top - m.bottom); };
    var out = [];

    hGrid(c, out, m, w, y, [0, 50, 100], function (t) { return t + '%'; });
    months.forEach(function (mo, k) {
      out.push(text(c, x(k, 0), 14, 'Month ' + (k + 1), '--fg', 'font-weight="700"'));
      if (mo.over >= 0) {
        out.push('<rect x="' + f1(x(k, mo.over)) + '" y="' + m.top + '" width="' + f1(x(k, DAYS) - x(k, mo.over)) + '" height="' +
          f1(y(0) - m.top) + '" fill="' + token('--muted') + '" fill-opacity="0.12"/>');
        out.push(w < 420
          ? text(c, x(k, mo.over) + 5, y(70), ['Month', 'over'], '--accent', 'font-weight="700"')
          : text(c, (x(k, mo.over) + x(k, DAYS)) / 2, y(70), ['Budget gone:', 'month over'], '--accent', 'text-anchor="middle" font-weight="700"'));
      }
      var pts = [];
      mo.path.forEach(function (v, d) {
        if (d > 0) pts.push(f1(x(k, d)) + ',' + f1(y(mo.path[d - 1])));
        pts.push(f1(x(k, d)) + ',' + f1(y(v)));
      });
      out.push(polyline(pts, token('--accent'), 2.5));
      if (mo.over >= 0) out.push('<circle cx="' + f1(x(k, mo.over)) + '" cy="' + f1(y(0)) + '" r="4.5" fill="' + token('--accent') + '"/>');
      out.push(text(c, x(k, 0), h - 8, 'Day 1', '--muted'));
      if (k === 1) {
        out.push('<line x1="' + f1(x(1, 0) - 6) + '" x2="' + f1(x(1, 0) - 6) + '" y1="' + (m.top - 8) + '" y2="' + f1(y(0)) + '" stroke="' + token('--fg') + '" stroke-width="1"/>');
        var end = mo.path[mo.path.length - 1];
        out.push(text(c, x(1, DAYS), y(end) + (w < 420 ? 24 : -10), Math.round(end) + '% left', '--fg', 'text-anchor="end" font-weight="700"'));
      }
    });
    if (w >= 420) out.push(text(c, x(1, 0) + 4, y(112), 'Same fixed budget', '--muted'));

    mount(el, w, h, 'Two made-up months of tuition, as the share of the monthly budget left. In month 1 the budget hits zero on day ' +
      months[0].over + ' and the month is over: no top-ups. Month 2 starts with the same fixed budget and ends with ' +
      Math.round(months[1].path[months[1].path.length - 1]) + '% left.', out);
  }

  // ---- Fig. 9.4: fifty paper trades, then the gate ----

  function drawPaperGate(el) {
    var c = context(el), token = c.token, w = c.width, wide = w >= 560, out = [];
    var perRow = wide ? 25 : 10, gateW = wide ? 150 : w;
    var cell = Math.min(22, ((wide ? w - gateW - 40 : w) - 2) / perRow);
    var rows = Math.ceil(TRADER_A.length / perRow), top = 22;

    out.push(text(c, 0, 14, '50 paper trades', '--fg', 'font-weight="700"'));
    TRADER_A.forEach(function (v, i) {
      var cx = (i % perRow) * cell, cy = top + Math.floor(i / perRow) * cell;
      out.push('<rect x="' + f1(cx + 1) + '" y="' + f1(cy + 1) + '" width="' + f1(cell - 2) + '" height="' + f1(cell - 2) + '" fill="' +
        token(v > 0 ? '--fg' : '--accent') + '"/>');
    });
    var gridBottom = top + rows * cell, avg = runningAverage(TRADER_A)[TRADER_A.length - 1];
    out.push('<rect x="0" y="' + f1(gridBottom + 10) + '" width="10" height="10" fill="' + token('--fg') + '"/>');
    out.push(text(c, 15, gridBottom + 19, 'Win', '--fg'));
    out.push('<rect x="50" y="' + f1(gridBottom + 10) + '" width="10" height="10" fill="' + token('--accent') + '"/>');
    out.push(text(c, 65, gridBottom + 19, 'Loss', '--fg'));

    var gx = wide ? perRow * cell + 40 : 0, gy = wide ? top : gridBottom + 44;
    if (wide) out.push(arrow(perRow * cell + 8, top + rows * cell / 2, gx - 4, top + rows * cell / 2, token('--fg')));
    else out.push(arrow(w / 2, gridBottom + 28, w / 2, gy - 2, token('--fg')));
    out.push(box(c, gx, gy, gateW, ['Expectancy +' + money(avg) + ':', 'Level 4 opens'], { fill: '--fg' }));
    out.push(text(c, gx, gy + 70, ['Then start small,', 'even inside the budget'], '--muted'));

    mount(el, w, wide ? Math.max(gridBottom + 28, gy + 96) : gy + 96, 'Fifty paper trades, Trader A from Chapter 3: 20 wins and 30 ' +
      'losses, an average of plus ' + money(avg) + ' a trade. Positive expectancy over about 50 paper trades opens Level 4. Then start small.', out);
  }

  // ---- Fig. 9.5: one day under a trade cap ----

  function drawTradeCap(el) {
    var CAP = 3, OPEN = 9.5, CLOSE = 16;
    var SETUPS = [{ t: 9.75, taken: true }, { t: 10.4, taken: true }, { t: 11.2, taken: true }, { t: 12.6 }, { t: 13.9 }, { t: 15.1 }];
    var c = context(el), token = c.token, w = c.width, narrow = w < 420, out = [];
    var m = { left: 8, right: 8 }, top = 34, axisY = 84;
    var x = function (hr) { return m.left + ((hr - OPEN) / (CLOSE - OPEN)) * (w - m.left - m.right); };
    var capAt = SETUPS.filter(function (s) { return s.taken; })[CAP - 1].t;

    out.push(text(c, 0, 14, 'Example cap: ' + CAP + ' trades a day', '--fg', 'font-weight="700"'));
    out.push('<rect x="' + f1(x(capAt) + 10) + '" y="' + (top - 6) + '" width="' + f1(x(CLOSE) - x(capAt) - 10) + '" height="' + (axisY - top + 6) +
      '" fill="' + token('--muted') + '" fill-opacity="0.12"/>');
    out.push(text(c, (x(capAt) + x(CLOSE)) / 2 + 5, top + 8, narrow ? 'Done for the day' : 'Cap reached: done for the day', '--fg', 'text-anchor="middle" font-weight="700"'));
    out.push('<line x1="' + f1(x(OPEN)) + '" x2="' + f1(x(CLOSE)) + '" y1="' + axisY + '" y2="' + axisY + '" stroke="' + token('--fg') + '" stroke-width="2"/>');
    SETUPS.forEach(function (s, i) {
      out.push('<circle cx="' + f1(x(s.t)) + '" cy="' + (axisY - 20) + '" r="8" fill="' + (s.taken ? token('--accent') : token('--bg')) + '" stroke="' +
        token(s.taken ? '--accent' : '--muted') + '" stroke-width="2"/>');
      if (s.taken) out.push(text(c, x(s.t), axisY - 16, String(i + 1), '--bg', 'text-anchor="middle" font-weight="700" font-size="11"'));
    });
    [[9.5, '9:30'], [12, 'Noon'], [16, '4:00']].forEach(function (t, k) {
      out.push(text(c, x(t[0]), axisY + 18, t[1], '--muted', 'text-anchor="' + (k === 0 ? 'start' : k === 2 ? 'end' : 'middle') + '"'));
    });
    var ly = axisY + 44;
    out.push('<circle cx="6" cy="' + (ly - 4) + '" r="6" fill="' + token('--accent') + '"/>');
    out.push(text(c, 18, ly, 'Trade taken', '--fg'));
    out.push('<circle cx="112" cy="' + (ly - 4) + '" r="6" fill="' + token('--bg') + '" stroke="' + token('--muted') + '" stroke-width="2"/>');
    out.push(text(c, 124, ly, 'Setup skipped', '--fg'));

    mount(el, w, ly + 8, 'One made-up trading day from 9:30 to 4:00 with an example cap of ' + CAP + ' trades. Three trades are taken ' +
      'by late morning; the cap is reached, and three later setups are skipped.', out);
  }

  // ---- Fig. 8.1: who pays, who collects, who is obliged ----

  function drawOptionRoles(el) {
    var CELLS = [
      { row: 0, col: 0, lines: ['Pays premium.', 'Has the right to', 'buy 100 shares', 'at the strike.'] },
      { row: 0, col: 1, lines: ['Collects premium.', 'Must sell 100', 'shares at the strike', 'if assigned.'], fill: true },
      { row: 1, col: 0, lines: ['Pays premium.', 'Has the right to', 'sell 100 shares', 'at the strike.'] },
      { row: 1, col: 1, lines: ['Collects premium.', 'Must buy 100', 'shares at the strike', 'if assigned.'], fill: true }
    ];
    var c = context(el), token = c.token, w = c.width, narrow = w < 420;
    var left = narrow ? 0 : 64, band = narrow ? 22 : 0, top = 26, gap = 6, cw = Math.min(200, (w - left - gap) / 2), ch = 96, out = [];

    out.push(text(c, left + cw / 2, 14, 'Buyer', '--fg', 'text-anchor="middle" font-weight="700"'));
    out.push(text(c, left + cw * 1.5 + gap, 14, narrow ? 'Seller' : 'Seller (this chapter)', '--fg', 'text-anchor="middle" font-weight="700"'));
    ['A call', 'A put'].forEach(function (name, r) {
      var y = top + r * (ch + gap + band);
      out.push(narrow ? text(c, 0, y + 15, name, '--fg', 'font-weight="700"') : text(c, 0, y + ch / 2 + 4, name, '--fg', 'font-weight="700"'));
    });
    CELLS.forEach(function (k) {
      var x = left + k.col * (cw + gap), y = top + band + k.row * (ch + gap + band);
      out.push('<rect x="' + f1(x) + '" y="' + y + '" width="' + f1(cw) + '" height="' + ch + '" fill="' +
        token(k.fill ? '--fg' : '--accent-2-soft') + '"/>');
      out.push(text(c, x + 10, y + 22, k.lines[0], k.fill ? '--bg' : '--fg', 'font-weight="700"'));
      out.push(text(c, x + 10, y + 41, k.lines.slice(1), k.fill ? '--bg' : '--fg'));
    });

    mount(el, w, top + 2 * (ch + band) + gap + 4, 'Grid of option roles. A call buyer pays the premium and has the right to buy ' +
      '100 shares at the strike; the call seller collects it and must sell if assigned. A put buyer pays and has the right to sell; ' +
      'the put seller collects and must buy if assigned.', out);
  }

  // ---- Payoff frame for Figs. 8.2 and 8.3: profit or loss at expiration against the stock price ----

  function payoffFrame(el, X_MIN, X_MAX, Y_MIN, Y_MAX, yTicks) {
    var c = context(el), w = c.width, narrow = w < 420;
    var h = Math.round(clamp(w * 0.58, 280, 420)) + (narrow ? 40 : 0);
    var m = { top: narrow ? 66 : 28, right: narrow ? 10 : 112, bottom: 30, left: 56 };
    var f = {
      c: c, w: w, h: h, m: m, out: [], narrow: narrow,
      // On narrow screens the series are named in a legend above the plot, not at the line ends.
      legend: function (items) {
        items.forEach(function (it, i) {
          var lx = (i % 2) * 140, ly = 34 + Math.floor(i / 2) * 18;
          f.out.push(it.area
            ? '<rect x="' + lx + '" y="' + (ly - 9) + '" width="18" height="10" fill="' + c.token(it.token) + '" fill-opacity="0.14" stroke="' + c.token(it.token) + '"/>'
            : '<line x1="' + lx + '" x2="' + (lx + 18) + '" y1="' + (ly - 4) + '" y2="' + (ly - 4) + '" stroke="' + c.token(it.token) + '" stroke-width="' +
              (it.dash ? 2 : 3) + '"' + (it.dash ? ' stroke-dasharray="5 4"' : '') + '/>');
          f.out.push(text(c, lx + 24, ly, it.name, '--fg'));
        });
      },
      x: function (p) { return m.left + ((p - X_MIN) / (X_MAX - X_MIN)) * (w - m.left - m.right); },
      y: function (v) { return h - m.bottom - ((v - Y_MIN) / (Y_MAX - Y_MIN)) * (h - m.top - m.bottom); },
      curve: function (fn) {
        var pts = [];
        for (var p = X_MIN; p <= X_MAX + 1e-9; p += 0.25) pts.push(f1(f.x(p)) + ',' + f1(f.y(fn(p))));
        return pts;
      }
    };
    yTicks.forEach(function (t) {
      f.out.push('<line x1="' + m.left + '" x2="' + f1(w - m.right) + '" y1="' + f1(f.y(t)) + '" y2="' + f1(f.y(t)) + '" stroke="' +
        c.token(t === 0 ? '--fg' : '--muted') + '" stroke-width="' + (t === 0 ? 2 : 0.5) + '"/>');
      f.out.push(text(c, m.left - 8, f.y(t) + 4, (t > 0 ? '+$' : t < 0 ? '&minus;$' : '$') + Math.abs(t).toLocaleString('en-US'), '--muted', 'text-anchor="end"'));
    });
    var step = w < 420 ? 10 : 5;
    for (var p = Math.ceil(X_MIN / step) * step; p <= X_MAX; p += step) {
      f.out.push(text(c, f.x(p), h - 8, '$' + p, '--muted', 'text-anchor="middle"'));
    }
    f.out.push(text(c, w < 420 ? 0 : m.left, 14, w < 420 ? 'Profit or loss at expiration' : 'Profit or loss at expiration, by the stock price then',
      '--fg', 'font-weight="700"'));
    return f;
  }

  // ---- Fig. 8.2: a covered call caps the upside ----

  function drawCoveredCall(el) {
    var BASIS = 50, STRIKE = 55, PREMIUM = 1, X_MIN = 35, X_MAX = 70;
    var f = payoffFrame(el, X_MIN, X_MAX, -1500, 2000, [-1500, -1000, -500, 0, 500, 1000, 1500, 2000]), c = f.c, token = c.token, out = f.out;
    var shares = function (p) { return (p - BASIS) * 100; }, covered = function (p) { return coveredCallPL(p, BASIS, STRIKE, PREMIUM); };

    // The upside given up: between the two lines, above the strike.
    var given = [];
    for (var p = STRIKE; p <= X_MAX + 1e-9; p += 0.25) given.push(f1(f.x(p)) + ',' + f1(f.y(shares(p))));
    given.push(f1(f.x(X_MAX)) + ',' + f1(f.y(covered(X_MAX))), f1(f.x(STRIKE)) + ',' + f1(f.y(covered(STRIKE))));
    out.push('<polygon points="' + given.join(' ') + '" fill="' + token('--accent') + '" fill-opacity="0.14"/>');
    out.push(polyline(f.curve(shares), token('--accent-2'), 2, 'stroke-dasharray="5 4"'));
    out.push(polyline(f.curve(covered), token('--fg'), 3));
    out.push('<line x1="' + f1(f.x(STRIKE)) + '" x2="' + f1(f.x(STRIKE)) + '" y1="' + f.m.top + '" y2="' + f1(f.h - f.m.bottom) + '" stroke="' +
      token('--muted') + '" stroke-width="1" stroke-dasharray="2 3"/>');
    out.push(text(c, f.x(STRIKE) + 4, f.m.top + 12, (f.narrow ? '$' : 'Strike $') + STRIKE, '--muted'));

    if (f.narrow) {
      f.legend([{ name: 'Shares alone', token: '--accent-2', dash: true }, { name: 'With the call', token: '--fg' },
        { name: 'Upside given up', token: '--accent', area: true }]);
    } else {
      var ly = spread([f.y(shares(X_MAX)) + 4, f.y(covered(X_MAX)) + 4], 17);
      out.push(text(c, f.x(X_MAX) + 8, ly[0], 'Shares alone', '--accent-2', 'font-weight="700"'));
      out.push(text(c, f.x(X_MAX) + 8, ly[1], 'With the call', '--fg', 'font-weight="700"'));
      out.push(text(c, f.x(X_MAX) + 8, (ly[0] + ly[1]) / 2 + 40, ['Upside', 'given up'], '--accent', 'font-weight="700"'));
      out.push(text(c, f.x(X_MIN) + 6, f.y(1700), ['Below $' + STRIKE + ', the $' + PREMIUM * 100 + ' premium', 'is a small cushion, not insurance'], '--fg'));
    }

    mount(el, f.w, f.h, 'Payoff chart at expiration for 100 shares bought at $50, alone and with a $55 call sold for $1. ' +
      'Below $55 the call adds $100 to the result. Above $55 the result is capped at +$600, while the shares alone keep rising.', out);
  }

  // ---- Fig. 8.3: a cash-secured put takes the downside, less the premium ----

  function drawShortPut(el) {
    var STRIKE = 50, PREMIUM = 1.5, X_MIN = 30, X_MAX = 65;
    var f = payoffFrame(el, X_MIN, X_MAX, -2000, 1500, [-2000, -1500, -1000, -500, 0, 500, 1000, 1500]), c = f.c, token = c.token, out = f.out;
    var shares = function (p) { return (p - STRIKE) * 100; }, put = function (p) { return shortPutPL(p, STRIKE, PREMIUM); };

    // The downside: below the zero line, under the put's line.
    var down = [];
    for (var p = X_MIN; p <= STRIKE - PREMIUM + 1e-9; p += 0.25) down.push(f1(f.x(p)) + ',' + f1(f.y(put(p))));
    down.push(f1(f.x(STRIKE - PREMIUM)) + ',' + f1(f.y(0)), f1(f.x(X_MIN)) + ',' + f1(f.y(0)));
    out.push('<polygon points="' + down.join(' ') + '" fill="' + token('--accent') + '" fill-opacity="0.14"/>');
    out.push(polyline(f.curve(shares), token('--accent-2'), 2, 'stroke-dasharray="5 4"'));
    out.push(polyline(f.curve(put), token('--fg'), 3));
    out.push('<line x1="' + f1(f.x(STRIKE)) + '" x2="' + f1(f.x(STRIKE)) + '" y1="' + f.m.top + '" y2="' + f1(f.h - f.m.bottom) + '" stroke="' +
      token('--muted') + '" stroke-width="1" stroke-dasharray="2 3"/>');
    out.push(text(c, f.x(STRIKE) + 4, f.m.top + 12, (f.narrow ? '$' : 'Strike $') + STRIKE, '--muted'));

    if (f.narrow) {
      f.legend([{ name: 'Owning at $' + STRIKE, token: '--accent-2', dash: true }, { name: 'Sold put', token: '--fg' },
        { name: 'Downside, less premium', token: '--accent', area: true }]);
    } else {
      var ly = spread([f.y(put(X_MAX)) + 4, f.y(shares(X_MAX)) + 4], 17);
      out.push(text(c, f.x(X_MAX) + 8, ly[0], ['Sold put:', 'keep $' + PREMIUM * 100], '--fg', 'font-weight="700"'));
      out.push(text(c, f.x(X_MAX) + 8, ly[1] + 18, ['Owning', 'at $' + STRIKE], '--accent-2', 'font-weight="700"'));
      out.push(text(c, f.x(X_MIN) + 6, f.y(-280), ['Full downside,', 'less the premium'], '--accent', 'font-weight="700"'));
    }

    mount(el, f.w, f.h, 'Payoff chart at expiration for one $50 put sold for $1.50, beside owning 100 shares at $50. ' +
      'Above $50 the seller keeps $150. Below it, the put loses almost exactly what the shares would, $150 less.', out);
  }

  // ---- Fig. 8.4: one turn of the Wheel ----

  function drawWheel(el) {
    var c = context(el), token = c.token, w = c.width, out = [];
    var x0 = 24, bw = Math.min(340, w - 30), cx = x0 + bw / 2, ROW = 74, y = 0;

    WHEEL.forEach(function (st, i) {
      out.push(box(c, x0, y, bw, st.lines, st.holding === 'shares' ? { stroke: '--accent-2' } : {}));
      if (i < WHEEL.length - 1) out.push(arrow(cx, y + 52, cx, y + ROW - 2, token('--fg')));
      y += ROW;
    });
    var last = (WHEEL.length - 1) * ROW + 50;
    out.push('<path d="M' + f1(cx) + ',' + (last + 2) + ' V' + (last + 16) + ' H' + f1(x0 - 14) + ' V25 H' + f1(x0 - 3) + '" fill="none" stroke="' +
      token('--fg') + '" stroke-width="2"/>');
    out.push(arrowhead(x0 - 1, 25, 0, token('--fg')));
    out.push(text(c, x0 + bw + 10, ROW + 30, w >= 480 ? ['Holding', 'shares'] : '', '--accent-2', 'font-weight="700"'));
    var net = WHEEL.reduce(function (s, st) { return s + st.cash; }, 0);
    out.push(text(c, x0, last + 40, 'Net for one turn: +' + money(net) + ', then start over', '--fg', 'font-weight="700"'));

    mount(el, w, last + 50, 'Cycle of four steps: ' + WHEEL.map(function (st) { return st.lines.join(', '); }).join('; ') +
      '. Then back to step 1. Net for one turn: plus ' + money(net) + '.', out);
  }

  // ---- Fig. 8.5: every obligation is covered before the trade ----

  function drawCovered(el) {
    var ROWS = [
      { name: 'Cash-secured put', owe: 'Might have to pay $5,000', have: 'Cash set aside: $5,000' },
      { name: 'Covered call', owe: 'Might have to deliver 100 shares', have: 'Shares held: 100' }
    ];
    var c = context(el), token = c.token, w = c.width, bw = Math.min(360, w), ROW = 104, out = [];

    ROWS.forEach(function (r, i) {
      var top = i * ROW;
      out.push(text(c, 0, top + 14, r.name, '--fg', 'font-weight="700"'));
      out.push('<rect x="1" y="' + (top + 24) + '" width="' + f1(bw - 2) + '" height="28" fill="none" stroke="' + token('--accent') + '" stroke-width="2" stroke-dasharray="5 4"/>');
      out.push(text(c, 10, top + 43, 'Obligation: ' + r.owe.charAt(0).toLowerCase() + r.owe.slice(1), '--fg'));
      out.push('<rect x="0" y="' + (top + 56) + '" width="' + f1(bw) + '" height="28" fill="' + token('--fg') + '"/>');
      out.push(text(c, 10, top + 75, r.have, '--bg', 'font-weight="700"'));
    });

    mount(el, w, ROWS.length * ROW - 14, 'Two matched pairs. A cash-secured put might require paying $5,000, and $5,000 in cash is set ' +
      'aside. A covered call might require delivering 100 shares, and 100 shares are held. Each obligation is covered in full before the trade.', out);
  }

  // ---- Fig. 7.1: a month of mornings ----

  function drawAttentionMonth(el) {
    var DAYS = 21, MINUTES = 30;
    var c = context(el), token = c.token, w = c.width, narrow = w < 420, out = [];
    var m = { left: narrow ? 0 : 76, right: narrow ? 0 : 92 };
    var cell = (w - m.left - m.right) / DAYS, size = Math.min(26, cell - 2), ROW = narrow ? 64 : 44;
    var hours = DAYS * MINUTES / 60;

    out.push(text(c, m.left, 12, 'A month of ' + DAYS + ' trading days', '--muted'));
    [{ name: 'Satellite', token: '--accent', days: DAYS, total: hours + ' hours', note: MINUTES + ' minutes every morning' },
      { name: 'Core', token: '--fg', days: 1, total: 'About none', note: 'One automatic deposit' }].forEach(function (r, k) {
      var top = 24 + k * ROW, cy = top + (narrow ? 22 : 4);
      if (narrow) {
        out.push(text(c, 0, top + 12, r.name + ': ' + r.total, '--fg', 'font-weight="700"'));
      } else {
        out.push(text(c, m.left - 10, cy + size / 2 + 4, r.name, '--fg', 'text-anchor="end" font-weight="700"'));
        out.push(text(c, w - m.right + 10, cy + size / 2 - 3, r.total, '--fg', 'font-weight="700"'));
        out.push(text(c, w - m.right + 10, cy + size / 2 + 12, r.note.split(' ').slice(0, 2).join(' '), '--muted'));
      }
      for (var d = 0; d < DAYS; d++) {
        var x = m.left + d * cell + (cell - size) / 2, on = d < r.days;
        out.push('<rect x="' + f1(x) + '" y="' + f1(cy) + '" width="' + f1(size) + '" height="' + f1(size) + '" fill="' +
          (on ? token(r.token) : 'none') + '" stroke="' + token(on ? r.token : '--muted') + '" stroke-width="' + (on ? 0 : 1) + '"' +
          (on ? '' : ' stroke-opacity="0.4"') + '/>');
      }
      if (narrow) out.push(text(c, 0, cy + size + 15, r.note, '--muted'));
    });

    mount(el, w, 24 + 2 * ROW + (narrow ? 10 : 0), 'Two rows of ' + DAYS + ' trading days. The satellite needs a ' + MINUTES +
      '-minute routine every morning, about ' + hours + ' hours a month. The core needs one automatic deposit.', out);
  }

  // ---- Fig. 7.2: three setups, each with its exit planned ----
  // Sketches, not prices: points are on a 0 to 1 grid. Each has a reference line, an
  // entry, a stop below, and a target above.

  var SETUPS = [
    { name: 'Pullback to a rising average', ref: [[0, 0.18], [1, 0.68]],
      price: [[0, 0.3], [0.15, 0.45], [0.3, 0.6], [0.42, 0.52], [0.52, 0.46], [0.6, 0.53], [0.75, 0.7], [0.88, 0.8], [1, 0.88]],
      entry: [0.6, 0.53], stop: 0.4, target: 0.84 },
    { name: 'Breakout from a base', ref: [[0.12, 0.55], [0.58, 0.55]],
      price: [[0, 0.15], [0.12, 0.5], [0.22, 0.42], [0.32, 0.54], [0.42, 0.43], [0.52, 0.53], [0.6, 0.6], [0.75, 0.72], [0.88, 0.8], [1, 0.88]],
      entry: [0.6, 0.6], stop: 0.41, target: 0.84 },
    { name: 'Bounce off a level', ref: [[0, 0.3], [1, 0.3]],
      price: [[0, 0.72], [0.14, 0.5], [0.26, 0.33], [0.36, 0.48], [0.46, 0.36], [0.55, 0.32], [0.64, 0.42], [0.8, 0.6], [1, 0.7]],
      entry: [0.64, 0.42], stop: 0.24, target: 0.66 }
  ];

  function drawSetups(el) {
    var c = context(el), token = c.token, w = c.width, wide = w >= 560, out = [];
    var gap = 24, pw = wide ? (w - 2 * gap) / 3 : w, PH = 130, head = 22;

    SETUPS.forEach(function (s, k) {
      var ox = wide ? k * (pw + gap) : 0, oy = wide ? 0 : k * (head + PH + 18);
      var x = function (v) { return ox + v * pw; }, y = function (v) { return oy + head + (1 - v) * PH; };
      var line = function (pts) { return pts.map(function (p) { return f1(x(p[0])) + ',' + f1(y(p[1])); }); };
      out.push(text(c, ox, oy + 13, s.name, '--fg', 'font-weight="700"'));
      out.push('<line x1="' + f1(x(0)) + '" x2="' + f1(x(1)) + '" y1="' + f1(y(0)) + '" y2="' + f1(y(0)) + '" stroke="' + token('--muted') + '" stroke-width="0.5"/>');
      out.push(polyline(line(s.ref), token('--accent-2'), 1.5));
      // Stop and target run from the entry to the right edge.
      out.push('<line x1="' + f1(x(s.entry[0])) + '" x2="' + f1(x(1)) + '" y1="' + f1(y(s.stop)) + '" y2="' + f1(y(s.stop)) + '" stroke="' +
        token('--accent') + '" stroke-width="1.5" stroke-dasharray="5 3"/>');
      out.push('<line x1="' + f1(x(s.entry[0])) + '" x2="' + f1(x(1)) + '" y1="' + f1(y(s.target)) + '" y2="' + f1(y(s.target)) + '" stroke="' +
        token('--fg') + '" stroke-width="1" stroke-dasharray="2 3"/>');
      out.push(polyline(line(s.price), token('--fg'), 2));
      out.push('<circle cx="' + f1(x(s.entry[0])) + '" cy="' + f1(y(s.entry[1])) + '" r="5" fill="' + token('--fg') + '" stroke="' + token('--bg') + '" stroke-width="2"/>');
    });

    var ly = wide ? head + PH + 24 : 3 * (head + PH + 18) + 4;
    out.push('<circle cx="5" cy="' + (ly - 4) + '" r="5" fill="' + token('--fg') + '"/>');
    out.push(text(c, 14, ly, 'Entry', '--fg'));
    out.push('<line x1="62" x2="84" y1="' + (ly - 4) + '" y2="' + (ly - 4) + '" stroke="' + token('--accent') + '" stroke-width="1.5" stroke-dasharray="5 3"/>');
    out.push(text(c, 90, ly, 'Stop', '--fg'));
    out.push('<line x1="130" x2="152" y1="' + (ly - 4) + '" y2="' + (ly - 4) + '" stroke="' + token('--fg') + '" stroke-width="1" stroke-dasharray="2 3"/>');
    out.push(text(c, 158, ly, 'Target', '--fg'));
    out.push('<line x1="210" x2="232" y1="' + (ly - 4) + '" y2="' + (ly - 4) + '" stroke="' + token('--accent-2') + '" stroke-width="1.5"/>');
    out.push(text(c, 238, ly, w < 330 ? 'Ref.' : 'Average, base, level', '--fg'));

    mount(el, w, ly + 8, 'Three sketches of swing setups, not real prices: a pullback to a rising average, a breakout from a base, ' +
      'and a bounce off a level. Each marks the entry, a stop below it, and a target above it, all planned before the trade.', out);
  }

  // ---- Fig. 7.3: growth momentum as a funnel ----

  function drawMomentumFunnel(el) {
    var ROWS = [
      { name: 'Every stock you could buy', sub: 'The whole market', share: 1, token: '--accent-2-soft', opacity: 1 },
      { name: 'The business is strong', sub: 'Earnings and sales growing, a leader', share: 0.66, token: '--accent-2', opacity: 1 },
      { name: 'The chart agrees', sub: 'A breakout from a base on rising volume', share: 0.4, token: '--fg', opacity: 1 },
      { name: 'Enter, with a stop', sub: 'The stop limits the damage if wrong', share: 0.2, token: '--accent', opacity: 1 }
    ];
    var c = context(el), token = c.token, w = c.width, ROW = 62, out = [];

    ROWS.forEach(function (r, i) {
      var top = i * ROW, bw = w * r.share;
      out.push(text(c, w / 2, top + 13, r.name, '--fg', 'text-anchor="middle" font-weight="700"'));
      out.push(text(c, w / 2, top + 28, r.sub, '--muted', 'text-anchor="middle"'));
      out.push('<rect x="' + f1((w - bw) / 2) + '" y="' + (top + 36) + '" width="' + f1(bw) + '" height="14" fill="' + token(r.token) +
        '" fill-opacity="' + r.opacity + '"/>');
    });

    mount(el, w, ROWS.length * ROW - 8, 'Funnel: ' + ROWS.map(function (r) { return r.name + ' (' + r.sub.toLowerCase() + ')'; }).join(', then ') +
      '. The fundamentals pick the stock, the chart picks the moment, and the stop limits the damage.', out);
  }

  // ---- Fig. 7.4: the three numbers, and what they size ----

  function drawTradePlan(el) {
    var ENTRY = 50, STOP = 47, TARGET = 59, CAPITAL = 10000, RISK = 0.01;
    var c = context(el), token = c.token, w = c.width, wide = w >= 600, out = [];
    var pw = wide ? (w - 40) / 2 : w;

    // Left: the plan on a price scale.
    var top = 26, PH = 190, lo = 44, hi = 62, sx = 86;
    var y = function (p) { return top + (hi - p) / (hi - lo) * PH; };
    out.push(text(c, 0, 13, 'The plan, written before the trade', '--fg', 'font-weight="700"'));
    out.push('<rect x="' + sx + '" y="' + f1(y(TARGET)) + '" width="22" height="' + f1(y(ENTRY) - y(TARGET)) + '" fill="' + token('--fg') + '"/>');
    out.push('<rect x="' + sx + '" y="' + f1(y(ENTRY)) + '" width="22" height="' + f1(y(STOP) - y(ENTRY)) + '" fill="' + token('--accent') + '"/>');
    [[TARGET, 'Target', '--fg'], [ENTRY, 'Entry', '--fg'], [STOP, 'Stop', '--accent']].forEach(function (l) {
      out.push('<line x1="' + (sx - 8) + '" x2="' + (sx + 30) + '" y1="' + f1(y(l[0])) + '" y2="' + f1(y(l[0])) + '" stroke="' + token(l[2]) + '" stroke-width="2"/>');
      out.push(text(c, sx - 14, y(l[0]) + 4, l[1] + ' $' + l[0], l[2], 'text-anchor="end" font-weight="700"'));
    });
    out.push(text(c, sx + 40, (y(TARGET) + y(ENTRY)) / 2 + 4, 'Reward $' + (TARGET - ENTRY), '--fg'));
    out.push(text(c, sx + 40, (y(ENTRY) + y(STOP)) / 2 + 4, 'Risk $' + (ENTRY - STOP), '--accent'));
    out.push(text(c, sx + 40, y(STOP) + 36, rewardRisk(ENTRY, STOP, TARGET) + ' to 1: it pays', '--fg', 'font-weight="700"'));
    out.push(text(c, sx + 40, y(STOP) + 51, 'more than it risks', '--fg', 'font-weight="700"'));

    // Right: same dollars at risk, two stops. Area = shares x stop distance.
    var ox = wide ? pw + 40 : 0, oy = wide ? 0 : top + PH + 80, budget = CAPITAL * RISK;
    var STOPS = [{ d: 1, name: 'Tight stop, $1 below' }, { d: 5, name: 'Wide stop, $5 below' }];
    var perShare = Math.min(1.8, (pw - 10) / 100), perDollar = 16;
    out.push(text(c, ox, oy + 13, '1% of a ' + money(CAPITAL) + ' satellite: ' + money(budget) + ' at risk', '--fg', 'font-weight="700"'));
    var ry = oy + 34;
    STOPS.forEach(function (s) {
      var shares = positionSize(CAPITAL, RISK, ENTRY, ENTRY - s.d), rw = shares * perShare, rh = s.d * perDollar;
      out.push(text(c, ox, ry + 4, s.name + ': ' + shares + ' shares', '--fg'));
      out.push('<rect x="' + f1(ox) + '" y="' + (ry + 12) + '" width="' + f1(rw) + '" height="' + rh + '" fill="' + token('--accent') + '"/>');
      out.push(text(c, ox + rw + 8, ry + 12 + rh / 2 + 4, money(shares * s.d), '--fg', 'font-weight="700"'));
      ry += rh + 44;
    });
    out.push(text(c, ox, ry - 16, ['Width is shares, height is the stop distance.', 'Same red area: the same ' + money(budget) + ' at risk.'], '--muted'));

    mount(el, w, wide ? Math.max(top + PH + 70, ry + 18) : ry + 18, 'Two panels. A trade plan: entry $' + ENTRY + ', stop $' + STOP +
      ', target $' + TARGET + ': risk $' + (ENTRY - STOP) + ' to make $' + (TARGET - ENTRY) + ', 3 to 1. Sizing with 1% of a $10,000 satellite, ' +
      '$100 at risk: a $1 stop allows 100 shares, a $5 stop allows 20.', out);
  }

  // ---- Fig. 7.5: a few trades prove nothing ----

  function drawRunningExpectancy(el) {
    var c = context(el), token = c.token, w = c.width;
    var run = runningAverage(TRADER_A), N = run.length, LONG = expectancy(0.4, 300, 100), Y_MIN = -100, Y_MAX = 150;
    var h = Math.round(clamp(w * 0.55, 260, 380));
    var m = { top: 26, right: 76, bottom: 30, left: 46 };
    var x = function (i) { return m.left + (i / (N - 1)) * (w - m.left - m.right); };
    var y = function (v) { return h - m.bottom - ((v - Y_MIN) / (Y_MAX - Y_MIN)) * (h - m.top - m.bottom); };
    var EARLY = 10, out = [];

    out.push('<rect x="' + f1(x(0)) + '" y="' + m.top + '" width="' + f1(x(EARLY - 1) - x(0)) + '" height="' + f1(h - m.top - m.bottom) +
      '" fill="' + token('--muted') + '" fill-opacity="0.12"/>');
    out.push(text(c, x(0) + 6, m.top + 16, w < 420 ? ['Too few', 'to judge'] : ['Too few to', 'judge'], '--muted', 'font-weight="700"'));
    [-100, -50, 0, 50, 100, 150].forEach(function (t) {
      out.push('<line x1="' + m.left + '" x2="' + f1(w - m.right) + '" y1="' + f1(y(t)) + '" y2="' + f1(y(t)) + '" stroke="' +
        token(t === 0 ? '--fg' : '--muted') + '" stroke-width="' + (t === 0 ? 2 : 0.5) + '"/>');
      out.push(text(c, m.left - 8, y(t) + 4, (t < 0 ? '&minus;$' : '$') + Math.abs(t), '--muted', 'text-anchor="end"'));
    });
    [1, 10, 20, 30, 40, 50].forEach(function (t) {
      if (w < 420 && (t === 10 || t === 30)) return;
      out.push(text(c, x(t - 1), h - 8, t === 1 ? 'Trade 1' : String(t), '--muted', 'text-anchor="' + (t === 1 ? 'start' : 'middle') + '"'));
    });
    out.push('<line x1="' + m.left + '" x2="' + f1(w - m.right) + '" y1="' + f1(y(LONG)) + '" y2="' + f1(y(LONG)) + '" stroke="' +
      token('--fg') + '" stroke-width="1.5" stroke-dasharray="5 4"/>');
    out.push(text(c, w - m.right + 8, y(LONG) + 4, ['Long run:', '+$' + LONG], '--fg', 'font-weight="700"'));
    out.push(polyline(run.map(function (v, i) { return f1(x(i)) + ',' + f1(y(Math.max(Y_MIN, Math.min(Y_MAX, v)))); }), token('--fg'), 2.5));
    run.forEach(function (v, i) {
      if (v < 0) out.push('<circle cx="' + f1(x(i)) + '" cy="' + f1(y(v)) + '" r="3" fill="' + token('--accent') + '"/>');
    });
    out.push(text(c, m.left, 14, 'Average per trade, so far', '--fg', 'font-weight="700"'));

    mount(el, w, h, 'Line chart of Trader A’s average result per trade, after each of 50 trades. After 5 trades it is minus $20; ' +
      'it swings early, then settles at plus $60, the long-run expectancy. Points below zero are marked.', out);
  }

  // ---- Fig. 5.1: the Ladder ----
  // Rungs from Level 1 at the bottom to Level 4 at the top, each with its strategy chips,
  // timing, and gate. Systematic runs alongside all four.

  function drawLadder(el) {
    var LEVELS = [
      { n: 4, name: 'Long Options and 0DTE', chips: [10, 12], when: '6+ months', gate: 'about 50 paper trades, positive expectancy', gateShort: 'about 50 paper trades' },
      { n: 3, name: 'Covered Calls and the Wheel', chips: [6, 7], when: 'Months 3 to 6', gate: 'the promotion rule' },
      { n: 2, name: 'Swing Trading and Growth Momentum', short: 'Swing Trading, Growth Momentum', chips: [9, 5], when: 'Months 1 to 3',
        gate: 'the promotion rule' },
      { n: 1, name: 'Foundation', chips: [1], when: 'Weeks 1 to 4', gate: 'journal and routine running first', gateShort: 'journal and routine first' }
    ];
    var c = context(el), token = c.token, w = c.width, narrow = w < 420, ROW = narrow ? 88 : 76, RAIL = 36, out = [];
    var tx = RAIL + 20, h = LEVELS.length * ROW + 64;

    out.push('<line x1="2" x2="2" y1="0" y2="' + (LEVELS.length * ROW + 6) + '" stroke="' + token('--fg') + '" stroke-width="3"/>');
    out.push('<line x1="' + RAIL + '" x2="' + RAIL + '" y1="0" y2="' + (LEVELS.length * ROW + 6) + '" stroke="' + token('--fg') + '" stroke-width="3"/>');
    LEVELS.forEach(function (l, i) {
      var top = i * ROW, rung = top + 22;
      out.push('<line x1="2" x2="' + RAIL + '" y1="' + rung + '" y2="' + rung + '" stroke="' + token('--fg') + '" stroke-width="3"/>');
      out.push(text(c, RAIL / 2 + 1, rung - 6, String(l.n), '--accent', 'text-anchor="middle" font-weight="700"'));
      out.push(text(c, tx, top + 18, 'Level ' + l.n, '--fg', 'font-weight="700"'));
      l.chips.forEach(function (n, k) { out.push(chip(c, tx + 64 + k * 22, top + 14, n, 9)); });
      out.push(text(c, tx, top + 36, narrow && l.short ? l.short : l.name, '--fg'));
      out.push(text(c, tx, top + 52, narrow ? [l.when, 'Gate: ' + (l.gateShort || l.gate)] : l.when + '. Gate: ' + l.gate, '--muted'));
    });
    var sy = LEVELS.length * ROW + 30;
    out.push('<rect x="0" y="' + (sy - 18) + '" width="' + f1(w) + '" height="34" fill="' + token('--muted') + '" fill-opacity="0.1"/>');
    out.push(chip(c, 18, sy - 1, 13, 9));
    out.push(text(c, 36, sy + 3, 'Alongside all four: Systematic' + (narrow ? '' : ', proven rules into code'), '--fg', 'font-weight="700"'));

    mount(el, w, h, 'Ladder diagram, Level 1 at the bottom. ' + LEVELS.slice().reverse().map(function (l) {
      return 'Level ' + l.n + ', ' + l.name + ', ' + l.when + ', gate: ' + l.gate;
    }).join('. ') + '. Systematic runs alongside all four.', out);
  }

  // ---- Fig. 5.2: the promotion rule needs both halves ----

  function drawPromotion(el) {
    var CELLS = [
      { e: 1, a: 1, lines: ['Promote.', 'It works, and you', 'can repeat it.'], narrow: ['Promote.', 'It works, and', 'you can repeat it.'], fill: '--fg' },
      { e: 1, a: 0, lines: ['Not yet.', 'A good result you', 'cannot repeat.'], narrow: ['Not yet.', 'A good result', 'you cannot repeat.'] },
      { e: 0, a: 1, lines: ['Not yet.', 'You followed the', 'rules: fix them.'], narrow: ['Not yet.', 'You followed the', 'rules: fix them.'] },
      { e: 0, a: 0, lines: ['Not yet.', 'Fix the habits,', 'then judge the rules.'], narrow: ['Not yet.', 'Fix the habits,', 'then judge', 'the rules.'] }
    ];
    var c = context(el), token = c.token, w = c.width, narrow = w < 420;
    var left = narrow ? 0 : 78, band = narrow ? 22 : 0, top = 40, gap = 6, cw = Math.min(200, (w - left - gap) / 2);
    var ch = narrow ? 90 : 78, out = [];

    out.push(text(c, left + cw + gap / 2, 12, 'Adherence to your rules', '--fg', 'text-anchor="middle" font-weight="700"'));
    out.push(text(c, left + cw / 2, 30, '90% or more', '--muted', 'text-anchor="middle"'));
    out.push(text(c, left + cw * 1.5 + gap, 30, 'Under 90%', '--muted', 'text-anchor="middle"'));
    if (narrow) {
      out.push(text(c, 0, top + 15, 'Positive expectancy', '--fg', 'font-weight="700"'));
      out.push(text(c, 0, top + band + ch + gap + 15, 'Zero or negative expectancy', '--fg', 'font-weight="700"'));
    } else {
      out.push(text(c, 0, top + ch / 2 - 4, ['Positive', 'expectancy'], '--fg', 'font-weight="700"'));
      out.push(text(c, 0, top + ch * 1.5 + gap - 4, ['Zero or', 'negative'], '--fg', 'font-weight="700"'));
    }
    CELLS.forEach(function (k) {
      var lines = narrow ? k.narrow : k.lines;
      var x = left + (k.a ? 0 : cw + gap), y = top + band + (k.e ? 0 : ch + gap + band);
      out.push('<rect x="' + f1(x) + '" y="' + y + '" width="' + f1(cw) + '" height="' + ch + '" fill="' + token(k.fill || '--muted') +
        '" fill-opacity="' + (k.fill ? 1 : 0.12) + '"/>');
      out.push(text(c, x + 10, y + 22, lines[0], k.fill ? '--bg' : '--fg', 'font-weight="700"'));
      out.push(text(c, x + 10, y + 40, lines.slice(1), k.fill ? '--bg' : '--fg'));
    });

    mount(el, w, top + 2 * band + ch * 2 + gap + 4, 'Two by two grid of the promotion rule. Only positive expectancy with 90% or more adherence ' +
      'promotes. A good result with poor adherence cannot be repeated. Good adherence with no edge means the rules need work. ' +
      'Neither means fix the habits first.', out);
  }

  // ---- Fig. 5.3: time works for the seller ----

  function drawTimeDecay(el) {
    var DAYS = 60;
    var c = context(el), token = c.token, w = c.width;
    var h = Math.round(clamp(w * 0.52, 260, 360));
    var m = { top: 28, right: 16, bottom: 30, left: 44 };
    var x = function (d) { return m.left + ((DAYS - d) / DAYS) * (w - m.left - m.right); };
    var y = function (v) { return h - m.bottom - v * (h - m.top - m.bottom); };
    var curve = [], out = [];

    hGrid(c, out, m, w, y, [0, 0.25, 0.5, 0.75, 1], function (t) { return Math.round(t * 100) + '%'; });
    [60, 45, 30, 15, 0].forEach(function (d) {
      out.push(text(c, x(d), h - 8, d === 0 ? 'Expiry' : d + (d === 60 ? ' days left' : ''), '--muted',
        'text-anchor="' + (d === 60 ? 'start' : d === 0 ? 'end' : 'middle') + '"'));
    });
    for (var d = DAYS; d >= 0; d -= 0.5) curve.push(f1(x(d)) + ',' + f1(y(timeValueLeft(d, DAYS))));
    // The part already lost to time: between the top and the curve.
    out.push('<polygon points="' + f1(x(DAYS)) + ',' + f1(y(1)) + ' ' + curve.join(' ') + ' ' + f1(x(0)) + ',' + f1(y(1)) + '" fill="' +
      token('--accent') + '" fill-opacity="0.12"/>');
    out.push(polyline(curve, token('--fg'), 3));
    out.push(text(c, m.left, 14, 'Time value left, if nothing else changes', '--fg', 'font-weight="700"'));
    out.push(text(c, x(16), y(0.86), ['Decay: the seller', 'collects it'], '--accent', 'text-anchor="middle" font-weight="700"'));
    var half = timeValueLeft(15, DAYS);
    out.push('<circle cx="' + f1(x(15)) + '" cy="' + f1(y(half)) + '" r="4" fill="' + token('--fg') + '"/>');
    out.push(text(c, x(15) - 8, y(half) + 18, ['15 days left:', 'half remains'], '--fg', 'text-anchor="end"'));

    mount(el, w, h, 'Line chart: the time value of an at-the-money option over its last 60 days, if nothing else changes. ' +
      'It falls with the square root of time left: half remains with 15 days to go, and the fall speeds up near expiry. ' +
      'The seller collects that decay; the buyer pays it.', out);
  }

  // ---- Fig. 5.4: tuition, already spent ----

  function drawTuition(el) {
    var c = context(el), token = c.token, w = c.width, out = [];
    var bw = Math.min(220, w * 0.58), side = bw + 18, ROW = 92;

    out.push(box(c, 0, 0, bw, ['Satellite account']));
    out.push(arrow(bw / 2, 42, bw / 2, ROW - 4, token('--fg')));
    out.push(text(c, bw / 2 + 8, 66, 'Fixed, monthly', '--fg'));
    out.push(box(c, 0, ROW, bw, ['Tuition budget:', 'counted as spent'], { fill: '--accent' }));
    out.push(arrow(bw / 2, ROW + 52, bw / 2, 2 * ROW + 6, token('--fg')));
    out.push(box(c, 0, 2 * ROW + 8, bw, ['Level 4 trades']));
    // Whatever comes back is a bonus.
    out.push('<path d="M' + f1(bw + 2) + ',' + (2 * ROW + 28) + ' H' + f1(side + 22) + ' V20 H' + f1(bw + 10) + '" fill="none" stroke="' +
      token('--fg') + '" stroke-width="2" stroke-dasharray="5 4"/>');
    out.push(arrowhead(bw + 3, 20, Math.PI, token('--fg')));
    out.push(text(c, side + 30, ROW + 4, ['Anything', 'left over:', 'a bonus'], '--fg', 'font-weight="700"'));
    // No chasing: the cross marks the urge the budget removes.
    var yx = ROW + 76;
    out.push(text(c, side + 30, yx, ['No top-ups,', 'no chasing', 'it back'], '--accent', 'font-weight="700"'));
    out.push('<path d="M' + f1(side + 6) + ',' + (yx - 14) + ' l12,12 m0,-12 l-12,12" stroke="' + token('--accent') + '" stroke-width="2.5"/>');

    mount(el, w, 2 * ROW + 52, 'Diagram: a fixed monthly amount moves from the satellite account into a tuition budget that is counted ' +
      'as spent, and from there into Level 4 trades. Anything left over returns as a bonus. There are no top-ups to chase the money back.', out);
  }

  // ---- Fig. 5.5: lost by neglect ----

  function drawNeglect(el) {
    var DONE = 6, LIMIT = 10;
    var c = context(el), token = c.token, w = c.width, out = [];
    var n = DONE + LIMIT, cell = Math.min(40, (w - 4) / n), top = 26;

    out.push(text(c, 0, 14, 'Trading days', '--fg', 'font-weight="700"'));
    for (var i = 0; i < n; i++) {
      var x = i * cell, missed = i >= DONE, k = i - DONE + 1;
      out.push('<rect x="' + f1(x + 1) + '" y="' + top + '" width="' + f1(cell - 2) + '" height="' + f1(cell - 2) + '" fill="' +
        (missed ? 'none' : token('--fg')) + '" stroke="' + token(missed ? (k === LIMIT ? '--accent' : '--muted') : '--fg') + '" stroke-width="' +
        (k === LIMIT ? 3 : 1.5) + '"/>');
      if (missed && (cell >= 22 || k === 1 || k === LIMIT)) {
        out.push(text(c, x + cell / 2, top + cell / 2 + 3, String(k), k === LIMIT ? '--accent' : '--muted',
          'text-anchor="middle" font-weight="700"' + (cell < 22 ? ' font-size="10"' : '')));
      }
    }
    var below = top + cell + 22;
    out.push('<rect x="0" y="' + (below - 10) + '" width="10" height="10" fill="' + token('--fg') + '"/>');
    out.push(text(c, 16, below, 'Routine done', '--fg'));
    out.push('<rect x="112.75" y="' + (below - 9.25) + '" width="8.5" height="8.5" fill="none" stroke="' + token('--muted') + '" stroke-width="1.5"/>');
    out.push(text(c, 128, below, 'Missed, counted', '--fg'));
    var end = (n - 0.5) * cell;
    out.push(arrow(end, below + 10, end, below + 40, token('--accent')));
    out.push(text(c, end - 10, below + 32, ['Day ' + LIMIT + ': the active slice', 'goes back to the core'], '--accent',
      'text-anchor="end" font-weight="700"'));

    mount(el, w, below + 58, 'A strip of trading days: the routine is done for ' + DONE + ' days, then missed for ' + LIMIT +
      ' in a row. On the tenth missed day the demotion rule sends the active slice back to the core.', out);
  }

  // ---- Fig. 6.5: a put puts a floor under the core ----

  function drawHedge(el) {
    var START = 100, FLOOR = 0.9, PREMIUM = 0.02, X_MIN = -0.5, X_MAX = 0.3, Y_MIN = 40, Y_MAX = 140;
    var c = context(el), token = c.token, w = c.width;
    var h = Math.round(clamp(w * 0.58, 280, 420));
    var m = { top: 28, right: 108, bottom: 30, left: 46 };
    var x = function (mv) { return m.left + ((mv - X_MIN) / (X_MAX - X_MIN)) * (w - m.left - m.right); };
    var y = function (v) { return h - m.bottom - ((v - Y_MIN) / (Y_MAX - Y_MIN)) * (h - m.top - m.bottom); };
    var pct = function (v) { return (v > 0 ? '+' : v < 0 ? '&minus;' : '') + Math.abs(Math.round(v * 100)) + '%'; };
    var bare = [], hedged = [], out = [];

    hGrid(c, out, m, w, y, [40, 60, 80, 100, 120, 140], function (t) { return '$' + t; });
    (w < 420 ? [-0.5, 0, 0.3] : [-0.5, -0.4, -0.3, -0.2, -0.1, 0, 0.1, 0.2, 0.3]).forEach(function (t) {
      out.push(text(c, x(t), h - 8, t === 0 ? '0' : pct(t), '--muted', 'text-anchor="' + (t === X_MIN ? 'start' : t === X_MAX ? 'end' : 'middle') + '"'));
    });
    out.push(text(c, m.left, 14, 'Core value after a market move', '--fg', 'font-weight="700"'));
    // The protected zone: below the floor, the hedge pays.
    out.push('<rect x="' + f1(x(X_MIN)) + '" y="' + f1(y(START * FLOOR)) + '" width="' + f1(x(FLOOR - 1) - x(X_MIN)) + '" height="' +
      f1(y(Y_MIN) - y(START * FLOOR)) + '" fill="' + token('--accent-2') + '" fill-opacity="0.12"/>');
    for (var mv = X_MIN; mv <= X_MAX + 1e-9; mv += 0.01) {
      bare.push(f1(x(mv)) + ',' + f1(y(START * (1 + mv))));
      hedged.push(f1(x(mv)) + ',' + f1(y(START * hedgedValue(mv, FLOOR, PREMIUM))));
    }
    out.push(polyline(bare, token('--accent'), 2, 'stroke-dasharray="5 4"'));
    out.push(polyline(hedged, token('--fg'), 3));

    var floorV = START * (FLOOR - PREMIUM), topBare = START * (1 + X_MAX), topHedged = START * hedgedValue(X_MAX, FLOOR, PREMIUM);
    var ly = spread([y(topBare) + 4, y(topHedged) + 4], 17);
    out.push(text(c, x(X_MAX) + 10, ly[0], 'No hedge: $' + topBare, '--accent', 'font-weight="700"'));
    out.push(text(c, x(X_MAX) + 10, ly[1], 'Hedged: $' + Math.round(topHedged), '--fg', 'font-weight="700"'));
    out.push(text(c, x(X_MIN) + 6, y(floorV) - 8, 'Floor: $' + Math.round(floorV), '--fg', 'font-weight="700"'));
    out.push(text(c, x(X_MIN) + 6, y(START * (1 + X_MIN)) + 16, 'Unhedged: $' + START * (1 + X_MIN), '--accent'));

    mount(el, w, h, 'Line chart of a $100 core after market moves from minus 50% to plus 30%. Unhedged, it falls with the market. ' +
      'Hedged with a put 10% below that costs $2, it never ends below $' + Math.round(floorV) + ', and in a rising market it trails by the $2 premium.', out);
  }

  // ---- Chapter 4: numbered strategy chips, colored by slice ----
  // Passive core in --fg (as in Chapters 2 and 6), the casino floor in --accent, the rest --accent-2.

  var GROUP_TOKEN = { core: '--fg', casino: '--accent' };
  function chip(c, x, y, num, r, hollow) {
    var tok = GROUP_TOKEN[STRATEGIES[num - 1].group] || '--accent-2';
    return '<circle cx="' + f1(x) + '" cy="' + f1(y) + '" r="' + r + '" fill="' + (hollow ? c.token('--bg') : c.token(tok)) +
      '" stroke="' + c.token(tok) + '" stroke-width="' + (hollow ? 1.5 : 0) + '"/>' +
      text(c, x, y + 4, String(num), hollow ? '--fg' : '--bg', 'text-anchor="middle" font-weight="700" font-size="11"');
  }
  // A row of three legend items, or a column when `stacked` (18px apart).
  function chipLegend(c, out, x, y, stacked) {
    [['Passive core', 1], ['Casino floor', 10], ['Everything else', 5]].forEach(function (g, i) {
      var gx = stacked ? x : x + i * 112;
      if (stacked) y += i ? 18 : 0;
      out.push('<circle cx="' + f1(gx + 5) + '" cy="' + f1(y - 4) + '" r="5" fill="' +
        c.token(GROUP_TOKEN[STRATEGIES[g[1] - 1].group] || '--accent-2') + '"/>');
      out.push(text(c, gx + 14, y, g[0], '--fg'));
    });
  }

  // ---- Fig. 4.1: a name turns one blur into separate answers ----

  function drawTags(el) {
    var MIX = [9, 12, 4, 12, 9, 4, 9, 12, 4], LANES = [[4, 'Value'], [9, 'Swing Trading'], [12, '0DTE Scalping']];
    var c = context(el), token = c.token, w = c.width, wide = w >= 560, out = [];
    var bw = wide ? Math.min(220, w * 0.32) : w, bh = 134, R = 10;

    out.push('<rect x="1" y="1" width="' + f1(bw - 2) + '" height="' + bh + '" fill="none" stroke="' + token('--muted') +
      '" stroke-width="1.5" stroke-dasharray="5 4"/>');
    out.push(text(c, 12, 22, '&ldquo;I was just trading&rdquo;', '--fg', 'font-weight="700"'));
    MIX.forEach(function (n, i) {
      // A loose scatter: three rows, nudged so it reads as a jumble, not a grid.
      var cx = 24 + (i % 5) * Math.min(36, (bw - 40) / 5) + (i % 2) * 6, cy = 48 + Math.floor(i / 5) * 30 + ((i * 7) % 3) * 4;
      out.push(chip(c, cx, cy, n, R));
    });
    out.push(text(c, 12, bh - 8, 'One blended result', '--muted'));

    var lx = wide ? bw + 96 : 0, ly = wide ? 6 : bh + 58;
    if (wide) {
      out.push(arrow(bw + 12, bh / 2, bw + 80, bh / 2, token('--fg')));
      out.push(text(c, bw + 46, bh / 2 - 10, 'Tag it', '--fg', 'text-anchor="middle" font-weight="700"'));
    } else {
      out.push(arrow(w / 2, bh + 8, w / 2, bh + 44, token('--fg')));
      out.push(text(c, w / 2 + 10, bh + 30, 'Tag each trade', '--fg', 'font-weight="700"'));
    }
    LANES.forEach(function (l, k) {
      var y = ly + k * 36 + 14;
      for (var j = 0; j < 3; j++) out.push(chip(c, lx + 12 + j * 24, y, l[0], R));
      out.push(text(c, lx + 92, y - 2, l[1], '--fg', 'font-weight="700"'));
      out.push(text(c, lx + 92, y + 13, 'Its own rules, its own result', '--muted'));
    });

    mount(el, w, wide ? Math.max(bh + 4, 3 * 36 + 12) : bh + 58 + 3 * 36 + 4, 'Diagram: an untagged pile of trades from ' +
      'three strategies gives one blended result. Tagged as Value, Swing Trading, and 0DTE Scalping, each gets its own rules and its own result.', out);
  }

  // ---- Fig. 4.2: the menu on one grid ----
  // Effort across, risk up. "High upfront, low ongoing" is a hollow ring at High joined to a
  // solid dot at Low. Systematic's risk depends on its rules, so it sits in its own row.

  function drawMenuGrid(el) {
    var RISK = ['Very High', 'High', 'Med to High', 'Med', 'Low to Med', 'Low', 'Lowers risk', 'Depends on rules'];
    var RISK_SHORT = ['Very High', 'High', 'Med&ndash;High', 'Med', 'Low&ndash;Med', 'Low', 'Lowers', 'Depends'];
    var EFFORT = ['Low', 'Low to Med', 'Med', 'Med to High', 'High', 'Very High'];
    var EFFORT_SHORT = ['Low', 'L&ndash;M', 'Med', 'M&ndash;H', 'High', 'V.H.'];
    var c = context(el), token = c.token, w = c.width, narrow = w < 560, out = [];
    var m = { top: 22, left: narrow ? 64 : 112, right: 6 }, ROW = 34, GAP = 12, R = 9;
    var col = (w - m.left - m.right) / EFFORT.length;
    var ry = function (i) { return m.top + i * ROW + (i === RISK.length - 1 ? GAP : 0) + ROW / 2; };
    var cx = function (j) { return m.left + col * (j + 0.5); };
    var gridBottom = m.top + RISK.length * ROW + GAP;

    out.push(text(c, 0, 12, 'Risk', '--fg', 'font-weight="700"'));
    RISK.forEach(function (r, i) {
      var top = ry(i) - ROW / 2;
      out.push('<rect x="' + m.left + '" y="' + f1(top) + '" width="' + f1(w - m.left - m.right) + '" height="' + ROW + '" fill="' +
        token('--muted') + '" fill-opacity="' + (i % 2 ? 0.05 : 0.11) + '"/>');
      out.push(text(c, m.left - 8, ry(i) + 4, (narrow ? RISK_SHORT : RISK)[i], '--fg', 'text-anchor="end"'));
    });
    EFFORT.forEach(function (e, j) {
      out.push(text(c, cx(j), gridBottom + 16, (narrow ? EFFORT_SHORT : EFFORT)[j], '--fg', 'text-anchor="middle"'));
    });
    out.push(text(c, w - m.right, gridBottom + 34, 'Effort &rarr;', '--fg', 'text-anchor="end" font-weight="700"'));

    // Place each strategy; spread chips that share a cell.
    var cells = {};
    STRATEGIES.forEach(function (s) {
      var split = s.effort === 'High upfront, low ongoing';
      var key = s.risk + '|' + (split ? 'Low' : s.effort);
      (cells[key] = cells[key] || []).push(s);
    });
    Object.keys(cells).forEach(function (key) {
      var list = cells[key];
      list.forEach(function (s, k) {
        var i = RISK.indexOf(s.risk), split = s.effort === 'High upfront, low ongoing';
        var j = split ? 0 : EFFORT.indexOf(s.effort), dx = (k - (list.length - 1) / 2) * (2 * R + 3);
        if (split) {
          var hx = cx(EFFORT.indexOf('High'));
          out.push('<line x1="' + f1(hx - R - 2) + '" x2="' + f1(cx(0) + R + 10) + '" y1="' + f1(ry(i)) + '" y2="' + f1(ry(i)) + '" stroke="' +
            token('--muted') + '" stroke-width="1.5" stroke-dasharray="4 3"/>');
          out.push(arrowhead(cx(0) + R + 3, ry(i), Math.PI, token('--muted')));
          out.push(chip(c, hx, ry(i), s.num, R, true));
        }
        out.push(chip(c, cx(j) + dx, ry(i), s.num, R));
      });
    });

    var ly = gridBottom + 34;
    chipLegend(c, out, 0, ly + (narrow ? 22 : 0), narrow);
    var ux = narrow ? 0 : 3 * 112 + 8, uy = ly + (narrow ? 22 + 3 * 18 : 0);
    out.push('<circle cx="' + f1(ux + 5) + '" cy="' + f1(uy - 4) + '" r="5" fill="' + token('--bg') + '" stroke="' + token('--muted') + '" stroke-width="1.5"/>');
    out.push(text(c, ux + 14, uy, 'Effort up front, then low', '--fg'));

    mount(el, w, uy + 8, 'Grid of the thirteen strategies by risk and effort. ' + STRATEGIES.map(function (s) {
      return s.num + ' ' + s.name + ': risk ' + s.risk + ', effort ' + s.effort;
    }).join('. ') + '.', out);
  }

  // ---- Fig. 4.3: the shape of a loss ----

  function drawLossShape(el) {
    var N = 500, COLS = 25;
    var c = context(el), token = c.token, w = c.width, wide = w >= 560, out = [];
    var pw = wide ? (w - 32) / 2 : w, cell = Math.min(10, (pw - 4) / COLS), gh = cell * (N / COLS);

    function caption(x, y, lines) { out.push(text(c, x, y, lines, '--fg')); }
    // Left: an equal-weight fund of 500; one holding fails.
    out.push(text(c, 0, 14, 'A fund of ' + N + ' equal holdings', '--fg', 'font-weight="700"'));
    for (var i = 0; i < N; i++) {
      var x = (i % COLS) * cell, y = 26 + Math.floor(i / COLS) * cell, bad = i === 137;
      out.push('<rect x="' + f1(x + 0.6) + '" y="' + f1(y + 0.6) + '" width="' + f1(cell - 1.2) + '" height="' + f1(cell - 1.2) + '" fill="' +
        (bad ? 'none' : token('--fg')) + '"' + (bad ? ' stroke="' + token('--accent') + '" stroke-width="1.5"' : '') + '/>');
    }
    caption(0, 26 + gh + 20, ['One company fails:', '&minus;' + f1(concentrationHit(N) * 100) + '% of the fund']);

    // Right: one same-day option.
    var ox = wide ? pw + 32 : 0, oy = wide ? 0 : 26 + gh + 64, side = Math.min(gh, 120);
    out.push(text(c, ox, oy + 14, 'One same-day option', '--fg', 'font-weight="700"'));
    out.push('<rect x="' + f1(ox + 1) + '" y="' + (oy + 27) + '" width="' + f1(side) + '" height="' + f1(side) + '" fill="none" stroke="' +
      token('--accent') + '" stroke-width="3"/>');
    out.push('<rect x="' + f1(ox + 1) + '" y="' + f1(oy + 27 + side - 4) + '" width="' + f1(side) + '" height="4" fill="' + token('--accent') + '"/>');
    caption(ox, oy + 27 + side + 20, ['It is the whole position:', 'it can lose nearly all of it,', 'within minutes']);

    mount(el, w, wide ? 26 + gh + 44 : oy + 27 + side + 54, 'Two panels. Left: a fund of 500 equal holdings; one fails and the fund ' +
      'loses 0.2%. Right: a single same-day option is the whole position and can lose nearly all of its value within minutes.', out);
  }

  // ---- Fig. 4.4: effort over time (a sketch of the text's claim, no data) ----

  function drawEffortShapes(el) {
    var SERIES = [
      { name: ['Day Trading,', '0DTE'], f: function (t) { return 0.62 * t; }, token: '--accent', width: 3 },
      { name: ['Value,', 'Systematic'], f: function (t) { return Math.min(t, 1) * 5 + Math.max(0, t - 1) * 0.12; }, token: '--accent-2', width: 2 },
      { name: ['Index Core'], f: function (t) { return Math.min(t, 0.3) * 1.5 + Math.max(0, t - 0.3) * 0.04; }, token: '--fg', width: 2 }
    ];
    var T = 12, Y_MAX = 8;
    var c = context(el), token = c.token, w = c.width;
    var h = Math.round(clamp(w * 0.5, 240, 340));
    var m = { top: 24, right: 92, bottom: 28, left: 12 };
    var x = function (t) { return m.left + (t / T) * (w - m.left - m.right); };
    var y = function (v) { return h - m.bottom - (v / Y_MAX) * (h - m.top - m.bottom); };
    var out = [];

    out.push('<line x1="' + m.left + '" x2="' + f1(w - m.right) + '" y1="' + f1(y(0)) + '" y2="' + f1(y(0)) + '" stroke="' + token('--fg') + '" stroke-width="2"/>');
    out.push('<line x1="' + m.left + '" x2="' + m.left + '" y1="' + m.top + '" y2="' + f1(y(0)) + '" stroke="' + token('--fg') + '" stroke-width="2"/>');
    out.push(text(c, m.left + 8, m.top - 8, 'Total effort spent', '--fg', 'font-weight="700"'));
    out.push(text(c, w - m.right, h - 8, 'Time &rarr;', '--fg', 'text-anchor="end" font-weight="700"'));
    out.push(text(c, m.left, h - 8, 'Start', '--muted'));

    var ends = SERIES.map(function (s) { return y(s.f(T)) - 3; }), labelY = spread(ends, 32);
    SERIES.forEach(function (s, k) {
      var pts = [];
      for (var t = 0; t <= T + 1e-9; t += 0.1) pts.push(f1(x(t)) + ',' + f1(y(s.f(t))));
      out.push(polyline(pts, token(s.token), s.width));
      out.push(text(c, x(T) + 10, labelY[k], s.name, '--fg', 'font-weight="700"'));
    });

    mount(el, w, h, 'Sketch with no units: total effort over time. Day Trading and 0DTE climb steadily, every day. ' +
      'Value and Systematic jump at the start, then flatten. Index Core takes a little at setup and almost nothing after.', out);
  }

  // ---- Fig. 4.5: how the strategies group ----

  function drawGroups(el) {
    var GROUPS = [
      ['Passive core', [1, 2, 3], 'Ch. 6'], ['Patient active', [4], 'Ch. 7'], ['Active satellite', [5, 9], 'Ch. 7'],
      ['Options, seller&rsquo;s side', [6, 7], 'Ch. 8'], ['Insurance', [8], 'Ch. 6'], ['Casino floor', [10, 11, 12], 'Ch. 9'],
      ['Systematic', [13], 'Ch. 15']
    ];
    var c = context(el), token = c.token, w = c.width, ROW = 34, R = 10, out = [];

    GROUPS.forEach(function (g, i) {
      var y = i * ROW + ROW / 2;
      out.push('<line x1="0" x2="' + w + '" y1="' + f1(i * ROW + ROW) + '" y2="' + f1(i * ROW + ROW) + '" stroke="' + token('--muted') +
        '" stroke-width="0.5"/>');
      g[1].forEach(function (n, k) { out.push(chip(c, 12 + k * 24, y, n, R)); });
      out.push(text(c, 84, y + 4, g[0], '--fg', 'font-weight="700"'));
      if (g[2]) out.push(text(c, w - 2, y + 4, g[2], '--muted', 'text-anchor="end"'));
    });

    mount(el, w, GROUPS.length * ROW + 2, 'The seven groups: ' + GROUPS.map(function (g) {
      return g[0].replace('&rsquo;', "'") + ', strategies ' + g[1].join(', ') + (g[2] ? ', ' + g[2].replace('Ch.', 'Chapter') : '');
    }).join('. ') + '.', out);
  }

  // ---- Fig. 4.6: one attention budget, split ----

  function drawAttention(el) {
    var COUNTS = [1, 2, 3, 5, 8, 13];
    var c = context(el), token = c.token, w = c.width;
    var m = { top: 8, right: 52, left: 104 }, ROW = 30, BAR = 16;
    var len = function (v) { return v * (w - m.left - m.right); }, out = [];

    COUNTS.forEach(function (n, i) {
      var top = m.top + i * ROW + (ROW - BAR) / 2, share = attentionShare(n);
      out.push(text(c, m.left - 10, top + BAR - 3, n + (n === 1 ? ' strategy' : ' strategies'), '--fg', 'text-anchor="end"' + (n === 13 ? ' font-weight="700"' : '')));
      out.push('<rect x="' + m.left + '" y="' + f1(top) + '" width="' + f1(len(1)) + '" height="' + BAR + '" fill="' + token('--muted') + '" fill-opacity="0.12"/>');
      out.push('<rect x="' + m.left + '" y="' + f1(top) + '" width="' + f1(Math.max(2, len(share))) + '" height="' + BAR + '" fill="' +
        token(n === 13 ? '--accent' : '--fg') + '"/>');
      out.push(text(c, m.left + len(share) + 6, top + BAR - 3, Math.round(share * 100) + '%', '--fg', 'font-weight="700"'));
    });
    out.push('<line x1="' + m.left + '" x2="' + m.left + '" y1="' + (m.top - 4) + '" y2="' + (m.top + COUNTS.length * ROW + 4) + '" stroke="' +
      token('--fg') + '" stroke-width="2"/>');

    mount(el, w, m.top + COUNTS.length * ROW + 8, 'Bar chart: the attention each strategy gets when one budget is split evenly. ' +
      COUNTS.map(function (n) { return n + ': ' + Math.round(attentionShare(n) * 100) + '%'; }).join(', ') + '.', out);
  }

  // ---- Registry and wiring ----

  var CHARTS = {
    compound: drawCompound, breakeven: drawBreakeven,
    fees: drawFees, pie: drawPie, 'dividend-loop': drawDividendLoop, 'dividend-income': drawDividendIncome,
    drift: drawDrift, 'core-default': drawCoreDefault,
    hedge: drawHedge,
    'tool-order': drawToolOrder, dimensions: drawDimensions, portable: drawPortable, 'fit-columns': drawFitColumns,
    'day-ring': drawDayRing, checklist: drawChecklist, 'journal-entry': drawJournalEntry, 'journal-math': drawJournalMath,
    watched: drawWatched,
    'calm-check': drawCalmCheck, traps: drawTraps, revenge: drawRevenge, restraint: drawRestraint, adherence: drawAdherence,
    'exit-plan': drawExitPlan, ratchet: drawRatchet, 'sized-trades': drawSizedTrades, 'tug-of-war': drawTugOfWar,
    streaks: drawStreaks,
    'holding-periods': drawHoldingPeriods, 'long-call': drawLongCall, 'tuition-months': drawTuitionMonths, 'paper-gate': drawPaperGate,
    'trade-cap': drawTradeCap,
    'option-roles': drawOptionRoles, 'covered-call': drawCoveredCall, 'short-put': drawShortPut, wheel: drawWheel,
    covered: drawCovered,
    'attention-month': drawAttentionMonth, setups: drawSetups, 'momentum-funnel': drawMomentumFunnel,
    'trade-plan': drawTradePlan, 'running-expectancy': drawRunningExpectancy,
    ladder: drawLadder, promotion: drawPromotion, 'time-decay': drawTimeDecay, tuition: drawTuition, neglect: drawNeglect,
    tags: drawTags, 'menu-grid': drawMenuGrid, 'loss-shape': drawLossShape, 'effort-shapes': drawEffortShapes,
    groups: drawGroups, attention: drawAttention,
    'edge-chain': drawEdgeChain, 'cost-waterfall': drawCostWaterfall, memory: drawMemory,
    'expectancy-map': drawExpectancyMap, 'edge-loop': drawEdgeLoop,
    'round-trip': drawRoundTrip, 'breakeven-curve': drawBreakevenCurve, survivors: drawSurvivors, habits: drawHabits,
    questions: drawQuestions,
    recovery: drawRecovery, buckets: drawBuckets, cushion: drawCushion, 'satellite-cap': drawSatelliteCap
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      grow: grow, breakeven: breakeven, futureValue: futureValue, drift: drift,
      mostUnderweight: mostUnderweight, dividendIncome: dividendIncome, pie: PIE,
      hedgedValue: hedgedValue, builtForCounts: builtForCounts, rMultiple: rMultiple, journalRows: JOURNAL_ROWS, sizedPath: sizedPath, adherence: adherence, streakLeft: streakLeft, sizedTrades: SIZED, longCallPL: longCallPL, tuitionPath: tuitionPath, coveredCallPL: coveredCallPL, shortPutPL: shortPutPL, wheel: WHEEL, rewardRisk: rewardRisk, positionSize: positionSize, runningAverage: runningAverage, traderA: TRADER_A, timeValueLeft: timeValueLeft, promoted: promoted,
      strategies: STRATEGIES, attentionShare: attentionShare, concentrationHit: concentrationHit,
      expectancy: expectancy, breakevenPayoff: breakevenPayoff, netAfterCosts: netAfterCosts, traderB: TRADER_B,
      roundTrip: roundTrip, lossPath: lossPath,
      recoveryYears: recoveryYears, forcedSale: forcedSale, portfolioHit: portfolioHit, charts: Object.keys(CHARTS)
    };
  }
  if (typeof document === 'undefined') return;

  function drawAll() {
    var nodes = document.querySelectorAll('[data-chart]');
    for (var i = 0; i < nodes.length; i++) {
      var draw = CHARTS[nodes[i].getAttribute('data-chart')];
      if (draw) draw(nodes[i]);
    }
  }

  var timer;
  window.addEventListener('resize', function () { clearTimeout(timer); timer = setTimeout(drawAll, 120); });
  document.addEventListener('DOMContentLoaded', drawAll);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(drawAll);
})();
