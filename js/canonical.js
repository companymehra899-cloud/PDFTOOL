(function () {
  var CANONICAL_ORIGIN = "https://epdfconverter.com";

  function cleanPath(pathname) {
    if (!pathname) return "/";
    pathname = pathname.split("?")[0].split("#")[0];
    pathname = pathname.replace(/\/index\.html$/i, "/");
    pathname = pathname.replace(/\.html$/i, "");
    if (pathname.length > 1 && pathname.charAt(pathname.length - 1) === "/") {
      pathname = pathname.slice(0, -1);
    }
    return pathname || "/";
  }

  function canonicalHref() {
    return CANONICAL_ORIGIN + cleanPath(window.location.pathname);
  }

  function applyCanonical() {
    var href = canonicalHref();
    var head = document.head || document.getElementsByTagName("head")[0];
    if (!head) return;
    var link = head.querySelector('link[rel="canonical"]');
    if (!link) {
      link = document.createElement("link");
      link.setAttribute("rel", "canonical");
      head.appendChild(link);
    }
    if (link.getAttribute("href") !== href) {
      link.setAttribute("href", href);
    }
  }

  applyCanonical();

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
