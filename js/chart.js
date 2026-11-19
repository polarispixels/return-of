// Fig. 1: compound growth of one dollar. Pure arithmetic, no market data.
// Draws into every [data-chart="compound"] element, sized to its real width so
// labels stay readable on a phone. Colors and fonts come from the theme tokens
// of the nearest [data-style] ancestor, so the chart restyles with its theme.
(function () {
  var SERIES = [
    { rate: 0.04, token: '--muted', width: 1.5 },
    { rate: 0.07, token: '--fg', width: 2 },
    { rate: 0.10, token: '--accent', width: 3 }
  ];
  var YEARS = 30;
  var Y_MAX = 18;
  var Y_TICKS = [0, 5, 10, 15];
  var X_TICKS = [0, 10, 20, 30];

  function grow(rate, years) { return Math.pow(1 + rate, years); }

  function draw(el) {
    var css = getComputedStyle(el);
    var token = function (name) { return css.getPropertyValue(name).trim(); };
    var w = Math.max(280, el.clientWidth);
    var h = Math.round(Math.max(240, Math.min(440, w * 0.56)));
    var m = { top: 12, right: 92, bottom: 30, left: 34 };
    var x = function (yr) { return m.left + (yr / YEARS) * (w - m.left - m.right); };
    var y = function (v) { return h - m.bottom - (v / Y_MAX) * (h - m.top - m.bottom); };
    var font = 'font-family="' + token('--font-body').replace(/"/g, "'") + '" font-size="12"';
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

    el.innerHTML = '<svg viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h +
      '" role="img" aria-label="Line chart: one dollar compounding for 30 years grows to $3.24 at 4 percent, ' +
      '$7.61 at 7 percent, and $17.45 at 10 percent.">' + out.join('') + '</svg>';
  }

  function drawAll() {
    var nodes = document.querySelectorAll('[data-chart="compound"]');
    for (var i = 0; i < nodes.length; i++) draw(nodes[i]);
  }

  var timer;
  window.addEventListener('resize', function () { clearTimeout(timer); timer = setTimeout(drawAll, 120); });
  document.addEventListener('DOMContentLoaded', drawAll);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(drawAll);
})();
