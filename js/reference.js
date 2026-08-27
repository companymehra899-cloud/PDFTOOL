/* ePDFConverter reference UI interactions */
(function () {
  var menu = document.querySelector('.menu');
  var links = document.querySelector('.links');
  var dropToggles = Array.prototype.slice.call(document.querySelectorAll('.drop-toggle'));

  function closeAllDrops() {
    dropToggles.forEach(function (toggle) {
      toggle.parentElement.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
    });
  }

  function openDrop(drop) {
    drop.classList.add('open');
    var t = drop.querySelector('.drop-toggle');
    if (t) t.setAttribute('aria-expanded', 'true');
  }

  function lockScroll(on) {
    if (!on) {
      document.body.classList.remove('nav-open');
      document.documentElement.classList.remove('nav-open');
      document.body.style.removeProperty('--nav-scrollbar');
      return;
    }
    var scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    if (scrollbarWidth > 0) {
      document.body.style.setProperty('--nav-scrollbar', scrollbarWidth + 'px');
    }
    document.body.classList.add('nav-open');
    document.documentElement.classList.add('nav-open');
    if (window.scrollY > 0) window.scrollTo(0, 0);
  }

  function setMenu(open) {
    if (!menu || !links) return;
    links.classList.toggle('open', open);
    menu.classList.toggle('open', open);
    menu.setAttribute('aria-expanded', open ? 'true' : 'false');
    menu.textContent = open ? '\u2715' : '\u2630';
    if (open) {
      closeAllDrops();
      lockScroll(true);
    } else {
      lockScroll(false);
    }
  }

  if (menu && links) {
    menu.addEventListener('click', function (e) {
      e.stopPropagation();
      setMenu(!links.classList.contains('open'));
    });
    menu.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setMenu(!links.classList.contains('open'));
      }
    });
  }

  dropToggles.forEach(function (toggle) {
    toggle.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      var drop = toggle.parentElement;
      var wasOpen = drop.classList.contains('open');
      closeAllDrops();
      if (!wasOpen) openDrop(drop);
    });
  });

  /* Hover-to-open dropdowns (desktop only). Click still works as a toggle. */
  Array.prototype.forEach.call(document.querySelectorAll('.drop'), function (drop) {
    var hoverTimer = null;
    var desktop = function () {
      return !(window.matchMedia && window.matchMedia('(hover: hover)').matches && window.innerWidth > 900);
    };
    drop.addEventListener('mouseenter', function () {
      if (desktop()) return;
      if (hoverTimer) clearTimeout(hoverTimer);
      openDrop(drop);
    });
    drop.addEventListener('mouseleave', function () {
      if (desktop()) return;
      if (hoverTimer) clearTimeout(hoverTimer);
      hoverTimer = setTimeout(closeAllDrops, 180);
    });
  });

  document.addEventListener('click', function (e) {
    if (!e.target.closest('.drop')) {
      closeAllDrops();
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      closeAllDrops();
      setMenu(false);
    }
  });

  if (links) {
    links.addEventListener('click', function (e) {
      if (window.innerWidth <= 900 && e.target.closest('a')) {
        setMenu(false);
      }
    });
  }

  window.addEventListener('resize', function () {
    if (window.innerWidth > 900) {
      closeAllDrops();
      setMenu(false);
    }
  });

  document.querySelectorAll('.faq button').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var item = btn.parentElement;
      var answer = item.querySelector('.faq-answer');
      var isOpen = btn.classList.toggle('open');
      if (answer) {
        answer.style.maxHeight = isOpen ? answer.scrollHeight + 'px' : '0px';
      }
    });
  });

  /* Theme toggle */
  var root = document.documentElement;
  var themeBtn = document.getElementById('themeToggle');
  var storedTheme = null;
  try { storedTheme = localStorage.getItem('epdf-theme'); } catch (e) {}
  var initialTheme = storedTheme || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  if (initialTheme === 'dark') root.setAttribute('data-theme', 'dark');

  function applyTheme(t) {
    if (t === 'dark') {
      root.setAttribute('data-theme', 'dark');
    } else {
      root.removeAttribute('data-theme');
    }
    try { localStorage.setItem('epdf-theme', t); } catch (e) {}
    if (themeBtn) themeBtn.setAttribute('aria-pressed', t === 'dark' ? 'true' : 'false');
  }

  if (themeBtn) {
    themeBtn.setAttribute('aria-pressed', initialTheme === 'dark' ? 'true' : 'false');
    themeBtn.addEventListener('click', function () {
      applyTheme(root.hasAttribute('data-theme') ? 'light' : 'dark');
    });
  }

  /* Sticky nav: subtle shadow once the page is scrolled */
  var navEl = document.querySelector('.nav');
  function syncNavShadow() {
    if (!navEl) return;
    navEl.classList.toggle('scrolled', window.scrollY > 6);
  }
  if (navEl) {
    window.addEventListener('scroll', syncNavShadow, { passive: true });
    window.addEventListener('resize', syncNavShadow);
    syncNavShadow();
  }
})();
