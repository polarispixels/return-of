// The one place the version lives. Pages stamp it into any [data-version] element.
// tools/check.js fails the build if CHANGELOG.md has no entry for it.
var RETURN_OF_VERSION = '0.21.0';

document.addEventListener('DOMContentLoaded', function () {
  var nodes = document.querySelectorAll('[data-version]');
  for (var i = 0; i < nodes.length; i++) {
    nodes[i].textContent = 'v' + RETURN_OF_VERSION;
  }
});
