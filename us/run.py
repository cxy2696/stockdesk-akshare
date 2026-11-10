from __future__ import annotations

import argparse
import threading
import time
import webbrowser

import uvicorn

from app import app


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8770)
    ap.add_argument("--no-browser", action="store_true")
    a = ap.parse_args()
    if not a.no_browser:
        threading.Thread(target=lambda: (time.sleep(1.2), webbrowser.open(f"http://127.0.0.1:{a.port}")), daemon=True).start()
    uvicorn.run(app, host="127.0.0.1", port=a.port, log_level="info")


if __name__ == "__main__":
    main()
