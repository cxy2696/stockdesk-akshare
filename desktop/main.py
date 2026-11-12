#!/usr/bin/env python3
"""StockDesk desktop launcher: local API server + native window."""
from __future__ import annotations

import argparse
import base64
import json
import os
import socket
import subprocess
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


_SHARE_PICKERS = []


class ShareApi:
    """Small pywebview API for reliable native image sharing."""

    def _save(self, data_url: str) -> str:
        raw = data_url.split(",", 1)[-1]
        data = base64.b64decode(raw)
        out = Path.home() / "Downloads"
        if not out.exists():
            out = Path.home()
        out.mkdir(parents=True, exist_ok=True)
        path = out / f"StockDesk-{time.strftime('%Y%m%d-%H%M%S')}.png"
        path.write_bytes(data)
        return str(path)

    def share_image(self, data_url: str) -> dict:
        path = self._save(data_url)
        try:
            if sys.platform == "darwin":
                from AppKit import NSApplication, NSMakeRect, NSSharingServicePicker, NSURL
                from PyObjCTools import AppHelper

                def show():
                    app = NSApplication.sharedApplication()
                    win = app.keyWindow() or (app.windows()[0] if app.windows() else None)
                    if not win:
                        subprocess.run(["open", path])
                        return
                    picker = NSSharingServicePicker.alloc().initWithItems_([NSURL.fileURLWithPath_(path)])
                    _SHARE_PICKERS.append(picker)
                    picker.showRelativeToRect_ofView_preferredEdge_(NSMakeRect(0, 0, 1, 1), win.contentView(), 1)

                AppHelper.callAfter(show)
            elif sys.platform == "win32":
                subprocess.Popen(["explorer", "/select,", path])
            else:
                subprocess.run(["xdg-open", path])
        except Exception:
            try:
                subprocess.run(["open" if sys.platform == "darwin" else "xdg-open", path])
            except Exception:
                pass
        return {"ok": True, "path": path}


def _log_dir() -> Path:
    """Directory that matches the documented per-platform data folder."""
    try:
        from backend.config import data_dir
        return data_dir()
    except Exception:
        base = os.environ.get("LOCALAPPDATA") or os.environ.get("TEMP") or str(Path.home())
        return Path(base) / "StockDesk"


def _setup_frozen_logging():
    """PyInstaller --noconsole has no stdout/stderr; keep a file log instead."""
    if not getattr(sys, "frozen", False):
        return
    try:
        logdir = _log_dir()
        logdir.mkdir(parents=True, exist_ok=True)
        f = open(logdir / "stockdesk.log", "a", encoding="utf-8", buffering=1)
        sys.stdout = f
        sys.stderr = f
    except Exception:
        pass


def _show_error(title: str, message: str) -> None:
    """Show a native error dialog even in a --noconsole PyInstaller build."""
    print(f"[stockdesk] {title}: {message}", file=sys.stderr)
    try:
        if sys.platform == "darwin":
            script = (
                f'display dialog {json.dumps(message)} with title {json.dumps(title)} '
                'buttons {"好"} default button 1 with icon stop'
            )
            subprocess.run(["osascript", "-e", script], timeout=90, check=False)
        elif sys.platform == "win32":
            import ctypes
            ctypes.windll.user32.MessageBoxW(0, message, title, 0x10)
    except Exception:
        pass


def main():
    _setup_frozen_logging()
    ap = argparse.ArgumentParser(description="StockDesk")
    ap.add_argument("--headless", action="store_true", help="run the API server only")
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--host", default="127.0.0.1", help="bind address (use 0.0.0.0 in containers)")
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

    # A packaged app must always carry its frontend. Without this check a
    # missing/partially-downloaded bundle showed an empty native window with no
    # explanation, which looked like "the app opened but content failed".
    if getattr(sys, "frozen", False):
        try:
            from backend.config import frontend_dist
            front = frontend_dist()
            if not (front / "index.html").exists():
                message = (
                    f"找不到前端资源：{front / 'index.html'}\n\n"
                    "请重新下载完整安装包，或查看日志：\n" + str(_log_dir() / "stockdesk.log")
                )
                if headless:
                    print("[stockdesk] " + message, file=sys.stderr)
                else:
                    _show_error("StockDesk 安装不完整", message)
                return 1
        except Exception as e:
            _show_error("StockDesk 启动失败", f"读取前端资源失败：{e}")
            return 1

    port = free_port(args.port)
    url = f"http://127.0.0.1:{port}"

    import uvicorn
    from backend.app import create

    cfg = uvicorn.Config(create(), host=args.host, port=port, log_level="warning", access_log=False)
    server = uvicorn.Server(cfg)
    t = threading.Thread(target=server.run, name="api-server", daemon=True)
    t.start()
    threading.Thread(target=warm_spot, name="warmup", daemon=True).start()

    if not wait_ready(url):
        message = (
            f"本地服务未能在 {url} 启动。\n\n"
            f"请查看日志：{_log_dir() / 'stockdesk.log'}\n"
            "可以尝试退出后重新打开；如果端口被占用，程序会自动换端口。"
        )
        if headless:
            print("[stockdesk] " + message, file=sys.stderr)
        else:
            _show_error("StockDesk 启动失败", message)
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
            js_api=ShareApi(),
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
