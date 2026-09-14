import { ORIGIN, PAGES } from "./_sitemap-data.js";

function assetPath(path) {
  if (path === "/" || path === "") {
    return "/index.html";
  }
  return path.replace(/\/+$/, "") + ".html";
}

async function assetExists(env, origin, path) {
  if (!env || !env.ASSETS) {
    return true;
  }
  try {
    const target = new URL(assetPath(path), origin).href;
    let res = await env.ASSETS.fetch(new Request(target, { method: "HEAD" }));
    if (!res.ok) {
      res = await env.ASSETS.fetch(new Request(target));
    }
    return res.ok;
  } catch (err) {
    return true;
  }
}

function renderEntry(page) {
  const lines = [
    "  <url>",
    `    <loc>${ORIGIN}${page.path}</loc>`
  ];
  if (page.lastmod) {
    lines.push(`    <lastmod>${page.lastmod}</lastmod>`);
  }
  lines.push(
    `    <changefreq>${page.changefreq}</changefreq>`,
    `    <priority>${page.priority}</priority>`,
    "  </url>"
  );
  return lines.join("\n");
}

export async function onRequest(context) {
  const { request, env } = context;
  const origin = new URL(request.url).origin;

  const active = [];
  for (const page of PAGES) {
    if (await assetExists(env, origin, page.path)) {
      active.push(page);
    }
  }

  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n\n' +
    active.map(renderEntry).join("\n\n") +
    "\n\n</urlset>\n";

  return new Response(xml, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, max-age=3600"
    }
  });
}
