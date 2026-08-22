/* Homepage interactions - category tabs, FAQ accordion, scroll reveal.
   Does not interfere with app.js. */
(function () {
  var tabsWrap = document.getElementById('cat-tabs');
  var grid = document.getElementById('home-tool-grid');
  if (tabsWrap && grid) {
    var cards = Array.prototype.slice.call(grid.querySelectorAll('.tool-card'));
    tabsWrap.addEventListener('click', function (e) {
      var tab = e.target.closest('.cat-tab');
      if (!tab) return;
      Array.prototype.forEach.call(tabsWrap.querySelectorAll('.cat-tab'), function (t) {
        t.classList.toggle('active', t === tab);
      });
      var cat = tab.dataset.cat;
      cards.forEach(function (c) {
        c.classList.toggle('hidden', cat !== 'all' && c.dataset.cat !== cat);
      });
    });
  }

  var browseBtn = document.getElementById('home-scroll-tools');
  if (browseBtn) {
    browseBtn.addEventListener('click', function () {
      var sec = document.getElementById('home-tools');
      if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  Array.prototype.forEach.call(document.querySelectorAll('.faq-item'), function (item) {
    var q = item.querySelector('.faq-q');
    if (!q) return;
    q.addEventListener('click', function () {
      var wasOpen = item.classList.contains('open');
      Array.prototype.forEach.call(document.querySelectorAll('.faq-item.open'), function (i) {
        i.classList.remove('open');
      });
      if (!wasOpen) item.classList.add('open');
    });
  });

  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          en.target.classList.add('visible');
          io.unobserve(en.target);
        }
      });
    }, { threshold: 0.1 });
    Array.prototype.forEach.call(document.querySelectorAll('.reveal'), function (el) {
      io.observe(el);
    });
  } else {
    Array.prototype.forEach.call(document.querySelectorAll('.reveal'), function (el) {
      el.classList.add('visible');
    });
  }
})();
