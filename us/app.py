"""StockDesk US — standalone FastAPI app."""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from fastapi import FastAPI, Query
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

import market_us as m

ROOT = Path(__file__).resolve().parent
app = FastAPI(title="StockDesk US", version="1.0.0")
app.mount("/static", StaticFiles(directory=ROOT / "static"), name="static")


@app.get("/api/us/health")
def health():
    return {"ok": True, "app": "StockDesk US", "version": "1.0.0"}


@app.get("/api/us/overview")
def overview():
    def safe(fn, default):
        try:
            return fn()
        except Exception:
            return default

    # Fetch the four panels concurrently: one slow upstream endpoint must not
    # serialize the whole dashboard behind several socket timeouts.
    with ThreadPoolExecutor(max_workers=4) as ex:
        f_indices = ex.submit(safe, m.indices, [])
        f_gainers = ex.submit(safe, lambda: m.movers(10), [])
        f_losers = ex.submit(safe, lambda: m.movers(10, asc=True), [])
        f_breadth = ex.submit(safe, m.breadth, {"up": 0, "down": 0, "flat": 0, "sample": 0, "ratio": 0})
        return {
            "ok": True,
            "indices": f_indices.result(),
            "gainers": f_gainers.result(),
            "losers": f_losers.result(),
            "breadth": f_breadth.result(),
            "updated": int(__import__("time").time()),
        }


@app.get("/api/us/quotes")
def quotes(symbols: str = Query(default=",".join(m.DEFAULT_WATCH))):
    out = []
    for s in symbols.split(",")[:30]:
        try:
            q = m.quote(s)
        except Exception:
            q = None
        if q:
            out.append(q)
    return {"ok": True, "items": out}


@app.get("/api/us/klines/{symbol}")
def klines(symbol: str, limit: int = 180):
    try:
        data = m.klines(symbol, limit)
    except Exception:
        data = {"symbol": symbol.upper(), "items": []}
    return {"ok": True, **data}


@app.get("/api/us/search")
def search(q: str):
    return {"ok": True, "items": m.search(q)}


@app.get("/")
def index():
    return FileResponse(ROOT / "static" / "index.html")
