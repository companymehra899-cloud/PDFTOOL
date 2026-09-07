#!/usr/bin/env python3
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ORIGIN = "https://epdfconverter.com"
TODAY = date.today().isoformat()

PREFERRED_ORDER = [
    "/",
    "/compress-pdf",
    "/pdf-to-jpg",
    "/jpg-to-pdf",
    "/merge-pdf",
    "/image-compressor",
    "/image-resizer",
    "/resize-image",
    "/edit-pdf",
    "/sign-pdf",
    "/unlock-protect-pdf",
    "/organise-pdf",
    "/privacy-policy",
    "/terms",
    "/about",
    "/contact",
    "/blog",
    "/blog-compress-pdf-for-email",
    "/blog-merge-pdf-online",
    "/blog-organise-pdf-pages",
    "/blog-pdf-to-jpg",
    "/blog-jpg-to-pdf",
    "/blog-sign-pdf",
    "/blog-edit-pdf",
    "/blog-unlock-protect-pdf",
    "/blog-compress-images",
    "/blog-resize-images",
    "/blog-photo-resize-ssc-upsc",
    "/blog-best-free-pdf-tools",
]

PRIORITY = {
    "/": 1.0,
    "/image-compressor": 0.9,
    "/image-resizer": 0.9,
    "/blog": 0.7,
    "/about": 0.4,
    "/contact": 0.3,
    "/privacy-policy": 0.3,
    "/terms": 0.3,
}

CHANGEFREQ = {
    "/": "weekly",
    "/blog": "weekly",
    "/privacy-policy": "yearly",
    "/terms": "yearly",
    "/contact": "yearly",
}


def has_query_or_hash(value):
    return "?" in value or "#" in value


def html_to_path(file_path):
    name = file_path.name
    if name == "index.html":
        path = "/"
    else:
        path = "/" + file_path.stem
    if has_query_or_hash(path):
        return None
    return path


def changefreq_for(path):
    return CHANGEFREQ.get(path, "monthly")


def priority_for(path):
    if path in PRIORITY:
        return PRIORITY[path]
    if path.startswith("/blog-"):
        return 0.6
    return 0.8


def main():
    discovered = []
    seen = set()
    for html in ROOT.glob("*.html"):
        path = html_to_path(html)
        if not path or path in seen or has_query_or_hash(path):
            continue
        seen.add(path)
        discovered.append(path)

    order_index = {item: i for i, item in enumerate(PREFERRED_ORDER)}
    paths = sorted(discovered, key=lambda p: (order_index.get(p, 1000), p))

    blocks = []
    for path in paths:
        loc = ORIGIN + path
        if has_query_or_hash(loc):
            continue
        blocks.append(
            "  <url>\n"
            f"    <loc>{loc}</loc>\n"
            f"    <lastmod>{TODAY}</lastmod>\n"
            f"    <changefreq>{changefreq_for(path)}</changefreq>\n"
            f"    <priority>{priority_for(path):.1f}</priority>\n"
            "  </url>"
        )

    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n\n'
        + "\n\n".join(blocks)
        + "\n\n</urlset>\n"
    )
    out = ROOT / "sitemap.xml"
    out.write_text(xml, encoding="utf-8")
    print(f"Wrote {len(blocks)} clean URLs to {out}")


if __name__ == "__main__":
    main()
