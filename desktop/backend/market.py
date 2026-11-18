"""Market data client for Eastmoney public quote endpoints.

All heavy calls are cached in SQLite (see db.cache_*). Only stdlib HTTP is used so
the app has no dependency on a browser-grade networking stack.
"""
from __future__ import annotations

import json
import math
import threading
import time
from pathlib import Path
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

import numpy as np

from . import clock, db, native
from .config import (EM_HIS, EM_LIST, EM_QUOTE, EM_UT, INDEXES, KLINE_MISS_TTL,
                     KLINE_TTL, QUOTE_MISS_TTL, QUOTE_TTL, SPOT_TTL)
from .net import prefer_ipv4_eastmoney

# Eastmoney TLS is reachable over IPv4 on networks where its IPv6 route is
# broken; install the preference before any request is attempted.
prefer_ipv4_eastmoney()

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"

SPOT_FIELDS = "f2,f3,f4,f5,f6,f7,f8,f9,f10,f12,f13,f14,f15,f16,f17,f18,f20,f21,f22,f23,f24,f25,f11,f62,f100"
# f62 = 主力净流入(元) on the quote API
FS_A = "m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23,m:0+t:81+s:2048"
SPOT_KEY = "spot:v7"
SPOT_SCHEMA = 7
SPOT_MIN_ROWS = 1000
UNIVERSE_EXTRA_KEY = "universe:extras:v1"

_spot_lock = threading.Lock()
_SPOT_REFRESH_LOCK = threading.Lock()
_SPOT_REFRESHING = False
# How old a cached full-market snapshot may be while a background refresh is
# running.  Without this, every page waited minutes on a stale snapshot once
# the 3-minute TTL expired, which is what made the tabs look blank.
_SPOT_MAX_STALE = 6 * 3600


_EM_STATE = {"fails": 0, "last": 0.0, "down_until": 0.0}
_EM_LOCK = __import__("threading").Lock()


def _em_available() -> bool:
    return time.time() >= _EM_STATE["down_until"]


def _em_failed() -> None:
    """Open a short circuit after two quick failures.

    Eastmoney occasionally answers 502 for minutes at a time.  Without a
    breaker every kline/board/quote call waits for its own 8 s timeout and the
    daily page takes minutes to paint.  The circuit is per-host and self-heals
    after 45 s, so a single transient error still falls through normally.
    """
    now = time.time()
    with _EM_LOCK:
        if now - _EM_STATE["last"] > 30:
            _EM_STATE["fails"] = 0
        _EM_STATE["fails"] += 1
        _EM_STATE["last"] = now
        if _EM_STATE["fails"] >= 2:
            _EM_STATE["down_until"] = now + 45


def _http_json(url: str, timeout: float = 6.0) -> dict:
    """GET JSON from Eastmoney with a short socket timeout.

    IPv4 is preferred for these hosts (see backend/net.py).  A very short
    per-host circuit breaker keeps a blocked quote host from serialising every
    page behind its timeout.
    """
    if not _em_available():
        raise RuntimeError("eastmoney circuit open")
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Referer": "https://quote.eastmoney.com/"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode("utf-8", "ignore"))
    except Exception:
        _em_failed()
        raise


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
    if code.startswith(("688", "689")):
        return "科创板"          # 689 = CDR (e.g. 九号公司-WD)
    if code.startswith(("60", "900")):
        return "沪市主板"
    if code.startswith(("300", "301", "302")):
        return "创业板"          # 302 is the newer ChiNext segment
    if code.startswith(("00", "200")):
        return "深市主板"
    if code.startswith(("8", "4", "92")):
        return "北交所"
    return "其他"


def limit_pct(row: dict) -> float:
    """Approximate daily price limit for a row (5/10/20/30%)."""
    code = str(row.get("code") or "")
    name = (row.get("name") or "").upper()
    if "ST" in name:
        return 5.0
    if code.startswith(("8", "4", "92")):
        return 30.0
    if code.startswith(("300", "301", "302", "688", "689")):
        return 20.0
    return 10.0


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


_FUND_LOCK = __import__("threading").Lock()


def _fund_flow(top: int = 900) -> dict[str, dict]:
    """Individual main-force flow from Sina, merged from both tails.

    The old request asked for all ~6,000 rows at once and took 20–40 s on a
    normal connection.  The page only needs the strongest inflows and
    outflows, so we fetch both sorted tails (900 rows each) in parallel and
    merge them.  That keeps the card complete while cutting payload ~3×.
    """
    cached = db.cache_get("fund:individual", 60)
    if cached is not None:
        return cached
    with _FUND_LOCK:
        cached = db.cache_get("fund:individual", 60)
        if cached is not None:
            return cached
        out: dict[str, dict] = {}
        base = ("https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/"
                "MoneyFlow.ssl_bkzj_ssggzj?page=1&num={num}&sort=netamount&asc={asc}")

        def fetch(asc: int):
            try:
                url = base.format(num=max(100, top), asc=asc)
                req = urllib.request.Request(url, headers={"User-Agent": UA, "Referer": "https://finance.sina.com.cn/"})
                return json.loads(urllib.request.urlopen(req, timeout=10).read().decode("utf-8", "ignore"))
            except Exception:
                # A blocked flow endpoint must not take down the whole
                # snapshot; flow is optional enrichment, not coverage.
                return []

        rows = []
        with ThreadPoolExecutor(max_workers=2) as ex:
            for part in ex.map(fetch, (0, 1)):
                rows.extend(part or [])
        for r in rows:
            code = str(r.get("symbol") or "")[-6:]
            if not code.isdigit():
                continue
            out[code] = {
                "main_inflow": _num(r.get("netamount")),
                "inflow": _num(r.get("inamount")),
                "outflow": _num(r.get("outamount")),
            }
        if out:
            db.cache_set("fund:individual", out)
        else:
            # Cache the failure briefly so a blocked Sina endpoint does not add
            # a fresh timeout to every page that renders flows.
            db.cache_set("fund:individual", {})
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


def _sina_batch(codes: list[str], deadline: float | None = None) -> dict[str, dict]:
    """Fetch Sina batch quotes with a bounded wall-clock budget.

    A full-market repair can need ~70 chunks. Sequential 10 s timeouts could
    block a fallback for minutes; run chunks concurrently and stop at the
    deadline, returning whatever arrived. The caller still keeps static rows
    for codes that did not come back, so a partial repair never loses stocks.
    """
    if not codes:
        return {}
    if deadline is None:
        deadline = time.monotonic() + 20.0
    chunks = [codes[i:i + 80] for i in range(0, len(codes), 80)]

    def fetch(chunk: list[str]) -> dict[str, dict]:
        left = deadline - time.monotonic()
        if left <= 0:
            return {}
        symbols = ",".join(f"{_prefix_for(c)}{c}" for c in chunk)
        try:
            req = urllib.request.Request(
                f"https://hq.sinajs.cn/list={symbols}",
                headers={"User-Agent": UA, "Referer": "https://finance.sina.com.cn/"},
            )
            text = urllib.request.urlopen(req, timeout=max(1.0, min(8.0, left))).read().decode("gbk", "ignore")
        except Exception:
            return {}
        rows: dict[str, dict] = {}
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
                rows[code] = {
                    "price": price, "high": _num(p[4]), "low": _num(p[5]),
                    "open": _num(p[1]), "volume": _num(p[8]), "amount": _num(p[9]),
                    "prev_close": prev, "pct": round((price / prev - 1) * 100, 2),
                    "chg": round(price - prev, 3),
                }
            except Exception:
                continue
        return rows

    out: dict[str, dict] = {}
    with ThreadPoolExecutor(max_workers=8) as ex:
        futures = [ex.submit(fetch, c) for c in chunks]
        try:
            for fut in as_completed(futures, timeout=max(0.1, deadline - time.monotonic())):
                out.update(fut.result())
        except TimeoutError:
            pass
        finally:
            for fut in futures:
                fut.cancel()
    return out


def _sina_market_center(deadline: float | None = None) -> dict[str, dict]:
    """Rich Sina spot snapshot (code, name, price, PE/PB, cap, turnover).

    The Market_Center JSON pages are small and can be fetched concurrently, so
    the fallback stays complete even when Eastmoney is unavailable. The legacy
    `ak.stock_zh_a_spot()` path was sequential, slow and carried no valuation
    fields.
    """
    UA_SINA = {"User-Agent": UA, "Referer": "https://finance.sina.com.cn/"}

    def page(n: int) -> list[dict]:
        left = deadline - time.monotonic()
        if left <= 0:
            return []
        url = ("https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/"
               f"Market_Center.getHQNodeData?page={n}&num=100&sort=amount&asc=0&node=hs_a&symbol=&_s_r_a=page")
        try:
            req = urllib.request.Request(url, headers=UA_SINA)
            with urllib.request.urlopen(req, timeout=max(1.0, min(8.0, left))) as r:
                data = json.loads(r.read().decode("utf-8", "ignore"))
            return data if isinstance(data, list) else []
        except Exception:
            return []

    if deadline is None:
        deadline = time.monotonic() + 20.0
    out: dict[str, dict] = {}
    try:
        with ThreadPoolExecutor(max_workers=8) as ex:
            futures = [ex.submit(page, n) for n in range(1, 71)]
            try:
                results = [f.result() for f in as_completed(futures, timeout=max(0.1, deadline - time.monotonic()))]
            except TimeoutError:
                results = []
            finally:
                for fut in futures:
                    fut.cancel()
            for chunk in results:
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


_QUOTE_KEYS = ("name", "price", "pct", "chg", "open", "high", "low", "prev_close",
               "volume", "amount", "amplitude", "turnover", "pe", "pb", "mcap", "fcap",
               "volume_ratio", "speed", "pct60", "pct_ytd", "pct5m", "industry")


def _blank_spot_row(code: str, name: str = "") -> dict:
    return {
        "code": code, "name": name, "price": None, "pct": None, "chg": None,
        "volume": None, "amount": None, "amplitude": None, "turnover": None,
        "pe": None, "pb": None, "high": None, "low": None, "open": None,
        "prev_close": None, "mcap": None, "fcap": None, "volume_ratio": None,
        "speed": None, "pct60": None, "pct_ytd": None, "pct5m": None,
        "main_inflow": None, "inflow": None, "outflow": None,
        "market": market_of(code), "industry": "",
    }


def _extra_symbols() -> dict[str, str]:
    """New listings observed since the bundled universe was built."""
    raw = db.cache_get(UNIVERSE_EXTRA_KEY, 86400 * 30) or {}
    if not isinstance(raw, dict):
        return {}
    out = {}
    for code, name in raw.items():
        code = str(code).zfill(6)
        if len(code) == 6 and code.isdigit():
            out[code] = str(name or "")
    return out


def _universe_symbols() -> list[tuple[str, str]]:
    """Bundled complete A-share code/name list (all ~5,580 listings)."""
    try:
        path = Path(__file__).resolve().parent / "data" / "all_symbols.json"
        data = json.loads(path.read_text("utf-8"))
        return [(str(x["code"]).zfill(6), str(x["name"])) for x in data if x.get("code")]
    except Exception:
        return []


def universe_symbols() -> list[tuple[str, str]]:
    """Bundled universe plus new listings discovered by earlier snapshots."""
    merged = dict(_universe_symbols())
    merged.update(_extra_symbols())
    return list(merged.items())


def _is_active_extra(row: dict) -> bool:
    """A newly discovered *trading* A-share, not a delisted/placeholder row.

    The Sina/EM lists also contain delisted entries and private-placement
    conversion codes (810xxx, names with 退/定转). Those must never inflate the
    live universe or be counted as covered market rows.
    """
    code = str(row.get("code") or "").zfill(6)
    name = str(row.get("name") or "")
    if len(code) != 6 or not code.isdigit():
        return False
    if not code.startswith(("0", "3", "6", "4", "8", "92")):
        return False
    if "退" in name or "定转" in name:
        return False
    price = row.get("price")
    pct = row.get("pct")
    return price is not None and price > 0 and pct is not None


def _remember_universe(rows: list[dict]) -> None:
    """Persist newly observed active codes for fallback snapshots."""
    base = {c for c, _ in _universe_symbols()}
    extras = _extra_symbols()
    changed = False
    for row in rows:
        if not _is_active_extra(row):
            continue
        code = str(row.get("code") or "").zfill(6)
        if code in base or code in extras:
            continue
        extras[code] = str(row.get("name") or "")
        changed = True
    if changed:
        db.cache_set(UNIVERSE_EXTRA_KEY, extras)


def _merge_row(row: dict, quote: dict | None, flow: dict | None, expected_name: str = "") -> dict:
    if not row:
        row = _blank_spot_row(str(quote.get("code") if quote else ""), expected_name)
    if quote:
        for key in _QUOTE_KEYS:
            if row.get(key) is None and quote.get(key) is not None:
                row[key] = quote[key]
    if expected_name and not row.get("name"):
        row["name"] = expected_name
    if row.get("main_inflow") is None and flow:
        row["main_inflow"] = flow.get("main_inflow")
        row["inflow"] = flow.get("inflow")
        row["outflow"] = flow.get("outflow")
    return row


def _assemble_snapshot(seen: dict[str, dict], expected: list[tuple[str, str]],
                       quotes: dict[str, dict] | None = None,
                       flow: dict[str, dict] | None = None, *,
                       em_total: int = 0, pages_failed: int = 0,
                       sources: list[str] | None = None,
                       classify_suspended: bool = False) -> dict:
    """Build a lossless snapshot: every expected and discovered code gets a row.

    Missing quotes remain rows with quote_status=missing/suspended, so counts,
    coverage audits and the UI can distinguish "not fetched" from "no trade".
    """
    quotes = quotes or {}
    flow = flow or {}
    expected_map = {str(code).zfill(6): str(name) for code, name in expected}
    # Codes discovered in the live pages/Sina are part of the expected universe
    # for this snapshot; they must not be classified as unexplained extras.
    for code, row in seen.items():
        if _is_active_extra(row):
            expected_map.setdefault(str(code).zfill(6), str(row.get("name") or ""))
    for code, quote in quotes.items():
        if _is_active_extra(quote):
            expected_map.setdefault(str(code).zfill(6), str(quote.get("name") or ""))
    all_codes = list(expected_map)
    rows = []
    for code in all_codes:
        code = str(code).zfill(6)
        row = dict(seen.get(code) or {})
        row = _merge_row(row, quotes.get(code), flow.get(code), expected_map.get(code, ""))
        row["code"] = code
        row["name"] = row.get("name") or expected_map.get(code, "")
        row["market"] = market_of(code)
        row.setdefault("industry", "")
        price = row.get("price")
        pct = row.get("pct")
        if price is not None and price > 0:
            row["quote_status"] = "ok"
        elif pct is not None:
            row["quote_status"] = "stale"
        elif row.get("prev_close") is not None or row.get("volume") is not None or row.get("amount") is not None:
            row["quote_status"] = "suspended"
        else:
            row["quote_status"] = "missing"
        rows.append(row)

    # A suspended stock often disappears from the quote feed entirely. Its
    # last K-line is older than the current session, which lets us preserve
    # the legitimate suspension state instead of calling it a missing quote.
    # Only probe a small number of rows; a broad outage stays "missing" and
    # keeps data_complete=false rather than hiding the problem.
    if classify_suspended:
        session = clock.last_session_date()
        missing_rows = [r for r in rows if r.get("quote_status") == "missing"]
        # Only a handful of legitimate suspensions should trigger a probe; a
        # broad feed outage must not fan out into hundreds of K-line calls.
        for row in (missing_rows if len(missing_rows) <= 8 else []):
            try:
                kl = klines(row["code"], limit=5, adjust="")
                if kl and str(kl[-1].get("date") or "") < session:
                    row["quote_status"] = "suspended"
                    row["prev_close"] = kl[-1].get("close")
                    row["volume"] = 0
            except Exception:
                continue

    row_codes = {r["code"] for r in rows}
    expected_codes = sorted(expected_map.keys())
    missing = sorted(set(expected_codes) - row_codes)
    unpriced = sorted(r["code"] for r in rows if r.get("quote_status") in ("missing", "stale"))
    suspended = sorted(r["code"] for r in rows if r.get("quote_status") == "suspended")
    status_counts = {key: 0 for key in ("ok", "stale", "suspended", "missing")}
    for row in rows:
        status_counts[row["quote_status"]] += 1
    field_missing = {
        field: sum(1 for row in rows if row.get(field) is None or row.get(field) == "")
        for field in ("price", "pct", "amount", "mcap", "industry", "main_inflow")
    }
    complete = not missing and pages_failed == 0
    data_complete = not missing and not unpriced
    source_names = list(dict.fromkeys(sources or ["universe"]))
    return {
        "schema": SPOT_SCHEMA,
        "ts": time.time(),
        "date": clock.last_session_date(),
        "total": len(rows),
        "expected": len(expected_codes),
        "captured": len(rows),
        "quoted": len(rows) - len(unpriced) - len(suspended),
        "unpriced": len(unpriced) + len(suspended),
        "suspended": len(suspended),
        "missing": len(missing),
        "missing_sample": missing[:20],
        "unpriced_codes": unpriced[:20],
        "suspended_codes": suspended[:20],
        "expected_codes": expected_codes,
        "status_counts": status_counts,
        "field_missing": field_missing,
        "complete": complete,
        # complete = every expected row is represented and no page failed.
        # data_complete additionally requires every non-suspended row to have
        # a quote; fully_quoted means even suspended rows have a price.
        "data_complete": data_complete,
        "fully_quoted": data_complete and not suspended,
        "em_total": em_total,
        "pages_failed": pages_failed,
        "sources": source_names,
        "source": "+".join(source_names),
        "rows": rows,
    }


def _akshare_spot() -> dict:
    """Complete fallback universe with Sina quotes and Eastmoney-like fields."""
    cached = db.cache_get("spot:ak", 600)
    if cached and cached.get("schema") == SPOT_SCHEMA:
        cached["date"] = clock.last_session_date()
        return cached
    universe = universe_symbols()
    quotes = _sina_market_center()
    source = "sina-market-center"
    if not quotes:
        quotes = _sina_batch([code for code, _ in universe])
        source = "sina-batch"
    flow = _fund_flow()
    out = _assemble_snapshot({}, universe, quotes, flow,
                             em_total=0, pages_failed=0, sources=[source, "universe"],
                             classify_suspended=True)
    if out["rows"]:
        db.cache_set("spot:ak", out)
        db.cache_set(SPOT_KEY, out)
        _remember_universe(out["rows"])
    return out


def _cached_snapshot(ttl: float) -> dict | None:
    cached = db.cache_get(SPOT_KEY, ttl)
    if not cached or cached.get("schema") != SPOT_SCHEMA:
        return None
    if cached.get("complete"):
        return cached
    # Do not hammer the upstream when a partial snapshot was just built; show
    # it with complete=false and retry after a short grace period.
    age = db.cache_age(SPOT_KEY)
    if age is not None and age < 20:
        return cached
    return None


def _stale_snapshot(max_age: float) -> dict | None:
    """Return the last schema-current snapshot regardless of its TTL."""
    cached = db.cache_get(SPOT_KEY)
    if not cached or cached.get("schema") != SPOT_SCHEMA:
        return None
    # A partial snapshot that still covers the market (rows exist, some
    # quotes missing) is far more useful than blocking the page for minutes.
    # Tiny/empty partials are rejected so a failed first fetch retries.
    if len(cached.get("rows") or []) < SPOT_MIN_ROWS:
        return None
    age = db.cache_age(SPOT_KEY)
    if age is not None and age > max_age:
        return None
    return cached


def cached_spot(max_age: float = _SPOT_MAX_STALE) -> dict | None:
    """Read the last usable snapshot without triggering a network refresh."""
    return _stale_snapshot(max_age)


def _refresh_spot_worker() -> None:
    global _SPOT_REFRESHING
    try:
        with _spot_lock:
            _fetch_spot_unlocked(ttl=0)
    except Exception:
        pass
    finally:
        with _SPOT_REFRESH_LOCK:
            _SPOT_REFRESHING = False


def _start_spot_refresh() -> None:
    global _SPOT_REFRESHING
    with _SPOT_REFRESH_LOCK:
        if _SPOT_REFRESHING:
            return
        _SPOT_REFRESHING = True
    threading.Thread(target=_refresh_spot_worker, name="spot-refresh", daemon=True).start()


def fetch_spot(ttl: float = SPOT_TTL, progress=None) -> dict:
    """Full A-share snapshot: every code represented, never silently dropped.

    Eastmoney pages are fetched concurrently and retried; a failed page or a
    missing quote is filled from Sina or represented by a placeholder row with
    quote_status. The cache stores the coverage contract (expected/captured/
    missing/status) so callers can distinguish a complete snapshot from a
    partial one instead of relying on a magic minimum count.

    A stale-but-usable snapshot is returned immediately while one background
    thread refreshes it.  The old synchronous refresh made every page block
    for minutes whenever the quote host was slow.
    """
    cached = _cached_snapshot(ttl)
    if cached:
        cached["date"] = clock.last_session_date()
        cached["stale"] = False
        return cached

    stale = _stale_snapshot(_SPOT_MAX_STALE)
    if stale:
        _start_spot_refresh()
        age = db.cache_age(SPOT_KEY) or 0
        payload = dict(stale)
        payload["stale"] = True
        payload["cache_age"] = round(age, 1)
        return payload

    with _spot_lock:
        cached = _cached_snapshot(ttl)
        if cached:
            cached["date"] = clock.last_session_date()
            cached["stale"] = False
            return cached
        return _fetch_spot_unlocked(ttl, progress)


def _fetch_spot_unlocked(ttl: float = SPOT_TTL, progress=None) -> dict:
    # A blocked quote host must not hold the first page for minutes: three
    # retries on every one of ~56 pages is a worst case of several minutes.
    # Bound the whole page sweep and let the Sina/static fallback repair what
    # did not arrive; coverage metadata then tells the caller it was partial.
    deadline = time.monotonic() + 35.0
    base = (
        f"{EM_LIST}?po=1&np=1&fltt=2&invt=2&fid=f12&fs={urllib.parse.quote(FS_A)}"
        f"&fields={SPOT_FIELDS}"
    )

    def fetch_page(page: int):
        for attempt in range(3):
            left = deadline - time.monotonic()
            if left <= 0:
                return None
            try:
                return _http_json(f"{base}&pn={page}&pz=100", timeout=max(1.0, min(6.0, left)))
            except Exception:
                if attempt < 2:
                    time.sleep(min(0.24, max(0.0, deadline - time.monotonic())))
        return None

    first = fetch_page(1)
    data = (first or {}).get("data") or {}
    total = int(data.get("total") or 0)
    if not total:
        return _akshare_spot()

    page_size = 100
    page_count = min(120, max(1, math.ceil(total / page_size)))
    pages: dict[int, dict | None] = {1: first}
    with ThreadPoolExecutor(max_workers=6) as ex:
        futures = {ex.submit(fetch_page, p): p for p in range(2, page_count + 1)}
        try:
            for fut in as_completed(futures, timeout=max(0.1, deadline - time.monotonic())):
                pages[futures[fut]] = fut.result()
        except TimeoutError:
            pass
        finally:
            for fut in futures:
                fut.cancel()

    seen: dict[str, dict] = {}

    def take(diff) -> None:
        for f in diff:
            r = _row_from_spot(f)
            if r["code"]:
                seen[r["code"]] = r

    pages_failed = 0
    for page in range(1, page_count + 1):
        payload = pages.get(page)
        diff = ((payload or {}).get("data") or {}).get("diff") or []
        if not diff:
            if len(seen) < total:
                pages_failed += 1
            continue
        take(diff)
        if progress:
            progress(min(99, int(len(seen) / max(total, 1) * 100)))

    if len(seen) < SPOT_MIN_ROWS:
        return _akshare_spot()

    # Merge everything known: bundled/extra universe, Eastmoney rows and Sina
    # quotes discovered while repairing failed pages.
    expected = universe_symbols()
    expected_map = dict(expected)
    quotes: dict[str, dict] = {}
    sources = ["eastmoney", "universe"]
    need = [code for code in expected_map if code not in seen or seen[code].get("price") is None]
    if pages_failed:
        # Only a failed page needs the full Sina universe sweep; a couple of
        # suspended rows can be filled by the much cheaper batch endpoint.
        sina = _sina_market_center()
        quotes.update(sina)
        sources.append("sina-market-center")
        for code, q in sina.items():
            if _is_active_extra(q):
                expected_map.setdefault(code, q.get("name") or "")
        need = [code for code in expected_map if code not in seen or seen[code].get("price") is None]
    if need:
        batch = _sina_batch(need)
        if batch:
            quotes.update(batch)
            sources.append("sina-batch")
    flow = _fund_flow() if any((row.get("main_inflow") is None) for row in seen.values()) or need else {}
    out = _assemble_snapshot(seen, list(expected_map.items()), quotes, flow,
                             em_total=total, pages_failed=pages_failed,
                             sources=sources, classify_suspended=True)
    if progress:
        progress(100)
    if out["rows"]:
        db.cache_set(SPOT_KEY, out)
        _remember_universe(out["rows"])
        return out
    return _akshare_spot()


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
    miss_key = f"{key}:miss"
    if db.cache_get(miss_key, QUOTE_MISS_TTL):
        return None

    def fallback() -> dict | None:
        q = _sina_quote(code)
        if q:
            db.cache_delete(miss_key)
            db.cache_set(key, q)
        else:
            db.cache_set(miss_key, {"miss": True})
        return q

    try:
        d = _http_json(
            f"{EM_QUOTE}/stock/get?secid={secid(code)}&fltt=2&invt=2&fields=f43,f44,f45,f46,f47,f48,f57,f58,f60,f107,f116,f117,f162,f167,f168,f169,f170,f171,f50"
        )
        x = (d or {}).get("data")
        if not x:
            return fallback()
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
        return fallback()


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

    # The full snapshot already contains every quote field the watchlist
    # renders.  Use a recently cached snapshot before issuing one HTTP request
    # per missing symbol; a 20-name watchlist otherwise spent ~10 s just on
    # quote round-trips while the snapshot sat in the same SQLite cache.
    if needed:
        spot = _stale_snapshot(900)
        if spot:
            by_code = {r.get("code"): r for r in spot.get("rows") or []}
            for c in needed:
                row = by_code.get(c)
                if row and row.get("price") is not None:
                    out[c] = row
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


def _sina_klines(code: str, period: str, limit: int, adjust: str, secid_override: str | None = None) -> list[dict]:
    """Stdlib Sina daily-bar fallback.

    Works without akshare and is markedly faster than the token endpoint on
    networks where Eastmoney is rate-limited.  Only daily bars are available;
    prices are unadjusted, which is fine for patterns, TD and regime work.
    """
    if period != "daily":
        return []
    sec = secid_override or secid(code)
    if sec.startswith("1."):
        prefix = "sh"
    elif code.startswith(("4", "8", "92")):
        prefix = "bj"
    else:
        prefix = "sz"
    symbol = f"{prefix}{code}"
    url = (f"https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/"
           f"CN_MarketData.getKLineData?symbol={symbol}&scale=240&ma=no&datalen={max(20, min(1023, int(limit)))}")
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA, "Referer": "https://finance.sina.com.cn/"})
        data = json.loads(urllib.request.urlopen(req, timeout=8).read().decode("utf-8", "ignore"))
    except Exception:
        return []
    rows = []
    prev = None
    for r in data or []:
        close = _num(r.get("close"))
        if close is None:
            continue
        pct = ((close / prev - 1) * 100) if prev else 0.0
        rows.append({
            "date": str(r.get("day") or "")[:10], "open": _num(r.get("open")),
            "close": close, "high": _num(r.get("high")), "low": _num(r.get("low")),
            "volume": _num(r.get("volume"), 0), "amount": _num(r.get("amount"), 0),
            "amplitude": None, "pct": round(pct, 2),
            "chg": round(close - prev, 3) if prev else 0, "turnover": None,
            "source": "sina",
        })
        prev = close
    return rows[-max(10, int(limit)):]


def klines(code: str, period: str = "daily", limit: int = 260, adjust: str = "qfq",
           secid_override: str | None = None, allow_akshare: bool = True) -> list[dict]:
    adjust = adjust if adjust in ("", "qfq", "hfq") else "qfq"
    fqt = {"": 0, "qfq": 1, "hfq": 2}[adjust]
    key = f"kline:{secid_override or code}:{period}:{adjust}:{limit}"
    ttl = clock.kline_ttl() if period in ("daily", "weekly", "monthly") else min(60, KLINE_TTL)
    cached = db.cache_get(key, ttl)
    if cached:
        return cached
    miss_key = f"{key}:miss"
    if db.cache_get(miss_key, KLINE_MISS_TTL):
        return []
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
        rows = _sina_klines(code, period, limit, adjust, secid_override)
    if not rows and allow_akshare:
        rows = _akshare_klines(code, period, limit, adjust, secid_override)
    if not rows:
        # All three sources failed.  Remember the miss briefly instead of
        # re-running the same slow timeout + fallback chain on every refresh.
        db.cache_set(miss_key, {"miss": True})
        return []
    if rows and any((r["close"] or 0) < 0 for r in rows):
        # forward-adjusted history can go negative on heavily-dividend stocks;
        # fall back to unadjusted prices for display
        return klines(code, period=period, limit=limit, adjust="", secid_override=secid_override)
    if rows:
        db.cache_delete(miss_key)
        db.cache_set(key, rows)
    return rows


def stock_name_map() -> dict[str, str]:
    spot = db.cache_get(SPOT_KEY, 86400 * 30)
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


_INDEX_LOCK = threading.Lock()


def indices() -> list[dict]:
    cached = db.cache_get("market:indices", 20)
    if cached:
        return cached
    # The HUD asks for overview and light state at the same time; single-flight
    # keeps both requests from hitting the index host twice on a cold start.
    with _INDEX_LOCK:
        cached = db.cache_get("market:indices", 20)
        if cached:
            return cached

        def work(i):
            return index_quote(i["secid"], i["code"], i["name"], i["short"])

        with ThreadPoolExecutor(max_workers=5) as ex:
            out = list(ex.map(work, INDEXES))
        if out:
            db.cache_set("market:indices", out)
        return out


def _breadth_reference(rows: list[dict]) -> dict:
    """Pure-Python fallback for the C++ census; same classification rules."""
    out = {"total": len(rows), "traded": 0, "up": 0, "down": 0, "flat": 0,
           "limit_up": 0, "limit_down": 0, "suspended": 0, "missing": 0}
    for row in rows:
        price = row.get("price")
        pct = row.get("pct")
        if (price is None or price <= 0) and pct is None:
            out["missing"] += 1
            continue
        if pct is None:
            out["suspended"] += 1
            continue
        out["traded"] += 1
        if pct > 0.01:
            out["up"] += 1
        elif pct < -0.01:
            out["down"] += 1
        else:
            out["flat"] += 1
        limit = limit_pct(row)
        if pct >= limit - 0.2:
            out["limit_up"] += 1
        if pct <= -limit + 0.2:
            out["limit_down"] += 1
    return out


def market_breadth() -> dict:
    """Up/down/suspended/limit census from the full snapshot.

    The C++ census counts every row exactly once and rejects an invariant
    violation; the Python reference is used when the optional extension is not
    built. Suspended and missing rows are no longer folded into "flat".
    """
    spot = db.cache_get(SPOT_KEY)
    if not spot:
        return {}
    age = db.cache_age(SPOT_KEY) or 0
    if age > _SPOT_MAX_STALE:
        return {}
    rows = spot.get("rows", [])
    pct = np.asarray([np.nan if r.get("pct") is None else float(r["pct"]) for r in rows], dtype=float)
    price = np.asarray([np.nan if r.get("price") is None else float(r["price"]) for r in rows], dtype=float)
    limits = np.asarray([limit_pct(r) for r in rows], dtype=float)
    try:
        if native.NATIVE:
            raw = native.native.breadth_census(pct, price, limits)
            counts = {k: int(v) for k, v in raw.items()}
        else:
            counts = _breadth_reference(rows)
    except Exception:
        counts = _breadth_reference(rows)
    # The snapshot is the authority for suspended/missing: C++ receives NaN
    # prices and cannot tell a halted stock from a never-fetched one. Keep its
    # traded distribution (one classification per row) and reconcile the two
    # non-traded buckets from quote_status.
    status_counts = spot.get("status_counts") or {}
    if status_counts:
        counts["suspended"] = int(status_counts.get("suspended", 0))
        counts["missing"] = int(status_counts.get("missing", counts.get("missing", 0)))
        counts["traded"] = int(counts.get("up", 0)) + int(counts.get("down", 0)) + int(counts.get("flat", 0))
    return {
        **counts,
        "total": len(rows),
        "expected": spot.get("expected", len(rows)),
        "complete": bool(spot.get("complete", False)),
        "unpriced": spot.get("unpriced", 0),
        "stale": age > SPOT_TTL,
        "age": round(age, 1),
        "ts": spot.get("ts"),
    }


# ---------------------------------------------------------------- search
def search(keyword: str, limit: int = 20) -> list[dict]:
    kw = (keyword or "").strip().upper()
    if not kw:
        return []
    spot = db.cache_get(SPOT_KEY, 86400)
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
    spot = db.cache_get(SPOT_KEY, 600)
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
        if cached:
            return cached
        db.cache_delete(key)  # never serve a permanently empty profile
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
    if not out:
        # Eastmoney F10 can be rate-limited; CNInfo is an independent F10
        # source and keeps the company-profile card usable.
        try:
            import akshare as ak
            df = ak.stock_profile_cninfo(symbol=code)
            if df is not None and len(df) > 0:
                x = df.iloc[0].to_dict()
                def pick(*names):
                    for n in names:
                        v = x.get(n)
                        if v is not None and str(v).strip() and str(v).strip() != "nan":
                            return str(v).strip()
                    return None
                out = {
                    "org_name": pick("公司名称"),
                    "industry": pick("所属行业"),
                    "reg_capital": _num(pick("注册资金")),
                    "employees": None,
                    "found_date": (pick("成立日期") or "")[:10],
                    "listing_date": (pick("上市日期") or "")[:10],
                    "profile": pick("主营业务", "经营范围"),
                    "scope": pick("经营范围"),
                    "main_business": pick("主营业务"),
                    "website": pick("官方网站"),
                    "email": pick("电子邮箱"),
                    "phone": pick("联系电话"),
                    "chairman": None,
                    "secretary": None,
                    "legal_person": pick("法人代表"),
                    "reg_number": None,
                    "address": pick("注册地址"),
                }
        except Exception:
            pass
    if out:
        db.cache_set(key, out)
    return out


def concepts(code: str) -> list[str]:
    """Industry / concept tags from Eastmoney F10 core themes."""
    key = f"concepts:{code}"
    cached = db.cache_get(key, 86400 * 7)
    if cached is not None:
        if cached:
            return cached
        db.cache_delete(key)  # never serve a permanently empty profile
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
