/* ePDFConverter reference UI interactions */
(function () {
  var menu = document.querySelector('.menu') || document.getElementById('nav-menu');
  var links = document.querySelector('.links') || document.getElementById('site-links');
  var dropToggles = Array.prototype.slice.call(document.querySelectorAll('.drop-toggle'));
  var linksHome = links ? links.parentNode : null;
  var linksAnchor = links && links.nextSibling;

  function closeAllDrops() {
    dropToggles.forEach(function (toggle) {
      toggle.parentElement.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
    });
  }

  function syncMobileMenuTop() {
    var nav = document.querySelector('.nav');
    if (!nav || !links) return;
    var h = Math.round(nav.getBoundingClientRect().height);
    if (h < 40) return;
    document.documentElement.style.setProperty('--epdf-nav-h', h + 'px');
    links.style.top = h + 'px';
    links.style.height = 'calc(100dvh - ' + h + 'px)';
    links.style.maxHeight = 'calc(100dvh - ' + h + 'px)';
  }

  function openDrop(drop) {
    drop.classList.add('open');
    var t = drop.querySelector('.drop-toggle');
    if (t) t.setAttribute('aria-expanded', 'true');
    if (window.innerWidth <= 900 && links && drop) {
      requestAnimationFrame(function () {
        var panelTop = links.getBoundingClientRect().top;
        var itemTop = drop.getBoundingClientRect().top;
        links.scrollTop += itemTop - panelTop - 8;
      });
    }
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
    if (open) {
      if (links.parentNode !== document.body) {
        document.body.appendChild(links);
      }
      links.classList.add('open');
      menu.classList.add('open');
      menu.setAttribute('aria-expanded', 'true');
      menu.textContent = '\u2715';
      closeAllDrops();
      lockScroll(true);
      syncMobileMenuTop();
      links.scrollTop = 0;
    } else {
      links.classList.remove('open');
      menu.classList.remove('open');
      menu.setAttribute('aria-expanded', 'false');
      menu.textContent = '\u2630';
      if (linksHome && links.parentNode !== linksHome) {
        if (linksAnchor && linksAnchor.parentNode === linksHome) {
          linksHome.insertBefore(links, linksAnchor);
        } else {
          linksHome.appendChild(links);
        }
      }
      lockScroll(false);
    }
  }

  if (menu && links) {
    menu.setAttribute('aria-expanded', 'false');
    menu.setAttribute('aria-controls', links.id || 'site-links');
    menu.addEventListener('click', function (e) {
      e.preventDefault();
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
    } else if (links && links.classList.contains('open')) {
      syncMobileMenuTop();
    }
  });
  syncMobileMenuTop();

  var faqList = document.querySelector('.faq');
  if (faqList) {
    faqList.addEventListener('click', function (e) {
      var btn = e.target.closest('button');
      if (!btn || !faqList.contains(btn)) return;
      e.preventDefault();
      var item = btn.closest('.faq-item');
      if (!item) return;
      var answer = item.querySelector('.faq-answer');
      var willOpen = !item.classList.contains('open');
      Array.prototype.forEach.call(faqList.querySelectorAll('.faq-item'), function (other) {
        other.classList.remove('open');
        var otherBtn = other.querySelector('button');
        var otherAnswer = other.querySelector('.faq-answer');
        if (otherBtn) {
          otherBtn.classList.remove('open');
          otherBtn.setAttribute('aria-expanded', 'false');
        }
        if (otherAnswer) otherAnswer.style.maxHeight = '0px';
      });
      if (willOpen) {
        item.classList.add('open');
        btn.classList.add('open');
        btn.setAttribute('aria-expanded', 'true');
        if (answer) answer.style.maxHeight = answer.scrollHeight + 'px';
      }
    });
  }

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
