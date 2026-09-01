(function () {
  var input = document.getElementById('tool-search');
  var form = document.getElementById('tool-search-form');
  var cards = Array.prototype.slice.call(document.querySelectorAll('.hp-card[data-tools]'));
  var empty = document.getElementById('tool-empty');
  if (!input || !cards.length) return;

  function filter() {
    var q = (input.value || '').trim().toLowerCase();
    var shown = 0;
    cards.forEach(function (card) {
      var hay = ((card.getAttribute('data-tools') || '') + ' ' + (card.textContent || '')).toLowerCase();
      var ok = !q || hay.indexOf(q) !== -1;
      card.classList.toggle('is-hidden', !ok);
      if (ok) shown += 1;
    });
    if (empty) empty.classList.toggle('show', !!q && shown === 0);
  }

  input.addEventListener('input', filter);
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      filter();
      var tools = document.getElementById('tools');
      if (tools) tools.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  var params = new URLSearchParams(window.location.search);
  if (params.get('q')) {
    input.value = params.get('q');
    filter();
  }
})();
