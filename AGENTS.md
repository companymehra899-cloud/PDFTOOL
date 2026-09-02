# Base44 Dev Environment

## What this project is
A pure static HTML/CSS/JS website (ePDFConverter) — browser-based PDF and image tools. No backend, no build step, no package manager. All processing happens client-side in the browser.

## How it runs here
Served by `nginx:alpine` (running as root to avoid host-dir permission issues) via `docker-compose.base44.yml`. The repo root is bind-mounted read-only into nginx's web root and exposed on host port 3000.

- Start: `docker compose -f docker-compose.base44.yml up -d`
- Health: `curl -sf http://localhost:3000/`
- No live-reload dev server (static files); edits to HTML/CSS/JS are visible on browser refresh. Call `reload_preview` when a change must force-refresh the iframe.

## Secrets
None required — fully client-side, no external services.

## Notes
- The repo root directory has restrictive permissions (0700); nginx runs as root (`user: "0:0"`) so the worker can read the bind-mounted files without depending on host dir perms.
