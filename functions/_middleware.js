const ASSET_EXT = /\.(css|js|mjs|png|jpe?g|gif|svg|ico|webp|xml|txt|json|woff2?|map|webmanifest)$/i;

const ALIASES = {
  "/image-compresser": "/image-compressor",
  "/image-resizer": "/photo-signature-resizer",
  "/blog-image-resizer": "/blog-resize-images"
};

function withSecurityHeaders(headers) {
  const next = new Headers(headers);
  if (!next.has("Strict-Transport-Security")) {
    next.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  }
  if (!next.has("X-Content-Type-Options")) {
    next.set("X-Content-Type-Options", "nosniff");
  }
  if (!next.has("X-Frame-Options")) {
    next.set("X-Frame-Options", "SAMEORIGIN");
  }
  if (!next.has("Referrer-Policy")) {
    next.set("Referrer-Policy", "strict-origin-when-cross-origin");
  }
  if (!next.has("Permissions-Policy")) {
    next.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  }
  return next;
}

async function notFound(context) {
  const res = await context.next();
  const headers = withSecurityHeaders(res.headers);
  headers.set("X-Robots-Tag", "noindex, follow");
  headers.set("Cache-Control", "no-store");
  return new Response(res.body, {
    status: 404,
    statusText: "Not Found",
    headers: headers
  });
}

export async function onRequest(context) {
  const url = new URL(context.request.url);

  if (ASSET_EXT.test(url.pathname)) {
    return context.next();
  }

  let path = url.pathname.replace(/\/{2,}/g, "/");
  let redirect = false;

  if (path !== url.pathname) {
    redirect = true;
  }

  if (path === "/404" || path === "/404.html") {
    return notFound(context);
  }

  if (/\/index\.html$/i.test(path)) {
    path = path.replace(/\/index\.html$/i, "/") || "/";
    redirect = true;
  } else if (/\.html$/i.test(path)) {
    path = path.replace(/\.html$/i, "") || "/";
    redirect = true;
  }

  if (path.length > 1 && path.endsWith("/")) {
    path = path.replace(/\/+$/, "");
    redirect = true;
  }

  const alias = ALIASES[path] || ALIASES[path.toLowerCase()];
  if (alias) {
    path = alias;
    redirect = true;
  }

  if (!path.startsWith("/")) {
    path = "/" + path;
  }

  let hash = "";
  if (url.search) {
    url.searchParams.forEach(function (value, key) {
      const k = key.toLowerCase();
      if (k === "target" && value) hash = "#" + String(value).toLowerCase();
      if (k === "kb" && value) hash = "#" + String(value).toLowerCase() + "kb";
      if (k === "mb" && value) hash = "#" + String(value).toLowerCase() + "mb";
    });
    if (hash) redirect = true;
  }

  if (!redirect) {
    const res = await context.next();
    if (res.status === 404) {
      const headers = withSecurityHeaders(res.headers);
      headers.set("X-Robots-Tag", "noindex, follow");
      headers.set("Cache-Control", "no-store");
      return new Response(res.body, {
        status: 404,
        statusText: "Not Found",
        headers: headers
      });
    }
    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers: withSecurityHeaders(res.headers)
    });
  }

  const dest = path + hash;
  return Response.redirect(new URL(dest, url.origin).href, 301);
}
