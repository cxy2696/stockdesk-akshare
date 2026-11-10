"""Market data client for Eastmoney public quote endpoints.

All heavy calls are cached in SQLite (see db.cache_*). Only stdlib HTTP is used so
the app has no dependency on a browser-grade networking stack.
"""
from __future__ import annotations

import json
import re
import time
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


def fetch_spot(ttl: float = SPOT_TTL, progress=None) -> dict:
    """Full A-share snapshot. Returns {"ts","date","total","rows"}."""
    cached = db.cache_get("spot:v3", ttl)
    if cached:
        return cached
    base = (
        f"{EM_LIST}?po=1&np=1&fltt=2&invt=2&fid=f3&fs={urllib.parse.quote(FS_A)}"
        f"&fields={SPOT_FIELDS}"
    )
    first = _http_json(f"{base}&pn=1&pz=100")
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
    return out


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
            return None
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
        return None


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
        # slow path: one page of quotes only
        rows = fetch_spot(ttl=0).get("rows", [])
    starts, contains = [], []
    for r in rows:
        code = r["code"]
        name = (r.get("name") or "").upper()
        if code == kw or code.startswith(kw) or name.startswith(kw):
            starts.append(r)
        elif kw in code or kw in name:
            contains.append(r)
    out = (starts + contains)[:limit]
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
