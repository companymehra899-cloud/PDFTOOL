(function () {
  var input = document.getElementById('tool-search');
  var form = document.getElementById('tool-search-form');
  var cards = Array.prototype.slice.call(document.querySelectorAll('.hp-card'));
  var empty = document.getElementById('tool-empty');
  if (!input || !cards.length) return;

  function filter(scroll) {
    var q = (input.value || '').trim().toLowerCase();
    var shown = 0;
    cards.forEach(function (card) {
      var hay = ((card.getAttribute('data-tools') || '') + ' ' + (card.textContent || '')).toLowerCase();
      var ok = !q || hay.indexOf(q) !== -1;
      card.classList.toggle('is-hidden', !ok);
      if (ok) shown += 1;
    });
    if (empty) {
      var none = !!q && shown === 0;
      empty.hidden = !none;
      empty.classList.toggle('show', none);
    }
    if (scroll && q) {
      var tools = document.getElementById('all-tools');
      if (tools) tools.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  input.addEventListener('input', function () { filter(false); });
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      filter(true);
    });
  }

  var params = new URLSearchParams(window.location.search);
  if (params.get('q')) {
    input.value = params.get('q');
    filter(true);
  }
})();
