#!/usr/bin/env python3
"""End-to-end API smoke test for a running StockDesk desktop server.

Covers every read-only endpoint plus the three write paths used by the UI,
and verifies that the SPA shell and its hashed entry asset are served.

Usage:
    python scripts/api_smoke.py                       # http://127.0.0.1:8765
    python scripts/api_smoke.py http://127.0.0.1:48010
    STOCKDESK_BASE=http://127.0.0.1:8765 python scripts/api_smoke.py

Exit code 0 only when every endpoint returns a healthy payload. The script is
also used by CI after starting the packaged app headlessly.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

GETS: list[tuple[str, dict | None]] = [
    ("/api/health", None),
    ("/api/ollama/config", None),
    ("/api/ollama/health", None),
    ("/api/ollama/models", None),
    ("/api/market/indices", None),
    ("/api/market/overview", None),
    ("/api/market/state", None),
    ("/api/market/spot", {"limit": 5}),
    ("/api/market/search", {"q": "茅台"}),
    ("/api/market/search", {"q": "600519"}),
    ("/api/market/quote/600519", None),
    ("/api/market/quotes", {"codes": "600519,000001"}),
    ("/api/market/kline/600519", {"limit": 30}),
    ("/api/market/stock/600519", None),
    ("/api/market/coverage", None),
    ("/api/market/news", {"limit": 3}),
    ("/api/market/industry-trends", {"limit": 3}),
    ("/api/market/industry-focus", None),
    ("/api/market/hot", None),
    ("/api/market/daily", None),
    ("/api/market/picks", {"limit": 5, "top": 3}),
    ("/api/market/patterns", None),
    ("/api/market/boards", {"limit": 5}),
    ("/api/market/heatmap", {"groups": 2, "per_group": 2}),
    ("/api/market/limitpool", {"limit": 3}),
    ("/api/market/technical/600519", None),
    ("/api/market/ranking", {"limit": 3}),
    ("/api/market/td/600519", None),
    ("/api/market/province-leaders", None),
    ("/api/market/company-map", None),
    ("/api/market/index-analysis", None),
    ("/api/market/models", None),
    ("/api/models/meta", None),
    ("/api/decision", {"scan": 30}),
    ("/api/decision/stock/600519", None),
    ("/api/watchlist", None),
    ("/api/portfolio/summary", None),
    ("/api/portfolio/trades", None),
    ("/api/portfolio/positions", None),
    ("/api/portfolio/analytics", None),
    ("/api/portfolio/account", None),
    ("/api/portfolio/advice", None),
    ("/api/screener/presets", None),
    ("/api/factors", {"limit": 10}),
    ("/api/backtest/strategies", None),
    ("/api/backtest/benchmarks", None),
    ("/api/backtest/last", None),
]

WRITES: list[tuple[str, str, dict]] = [
    ("PUT", "/api/portfolio/account", {"assets": 500000}),
    ("POST", "/api/backtest/run", {"code": "600519", "strategy": "ma_cross", "params": {}, "capital": 100000}),
    ("POST", "/api/screener", {"limit": 10}),
]


def call(base: str, path: str, payload: dict | None, method: str | None = None, timeout: float = 180.0):
    data = None
    headers = {}
    if payload is not None:
        data = json.dumps(payload).encode()
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(base + path, data=data, headers=headers, method=method or ("POST" if payload is not None else "GET"))
    started = time.time()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read()
            status = resp.status
    except urllib.error.HTTPError as exc:
        raw = exc.read()
        status = exc.code
    except Exception as exc:  # noqa: BLE001 - report any transport failure
        return 0, time.time() - started, f"{type(exc).__name__}: {exc}"
    elapsed = time.time() - started
    try:
        body = json.loads(raw)
    except Exception:
        return status, elapsed, "response is not JSON"
    if status != 200:
        return status, elapsed, str(body)[:200]
    if body.get("ok") is False:
        return status, elapsed, str(body.get("error"))[:200]
    return status, elapsed, ""


def run(base: str, quick: bool = False) -> int:
    base = base.rstrip("/")
    print(f"StockDesk API smoke: {base}\n")
    started = time.time()
    failures: list[str] = []

    def report(ok: bool, status: int, elapsed: float, label: str, note: str) -> None:
        print(f"{'PASS' if ok else 'FAIL'}  {status:3d}  {elapsed:7.2f}s  {label}  {note}".rstrip(), flush=True)
        if not ok:
            failures.append(label)

    for path, params in (GETS if not quick else GETS[:6]):
        label = path + ("?" + urllib.parse.urlencode(params) if params else "")
        status, elapsed, note = call(base, label, None)
        report(status == 200 and not note, status, elapsed, label, note)

    if not quick:
        for method, path, payload in WRITES:
            status, elapsed, note = call(base, path, payload, method=method)
            report(status == 200 and not note, status, elapsed, f"{method} {path}", note)

    # The SPA shell and its hashed entry asset must be served, not just the API.
    try:
        with urllib.request.urlopen(base + "/", timeout=30) as resp:
            html = resp.read().decode("utf-8", "replace")
        asset = re.search(r'src="(/assets/[^"]+\.js)"', html)
        if not asset:
            report(False, 200, 0.0, "/", "no entry asset")
        else:
            with urllib.request.urlopen(base + asset.group(1), timeout=60) as resp:
                size = len(resp.read())
                asset_status = resp.status
            report(asset_status == 200, asset_status, 0.0, asset.group(1), f"{size / 1024:.0f}KB")
    except Exception as exc:  # noqa: BLE001
        report(False, 0, 0.0, "/", f"{type(exc).__name__}: {exc}")

    print(f"\n{len(failures)} failure(s); total {time.time() - started:.1f}s")
    if failures:
        print("failed:", failures)
        return 1
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description="StockDesk API smoke test")
    ap.add_argument("base", nargs="?", default=os.environ.get("STOCKDESK_BASE", "http://127.0.0.1:8765"))
    ap.add_argument("--quick", action="store_true", help="only the first few endpoints (CI cache warm-up)")
    args = ap.parse_args()
    return run(args.base, args.quick)


if __name__ == "__main__":
    raise SystemExit(main())
