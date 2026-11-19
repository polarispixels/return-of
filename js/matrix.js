// Makes a fit matrix re-rank itself when its weights change.
// The table is built by tools/build.js and reads fine without this script;
// this only wires up the weight inputs and the reset button.
(function () {
  function setup(table) {
    var inputs = table.querySelectorAll('.matrix-weights input');
    var body = table.tBodies[0];
    var rows = Array.prototype.slice.call(body.rows);
    rows.forEach(function (row, i) { row.setAttribute('data-order', i); });

    function update() {
      var weights = Array.prototype.map.call(inputs, function (input) {
        var w = parseFloat(input.value);
        return isNaN(w) || w < 0 ? 0 : Math.min(w, 3);
      });
      var total = weights.reduce(function (a, b) { return a + b; }, 0);
      rows.forEach(function (row) {
        var cells = row.querySelectorAll('.matrix-score');
        var sum = 0;
        for (var i = 0; i < cells.length; i++) sum += weights[i] * Number(cells[i].getAttribute('data-score'));
        var fit = total > 0 ? sum / total : 0;
        row.setAttribute('data-fit', fit);
        row.querySelector('.matrix-fit').textContent = total > 0 ? fit.toFixed(2) : 'n/a';
      });
      // Highest fit first; ties keep the original order.
      rows.slice().sort(function (a, b) {
        return Number(b.getAttribute('data-fit')) - Number(a.getAttribute('data-fit')) ||
          Number(a.getAttribute('data-order')) - Number(b.getAttribute('data-order'));
      }).forEach(function (row) { body.appendChild(row); });
    }

    for (var i = 0; i < inputs.length; i++) inputs[i].addEventListener('input', update);
    var reset = table.querySelector('[data-matrix-reset]');
    if (reset) {
      reset.addEventListener('click', function () {
        for (var i = 0; i < inputs.length; i++) inputs[i].value = inputs[i].getAttribute('data-default');
        update();
      });
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    var tables = document.querySelectorAll('table[data-matrix]');
    for (var i = 0; i < tables.length; i++) setup(tables[i]);
  });
})();
