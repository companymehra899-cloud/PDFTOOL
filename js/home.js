/* Homepage interactions - FAQ accordion, scroll reveal.
   Nav/menu behaviour is handled by reference.js (the current header markup). */
(function () {
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
