# Base44 Dev Environment

## What this is
A purely static website (ePDFConverter) — HTML/CSS/JS, no build step, no backend.
All PDF/image processing runs client-side via CDN-loaded libraries
(pdf-lib, pdfjs-dist, FileSaver). No server-side code, no database.

## How it runs
Served by `nginx:alpine` via `docker-compose.base44.yml` on host port 3000.
The repo root is bind-mounted (read-only) into nginx's web root.

```bash
docker compose -f docker-compose.base44.yml up -d
```

## Gotchas
- The sandbox repo directory defaults to mode 700; nginx's worker user
  cannot read it and returns 403. Run `chmod 755 .` if that happens.
- Edits to HTML/CSS/JS are immediately live (nginx serves the bind mount);
  a browser refresh is all that's needed (or `reload_preview`).
- No external credentials are required. Third-party integrations
  (Google Analytics, AdSense, Google Translate, Google Fonts, jsdelivr/cdnjs
  libraries) are all public client-side scripts needing no keys.

## Verification
```bash
curl -sf -H "Host: external-preview.example.com" http://localhost:3000/   # homepage
curl -sf -H "Host: external-preview.example.com" http://localhost:3000/merge-pdf.html
```
