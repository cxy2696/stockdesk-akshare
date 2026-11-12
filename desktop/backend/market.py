"""Market data client for Eastmoney public quote endpoints.

All heavy calls are cached in SQLite (see db.cache_*). Only stdlib HTTP is used so
the app has no dependency on a browser-grade networking stack.
"""
from __future__ import annotations

import json
import re
import time
from pathlib import Path
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from typing import Any

from . import db
from .config import EM_HIS, EM_LIST, EM_QUOTE, EM_UT, INDEXES, KLINE_TTL, QUOTE_TTL, SPOT_TTL
from .net import prefer_ipv4_eastmoney

# Eastmoney TLS is reachable over IPv4 on networks where its IPv6 route is
# broken; install the preference before any request is attempted.
prefer_ipv4_eastmoney()

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"

SPOT_FIELDS = "f2,f3,f4,f5,f6,f7,f8,f9,f10,f12,f13,f14,f15,f16,f17,f18,f20,f21,f22,f23,f24,f25,f11,f62,f100"
# f62 = 主力净流入(元) on the quote API
FS_A = "m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23,m:0+t:81+s:2048"

_spot_lock = __import__("threading").Lock()


def _http_json(url: str, timeout: float = 8.0) -> dict:
    """GET JSON from Eastmoney with a short socket timeout.

    IPv4 is preferred for these hosts (see backend/net.py). No cross-request
    breaker is used: a single transient board/quote failure must not poison the
    unrelated endpoints or force a lower-quality fallback for seconds.
    """
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Referer": "https://quote.eastmoney.com/"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8", "ignore"))


def _num(v, default=None):
    if v is None or v == "-" or v == "":
        return default
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


INDEX_SECIDS = {"000300": "1.000300", "000688": "1.000688", "000016": "1.000016"}


def secid(code: str) -> str:
    code = str(code).strip()
    if code in INDEX_SECIDS:
        return INDEX_SECIDS[code]
    if code.startswith(("6", "5", "9")):
        return f"1.{code}"
    if code.startswith(("4", "8", "92")):
        return f"0.{code}"
    return f"0.{code}"


def market_of(code: str) -> str:
    code = str(code)
    if code.startswith("688"):
        return "科创板"
    if code.startswith(("60", "900")):
        return "沪市主板"
    if code.startswith(("300", "301")):
        return "创业板"
    if code.startswith(("00", "200")):
        return "深市主板"
    if code.startswith(("8", "4", "92")):
        return "北交所"
    return "其他"


def _row_from_spot(f: dict) -> dict:
    return {
        "code": str(f.get("f12") or ""),
        "name": f.get("f14") or "",
        "price": _num(f.get("f2")),
        "pct": _num(f.get("f3")),
        "chg": _num(f.get("f4")),
        "volume": _num(f.get("f5")),          # 手
        "amount": _num(f.get("f6")),          # 元
        "amplitude": _num(f.get("f7")),
        "turnover": _num(f.get("f8")),
        "pe": _num(f.get("f9")),
        "pb": _num(f.get("f23")),
        "high": _num(f.get("f15")),
        "low": _num(f.get("f16")),
        "open": _num(f.get("f17")),
        "prev_close": _num(f.get("f18")),
        "mcap": _num(f.get("f20")),
        "fcap": _num(f.get("f21")),
        "volume_ratio": _num(f.get("f10")),
        "speed": _num(f.get("f22")),
        "pct60": _num(f.get("f24")),
        "pct_ytd": _num(f.get("f25")),
        "pct5m": _num(f.get("f11")),
        "main_inflow": _num(f.get("f62")),
        "market": market_of(str(f.get("f12") or "")),
        "industry": f.get("f100") or "",
    }


def _money_cn(v) -> float | None:
    if v is None:
        return None
    text = str(v).strip().replace(",", "")
    try:
        if text.endswith("亿"):
            return float(text[:-1]) * 1e8
        if text.endswith("万"):
            return float(text[:-1]) * 1e4
        if text.endswith("元"):
            return float(text[:-1])
        return float(text)
    except Exception:
        return None


def _fund_flow() -> dict[str, dict]:
    cached = db.cache_get("fund:individual", 60)
    if cached is not None:
        return cached
    out: dict[str, dict] = {}
    try:
        url = ("https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/"
               "MoneyFlow.ssl_bkzj_ssggzj?page=1&num=6000&sort=netamount&asc=0")
        req = urllib.request.Request(url, headers={"User-Agent": UA, "Referer": "https://finance.sina.com.cn/"})
        rows = json.loads(urllib.request.urlopen(req, timeout=15).read().decode("utf-8", "ignore"))
        for r in rows:
            code = str(r.get("symbol") or "")[-6:]
            if not code.isdigit():
                continue
            out[code] = {
                "main_inflow": _num(r.get("netamount")),
                "inflow": _num(r.get("inamount")),
                "outflow": _num(r.get("outamount")),
            }
    except Exception as e:
        try:
            db.cache_set("fund:error", {"error": repr(e)[:900], "ts": time.time()})
        except Exception:
            pass
    if out:
        db.cache_set("fund:individual", out)
    return out


def _sina_industry_flow() -> list[dict]:
    try:
        url = ("https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/"
               "MoneyFlow.ssl_bkzj_bk?page=1&num=100&sort=netamount&asc=0&fenlei=0")
        req = urllib.request.Request(url, headers={"User-Agent": UA, "Referer": "https://finance.sina.com.cn/"})
        rows = json.loads(urllib.request.urlopen(req, timeout=15).read().decode("utf-8", "ignore"))
        out = []
        for r in rows:
            out.append({
                "name": r.get("name") or "",
                "pct": round((_num(r.get("avg_changeratio")) or 0) * 100, 2),
                "inflow": _num(r.get("netamount")),
                "inflow_raw": _num(r.get("inamount")),
                "outflow": _num(r.get("outamount")),
                "leader": r.get("ts_name"),
                "leader_pct": round((_num(r.get("ts_changeratio")) or 0) * 100, 2),
            })
        return out
    except Exception:
        return []


def _prefix_for(code: str) -> str:
    if code.startswith(("6", "5", "9")):
        return "sh"
    if code.startswith(("4", "8", "92")):
        return "bj"
    return "sz"


def _sina_batch(codes: list[str]) -> dict[str, dict]:
    out: dict[str, dict] = {}
    for start in range(0, len(codes), 80):
        chunk = codes[start:start + 80]
        symbols = ",".join(f"{_prefix_for(c)}{c}" for c in chunk)
        try:
            req = urllib.request.Request(
                f"https://hq.sinajs.cn/list={symbols}",
                headers={"User-Agent": UA, "Referer": "https://finance.sina.com.cn/"},
            )
            text = urllib.request.urlopen(req, timeout=10).read().decode("gbk", "ignore")
        except Exception:
            continue
        for line in text.splitlines():
            if '="' not in line:
                continue
            try:
                head, payload = line.split('="', 1)
                code = head.rsplit("_", 1)[-1][2:]
                p = payload.split('";', 1)[0].split(",")
                price, prev = _num(p[3]), _num(p[2])
                if not price or not prev:
                    continue
                out[code] = {
                    "price": price, "high": _num(p[4]), "low": _num(p[5]),
                    "open": _num(p[1]), "volume": _num(p[8]), "amount": _num(p[9]),
                    "prev_close": prev, "pct": round((price / prev - 1) * 100, 2),
                    "chg": round(price - prev, 3),
                }
            except Exception:
                continue
    return out


def _sina_market_center() -> dict[str, dict]:
    """Rich Sina spot snapshot (code, name, price, PE/PB, cap, turnover).

    The Market_Center JSON pages are small and can be fetched concurrently, so
    the fallback stays complete even when Eastmoney is unavailable. The legacy
    `ak.stock_zh_a_spot()` path was sequential, slow and carried no valuation
    fields.
    """
    UA_SINA = {"User-Agent": UA, "Referer": "https://finance.sina.com.cn/"}

    def page(n: int) -> list[dict]:
        url = ("https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/"
               f"Market_Center.getHQNodeData?page={n}&num=100&sort=amount&asc=0&node=hs_a&symbol=&_s_r_a=page")
        try:
            req = urllib.request.Request(url, headers=UA_SINA)
            with urllib.request.urlopen(req, timeout=12) as r:
                data = json.loads(r.read().decode("utf-8", "ignore"))
            return data if isinstance(data, list) else []
        except Exception:
            return []

    out: dict[str, dict] = {}
    try:
        with ThreadPoolExecutor(max_workers=8) as ex:
            for chunk in ex.map(page, range(1, 57)):
                for r in chunk:
                    code = str(r.get("code") or "")[-6:]
                    if not code.isdigit():
                        continue
                    price = _num(r.get("trade"))
                    prev = _num(r.get("settlement"))
                    if not price:
                        continue
                    mcap = _num(r.get("mktcap"))
                    fcap = _num(r.get("nmc"))
                    pct = _num(r.get("changepercent"))
                    out[code] = {
                        "name": str(r.get("name") or ""),
                        "price": price,
                        "pct": pct if pct is not None else (round((price / prev - 1) * 100, 2) if prev else None),
                        "chg": _num(r.get("pricechange")),
                        "open": _num(r.get("open")),
                        "high": _num(r.get("high")),
                        "low": _num(r.get("low")),
                        "prev_close": prev,
                        "volume": _num(r.get("volume")),
                        "amount": _num(r.get("amount")),
                        "turnover": _num(r.get("turnoverratio")),
                        "pe": _num(r.get("per")),
                        "pb": _num(r.get("pb")),
                        "mcap": round(mcap * 1e4, 2) if mcap is not None else None,
                        "fcap": round(fcap * 1e4, 2) if fcap is not None else None,
                        "volume_ratio": None,
                        "market": market_of(code),
                        "industry": "",
                    }
    except Exception:
        return {}
    return out


def _akshare_spot() -> dict:
    """Complete fallback universe with Sina quotes and Eastmoney-like fields."""
    cached = db.cache_get("spot:ak", 600)
    if cached:
        return cached
    universe = _universe_symbols()
    quotes = _sina_market_center()
    if not quotes:
        quotes = _sina_batch([code for code, _ in universe])
    flow = _fund_flow()
    rows = []
    universe_map = dict(universe)
    for code, name in universe:
        q = quotes.get(code) or {}
        f = flow.get(code) or {}
        row = {**q}
        row.update({
            "code": code,
            "name": q.get("name") or name,
            "main_inflow": f.get("main_inflow"),
            "inflow": f.get("inflow"),
            "outflow": f.get("outflow"),
            "market": market_of(code),
        })
        row.setdefault("industry", "")
        rows.append(row)
    for code, q in quotes.items():
        if code in universe_map or not q.get("price"):
            continue
        row = {**q}
        row.update({"code": code, "main_inflow": None, "inflow": None, "outflow": None,
                    "market": market_of(code)})
        row.setdefault("industry", "")
        rows.append(row)
    out = {
        "ts": time.time(),
        "date": time.strftime("%Y-%m-%d"),
        "total": len(rows),
        "rows": rows,
        "source": "sina-market-center" if quotes else "empty",
    }
    if rows:
        db.cache_set("spot:ak", out)
        db.cache_set("spot:v3", out)
    return out


def _universe_symbols() -> list[tuple[str, str]]:
    """Bundled complete A-share code/name list (all ~5,580 listings)."""
    try:
        import json as _json
        path = Path(__file__).resolve().parent / "data" / "all_symbols.json"
        data = _json.loads(path.read_text("utf-8"))
        return [(str(x["code"]).zfill(6), str(x["name"])) for x in data if x.get("code")]
    except Exception:
        return []


def fetch_spot(ttl: float = SPOT_TTL, progress=None) -> dict:
    """Full A-share snapshot: Eastmoney fields plus the complete symbol list.

    Eastmoney's paged list is fast and carries valuation/fund-flow fields, but
    pages can overlap while prices move and some Beijing listings are missing.
    We dedupe by code, then fill every bundled universe symbol from Sina so the
    table stays complete even when a page is skipped.
    """
    cached = db.cache_get("spot:v3", ttl)
    if cached and cached.get("total", 0) >= 5500:
        return cached
    base = (
        f"{EM_LIST}?po=1&np=1&fltt=2&invt=2&fid=f12&fs={urllib.parse.quote(FS_A)}"
        f"&fields={SPOT_FIELDS}"
    )
    try:
        first = _http_json(f"{base}&pn=1&pz=100")
    except Exception:
        return _akshare_spot()
    data = (first or {}).get("data") or {}
    total = int(data.get("total") or 0)
    if not total:
        return _akshare_spot()

    seen: dict[str, dict] = {}

    def take(diff) -> None:
        for f in diff:
            r = _row_from_spot(f)
            if r["code"]:
                seen[r["code"]] = r

    take(data.get("diff") or [])
    page = 1
    while len(seen) < total and page < 80:
        page += 1
        try:
            d = _http_json(f"{base}&pn={page}&pz=100")
            diff = ((d or {}).get("data") or {}).get("diff") or []
        except Exception:
            break
        if not diff:
            break
        take(diff)
        if progress:
            progress(min(99, int(len(seen) / max(total, 1) * 100)))

    if len(seen) < 1000:
        return _akshare_spot()

    universe = _universe_symbols()
    uni_map = dict(universe)
    need = [c for c, _ in universe if c not in seen or not (seen[c].get("price"))]
    quotes = _sina_batch(need) if need else {}
    flow = _fund_flow() if need else {}
    quote_keys = ("price", "high", "low", "open", "volume", "amount", "prev_close", "pct", "chg")

    for code, name in universe:
        r = seen.get(code)
        q = quotes.get(code) or {}
        if r is None:
            r = {"code": code, "name": name, "price": None, "pct": None, "chg": None,
                 "volume": None, "amount": None, "amplitude": None, "turnover": None,
                 "pe": None, "pb": None, "high": None, "low": None, "open": None,
                 "prev_close": None, "mcap": None, "fcap": None, "volume_ratio": None,
                 "speed": None, "pct60": None, "pct_ytd": None, "pct5m": None,
                 "main_inflow": None, "market": market_of(code), "industry": ""}
            seen[code] = r
        if not r.get("name"):
            r["name"] = name
        if not r.get("price") and q:
            for key in quote_keys:
                if q.get(key) is not None:
                    r[key] = q[key]
        if r.get("main_inflow") is None:
            f = flow.get(code) or {}
            r["main_inflow"] = f.get("main_inflow")
            r["inflow"] = f.get("inflow")
            r["outflow"] = f.get("outflow")

    rows = [r for r in seen.values()
            if r["code"] in uni_map or r.get("price") is not None]
    out = {
        "ts": time.time(),
        "date": time.strftime("%Y-%m-%d"),
        "total": len(rows),
        "rows": rows,
        "source": "eastmoney+universe",
    }
    if rows:
        db.cache_set("spot:v3", out)
    return out if rows else _akshare_spot()

def _sina_quote(code: str, prefix: str | None = None) -> dict | None:
    """Fallback quote when the Eastmoney push2 endpoint is rate-limited."""
    sec = secid(code)
    prefix = prefix or ("sh" if sec.startswith("1.") else "sz")
    if prefix == "auto" and code.startswith(("4", "8", "92")):
        prefix = "bj"
    symbol = f"{prefix}{code}"
    try:
        req = urllib.request.Request(
            f"https://hq.sinajs.cn/list={symbol}",
            headers={"User-Agent": UA, "Referer": "https://finance.sina.com.cn/"},
        )
        text = urllib.request.urlopen(req, timeout=8).read().decode("gbk", "ignore")
        payload = text.split('="', 1)[1].split('";', 1)[0] if '="' in text else ""
        p = payload.split(",")
        if len(p) < 10 or not p[0]:
            return None
        price = _num(p[3])
        prev = _num(p[2])
        if not price or not prev:
            return None
        high, low = _num(p[4]), _num(p[5])
        return {
            "code": code, "name": p[0], "price": price, "high": high, "low": low,
            "open": _num(p[1]), "volume": _num(p[8]), "amount": _num(p[9]),
            "prev_close": prev, "pct": round((price / prev - 1) * 100, 2),
            "chg": round(price - prev, 3), "turnover": None, "pe": None, "pb": None,
            "mcap": None, "fcap": None, "volume_ratio": None, "market": market_of(code),
            "amplitude": round((high - low) / prev * 100, 2) if high and low and prev else None,
            "ts": time.time(), "source": "sina",
        }
    except Exception:
        return None


def _suggest(keyword: str, limit: int) -> list[dict]:
    """Direct Eastmoney suggest API, used when the full spot list is unavailable."""
    try:
        q = urllib.parse.quote(keyword)
        url = ("https://searchapi.eastmoney.com/api/suggest/get?"
               f"input={q}&type=14&token=D43BF722C8E33BDC906FB84D85E326E8&count={max(5, limit)}")
        d = _http_json(url, timeout=6)
        rows = (((d or {}).get("QuotationCodeTable") or {}).get("Data") or [])
        out = []
        for r in rows:
            code = str(r.get("Code") or "")
            name = r.get("Name") or ""
            if not code or not name:
                continue
            out.append({"code": code, "name": name, "price": None, "pct": None,
                        "market": r.get("SecurityTypeName") or market_of(code),
                        "pe": None, "pb": None, "mcap": None, "quote_id": r.get("QuoteID")})
        return out[:limit]
    except Exception:
        return []


def quote(code: str) -> dict | None:
    key = f"quote:{code}"
    cached = db.cache_get(key, QUOTE_TTL)
    if cached:
        return cached
    try:
        d = _http_json(
            f"{EM_QUOTE}/stock/get?secid={secid(code)}&fltt=2&invt=2&fields=f43,f44,f45,f46,f47,f48,f57,f58,f60,f107,f116,f117,f162,f167,f168,f169,f170,f171,f50"
        )
        x = (d or {}).get("data")
        if not x:
            return _sina_quote(code)
        out = {
            "code": str(x.get("f57") or code),
            "name": x.get("f58") or "",
            "price": _num(x.get("f43")),
            "high": _num(x.get("f44")),
            "low": _num(x.get("f45")),
            "open": _num(x.get("f46")),
            "volume": _num(x.get("f47")),
            "amount": _num(x.get("f48")),
            "prev_close": _num(x.get("f60")),
            "pct": _num(x.get("f170")),
            "chg": _num(x.get("f169")),
            "pe": _num(x.get("f162")),
            "pb": _num(x.get("f167")),
            "turnover": _num(x.get("f168")),
            "volume_ratio": _num(x.get("f50")),
            "amplitude": _num(x.get("f171")),
            "mcap": _num(x.get("f116")),
            "fcap": _num(x.get("f117")),

            "ts": time.time(),
        }
        if out.get("amplitude") is None and out.get("high") and out.get("low") and out.get("prev_close"):
            out["amplitude"] = round((out["high"] - out["low"]) / out["prev_close"] * 100, 2)
        db.cache_set(key, out)
        return out
    except Exception:
        return _sina_quote(code)


def quotes(codes: list[str]) -> dict[str, dict]:
    codes = [c for c in dict.fromkeys([str(c) for c in codes]) if c]
    if not codes:
        return {}
    out: dict[str, dict] = {}
    for c in codes:
        cached = db.cache_get(f"quote:{c}", QUOTE_TTL)
        if cached:
            out[c] = cached
    needed = [c for c in codes if not out.get(c)]

    def work(c):
        return c, quote(c)

    if needed:
        with ThreadPoolExecutor(max_workers=8) as ex:
            for c, q in ex.map(work, needed):
                if q:
                    out[c] = q
    return {c: q for c, q in out.items() if q}


# ---------------------------------------------------------------- klines
_PERIOD = {"daily": 101, "weekly": 102, "monthly": 103, "60m": 60, "30m": 30, "15m": 15, "5m": 5}


def _akshare_klines(code: str, period: str, limit: int, adjust: str, secid_override: str | None = None) -> list[dict]:
    """Sina fallback via akshare when the Eastmoney kline endpoint is limited."""
    try:
        import akshare as ak
        sec = secid_override or secid(code)
        prefix = "sh" if sec.startswith("1.") else "sz"
        if code.startswith(("4", "8", "92")):
            prefix = "bj"
        symbol = f"{prefix}{code}"
        if period in ("5m", "30m", "15m", "60m"):
            df = ak.stock_zh_a_minute(symbol=symbol, period={"5m": "5", "15m": "15", "30m": "30", "60m": "60"}[period], adjust="")
            date_col = "day"
        else:
            # Sina minute endpoint with scale=240 gives one daily bar per day;
            # it works when both Eastmoney and the Sina daily token endpoint fail.
            df = ak.stock_zh_a_minute(symbol=symbol, period="240", adjust="")
            date_col = "day"
        rows = []
        prev = None
        for _, r in df.tail(max(10, limit)).iterrows():
            close = _num(r.get("close"))
            if close is None:
                continue
            pct = ((close / prev - 1) * 100) if prev else 0.0
            rows.append({
                "date": str(r.get(date_col)), "open": _num(r.get("open")), "close": close,
                "high": _num(r.get("high")), "low": _num(r.get("low")),
                "volume": _num(r.get("volume"), 0), "amount": _num(r.get("amount"), 0),
                "amplitude": None, "pct": round(pct, 2), "chg": round(close - prev, 3) if prev else 0,
                "turnover": (_num(r.get("turnover"), 0) or 0) * (100 if period == "daily" else 1),
            })
            prev = close
        return rows
    except Exception:
        return []


def klines(code: str, period: str = "daily", limit: int = 260, adjust: str = "qfq", secid_override: str | None = None) -> list[dict]:
    adjust = adjust if adjust in ("", "qfq", "hfq") else "qfq"
    fqt = {"": 0, "qfq": 1, "hfq": 2}[adjust]
    key = f"kline:{secid_override or code}:{period}:{adjust}:{limit}"
    ttl = KLINE_TTL if period in ("daily", "weekly", "monthly") else 60
    cached = db.cache_get(key, ttl)
    if cached:
        return cached
    klt = _PERIOD.get(period, 101)
    end = time.strftime("%Y%m%d")
    start = "19900101"
    url = (
        f"{EM_HIS}?secid={secid_override or secid(code)}&ut={EM_UT}"
        f"&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61"
        f"&klt={klt}&fqt={fqt}&beg={start}&end={end}&lmt={max(10, int(limit))}"
    )
    try:
        d = _http_json(url)
        kl = ((d or {}).get("data") or {}).get("klines") or []
    except Exception:
        kl = []
    rows = []
    for line in kl:
        p = line.split(",")
        if len(p) < 11:
            continue
        rows.append(
            {
                "date": p[0],
                "open": _num(p[1]),
                "close": _num(p[2]),
                "high": _num(p[3]),
                "low": _num(p[4]),
                "volume": _num(p[5]),
                "amount": _num(p[6]),
                "amplitude": _num(p[7]),
                "pct": _num(p[8]),
                "chg": _num(p[9]),
                "turnover": _num(p[10]),
            }
        )
    rows = rows[-max(10, int(limit)):]
    if not rows:
        return _akshare_klines(code, period, limit, adjust, secid_override)
    if rows and any((r["close"] or 0) < 0 for r in rows):
        # forward-adjusted history can go negative on heavily-dividend stocks;
        # fall back to unadjusted prices for display
        return klines(code, period=period, limit=limit, adjust="", secid_override=secid_override)
    if rows:
        db.cache_set(key, rows)
    return rows


def stock_name_map() -> dict[str, str]:
    spot = db.cache_get("spot:v3", 86400 * 30)
    if not spot:
        return {}
    return {r["code"]: r["name"] for r in spot.get("rows", [])}


def resolve_name(code: str) -> str:
    key = f"name:{code}"
    n = db.cache_get(key, 86400 * 30)
    if n:
        return n
    try:
        d = _http_json(f"{EM_QUOTE}/stock/get?secid={secid(code)}&fltt=2&invt=2&fields=f57,f58")
        x = (d or {}).get("data") or {}
        name = x.get("f58") or ""
        if name:
            db.cache_set(key, name)
        return name
    except Exception:
        return ""


# ---------------------------------------------------------------- indices
def index_quote(secid_: str, code: str, name: str, short: str) -> dict:
    key = f"index:{code}"
    cached = db.cache_get(key, 30)
    if cached:
        return cached
    try:
        d = _http_json(
            f"{EM_QUOTE}/stock/get?secid={secid_}&fltt=2&invt=2&fields=f43,f44,f45,f46,f47,f48,f57,f58,f60,f169,f170,f171,f47,f48"
        )
        x = (d or {}).get("data") or {}
        out = {
            "code": code,
            "name": x.get("f58") or name,
            "short": short,
            "price": _num(x.get("f43")),
            "chg": _num(x.get("f169")),
            "pct": _num(x.get("f170")),
            "high": _num(x.get("f44")),
            "low": _num(x.get("f45")),
            "open": _num(x.get("f46")),
            "prev_close": _num(x.get("f60")),
            "amount": _num(x.get("f48")),
            "ts": time.time(),
        }
        db.cache_set(key, out)
        return out
    except Exception:
        q = _sina_quote(code, "sh" if secid_.startswith("1.") else "sz")
        if q:
            out = {**q, "short": short, "name": name, "code": code}
            db.cache_set(key, out)
            return out
        return {"code": code, "name": name, "short": short, "price": None, "pct": None, "ts": time.time()}


def indices() -> list[dict]:
    def work(i):
        return index_quote(i["secid"], i["code"], i["name"], i["short"])

    with ThreadPoolExecutor(max_workers=5) as ex:
        return list(ex.map(work, INDEXES))


def market_breadth() -> dict:
    """Up/down counts and limit-up/down stats from the full snapshot."""
    spot = db.cache_get("spot:v3", 600)
    if not spot:
        return {}
    up = down = flat = limit_up = limit_down = 0
    for r in spot["rows"]:
        p = r.get("pct")
        if p is None:
            flat += 1
            continue
        if p > 0.01:
            up += 1
        elif p < -0.01:
            down += 1
        else:
            flat += 1
        if p >= 9.8:
            limit_up += 1
        if p <= -9.8:
            limit_down += 1
    return {
        "up": up,
        "down": down,
        "flat": flat,
        "limit_up": limit_up,
        "limit_down": limit_down,
        "total": spot.get("total", 0),
        "ts": spot.get("ts"),
    }


# ---------------------------------------------------------------- search
def search(keyword: str, limit: int = 20) -> list[dict]:
    kw = (keyword or "").strip().upper()
    if not kw:
        return []
    spot = db.cache_get("spot:v3", 86400)
    rows = spot.get("rows", []) if spot else []
    if not rows:
        # slow path: one page of quotes only; the spot list may be rate-limited
        try:
            rows = fetch_spot(ttl=0).get("rows", [])
        except Exception:
            rows = []
    starts, contains = [], []
    for r in rows:
        code = r["code"]
        name = (r.get("name") or "").upper()
        if code == kw or code.startswith(kw) or name.startswith(kw):
            starts.append(r)
        elif kw in code or kw in name:
            contains.append(r)
    out = (starts + contains)[:limit]
    if not out:
        return _suggest(keyword, limit)
    return [
        {
            "code": r["code"],
            "name": r.get("name"),
            "price": r.get("price"),
            "pct": r.get("pct"),
            "market": r.get("market"),
            "pe": r.get("pe"),
            "pb": r.get("pb"),
            "mcap": r.get("mcap"),
        }
        for r in out
    ]


# ---------------------------------------------------------------- rankings
def ranking(by: str = "pct", limit: int = 10) -> list[dict]:
    spot = db.cache_get("spot:v3", 600)
    rows = spot.get("rows", []) if spot else []
    key = {"pct": "pct", "turnover": "turnover", "amount": "amount", "inflow": "main_inflow"}.get(by, "pct")
    clean = [r for r in rows if r.get(key) is not None and r.get("price")]
    clean.sort(key=lambda r: r[key], reverse=True)
    return clean[:limit]


# ---------------------------------------------------------------- fundamentals
FIN_FIELDS = ",".join(
    [
        "SECURITY_CODE", "SECURITY_NAME_ABBR", "REPORT_DATE", "REPORT_DATE_NAME",
        "EPSJB", "BPS", "ROEJQ", "TOTALOPERATEREVETZ", "PARENTNETPROFITTZ",
        "XSMLL", "XSJLL", "ZCFZL", "TOTAL_OPERATE_INCOME", "PARENT_NETPROFIT",
        "MGJYXJJE", "TOTAL_SHARE", "FREE_SHARE",
    ]
)


def financials(code: str, periods: int = 8) -> list[dict]:
    """Recent quarterly main indicators (eastmoney F10 datacenter)."""
    key = f"fin:{code}"
    cached = db.cache_get(key, 3600 * 12)
    if cached is not None:
        return cached
    url = (
        "https://datacenter.eastmoney.com/securities/api/data/v1/get"
        "?reportName=RPT_F10_FINANCE_MAINFINADATA"
        "&columns=SECURITY_CODE,SECURITY_NAME_ABBR,REPORT_DATE,REPORT_DATE_NAME,EPSJB,BPS,ROEJQ,"
        "TOTALOPERATEREVETZ,PARENTNETPROFITTZ,XSMLL,XSJLL,ZCFZL"
        f"&filter=(SECURITY_CODE%3D%22{code}%22)&sortColumns=REPORT_DATE&sortTypes=-1&page=1&pageSize={periods}"
        "&source=HSF10&client=PC"
    )
    rows: list[dict] = []
    try:
        d = _http_json(url)
        res = (d or {}).get("result") or {}
        data = res.get("data") if isinstance(res, dict) else res
        for x in data or []:
            rows.append(
                {
                    "period": (x.get("REPORT_DATE_NAME") or (x.get("REPORT_DATE") or "")[:10] or "").replace(" ", ""),
                    "eps": _num(x.get("EPSJB")),
                    "bps": _num(x.get("BPS")),
                    "roe": _num(x.get("ROEJQ")),
                    "revenue_yoy": _num(x.get("TOTALOPERATEREVETZ")),
                    "profit_yoy": _num(x.get("PARENTNETPROFITTZ")),
                    "gross_margin": _num(x.get("XSMLL")),
                    "net_margin": _num(x.get("XSJLL")),
                    "debt_ratio": _num(x.get("ZCFZL")),
                    "revenue": _num(x.get("TOTAL_OPERATE_INCOME")),
                    "net_profit": _num(x.get("PARENT_NETPROFIT")),
                }
            )
    except Exception:
        pass
    db.cache_set(key, rows)
    return rows


def profile(code: str) -> dict:
    key = f"profile:{code}"
    cached = db.cache_get(key, 86400 * 7)
    if cached is not None:
        return cached
    url = (
        "https://datacenter.eastmoney.com/securities/api/data/v1/get"
        "?reportName=RPT_F10_BASIC_ORGINFO"
        "&columns=SECURITY_CODE,ORG_NAME,INDUSTRYCSRC1,REG_CAPITAL,EMP_NUM,FOUND_DATE,LISTING_DATE,"
        "ORG_PROFILE,BUSINESS_SCOPE,MAIN_BUSINESS,REG_ADDRESS,ORG_WEB,ORG_EMAIL,ORG_TEL,CHAIRMAN,SECRETARY,LEGAL_PERSON,REG_NUM"
        f"&filter=(SECURITY_CODE%3D%22{code}%22)&page=1&pageSize=1&source=HSF10&client=PC"
    )
    out: dict = {}
    try:
        d = _http_json(url)
        res = (d or {}).get("result") or {}
        data = res.get("data") if isinstance(res, dict) else res
        x = (data or [None])[0] if isinstance(data, list) else data
        if x:
            out = {
                "org_name": x.get("ORG_NAME"),
                "industry": x.get("INDUSTRYCSRC1"),
                "reg_capital": _num(x.get("REG_CAPITAL")),
                "employees": _num(x.get("EMP_NUM")),
                "found_date": (x.get("FOUND_DATE") or "")[:10],
                "listing_date": (x.get("LISTING_DATE") or "")[:10],
                "profile": x.get("ORG_PROFILE"),
                "scope": x.get("BUSINESS_SCOPE"),
                "main_business": x.get("MAIN_BUSINESS"),
                "website": x.get("ORG_WEB"),
                "email": x.get("ORG_EMAIL"),
                "phone": x.get("ORG_TEL"),
                "chairman": x.get("CHAIRMAN"),
                "secretary": x.get("SECRETARY"),
                "legal_person": x.get("LEGAL_PERSON"),
                "reg_number": x.get("REG_NUM"),
                "address": x.get("REG_ADDRESS"),
            }
    except Exception:
        pass
    db.cache_set(key, out)
    return out


def concepts(code: str) -> list[str]:
    """Industry / concept tags from Eastmoney F10 core themes."""
    key = f"concepts:{code}"
    cached = db.cache_get(key, 86400 * 7)
    if cached is not None:
        return cached
    url = (
        "https://datacenter.eastmoney.com/securities/api/data/v1/get"
        "?reportName=RPT_F10_CORETHEME_BOARDTYPE"
        "&columns=SECURITY_CODE,BOARD_NAME,IS_PRECISE"
        f"&filter=(SECURITY_CODE%3D%22{code}%22)&page=1&pageSize=60&source=HSF10&client=PC"
    )
    names: list[str] = []
    try:
        d = _http_json(url)
        res = (d or {}).get("result") or {}
        data = res.get("data") if isinstance(res, dict) else res
        for x in data or []:
            n = (x.get("BOARD_NAME") or "").strip()
            if n and n not in names:
                names.append(n)
    except Exception:
        pass
    db.cache_set(key, names)
    return names


def board_of(code: str) -> str:
    return market_of(code)
