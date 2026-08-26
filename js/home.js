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

  var navs = document.querySelectorAll('.site-nav');
  Array.prototype.forEach.call(navs, function (nav) {
    nav.addEventListener('wheel', function (e) {
      if (nav.scrollWidth <= nav.clientWidth + 1) return;
      var dx = (e.deltaY || e.deltaX) || 0;
      if (dx === 0) return;
      var max = nav.scrollWidth - nav.clientWidth;
      var next = Math.min(Math.max(nav.scrollLeft + dx, 0), max);
      if (next === nav.scrollLeft) return;
      e.preventDefault();
      nav.scrollLeft = next;
    }, { passive: false });

    var drag = false, dragMoved = false, dragStartX = 0, dragStartY = 0, dragStartScroll = 0;
    nav.addEventListener('mousedown', function (e) {
      if (e.button !== 0 || nav.scrollWidth <= nav.clientWidth + 1) return;
      drag = true;
      dragMoved = false;
      dragStartX = e.pageX;
      dragStartY = e.pageY;
      dragStartScroll = nav.scrollLeft;
    });
    document.addEventListener('mousemove', function (e) {
      if (!drag) return;
      var dx = e.pageX - dragStartX;
      var dy = e.pageY - dragStartY;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) dragMoved = true;
      if (Math.abs(dx) > Math.abs(dy)) {
        var max = nav.scrollWidth - nav.clientWidth;
        nav.scrollLeft = Math.min(Math.max(dragStartScroll - dx, 0), max);
        e.preventDefault();
      }
    }, { passive: false });
    document.addEventListener('mouseup', function () {
      drag = false;
    });
    nav.addEventListener('click', function (e) {
      if (dragMoved) {
        e.preventDefault();
        e.stopPropagation();
        dragMoved = false;
      }
    }, true);
  });

  var navToggle = document.getElementById('nav-toggle');
  if (navToggle) {
    var siteHeader = document.querySelector('.site-header');
    var siteNav = document.getElementById('site-nav');
    var bodyEl = document.body;

    function setMenu(open) {
      siteHeader.classList.toggle('nav-open', open);
      navToggle.setAttribute('aria-expanded', String(open));
      if (open) {
        bodyEl.style.overflow = 'hidden';
      } else {
        bodyEl.style.overflow = '';
      }
    }

    navToggle.addEventListener('click', function () {
      setMenu(!siteHeader.classList.contains('nav-open'));
    });
    if (siteNav) {
      siteNav.addEventListener('click', function (e) {
        if (e.target.closest('.nav-dropdown-link')) {
          setMenu(false);
        }
        if (e.target.closest('.nav-link') && !e.target.closest('.nav-dropdown-toggle')) {
          setMenu(false);
        }
      });
    }
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && siteHeader.classList.contains('nav-open')) {
        setMenu(false);
      }
    });
    window.addEventListener('resize', function () {
      if (window.innerWidth > 767 && siteHeader.classList.contains('nav-open')) {
        setMenu(false);
      }
    });
  }

  /* ---------- Tools dropdown ---------- */
  var ddWraps = document.querySelectorAll('.nav-dropdown');
  var menuTarget = null;

  function positionMenu(wrap) {
    var menu = wrap.querySelector('.nav-dropdown-menu');
    var toggle = wrap.querySelector('.nav-dropdown-toggle');
    if (!menu || !toggle) return;
    var r = toggle.getBoundingClientRect();
    var mw = menu.offsetWidth || 520;
    var left = r.left;
    if (left + mw > window.innerWidth - 12) {
      left = Math.max(12, window.innerWidth - mw - 12);
    }
    menu.style.left = left + 'px';
    menu.style.top = (r.bottom + 8) + 'px';
  }

  function openDD(wrap) {
    positionMenu(wrap);
    wrap.classList.add('open');
    var t = wrap.querySelector('.nav-dropdown-toggle');
    if (t) t.setAttribute('aria-expanded', 'true');
    menuTarget = wrap;
  }

  function closeAllDD() {
    Array.prototype.forEach.call(document.querySelectorAll('.nav-dropdown.open'), function (w) {
      w.classList.remove('open');
      var t = w.querySelector('.nav-dropdown-toggle');
      if (t) t.setAttribute('aria-expanded', 'false');
    });
    menuTarget = null;
  }

  Array.prototype.forEach.call(ddWraps, function (wrap) {
    var toggle = wrap.querySelector('.nav-dropdown-toggle');
    if (!toggle) return;
    toggle.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      var wasOpen = wrap.classList.contains('open');
      closeAllDD();
      if (!wasOpen) openDD(wrap);
    });

    if (window.matchMedia && window.matchMedia('(hover: hover)').matches) {
      var hoverTimer = null;
      wrap.addEventListener('mouseenter', function () {
        if (window.innerWidth <= 767) return;
        if (hoverTimer) clearTimeout(hoverTimer);
        openDD(wrap);
      });
      wrap.addEventListener('mouseleave', function () {
        if (window.innerWidth <= 767) return;
        hoverTimer = setTimeout(closeAllDD, 150);
      });
      wrap.addEventListener('mouseenter', function () { if (hoverTimer) clearTimeout(hoverTimer); });
    }
  });

  document.addEventListener('click', function (e) {
    if (e.target.closest('.nav-dropdown')) return;
    closeAllDD();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      closeAllDD();
    }
  });
  window.addEventListener('resize', function () {
    if (menuTarget && window.innerWidth > 767) positionMenu(menuTarget);
  });
})();
