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

  // ---- Registry and wiring ----

  var CHARTS = { compound: drawCompound, breakeven: drawBreakeven };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { grow: grow, breakeven: breakeven, charts: Object.keys(CHARTS) };
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
