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

  // Years to get back to even after falling by the fraction `loss`, growing at `rate` a year.
  function recoveryYears(loss, rate) { return Math.log(1 / (1 - loss)) / Math.log(1 + rate); }

  // To raise `cash` after a fall of `drop`, you sell shares that were worth this much before it.
  function forcedSale(cash, drop) { return cash / (1 - drop); }

  // Fraction of the whole portfolio lost when a slice of `share` loses the fraction `loss`.
  function portfolioHit(share, loss) { return share * loss; }

  // The example pie used across Chapter 6: one set of holdings, one set of colors.
  var PIE = {
    names: ['U.S. stocks', 'International stocks', 'Bonds'],
    target: [60, 30, 10],
    now: [67, 24, 9],
    tokens: ['--fg', '--accent', '--muted']
  };

  // ---- Shared drawing helpers ----

  function context(el) {
    var css = getComputedStyle(el);
    var token = function (name) { return css.getPropertyValue(name).trim(); };
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
      { rate: 0.04, token: '--muted', width: 1.5 },
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
  function donut(c, cx, cy, R, values, tokens) {
    var r = R * 0.58, a = -Math.PI / 2, out = [];
    var pt = function (rad, ang) { return f1(cx + rad * Math.cos(ang)) + ',' + f1(cy + rad * Math.sin(ang)); };
    values.forEach(function (v, i) {
      var b = a + (v / 100) * 2 * Math.PI, big = b - a > Math.PI ? 1 : 0;
      out.push('<path d="M' + pt(R, a) + ' A' + f1(R) + ',' + f1(R) + ' 0 ' + big + ' 1 ' + pt(R, b) + ' L' + pt(r, b) +
        ' A' + f1(r) + ',' + f1(r) + ' 0 ' + big + ' 0 ' + pt(r, a) + ' Z" fill="' + c.token(tokens[i]) +
        '" stroke="' + c.token('--bg') + '" stroke-width="2"/>');
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

    Y_TICKS.forEach(function (t) {
      out.push('<line x1="' + m.left + '" x2="' + (w - m.right) + '" y1="' + f1(y(t)) + '" y2="' + f1(y(t)) +
        '" stroke="' + token(t === 0 ? '--fg' : '--muted') + '" stroke-width="' + (t === 0 ? 2 : 0.5) + '"/>');
      out.push(text(c, m.left - 8, y(t) + 4, t === 0 ? '$0' : '$' + t / 1000 + 'k', '--muted', 'text-anchor="end"'));
    });
    X_TICKS.forEach(function (t) {
      out.push(text(c, x(t), h - 8, t === 0 ? 'Year 0' : String(t), '--muted', 'text-anchor="' + (t === 0 ? 'start' : 'middle') + '"'));
    });

    // The gap between the two fee lines.
    out.push('<polygon points="' + pts(low).concat(pts(high).reverse()).join(' ') + '" fill="' + token('--accent') +
      '" fill-opacity="0.16"/>');
    out.push('<polyline fill="none" stroke="' + token('--muted') + '" stroke-width="1.5" stroke-dasharray="4 4" points="' +
      pts(paid).join(' ') + '"/>');
    out.push('<polyline fill="none" stroke="' + token('--fg') + '" stroke-width="2" stroke-linejoin="round" points="' +
      pts(high).join(' ') + '"/>');
    out.push('<polyline fill="none" stroke="' + token('--accent') + '" stroke-width="3" stroke-linejoin="round" points="' +
      pts(low).join(' ') + '"/>');

    [{ fn: low, name: '0.03% fee', token: '--accent' }, { fn: high, name: '1.00% fee', token: '--fg' },
      { fn: paid, name: 'You put in', token: '--muted' }].forEach(function (s) {
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

    out.push(donut(c, cx1, cy, R, PIE.target, PIE.tokens));
    out.push(donut(c, cx2, cy, R, PIE.now, PIE.tokens));
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
      out.push('<rect x="' + f1(lx) + '" y="' + f1(yy - 10) + '" width="10" height="10" fill="' + token(PIE.tokens[i]) + '"/>');
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
      out.push('<circle cx="' + f1(px(a)) + '" cy="' + f1(py(a)) + '" r="' + NODE + '" fill="' + token('--accent') + '"/>');
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

    Y_TICKS.forEach(function (t) {
      out.push('<line x1="' + m.left + '" x2="' + (w - m.right) + '" y1="' + f1(y(t)) + '" y2="' + f1(y(t)) +
        '" stroke="' + token(t === 0 ? '--fg' : '--muted') + '" stroke-width="' + (t === 0 ? 2 : 0.5) + '"/>');
      out.push(text(c, m.left - 8, y(t) + 4, '$' + t, '--muted', 'text-anchor="end"'));
    });
    out.push('<rect x="' + m.left + '" y="4" width="10" height="10" fill="' + token('--muted') + '"/>');
    out.push(text(c, m.left + 16, 13, 'Taking cash', '--fg'));
    out.push('<rect x="' + (m.left + 104) + '" y="4" width="10" height="10" fill="' + token('--accent') + '"/>');
    out.push(text(c, m.left + 120, 13, 'Reinvesting', '--fg'));

    YEARS.forEach(function (yr, i) {
      var mid = m.left + group * (i + 0.5), inc = dividendIncome(START, YIELD, GROWTH, yr);
      out.push('<rect x="' + f1(mid - bar - 1) + '" y="' + f1(y(inc.cash)) + '" width="' + f1(bar) + '" height="' +
        f1(y(0) - y(inc.cash)) + '" fill="' + token('--muted') + '"/>');
      out.push('<rect x="' + f1(mid + 1) + '" y="' + f1(y(inc.reinvested)) + '" width="' + f1(bar) + '" height="' +
        f1(y(0) - y(inc.reinvested)) + '" fill="' + token('--accent') + '"/>');
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
        '" height="14" fill="' + token(PIE.tokens[i]) + '"/>');
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
        out.push('<rect x="' + f1(ox) + '" y="' + satY + '" width="' + f1(satW) + '" height="' + satH + '" fill="' + token('--accent') + '"/>');
        out.push(text(c, ox + satW / 2, satY + satH / 2 + 4, 'Satellite', '--bg', 'text-anchor="middle" font-weight="700"'));
        out.push(text(c, ox + satW + 12, satY + 18, ['Active work.', 'Needs the routine.'], '--fg'));
      }
      out.push('<rect x="' + f1(ox) + '" y="' + coreY + '" width="' + f1(pw) + '" height="' + coreH + '" fill="' + token('--fg') + '"/>');
      if (lapsed) {
        out.push('<rect x="' + f1(ox) + '" y="' + coreY + '" width="' + f1(satW) + '" height="5" fill="' + token('--accent') + '"/>');
      }
      out.push(text(c, ox + 14, coreY + 26, 'Core', '--bg', 'font-weight="700"'));
      out.push(text(c, ox + 14, coreY + 46, ['Index funds, pies, dividends.', 'Runs without attention.'], '--bg'));
    }

    panel(0, 0, false);
    if (side) panel(pw + 32, 0, true);
    else panel(0, PH + 16, true);

    mount(el, w, side ? PH : PH * 2 + 16, 'Diagram in two panels. First, the routine runs: a small satellite of active ' +
      'work sits on top of a large automated core. Second, the routine lapses: the satellite is empty and its money ' +
      'goes back to the core. Not to scale.', out);
  }

  // ---- Chapter 2 colors: one per bucket, matching Chapter 6 (core --fg, satellite --accent) ----

  var BUCKETS = [
    { name: 'Cushion', lines: ['Emergencies and', 'near-term bills'], token: '--muted', opacity: 1 },
    { name: 'Opportunity reserve', lines: ['Cash ready for', 'a setup'], token: '--muted', opacity: 0.45 },
    { name: 'Core', lines: ['Long-term growth,', 'little attention'], token: '--fg', opacity: 1 },
    { name: 'Satellite', lines: ['Active work,', 'capped small'], token: '--accent', opacity: 1 }
  ];

  function block(c, x, y, bw, bh, b, labels) {
    var dark = b.opacity === 1;
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
    out.push('<rect x="' + f1(start + 140) + '" y="4" width="10" height="10" fill="' + token('--muted') + '" fill-opacity="0.3"/>');
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
            token(sat ? '--accent' : '--muted') + '"' + (sat ? '' : ' fill-opacity="0.3"') + '/>');
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

  // ---- Registry and wiring ----

  var CHARTS = {
    compound: drawCompound, breakeven: drawBreakeven,
    fees: drawFees, pie: drawPie, 'dividend-loop': drawDividendLoop, 'dividend-income': drawDividendIncome,
    drift: drawDrift, 'core-default': drawCoreDefault,
    recovery: drawRecovery, buckets: drawBuckets, cushion: drawCushion, 'satellite-cap': drawSatelliteCap
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      grow: grow, breakeven: breakeven, futureValue: futureValue, drift: drift,
      mostUnderweight: mostUnderweight, dividendIncome: dividendIncome, pie: PIE,
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
