const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "utm_id",
  "gclid",
  "gbraid",
  "wbraid",
  "fbclid",
  "msclkid",
  "ttclid",
  "ref",
  "mc_cid",
  "mc_eid",
  "_ga",
  "yclid",
  "g_fsrc",
  "gad_source",
  "gad_campaignid"
]);

const ASSET_EXT = /\.(css|js|mjs|png|jpe?g|gif|svg|ico|webp|xml|txt|json|woff2?|map|webmanifest)$/i;

const ALIASES = {
  "/image-compresser": "/image-compressor",
  "/image-resizer": "/photo-signature-resizer"
};

async function notFound(context) {
  const res = await context.next();
  const headers = new Headers(res.headers);
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

  const kept = new URLSearchParams();
  url.searchParams.forEach(function (value, key) {
    if (!TRACKING_PARAMS.has(key.toLowerCase())) {
      kept.append(key, value);
    } else {
      redirect = true;
    }
  });

  if (!redirect) {
    return context.next();
  }

  const search = kept.toString();
  const dest = path + (search ? "?" + search : "");
  return Response.redirect(new URL(dest, url.origin).href, 301);
}
