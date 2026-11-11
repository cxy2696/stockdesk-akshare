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

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"

SPOT_FIELDS = "f2,f3,f4,f5,f6,f7,f8,f9,f10,f12,f13,f14,f15,f16,f17,f18,f20,f21,f22,f23,f24,f25,f11,f62,f100"
# f62 = 主力净流入(元) on the quote API
FS_A = "m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23,m:0+t:81+s:2048"

_spot_lock = __import__("threading").Lock()


def _http_json(url: str, timeout: float = 12.0) -> dict:
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


def _akshare_spot() -> dict:
    """Full A-share universe fallback: 5,000+ listed symbols plus Sina quotes."""
    cached = db.cache_get("spot:ak", 600)
    if cached:
        return cached
    try:
        import akshare as ak
        universe = []
        try:
            import json as _json
            symbol_file = Path(__file__).resolve().parent / "data" / "all_symbols.json"
            universe = [(str(x["code"]).zfill(6), str(x["name"])) for x in _json.loads(symbol_file.read_text("utf-8"))]
        except Exception:
            try:
                names = ak.stock_info_a_code_name()
                universe = [(str(r["code"]).zfill(6), str(r["name"])) for _, r in names.iterrows()]
            except Exception:
                universe = []
        flow = _fund_flow()
        quotes = {}
        try:
            spot = ak.stock_zh_a_spot()
            for _, r in spot.iterrows():
                raw = str(r.get("代码") or "")
                code = raw[-6:]
                if not code.isdigit():
                    continue
                quotes[code] = {
                    "price": _num(r.get("最新价")), "pct": _num(r.get("涨跌幅")),
                    "chg": _num(r.get("涨跌额")), "open": _num(r.get("今开")),
                    "high": _num(r.get("最高")), "low": _num(r.get("最低")),
                    "prev_close": _num(r.get("昨收")), "volume": _num(r.get("成交量")),
                    "amount": _num(r.get("成交额")), "turnover": None,
                }
        except Exception:
            quotes = {}
        missing = [code for code, _ in universe if not (quotes.get(code) or {}).get("price")]
        if missing:
            quotes.update(_sina_batch(missing))
        rows = []
        for code, name in universe:
            q = quotes.get(code, {})
            f = flow.get(code, {})
            rows.append({"code": code, "name": name, **q, "pe": None, "pb": None,
                         "mcap": None, "fcap": None, "main_inflow": f.get("main_inflow"),
                         "inflow": f.get("inflow"), "outflow": f.get("outflow"),
                         "volume_ratio": None, "market": market_of(code)})
        if not rows:
            for code, q in quotes.items():
                if q.get("price"):
                    rows.append({"code": code, "name": "", **q, "pe": None, "pb": None,
                                 "mcap": None, "fcap": None, "main_inflow": None,
                                 "volume_ratio": None, "market": market_of(code)})
        out = {"ts": time.time(), "date": time.strftime("%Y-%m-%d"), "total": len(rows), "rows": rows, "source": "akshare-sina"}
        if rows:
            db.cache_set("spot:ak", out)
            db.cache_set("spot:v3", out)
        return out
    except Exception:
        return {"ts": time.time(), "date": time.strftime("%Y-%m-%d"), "total": 0, "rows": []}


def fetch_spot(ttl: float = SPOT_TTL, progress=None) -> dict:
    """Full A-share snapshot, including all ~5,580 listed names."""
    cached = db.cache_get("spot:v3", ttl)
    if cached and cached.get("total", 0) >= 5500:
        return cached
    # The Eastmoney clist endpoint omits some Beijing listings and is often
    # rate-limited; use the complete akshare/Sina universe as the primary list.
    return _akshare_spot()
    base = (
        f"{EM_LIST}?po=1&np=1&fltt=2&invt=2&fid=f3&fs={urllib.parse.quote(FS_A)}"
        f"&fields={SPOT_FIELDS}"
    )
    try:
        first = _http_json(f"{base}&pn=1&pz=100")
    except Exception:
        return _akshare_spot()
    data = (first or {}).get("data") or {}
    total = int(data.get("total") or 0)
    rows = [_row_from_spot(f) for f in (data.get("diff") or [])]
    page = 1
    while len(rows) < total and page < 80:
        page += 1
        try:
            d = _http_json(f"{base}&pn={page}&pz=100")
            diff = ((d or {}).get("data") or {}).get("diff") or []
            if not diff:
                break
            rows.extend(_row_from_spot(f) for f in diff)
        except Exception:
            break
        if progress:
            progress(min(99, int(len(rows) / max(total, 1) * 100)))
    out = {
        "ts": time.time(),
        "date": time.strftime("%Y-%m-%d"),
        "total": len(rows),
        "rows": [r for r in rows if r["code"]],
    }
    if out["rows"]:
        db.cache_set("spot:v3", out)
    # Eastmoney's list omits some Beijing listings; the akshare/Sina universe
    # includes all ~5,580 A-share names. Prefer the complete universe.
    if len(out["rows"]) < 5500:
        ak_rows = _akshare_spot()
        if ak_rows.get("total", 0) > len(out["rows"]):
            return ak_rows
    return out if out["rows"] else _akshare_spot()


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
        return {
            "code": code, "name": p[0], "price": price, "high": _num(p[4]), "low": _num(p[5]),
            "open": _num(p[1]), "volume": _num(p[8]), "amount": _num(p[9]),
            "prev_close": prev, "pct": round((price / prev - 1) * 100, 2),
            "chg": round(price - prev, 3), "turnover": None, "pe": None, "pb": None,
            "mcap": None, "fcap": None, "volume_ratio": None, "market": market_of(code),
            "ts": time.time(), "source": "sina",
        }
    except Exception:
        return _sina_quote(code)


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
            "mcap": _num(x.get("f116")),
            "fcap": _num(x.get("f117")),

            "ts": time.time(),
        }
        db.cache_set(key, out)
        return out
    except Exception:
        return _sina_quote(code)


def quotes(codes: list[str]) -> dict[str, dict]:
    codes = [c for c in dict.fromkeys([str(c) for c in codes]) if c]
    if not codes:
        return {}
    out: dict[str, dict] = {}
    fresh = [c for c in codes if not (out.setdefault(c, db.cache_get(f"quote:{c}", QUOTE_TTL)))]
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
            return {**q, "short": short, "name": name, "code": code}
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
