"""KDJ extreme-zone alerts for semiconductors, communications equipment and indices.

This is intentionally a *warning* layer, not a trade system. It looks at the
J value on 5-minute and 30-minute bars, and draws an approximate central zone
("中枢") from recent swing highs/lows. The zone is descriptive, not a strict
Chan-theory construction.
"""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from typing import Any

from . import market

TARGETS = [
    {"key": "semi", "name": "半导体", "kind": "行业", "secid": "90.BK1036"},
    {"key": "comm", "name": "通信设备", "kind": "行业", "secid": "90.BK0448"},
    {"key": "sse", "name": "上证指数", "kind": "指数", "secid": "1.000001"},
    {"key": "hs300", "name": "沪深300", "kind": "指数", "secid": "1.000300"},
    {"key": "chinext", "name": "创业板指", "kind": "指数", "secid": "0.399006"},
    {"key": "szse", "name": "深证成指", "kind": "指数", "secid": "0.399001"},
    {"key": "star50", "name": "科创50", "kind": "指数", "secid": "1.000688"},
    {"key": "csi1000", "name": "中证1000", "kind": "指数", "secid": "1.000852"},
]

UPPER = 118.0
LOWER = -14.0


def _kdj(rows: list[dict], n: int = 9) -> dict[str, Any]:
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
        out.append({"date": r.get("date"), "j": round(j, 2), "k": round(k, 2), "d": round(d, 2),
                    "open": r.get("open"), "close": close, "high": r.get("high"), "low": r.get("low"),
                    "volume": r.get("volume")})
    last = out[-1]
    return {"j": last["j"], "k": last["k"], "d": last["d"], "series": out[-90:]}


def _zone(rows: list[dict], lookback: int = 80) -> dict | None:
    """Approximate central zone from the overlap of recent swing extremes."""
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
        # No clean overlap: show the recent swing envelope instead.
        upper, lower = max(highs), min(lows)
        quality = "envelope"
    return {"upper": round(upper, 3), "lower": round(lower, 3), "mid": round((upper + lower) / 2, 3), "quality": quality}


def _one(t: dict) -> dict:
    base = {"key": t["key"], "name": t["name"], "kind": t["kind"], "secid": t["secid"]}
    result = {**base, "j5": None, "j30": None, "alert5": None, "alert30": None,
              "series5": [], "series30": [], "zone5": None, "zone30": None, "price": None, "pct": None}
    try:
        m5 = market.klines(t["secid"], period="5m", limit=180, adjust="", secid_override=t["secid"])
        m30 = market.klines(t["secid"], period="30m", limit=180, adjust="", secid_override=t["secid"])
    except Exception:
        return {**result, "error": "行情暂不可用"}
    if m5:
        k5 = _kdj(m5)
        result.update(j5=k5["j"], series5=k5["series"], zone5=_zone(m5),
                      alert5=("超买" if k5["j"] is not None and k5["j"] > UPPER else
                              "超卖" if k5["j"] is not None and k5["j"] < LOWER else "正常"),
                      price=m5[-1].get("close"), pct=m5[-1].get("pct"))
    if m30:
        k30 = _kdj(m30)
        result.update(j30=k30["j"], series30=k30["series"], zone30=_zone(m30),
                      alert30=("超买" if k30["j"] is not None and k30["j"] > UPPER else
                               "超卖" if k30["j"] is not None and k30["j"] < LOWER else "正常"),
                      price=result["price"] or m30[-1].get("close"), pct=result["pct"] if result["pct"] is not None else m30[-1].get("pct"))
    result["alert"] = any(x in ("超买", "超卖") for x in (result["alert5"], result["alert30"]))
    result["direction"] = "超买" if "超买" in (result["alert5"], result["alert30"]) else "超卖" if "超卖" in (result["alert5"], result["alert30"]) else "正常"
    return result


def snapshot() -> dict:
    with ThreadPoolExecutor(max_workers=4) as ex:
        targets = list(ex.map(_one, TARGETS))
    return {"thresholds": {"upper": UPPER, "lower": LOWER}, "targets": targets,
            "zones_note": "中枢为最近摆动高低点重叠区的近似值，不是严格缠论中枢。",
            "updated": __import__("time").time()}
