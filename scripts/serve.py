#!/usr/bin/env python3
import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

ROOT = Path(__file__).resolve().parents[1]
os.chdir(ROOT)


class RewriteHandler(SimpleHTTPRequestHandler):
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

    def log_message(self, format, *args):
        super().log_message(format, *args)


if __name__ == "__main__":
    host = "0.0.0.0"
    port = int(os.environ.get("PORT", "8000"))
    server = ThreadingHTTPServer((host, port), RewriteHandler)
    print(f"Serving {ROOT} on http://{host}:{port}", flush=True)
    server.serve_forever()
