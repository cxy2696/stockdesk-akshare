"""StockDesk US — standalone FastAPI app."""
from __future__ import annotations

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
    return {"ok": True, "indices": m.indices(), "gainers": m.movers(10), "losers": m.movers(10, asc=True),
            "breadth": m.breadth(), "updated": int(__import__("time").time())}


@app.get("/api/us/quotes")
def quotes(symbols: str = Query(default=",".join(m.DEFAULT_WATCH))):
    out = []
    for s in symbols.split(",")[:30]:
        q = m.quote(s)
        if q:
            out.append(q)
    return {"ok": True, "items": out}


@app.get("/api/us/klines/{symbol}")
def klines(symbol: str, limit: int = 180):
    return {"ok": True, **m.klines(symbol, limit)}


@app.get("/api/us/search")
def search(q: str):
    return {"ok": True, "items": m.search(q)}


@app.get("/")
def index():
    return FileResponse(ROOT / "static" / "index.html")
