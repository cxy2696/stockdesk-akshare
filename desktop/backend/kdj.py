"""KDJ extreme-zone alerts.

Data comes from akshare (Sina for index 5m/30m bars, Eastmoney for industry
boards). Industry boards fall back to a tracking ETF when the Eastmoney
minute endpoint is rate-limited, so the warning layer still has a live proxy.
"""
from __future__ import annotations

import socket
import traceback
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Any

UPPER = 118.0
LOWER = -14.0
BAR_LIMIT = 180
CACHE_TTL = 45
SNAPSHOT_TTL = 30

TARGETS = [
    {"key": "semi", "name": "半导体", "kind": "行业", "board": "BK1036", "proxy": "sh512480"},
    {"key": "comm", "name": "通信设备", "kind": "行业", "board": "BK0448", "proxy": "sh515880"},
    {"key": "sse", "name": "上证指数", "kind": "指数", "sina": "sh000001", "secid": "1.000001"},
    {"key": "szse", "name": "深证成指", "kind": "指数", "sina": "sz399001", "secid": "0.399001"},
    {"key": "chinext", "name": "创业板指", "kind": "指数", "sina": "sz399006", "secid": "0.399006"},
    {"key": "hs300", "name": "沪深300", "kind": "指数", "sina": "sh000300", "secid": "1.000300"},
    {"key": "csi500", "name": "中证500", "kind": "指数", "sina": "sh000905", "secid": "1.000905"},
    {"key": "csi1000", "name": "中证1000", "kind": "指数", "sina": "sh000852", "secid": "1.000852"},
    {"key": "star50", "name": "科创50", "kind": "指数", "sina": "sh000688", "secid": "1.000688"},
    {"key": "sse50", "name": "上证50", "kind": "指数", "sina": "sh000016", "secid": "1.000016"},
    {"key": "bse50", "name": "北证50", "kind": "指数", "sina": "bj899050", "secid": "0.899050"},
]

INDUSTRY_PROXY = {
    "半导体": "sh512480", "通信设备": "sh515880", "元件": "sh515260",
    "消费电子": "sz159732", "光学光电子": "sh515260", "软件开发": "sh515230",
    "计算机设备": "sh512720", "电池": "sz159755", "光伏设备": "sh515790",
    "证券": "sh512880", "银行": "sh512800", "保险": "sh512070",
    "白酒": "sh512690", "医疗器械": "sh512170", "化学制药": "sh512010",
    "电力": "sz159611", "煤炭": "sh515220", "有色金属": "sh512400",
    "房地产": "sh512200", "航天装备": "sh512660", "汽车零部件": "sh516110",
    "游戏": "sh516010", "传媒": "sh512980", "钢铁": "sh515210",
    "基础建设": "sh516950", "农业": "sz159825", "食品饮料": "sh515170",
}
INDUSTRIES_FALLBACK = ["半导体", "通信设备", "元件", "光学光电子", "消费电子", "软件开发", "计算机设备", "电池", "光伏设备", "汽车零部件", "证券", "银行", "保险", "白酒", "医疗器械", "化学制药", "电力", "煤炭", "有色金属", "房地产"]
_INDUSTRY_CACHE: tuple[float, list[str]] = (0.0, [])


def industries() -> list[str]:
    global _INDUSTRY_CACHE
    now = time.time()
    if _INDUSTRY_CACHE[1] and now - _INDUSTRY_CACHE[0] < 600:
        return _INDUSTRY_CACHE[1]
    try:
        import akshare as ak
        df = ak.stock_fund_flow_industry(symbol="即时")
        names = [str(x) for x in df["行业"].tolist() if str(x).strip()]
        if names:
            # Only expose sectors with a minute-data proxy; avoid empty options.
            supported = [n for n in names if n in INDUSTRY_PROXY]
            supported += [n for n in INDUSTRY_PROXY if n not in supported]
            _INDUSTRY_CACHE = (now, supported)
            return supported
    except Exception:
        pass
    return INDUSTRIES_FALLBACK


_CACHE: dict[tuple[str, str], tuple[float, dict]] = {}
_CACHE_LOCK = threading.Lock()
_SNAPSHOT: dict[str, tuple[float, dict]] = {}
_EASTMONEY_BLOCKED_UNTIL = 0.0


def _num(v, default=None):
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


def _normalize(df, period: str, source: str) -> dict:
    rows = []
    prev = None
    for _, r in df.tail(BAR_LIMIT).iterrows():
        close = _num(r.get("close"))
        if close is None:
            continue
        pct = _num(r.get("pct"))
        if pct is None:
            pct = ((close / prev - 1) * 100) if prev else 0.0
        rows.append({
            "date": str(r.get("day") or r.get("时间") or r.get("日期时间") or ""),
            "open": _num(r.get("open")),
            "close": close,
            "high": _num(r.get("high")),
            "low": _num(r.get("low")),
            "volume": _num(r.get("volume"), 0),
            "pct": round(float(pct), 2),
        })
        prev = close
    return {"rows": rows, "source": source}


def _ak_index(symbol: str, period: str) -> dict:
    import akshare as ak
    df = ak.stock_zh_a_minute(symbol=symbol, period=period, adjust="")
    return _normalize(df, period, "akshare · 新浪")


def _ak_sector(board: str, period: str) -> dict:
    global _EASTMONEY_BLOCKED_UNTIL
    if time.time() < _EASTMONEY_BLOCKED_UNTIL:
        raise RuntimeError("行业板块行情暂时限流")
    import akshare as ak
    try:
        df = ak.stock_board_industry_hist_min_em(symbol=board, period=period)
        return _normalize(df, period, "akshare · 东方财富")
    except Exception as e:
        if "限流" in str(e) or "断开" in str(e):
            _EASTMONEY_BLOCKED_UNTIL = time.time() + 300
        raise


def _fetch(t: dict, period: str) -> dict:
    key = (t["key"], period)
    now = time.time()
    with _CACHE_LOCK:
        hit = _CACHE.get(key)
        if hit and now - hit[0] < CACHE_TTL:
            return hit[1]
    result = {"rows": [], "source": "", "error": ""}
    try:
        if t.get("kind") == "行业":
            try:
                result = _ak_sector(t["board"], period)
            except Exception:
                # The ETF is a transparent fallback proxy, not a replacement.
                result = _ak_index(t["proxy"], period)
                result["source"] = "akshare · 行业ETF代理"
                result["proxy"] = True
        else:
            result = _ak_index(t["sina"], period)
    except Exception as e:
        result["error"] = (traceback.format_exc().strip() or str(e)) or "行情暂不可用"
    with _CACHE_LOCK:
        _CACHE[key] = (now, result)
    return result


def _kdj(rows: list[dict], n: int = 9) -> dict:
    if not rows:
        return {"j": None, "k": None, "d": None, "series": []}
    k, d = 50.0, 50.0
    out = []
    for i, r in enumerate(rows):
        window = rows[max(0, i - n + 1):i + 1]
        hi = max((x.get("high") or 0) for x in window)
        lo = min((x.get("low") or 0) for x in window)
        close = r.get("close") or 0
        rsv = 50.0 if hi <= lo else (close - lo) / (hi - lo) * 100
        k = (2 * k + rsv) / 3
        d = (2 * d + k) / 3
        j = 3 * k - 2 * d
        out.append({**r, "j": round(j, 2), "k": round(k, 2), "d": round(d, 2)})
    last = out[-1]
    return {"j": last["j"], "k": last["k"], "d": last["d"], "series": out[-90:]}


def _zone(rows: list[dict], lookback: int = 80) -> dict | None:
    data = rows[-lookback:]
    if len(data) < 12:
        return None
    highs, lows = [], []
    for i in range(2, len(data) - 2):
        h, l = data[i].get("high") or 0, data[i].get("low") or 0
        if h >= max((x.get("high") or 0) for x in data[i - 2:i + 3]):
            highs.append(h)
        if l <= min((x.get("low") or 0) for x in data[i - 2:i + 3]):
            lows.append(l)
    highs, lows = highs[-3:], lows[-3:]
    if not highs or not lows:
        prices = [x.get("close") or 0 for x in data]
        mid = sum(prices) / len(prices)
        return {"upper": round(mid * 1.01, 3), "lower": round(mid * 0.99, 3), "mid": round(mid, 3), "quality": "range"}
    upper, lower = min(highs), max(lows)
    quality = "overlap"
    if upper <= lower:
        upper, lower = max(highs), min(lows)
        quality = "envelope"
    return {"upper": round(upper, 3), "lower": round(lower, 3), "mid": round((upper + lower) / 2, 3), "quality": quality}


def _one(t: dict) -> dict:
    base = {"key": t["key"], "name": t["name"], "kind": t["kind"], "j5": None, "j30": None,
            "alert5": None, "alert30": None, "series5": [], "series30": [],
            "zone5": None, "zone30": None, "price": None, "pct": None, "source5": "", "source30": "",
            "proxy": False, "error": ""}
    try:
        d5 = _fetch(t, "5")
        d30 = _fetch(t, "30")
    except Exception as e:
        return {**base, "error": str(e)[:160]}
    errors = []
    for suffix, d in (("5", d5), ("30", d30)):
        if d.get("rows"):
            kdj = _kdj(d["rows"])
            base[f"j{suffix}"] = kdj["j"]
            base[f"series{suffix}"] = kdj["series"]
            base[f"zone{suffix}"] = _zone(d["rows"])
            j = kdj["j"]
            base[f"alert{suffix}"] = "超买" if j is not None and j >= UPPER else "超卖" if j is not None and j <= LOWER else "正常"
            base[f"source{suffix}"] = d.get("source", "")
            base["proxy"] = base["proxy"] or bool(d.get("proxy"))
            base["price"] = base["price"] or d["rows"][-1]["close"]
            base["pct"] = base["pct"] if base["pct"] is not None else d["rows"][-1]["pct"]
        elif d.get("error"):
            errors.append(f"{suffix}m: {d['error']}")
    if errors:
        base["error"] = "；".join(errors)[:2400]
    base["alert"] = any(x in ("超买", "超卖") for x in (base["alert5"], base["alert30"]))
    base["direction"] = "超买" if base["alert5"] == "超买" or base["alert30"] == "超买" else "超卖" if base["alert5"] == "超卖" or base["alert30"] == "超卖" else "正常"
    return base


def snapshot(force: bool = False, industry: str | None = None) -> dict:
    now = time.time()
    industry = (industry or "").strip()
    cache_key = industry or "__default__"
    with _CACHE_LOCK:
        hit = _SNAPSHOT.get(cache_key)
        if not force and hit and now - hit[0] < SNAPSHOT_TTL:
            return hit[1]
    defs = list(TARGETS)
    if industry and not any(t.get("name") == industry for t in defs):
        defs.append({"key": f"industry:{industry}", "name": industry, "kind": "行业", "board": industry, "proxy": INDUSTRY_PROXY.get(industry)})
    old = socket.getdefaulttimeout()
    socket.setdefaulttimeout(12)
    try:
        with ThreadPoolExecutor(max_workers=4) as ex:
            targets = list(ex.map(_one, defs))
    finally:
        socket.setdefaulttimeout(old)
    data = {"thresholds": {"upper": UPPER, "lower": LOWER}, "targets": targets,
            "industry": industry or "半导体",
            "zones_note": "中枢为最近摆动高低点重叠区的近似值，不是严格缠论中枢。",
            "updated": time.time()}
    with _CACHE_LOCK:
        _SNAPSHOT[cache_key] = (time.time(), data)
    return data
