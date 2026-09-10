#!/usr/bin/env python3
import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qsl, unquote, urlencode, urlparse

ROOT = Path(__file__).resolve().parents[1]
os.chdir(ROOT)

TRACKING_PARAMS = {
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
}


class RewriteHandler(SimpleHTTPRequestHandler):
    def canonical_location(self):
        parsed = urlparse(self.path)
        path = unquote(parsed.path) or "/"
        query = parse_qsl(parsed.query, keep_blank_values=True)
        redirect = False

        lower = path.lower()
        if lower.endswith("/index.html"):
            path = path[: -len("index.html")]
            if path != "/" and path.endswith("/"):
                path = path.rstrip("/") or "/"
            redirect = True
        elif lower.endswith(".html"):
            path = path[:-5]
            if not path:
                path = "/"
            redirect = True

        if path != "/" and path.endswith("/"):
            path = path.rstrip("/")
            redirect = True

        kept = [(k, v) for k, v in query if k.lower() not in TRACKING_PARAMS]
        if len(kept) != len(query):
            redirect = True

        if not redirect:
            return None

        dest = path
        if kept:
            dest += "?" + urlencode(kept)
        return dest

    def send_canonical_redirect(self):
        dest = self.canonical_location()
        if not dest:
            return False
        self.send_response(301)
        self.send_header("Location", dest)
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()
        return True

    def do_GET(self):
        if self.send_canonical_redirect():
            return
        super().do_GET()

    def do_HEAD(self):
        if self.send_canonical_redirect():
            return
        super().do_HEAD()

    def translate_path(self, path):
        parsed = urlparse(unquote(path))
        request_path = parsed.path or "/"

        if request_path != "/" and request_path.endswith("/"):
            request_path = request_path.rstrip("/")

        candidate = super().translate_path(request_path)
        if os.path.isdir(candidate):
            index_path = os.path.join(candidate, "index.html")
            if os.path.isfile(index_path):
                return index_path
            return candidate

        if os.path.isfile(candidate):
            return candidate

        html_path = candidate + ".html"
        if os.path.isfile(html_path):
            return html_path

        return candidate

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()


if __name__ == "__main__":
    host = "0.0.0.0"
    port = int(os.environ.get("PORT", "8000"))
    server = ThreadingHTTPServer((host, port), RewriteHandler)
    print(f"Serving {ROOT} on http://{host}:{port}", flush=True)
    server.serve_forever()
