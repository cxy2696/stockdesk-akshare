"""US market data via Eastmoney public endpoints (no API key)."""
from __future__ import annotations

import json
import time
import urllib.parse
import urllib.request
from typing import Any

PUSH = "https://push2.eastmoney.com/api/qt"
HIS = "https://push2his.eastmoney.com/api/qt/stock/kline/get"
SEARCH = "https://searchapi.eastmoney.com/api/suggest/get"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124 Safari/537.36"
TTL = 30
_cache: dict[str, tuple[float, Any]] = {}

INDEXES = [
    {"symbol": "DJIA", "secid": "100.DJIA", "name": "道琼斯", "en": "Dow Jones"},
    {"symbol": "NDX", "secid": "100.NDX", "name": "纳斯达克", "en": "Nasdaq 100"},
    {"symbol": "SPX", "secid": "100.SPX", "name": "标普500", "en": "S&P 500"},
]
DEFAULT_WATCH = ["AAPL", "MSFT", "NVDA", "TSLA", "AMZN", "META", "GOOGL", "SPY"]


def _get(url: str) -> Any:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Referer": "https://quote.eastmoney.com/"})
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read().decode("utf-8", "replace"))


def _cached(key: str, loader, ttl: int = TTL):
    now = time.time()
    hit = _cache.get(key)
    if hit and now - hit[0] < ttl:
        return hit[1]
    data = loader()
    _cache[key] = (now, data)
    return data


def _scaled(raw, decimals) -> float | None:
    if raw in (None, "-", ""):
        return None
    try:
        return round(float(raw) / (10 ** int(decimals or 2)), 4)
    except Exception:
        return None


def indices() -> list[dict]:
    def load():
        out = []
        for ix in INDEXES:
            try:
                d = _get(f"{PUSH}/stock/get?secid={ix['secid']}&fields=f43,f57,f58,f59,f60,f170")
                q = d.get("data") or {}
                price = _scaled(q.get("f43"), q.get("f59", 2))
                prev = _scaled(q.get("f60"), q.get("f59", 2))
                pct = None if q.get("f170") in (None, "-") else round(float(q["f170"]) / 100, 2)
                out.append({**ix, "price": price, "prev": prev, "pct": pct})
            except Exception:
                out.append({**ix, "price": None, "prev": None, "pct": None})
        return out
    return _cached("indices", load)


def movers(limit: int = 12, asc: bool = False) -> list[dict]:
    def load():
        fs = urllib.parse.quote("m:105,m:106,m:107", safe=",:")
        url = (f"{PUSH}/clist/get?pn=1&pz={max(limit * 3, 40)}&po={'0' if asc else '1'}&np=1"
               f"&fltt=2&invt=2&fid=f3&fs={fs}&fields=f12,f14,f2,f3,f4,f5,f6,f15,f16,f17,f18")
        d = _get(url)
        rows = (d.get("data") or {}).get("diff") or []
        out = []
        for r in rows:
            try:
                price = float(r.get("f2")) if r.get("f2") not in (None, "-") else None
            except Exception:
                price = None
            if price is None or price < 0.5:
                continue
            out.append({
                "symbol": r.get("f12"), "name": r.get("f14"), "price": price,
                "pct": r.get("f3"), "change": r.get("f4"), "volume": r.get("f5"), "amount": r.get("f6"),
            })
            if len(out) >= limit:
                break
        return out
    return _cached(f"movers:{limit}:{asc}", load)


def breadth() -> dict:
    def load():
        fs = urllib.parse.quote("m:105,m:106,m:107", safe=",:")
        url = (f"{PUSH}/clist/get?pn=1&pz=1000&po=1&np=1&fltt=2&invt=2&fid=f6&fs={fs}"
               "&fields=f12,f3")
        d = _get(url)
        rows = (d.get("data") or {}).get("diff") or []
        up = sum(1 for r in rows if isinstance(r.get("f3"), (int, float)) and r["f3"] > 0)
        down = sum(1 for r in rows if isinstance(r.get("f3"), (int, float)) and r["f3"] < 0)
        flat = len(rows) - up - down
        return {"up": up, "down": down, "flat": flat, "sample": len(rows),
                "ratio": round(up / max(up + down, 1) * 100, 2)}
    return _cached("breadth", load, ttl=60)


def resolve(symbol: str) -> tuple[str, str] | None:
    symbol = symbol.strip().upper()
    if not symbol:
        return None
    for market in ("105", "106", "107"):
        secid = f"{market}.{symbol}"
        try:
            d = _get(f"{PUSH}/stock/get?secid={secid}&fields=f57,f58,f43,f59")
            if (d.get("data") or {}).get("f57"):
                return secid, symbol
        except Exception:
            continue
    return None


def quote(symbol: str) -> dict | None:
    symbol = symbol.strip().upper()

    def load():
        r = resolve(symbol)
        if not r:
            return None
        secid, sym = r
        d = _get(f"{PUSH}/stock/get?secid={secid}&fields=f43,f44,f45,f46,f47,f48,f57,f58,f59,f60,f116,f117,f162,f167,f168,f170")
        q = d.get("data") or {}
        if not q:
            return None
        dec = q.get("f59", 2)
        price = _scaled(q.get("f43"), dec)
        prev = _scaled(q.get("f60"), dec)
        pct = None if q.get("f170") in (None, "-") else round(float(q["f170"]) / 100, 2)
        chg = None if price is None or prev is None else round(price - prev, 4)
        return {
            "symbol": q.get("f57") or sym, "name": q.get("f58") or sym, "secid": secid,
            "price": price, "prev": prev, "pct": pct, "change": chg,
            "high": _scaled(q.get("f44"), dec), "low": _scaled(q.get("f45"), dec),
            "open": _scaled(q.get("f46"), dec), "volume": q.get("f47"), "amount": q.get("f48"),
            "market_cap": q.get("f116"), "float_cap": q.get("f117"),
            "pe": (None if q.get("f162") in (None, "-") or float(q["f162"]) == 0 else round(float(q["f162"]) / 100, 2)),
            "turnover": None if q.get("f168") in (None, "-") else round(float(q["f168"]) / 100, 2),
        }
    return _cached(f"quote:{symbol}", load, ttl=20)


def klines(symbol: str, limit: int = 180) -> dict:
    symbol = symbol.strip().upper()

    def load():
        r = resolve(symbol)
        if not r:
            return {"symbol": symbol, "items": []}
        secid, sym = r
        url = (f"{HIS}?secid={secid}&klt=101&fqt=1&lmt={max(10, min(limit, 500))}&end=20500101"
               "&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58")
        d = _get(url)
        data = d.get("data") or {}
        items = []
        for line in data.get("klines") or []:
            p = line.split(",")
            if len(p) < 8:
                continue
            items.append({"date": p[0], "open": float(p[1]), "close": float(p[2]),
                          "high": float(p[3]), "low": float(p[4]), "volume": float(p[5]),
                          "amount": float(p[6]), "pct": float(p[7])})
        return {"symbol": data.get("code") or sym, "name": data.get("name") or sym,
                "decimal": data.get("decimal", 3), "items": items}
    return _cached(f"kline:{symbol}:{limit}", load, ttl=120)


def search(q: str, limit: int = 12) -> list[dict]:
    q = q.strip()
    if not q:
        return []
    params = urllib.parse.urlencode({"input": q, "type": 14, "token": "D43BF722C8E33BDC906FB84D85E326E8", "count": limit})
    try:
        d = _get(f"{SEARCH}?{params}")
    except Exception:
        return []
    rows = (d.get("QuotationCodeTable") or {}).get("Data") or []
    out = []
    for r in rows:
        if r.get("Classify") != "UsStock":
            continue
        out.append({"symbol": r.get("Code"), "name": r.get("Name"), "market": r.get("JYS"),
                    "secid": r.get("QuoteID")})
    return out[:limit]
