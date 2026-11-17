"""Stock screener over the full-market snapshot + saved presets."""
from __future__ import annotations

import time

from . import db, market


def _quality(r: dict) -> float:
    """0-100 composite: cheaper valuations + healthier momentum/flow."""
    pe, pb = r.get("pe"), r.get("pb")
    s = 50.0
    if pe is not None and pe > 0:
        s += max(-15, min(15, (25 - pe) / 2))
    if pb is not None and pb > 0:
        s += max(-10, min(10, (3 - pb) * 3))
    p60 = r.get("pct60") or 0
    s += max(-12, min(12, p60 / 4))
    to = r.get("turnover") or 0
    s += max(-6, min(6, (to - 2) * 1.2))
    inflow = r.get("main_inflow") or 0
    if r.get("amount"):
        ratio = inflow / r["amount"] * 100
        s += max(-8, min(8, ratio / 2))
    return round(max(0, min(100, s)), 1)


def screen(filters: dict | None = None, limit: int = 100) -> dict:
    f = filters or {}
    spot = market.fetch_spot()
    rows = spot.get("rows", [])
    if not rows:
        return {"rows": [], "total": 0, "scanned": 0, "ts": spot.get("ts")}

    def num(k, default=None):
        v = f.get(k)
        if v is None or v == "":
            return default
        try:
            return float(v)
        except Exception:
            return default

    pmin, pmax = num("price_min"), num("price_max")
    cap_min, cap_max = num("mcap_min"), num("mcap_max")  # 亿
    pe_min, pe_max = num("pe_min"), num("pe_max")
    pb_min, pb_max = num("pb_min"), num("pb_max")
    pct_min, pct_max = num("pct_min"), num("pct_max")
    to_min, to_max = num("turnover_min"), num("turnover_max")
    inflow_min = num("inflow_min")
    boards = f.get("boards") or []
    exclude_st = bool(f.get("exclude_st", True))
    exclude_new = bool(f.get("exclude_new", True))
    only_profit = bool(f.get("only_profit", True))
    kw = (f.get("keyword") or "").strip().upper()
    sort_by = f.get("sort", "score")

    out = []
    for r in rows:
        code, name = r["code"], r.get("name") or ""
        if exclude_st and ("ST" in name.upper() or "退" in name):
            continue
        if exclude_new and (name.startswith("N") or name.startswith("C")):
            continue
        if boards and r.get("market") not in boards:
            continue
        px = r.get("price")
        if px is None or px <= 0:
            continue
        if pmin is not None and px < pmin:
            continue
        if pmax is not None and px > pmax:
            continue
        mcap = (r.get("mcap") or 0) / 1e8
        if cap_min is not None and mcap < cap_min:
            continue
        if cap_max is not None and mcap > cap_max:
            continue
        pe, pb = r.get("pe"), r.get("pb")
        if only_profit and (pe is None or pe <= 0):
            continue
        if pe_min is not None and (pe is None or pe < pe_min):
            continue
        if pe_max is not None and (pe is None or pe > pe_max):
            continue
        if pb_min is not None and (pb is None or pb < pb_min):
            continue
        if pb_max is not None and (pb is None or pb > pb_max):
            continue
        pct = r.get("pct")
        if pct_min is not None and (pct is None or pct < pct_min):
            continue
        if pct_max is not None and (pct is None or pct > pct_max):
            continue
        to = r.get("turnover")
        if to_min is not None and (to is None or to < to_min):
            continue
        if to_max is not None and (to is None or to > to_max):
            continue
        if inflow_min is not None and (r.get("main_inflow") or 0) < inflow_min * 1e8:
            continue
        if kw and kw not in code and kw not in name.upper():
            continue
        score = _quality(r)
        x = dict(r)
        x["score"] = score
        x["mcap_yi"] = round(mcap, 1)
        x["inflow_yi"] = round((r.get("main_inflow") or 0) / 1e8, 2)
        out.append(x)

    keymap = {
        "score": lambda r: r["score"],
        "pct": lambda r: r.get("pct") or -999,
        "turnover": lambda r: r.get("turnover") or 0,
        "amount": lambda r: r.get("amount") or 0,
        "mcap": lambda r: r.get("mcap") or 0,
        "pe": lambda r: -(r.get("pe") or 1e9),
        "pb": lambda r: -(r.get("pb") or 1e9),
        "inflow": lambda r: r.get("main_inflow") or 0,
        "pct60": lambda r: r.get("pct60") or -999,
    }
    out.sort(key=keymap.get(sort_by, keymap["score"]), reverse=True)
    return {
        "rows": out[: max(1, min(limit, 500))],
        "total": len(out),
        "scanned": len(rows),
        "ts": spot.get("ts"),
        "date": spot.get("date"),
    }


def presets() -> list[dict]:
    return db.get_setting("screen_presets", []) or []


def save_preset(name: str, filters: dict):
    ps = presets()
    ps = [p for p in ps if p.get("name") != name]
    ps.append({"name": name, "filters": filters, "created": time.strftime("%Y-%m-%d %H:%M")})
    db.set_setting("screen_presets", ps[-20:])
    return ps


def delete_preset(name: str):
    ps = [p for p in presets() if p.get("name") != name]
    db.set_setting("screen_presets", ps)
    return ps
