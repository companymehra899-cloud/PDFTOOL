/* Homepage interactions - FAQ accordion, scroll reveal.
   Nav/menu behaviour is handled by reference.js (the current header markup). */
(function () {
  function answerOf(item) {
    return item.querySelector('.faq-a, .faq-answer');
  }

  function measureOpenHeight(el) {
    var prev = el.style.maxHeight;
    el.style.maxHeight = 'none';
    var h = el.scrollHeight;
    el.style.maxHeight = prev;
    return Math.max(h, 80);
  }

  function setOpen(item, open) {
    var a = answerOf(item);
    item.classList.toggle('open', open);
    if (item.tagName === 'DETAILS') item.open = open;
    var q = item.querySelector('.faq-q');
    if (q) q.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (!a) return;
    if (open) {
      a.style.maxHeight = measureOpenHeight(a) + 'px';
    } else {
      a.style.maxHeight = '0px';
    }
  }

  Array.prototype.forEach.call(document.querySelectorAll('.faq-item'), function (item) {
    if (item.tagName === 'DETAILS') return;
    var q = item.querySelector('.faq-q');
    if (!q) return;
    q.setAttribute('aria-expanded', item.classList.contains('open') ? 'true' : 'false');
    q.addEventListener('click', function (e) {
      e.preventDefault();
      var wasOpen = item.classList.contains('open');
      var root = item.closest('.faq-list, .faq') || document;
      Array.prototype.forEach.call(root.querySelectorAll('.faq-item.open'), function (i) {
        if (i !== item && i.tagName !== 'DETAILS') setOpen(i, false);
      });
      setOpen(item, !wasOpen);
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
