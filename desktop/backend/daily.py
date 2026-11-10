"""Daily market brief: indices, breadth, sectors, key levels and a plan."""
from __future__ import annotations

import time

from . import advice, db, market, state


def _index_levels():
    out = []
    for code, name, sec in (("000001", "上证指数", "1.000001"), ("000300", "沪深300", "1.000300")):
        try:
            rows = market.klines(code, limit=160, adjust="", secid_override=sec)
            if len(rows) < 25:
                continue
            closes = [r["close"] for r in rows]
            highs = [r["high"] for r in rows[-20:]]
            lows = [r["low"] for r in rows[-20:]]
            ma20 = sum(closes[-20:]) / 20
            ma60 = sum(closes[-60:]) / 60 if len(closes) >= 60 else None
            price = closes[-1]
            support = max([x for x in (ma20, min(lows)) if x and x < price] or [min(lows)])
            resistance = max(highs)
            out.append({
                "code": code, "name": name, "price": round(price, 2),
                "support": round(support, 2),
                "support_dist": round((support / price - 1) * 100, 2),
                "resistance": round(resistance, 2),
                "resistance_dist": round((resistance / price - 1) * 100, 2),
                "ma20": round(ma20, 2), "ma60": round(ma60, 2) if ma60 else None,
            })
        except Exception:
            continue
    return out


def daily_brief() -> dict:
    cached = db.cache_get("market:daily:v3", 120)
    if cached:
        return cached
    m = state.market_state()
    idx = m.get("indices") or []
    b = m.get("breadth") or {}
    sectors = state.boards("industry", "pct", 80)
    top = [x for x in sectors if (x.get("pct") or 0) > 0][:5]
    bottom = sorted([x for x in sectors if x.get("pct") is not None], key=lambda x: x["pct"])[:3]
    adv = advice.position_advice()

    sh = next((x for x in idx if x["code"] == "000001"), None)
    turnover = m.get("turnover")
    summary = (
        f"今日 A 股{m.get('verdict', {}).get('label')}，"
        f"上证指数 {sh['pct']:+.2f}% 收于 {sh['price']:.2f}，" if sh else "今日 A 股"
    )
    if sh:
        summary += (
            f"全市场 {b.get('up', 0)} 家上涨、{b.get('down', 0)} 家下跌，"
            f"涨停 {b.get('limit_up', 0)} 家、跌停 {b.get('limit_down', 0)} 家，"
            f"成交额约 {turnover / 1e8:.0f} 亿元。" if turnover else ""
        )
    else:
        summary = "今日 A 股"
        summary += f"全市场 {b.get('up', 0)} 家上涨、{b.get('down', 0)} 家下跌。"
    if top:
        summary += f"领涨行业：{'、'.join(x['name'] for x in top[:3])}。"
    if bottom:
        tag = "领跌行业" if (bottom[0].get("pct") or 0) < 0 else "行业靠后"
        summary += f"{tag}：{'、'.join(x['name'] for x in bottom[:2])}。"
    summary += f"市场温度 {m.get('score')}，建议总仓位 {adv['target_low']}%–{adv['target_high']}%。"

    result = {
        "date": time.strftime("%Y-%m-%d"),
        "ts": time.time(),
        "status": m.get("status"),
        "indices": idx,
        "breadth": b,
        "turnover": turnover,
        "sectors": {"top": top, "bottom": bottom, "concepts": (m.get("sectors") or {}).get("concepts", [])},
        "score": m.get("score"),
        "verdict": m.get("verdict"),
        "summary": summary,
        "levels": _index_levels(),
        "advice": adv,
        "hot": state.hot_board(),
        "industry_trends": state.industry_trends(8),
        "news": state.market_news(12),
    }
    db.cache_set("market:daily:v3", result)
    return result
