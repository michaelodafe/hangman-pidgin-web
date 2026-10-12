"""DEV ONLY: serve public/ on http://localhost:8765.
   /            the game as shipped (not framed, so it plays as a guest)
   /?mock=1     the game with dev/mock-vatar.js instead of the real SDK (fake player, leaderboard, purchases)
   /frame.html  the game inside a 375x812 phone frame, like Lagos Life's game player (add ?mock=1 too)
"""
import http.server
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"
SDK = '<script src="https://lagoslife.app/sdk/vatar-games-v1.js"></script>'
FRAME = """<!doctype html><meta charset=utf-8><title>Phone frame</title>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#ddd;font:14px system-ui">
<div><div style="width:375px;height:56px;background:#111;color:#fff;display:flex;align-items:center;padding:0 14px;box-sizing:border-box;border-radius:28px 28px 0 0">◀ Games · Hangman Pidgin</div>
<iframe id=g src="/{q}" style="width:375px;height:756px;border:0;display:block;border-radius:0 0 28px 28px"></iframe></div>"""


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=str(PUBLIC), **k)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_text(self, text, ctype="text/html; charset=utf-8"):
        data = text.encode()
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        path, _, query = self.path.partition("?")
        if path == "/frame.html":
            return self.send_text(FRAME.format(q="?" + query if query else ""))
        if path == "/shot.html":  # DEV: the game at exactly 375x812 in the top-left corner, for dev/shots.sh
            return self.send_text('<!doctype html><body style="margin:0;background:#000"><iframe src="/?' + query +
                                  '" style="width:375px;height:812px;border:0;display:block"></iframe>')
        if path == "/mock-vatar.js":
            return self.send_text((ROOT / "dev" / "mock-vatar.js").read_text(), "text/javascript")
        if path in ("/", "/index.html") and "mock=1" in query:
            html = (PUBLIC / "index.html").read_text().replace(SDK, '<script src="/mock-vatar.js"></script>')
            return self.send_text(html)
        return super().do_GET()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    print(f"http://localhost:{port}/frame.html?mock=1")
    http.server.ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
