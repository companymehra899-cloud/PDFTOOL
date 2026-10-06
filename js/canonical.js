(function () {
  var CANONICAL_ORIGIN = "https://epdfconverter.com";
  var PAGES_BASE = "/PDFTOOL";

  function isGithubPages() {
    return /\.github\.io$/i.test(window.location.hostname || "");
  }

  function siteBase() {
    if (isGithubPages()) return PAGES_BASE;
    return "";
  }

  function cleanPath(pathname) {
    if (!pathname) return "/";
    pathname = String(pathname).split("?")[0].split("#")[0];
    var base = siteBase();
    if (base && pathname.indexOf(base) === 0) {
      pathname = pathname.slice(base.length) || "/";
    }
    pathname = pathname.replace(/\/index\.html$/i, "/");
    pathname = pathname.replace(/\.html$/i, "");
    pathname = pathname.replace(/\/{2,}/g, "/");
    if (pathname.length > 1 && pathname.charAt(pathname.length - 1) === "/") {
      pathname = pathname.slice(0, -1);
    }
    return pathname || "/";
  }

  function isErrorPath() {
    var raw = String(window.location.pathname || "");
    var path = cleanPath(raw);
    return path === "/404" || /\/404\.html$/i.test(raw);
  }

  function canonicalHref() {
    return CANONICAL_ORIGIN + cleanPath(window.location.pathname);
  }

  function upsertMeta(attr, key, value) {
    var head = document.head || document.getElementsByTagName("head")[0];
    if (!head) return;
    var selector = 'meta[' + attr + '="' + key + '"]';
    var el = head.querySelector(selector);
    if (!el) {
      el = document.createElement("meta");
      el.setAttribute(attr, key);
      head.appendChild(el);
    }
    if (el.getAttribute("content") !== value) {
      el.setAttribute("content", value);
    }
  }

  function applyCanonical() {
    var head = document.head || document.getElementsByTagName("head")[0];
    if (!head) return;

    if (isErrorPath()) {
      upsertMeta("name", "robots", "noindex, follow");
      var errLink = head.querySelector('link[rel="canonical"]');
      if (errLink && errLink.parentNode) errLink.parentNode.removeChild(errLink);
      return;
    }

    if (isGithubPages()) {
      upsertMeta("name", "robots", "noindex, follow");
    }

    var href = canonicalHref();
    var link = head.querySelector('link[rel="canonical"]');
    if (!link) {
      link = document.createElement("link");
      link.setAttribute("rel", "canonical");
      head.appendChild(link);
    }
    if (link.getAttribute("href") !== href) {
      link.setAttribute("href", href);
    }

    upsertMeta("property", "og:url", href);
  }

  function withBase(href, base) {
    if (!base || !href || href.charAt(0) !== "/") return href;
    if (href.charAt(1) === "/") return href;
    if (href.indexOf(base + "/") === 0 || href === base || href.indexOf(base + "?") === 0 || href.indexOf(base + "#") === 0) {
      return href;
    }
    return base + href;
  }

  function rewriteRootLinks() {
    var base = siteBase();
    if (!base) return;
    var nodes = document.querySelectorAll('a[href^="/"]');
    for (var i = 0; i < nodes.length; i++) {
      var href = nodes[i].getAttribute("href");
      var next = withBase(href, base);
      if (next !== href) nodes[i].setAttribute("href", next);
    }
  }

  applyCanonical();
  rewriteRootLinks();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", rewriteRootLinks);
  } else {
    rewriteRootLinks();
  }

  document.addEventListener(
    "click",
    function (e) {
      var base = siteBase();
      if (!base) return;
      var a = e.target && e.target.closest ? e.target.closest("a") : null;
      if (!a) return;
      var href = a.getAttribute("href");
      var next = withBase(href, base);
      if (next && next !== href) a.setAttribute("href", next);
    },
    true
  );

  window.addEventListener("popstate", applyCanonical);
  window.addEventListener("hashchange", applyCanonical);

  var historyProto = window.history;
  if (historyProto) {
    var pushState = historyProto.pushState;
    var replaceState = historyProto.replaceState;
    if (typeof pushState === "function") {
      historyProto.pushState = function () {
        var result = pushState.apply(this, arguments);
        applyCanonical();
        return result;
      };
    }
    if (typeof replaceState === "function") {
      historyProto.replaceState = function () {
        var result = replaceState.apply(this, arguments);
        applyCanonical();
        return result;
      };
    }
  }
})();
