/* Multi-language website switcher powered by Google Translate widget.
   Languages: English, Hindi, Spanish, French, Arabic. */
(function () {
  'use strict';

  var LABELS = {
    en: 'English',
    hi: '\u0939\u093f\u0928\u094d\u0926\u0940',
    es: 'Espa\u00f1ol',
    fr: 'Fran\u00e7ais',
    ar: '\u0627\u0644\u0639\u0631\u0628\u064a\u0629'
  };
  var STORAGE_KEY = 'epdf-lang';
  var current = 'en';

  function getSavedLang() {
    try {
      var v = localStorage.getItem(STORAGE_KEY);
      return v && LABELS[v] ? v : 'en';
    } catch (e) {
      return 'en';
    }
  }

  function saveLang(lang) {
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch (e) {}
  }

  function getCombo() {
    var box = document.getElementById('google_translate_element');
    return box ? box.querySelector('.goog-te-combo') : null;
  }

  function ensureEnOption() {
    var combo = getCombo();
    if (!combo) return;
    for (var i = 0; i < combo.options.length; i++) {
      if (combo.options[i].value === 'en') return;
    }
    var opt = document.createElement('option');
    opt.value = 'en';
    opt.text = 'English';
    combo.appendChild(opt);
  }

  function setActive(lang) {
    current = LABELS[lang] ? lang : 'en';
    Array.prototype.forEach.call(document.querySelectorAll('.lang-option'), function (el) {
      el.classList.toggle('active', el.getAttribute('data-lang') === current);
    });
    var label = document.querySelector('.lang-label');
    if (label) label.textContent = LABELS[current];
    document.documentElement.setAttribute('lang', current);
  }

  function applyLang(lang) {
    var combo = getCombo();
    if (!combo) return;
    ensureEnOption();
    if (combo.value !== lang) {
      combo.value = lang;
      combo.dispatchEvent(new Event('change', { bubbles: true }));
    }
    setActive(lang);
    saveLang(lang);
  }

  function wireDropdown() {
    Array.prototype.forEach.call(document.querySelectorAll('.lang-option'), function (opt) {
      opt.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        applyLang(opt.getAttribute('data-lang'));
        Array.prototype.forEach.call(document.querySelectorAll('.lang-drop.open'), function (drop) {
          drop.classList.remove('open');
          var t = drop.querySelector('.drop-toggle');
          if (t) t.setAttribute('aria-expanded', 'false');
        });
      });
    });
  }

  function closeOpenDrops() {
    Array.prototype.forEach.call(document.querySelectorAll('.lang-drop.open'), function (drop) {
      drop.classList.remove('open');
      var t = drop.querySelector('.drop-toggle');
      if (t) t.setAttribute('aria-expanded', 'false');
    });
  }

  document.addEventListener('click', function (e) {
    if (!e.target.closest('.lang-drop')) closeOpenDrops();
  });

  window.googleTranslateElementInit = function () {
    if (typeof google === 'undefined' || !google.translate) return;
    new google.translate.TranslateElement({
      pageLanguage: 'en',
      includedLanguages: 'en,hi,es,fr,ar',
      autoDisplay: false,
      layout: google.translate.TranslateElement.InlineLayout.VERTICAL
    }, 'google_translate_element');

    wireDropdown();
    setActive(getSavedLang());

    var saved = getSavedLang();
    var tries = 0;
    var timer = window.setInterval(function () {
      if (getCombo()) {
        window.clearInterval(timer);
        if (saved !== 'en') {
          applyLang(saved);
        } else {
          ensureEnOption();
          var c = getCombo();
          if (c && c.value !== '' && c.value !== 'en') applyLang('en');
        }
      } else if (++tries > 40) {
        window.clearInterval(timer);
      }
    }, 150);
  };

  if (document.getElementById('google_translate_element')) {
    wireDropdown();
    setActive(getSavedLang());
  }
})();
