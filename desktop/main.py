#!/usr/bin/env python3
"""StockDesk desktop launcher: local API server + native window."""
from __future__ import annotations

import argparse
import os
import socket
import sys
import threading
import time
import urllib.request
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))


def free_port(preferred: int = 8765) -> int:
    for port in range(preferred, preferred + 40):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(("127.0.0.1", port))
                return port
            except OSError:
                continue
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def wait_ready(url: str, timeout: float = 25.0) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url + "/api/health", timeout=1.0) as r:
                if r.status == 200:
                    return True
        except Exception:
            time.sleep(0.15)
    return False


def warm_spot():
    """Pre-load the full-market snapshot in the background (first screen feels instant)."""
    time.sleep(1.2)
    try:
        from backend import db, market
        db.init()
        market.fetch_spot(ttl=0)
        print("[stockdesk] market snapshot warmed")
    except Exception as e:
        print("[stockdesk] warm-up skipped:", e)


def _setup_frozen_logging():
    """PyInstaller --noconsole has no stdout/stderr; keep a file log instead."""
    if not getattr(sys, "frozen", False):
        return
    try:
        base = os.environ.get("LOCALAPPDATA") or os.environ.get("TEMP") or str(Path.home())
        logdir = Path(base) / "StockDesk"
        logdir.mkdir(parents=True, exist_ok=True)
        f = open(logdir / "stockdesk.log", "a", encoding="utf-8", buffering=1)
        sys.stdout = f
        sys.stderr = f
    except Exception:
        pass


def main():
    _setup_frozen_logging()
    ap = argparse.ArgumentParser(description="StockDesk")
    ap.add_argument("--headless", action="store_true", help="run the API server only")
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--browser", action="store_true", help="open in the default browser instead of a native window")
    ap.add_argument("--production", action="store_true", help="use the bundled frontend build")
    ap.add_argument("--check-webview", action="store_true", help="verify native webview import and exit")
    args = ap.parse_args()
    if args.check_webview:
        try:
            import webview  # noqa: F401
            print("webview-ok")
            return 0
        except Exception as e:
            print("webview-failed:", e, file=sys.stderr)
            return 2

    headless = args.headless or os.environ.get("STOCKDESK_HEADLESS") == "1"
    port = free_port(args.port)
    url = f"http://127.0.0.1:{port}"

    import uvicorn
    from backend.app import create

    cfg = uvicorn.Config(create(), host="127.0.0.1", port=port, log_level="warning", access_log=False)
    server = uvicorn.Server(cfg)
    t = threading.Thread(target=server.run, name="api-server", daemon=True)
    t.start()
    threading.Thread(target=warm_spot, name="warmup", daemon=True).start()

    if not wait_ready(url):
        print("API server failed to start", file=sys.stderr)
        return 1
    print(f"[stockdesk] ready at {url}")

    if headless:
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            pass
        return 0

    if args.browser:
        webbrowser.open(url)
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            return 0

    try:
        import webview

        window_x = 60
        if sys.platform == "darwin":
            try:
                from AppKit import NSScreen
                primary = NSScreen.screens()[0].frame()
                current = NSScreen.mainScreen().frame()
                window_x = int(primary.origin.x - current.origin.x + 60)
            except Exception:
                pass

        webview.create_window(
            "StockDesk · 个人股票投资台",
            url,
            width=1440,
            height=860,
            x=window_x,
            y=60,
            min_size=(1100, 720),
            background_color="#0B0F17",
            text_select=True,
        )
        def _place_window():
            try:
                time.sleep(1.0)
                from PyObjCTools import AppHelper

                def do_move():
                    try:
                        from AppKit import NSApplication, NSPoint
                        for nw in NSApplication.sharedApplication().windows():
                            if "StockDesk" in str(nw.title()):
                                nw.setFrameOrigin_(NSPoint(60, 500))
                                nw.makeKeyAndOrderFront_(None)
                                break
                    except Exception as e:
                        print("move failed:", e)

                AppHelper.callAfter(do_move)
            except Exception as e:
                print("place failed:", e)

        webview.start(_place_window)
    except Exception as e:
        print("[stockdesk] native window unavailable, falling back to browser:", e)
        webbrowser.open(url)
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            pass
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
