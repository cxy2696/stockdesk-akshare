"""Chip distribution (筹码分布) and Fibonacci retracement levels (黄金分割)."""
from __future__ import annotations

from . import db, market


def _rows(code: str, days: int) -> list[dict]:
    kl = market.klines(code, period="daily", limit=max(days + 30, 160), adjust="")
    return kl[-days:] if len(kl) > days else kl


def _vwap(rows: list[dict]) -> float | None:
    vol = sum((r.get("volume") or 0) for r in rows)
    if vol <= 0:
        return None
    return sum((((r["high"] + r["low"] + r["close"]) / 3) * (r.get("volume") or 0)) for r in rows) / vol


def _chip_analysis(rows: list[dict], current: float, avg_cost: float, profit: float,
                   concentration: float, support: float, resistance: float,
                   cost_low: float, cost_high: float, peak: float) -> dict:
    premium = (current / avg_cost - 1) * 100 if avg_cost else 0
    sup_dist = (support / current - 1) * 100 if current else 0
    res_dist = (resistance / current - 1) * 100 if current else 0
    v60 = _vwap(rows[-60:])
    v120 = _vwap(rows)
    migration = (v60 / v120 - 1) * 100 if v60 and v120 else 0
    if concentration < 12:
        conc_label = "高度集中"
    elif concentration < 22:
        conc_label = "较为集中"
    else:
        conc_label = "相对分散"

    score = 50 + (profit - 50) * 0.35 + max(-20, min(20, premium * 1.2)) + max(-12, min(12, migration * 1.5))
    score = round(max(0, min(100, score)), 0)
    if score >= 62:
        verdict, tone = "筹码偏多", "up"
    elif score >= 42:
        verdict, tone = "筹码中性", "flat"
    else:
        verdict, tone = "筹码偏空", "down"

    comments = [
        f"获利比例 {profit:.1f}%，当前{'获利盘占优，注意高位兑现压力' if profit >= 70 else ('套牢盘较重，反弹会遇到解套抛压' if profit <= 30 else '获利盘与套牢盘相对均衡')}。",
        f"现价较平均成本 {premium:+.1f}%（平均成本 {avg_cost:.2f} 元），{'持仓者整体浮盈' if premium >= 0 else '持仓者整体浮亏'}。",
        f"90% 筹码位于 {cost_low:.2f} ~ {cost_high:.2f} 元，集中度 {concentration:.1f}%（{conc_label}），{'筹码峰较窄，突破后容易形成一致方向' if concentration < 22 else '筹码分布较散，上方套牢盘需要时间消化'}。",
        f"最近压力 {resistance:.2f} 元（{res_dist:+.1f}%），最近支撑 {support:.2f} 元（{sup_dist:+.1f}%）。",
        f"筹码峰在 {peak:.2f} 元，现价位于峰{'上方，峰位可视为回踩支撑' if current >= peak else '下方，峰位是反弹需要消化的套牢区'}。",
        f"近 60 日筹码成本{'上移' if migration > 1 else ('下移' if migration < -1 else '基本平稳')} {migration:+.1f}%，{'资金在更高位置换手' if migration > 1 else ('低成本筹码仍在，抛压相对有限' if migration < -1 else '持仓成本稳定')}。",
    ]
    return {
        "score": score,
        "verdict": verdict,
        "tone": tone,
        "premium": round(premium, 2),
        "support_distance": round(sup_dist, 2),
        "resistance_distance": round(res_dist, 2),
        "concentration_label": conc_label,
        "migration": round(migration, 2),
        "peak": round(peak, 2),
        "comments": comments,
    }


def chips(code: str, days: int = 120, buckets: int = 56) -> dict:
    """Volume-by-price distribution with exponential aging.

    Older bars matter less (half-life = 45 trading days), like most 筹码 tools.
    """
    key = f"chip:{code}:{days}"
    cached = db.cache_get(key, 300)
    if cached:
        return cached
    rows = _rows(code, days)
    if not rows:
        return {}
    current = rows[-1]["close"]
    lo = min(r["low"] for r in rows if r["low"])
    hi = max(r["high"] for r in rows if r["high"])
    if hi <= lo:
        hi = lo * 1.001
    step = (hi - lo) / buckets
    dist = [0.0] * buckets
    centers = [lo + step * (i + 0.5) for i in range(buckets)]
    n = len(rows)
    for idx, r in enumerate(rows):
        age = n - 1 - idx
        w = 0.5 ** (age / 45.0)
        b_lo = int((r["low"] - lo) / step)
        b_hi = int((r["high"] - lo) / step)
        b_lo = max(0, min(buckets - 1, b_lo))
        b_hi = max(0, min(buckets - 1, b_hi))
        span = b_hi - b_lo + 1
        per = (r.get("volume") or 0) * w / span
        for b in range(b_lo, b_hi + 1):
            dist[b] += per
    total = sum(dist) or 1
    avg_cost = sum(c * w for c, w in zip(centers, dist)) / total
    profit = sum(w for c, w in zip(centers, dist) if c <= current) / total * 100
    # 90% cost range
    order = sorted(range(buckets), key=lambda i: dist[i])
    acc, keep = 0.0, set()
    for i in order:
        keep.add(i)
        acc += dist[i]
        if acc / total >= 0.9:
            break
    p_low = min(centers[i] for i in keep)
    p_high = max(centers[i] for i in keep)
    below = [(centers[i], dist[i]) for i in range(buckets) if centers[i] <= current]
    above = [(centers[i], dist[i]) for i in range(buckets) if centers[i] > current]
    support = max(below, key=lambda x: x[1])[0] if below else lo
    resistance = max(above, key=lambda x: x[1])[0] if above else hi
    peak = centers[max(range(buckets), key=lambda i: dist[i])]
    analysis = _chip_analysis(rows, current, avg_cost, profit, (p_high - p_low) / ((p_high + p_low) / 2) * 100,
                              support, resistance, p_low, p_high, peak)
    result = {
        "code": code,
        "days": len(rows),
        "current": round(current, 2),
        "avg_cost": round(avg_cost, 2),
        "profit_ratio": round(profit, 1),
        "concentration": round((p_high - p_low) / ((p_high + p_low) / 2) * 100, 1),
        "cost_low": round(p_low, 2),
        "cost_high": round(p_high, 2),
        "support": round(support, 2),
        "resistance": round(resistance, 2),
        "range": [round(lo, 2), round(hi, 2)],
        "peak": round(peak, 2),
        "analysis": analysis,
        "buckets": [
            {"price": round(c, 2), "weight": round(w, 1), "pct": round(w / total * 100, 2)}
            for c, w in zip(centers, dist)
        ],
    }
    db.cache_set(key, result)
    return result


# ratio, name, note, action
RATIOS = [
    (0.0, "前高", "放量突破前高可看新高；若冲高回落，注意假突破", "突破买入 / 冲高减仓"),
    (0.236, "0.236", "强势回踩位；跌破说明短线动能减弱", "持有 / 跌破减仓"),
    (0.382, "0.382", "常见浅回撤支撑，企稳可关注", "低吸关注"),
    (0.5, "0.5", "多空分水岭，得失决定短期方向", "观望"),
    (0.618, "0.618", "黄金分割核心支撑，缩量企稳可分批关注", "分批低吸"),
    (0.786, "0.786", "最后防线，跌破通常意味着趋势转弱", "跌破止损"),
    (1.0, "前低", "跌破前低视为趋势破坏，注意止损", "止损离场"),
]


def fibonacci(code: str, days: int = 120) -> dict:
    key = f"fib:{code}:{days}"
    cached = db.cache_get(key, 300)
    if cached:
        return cached
    rows = _rows(code, days)
    if not rows:
        return {}
    current = rows[-1]["close"]
    lo = min(r["low"] for r in rows if r["low"])
    hi = max(r["high"] for r in rows if r["high"])
    span = hi - lo
    if span <= 0:
        return {}
    levels = []
    for ratio, name, note, action in RATIOS:
        price = hi - span * ratio
        kind = "支撑" if price <= current else "压力"
        dist = (price / current - 1) * 100 if current else 0
        levels.append({
            "ratio": ratio,
            "name": name,
            "price": round(price, 2),
            "kind": kind,
            "distance": round(dist, 2),
            "note": note,
            "action": action,
        })
    # trend context
    closes = [r["close"] for r in rows]
    ma20 = sum(closes[-20:]) / min(20, len(closes))
    ma60 = sum(closes[-60:]) / min(60, len(closes))
    # RSI14
    gains = losses = 0.0
    for i in range(max(1, len(closes) - 14), len(closes)):
        ch = closes[i] - closes[i - 1]
        gains += max(ch, 0)
        losses += max(-ch, 0)
    rsi = 100.0 if losses == 0 else 100 - 100 / (1 + (gains / 14) / (losses / 14))
    if current > ma20 > ma60:
        trend = "多头排列"
    elif current < ma20 < ma60:
        trend = "空头排列"
    else:
        trend = "震荡整理"

    position = (current - lo) / span
    if position >= 0.764:
        zone = "高位区"
        advice = "接近前高，追高性价比低；回踩 0.382/0.5 且缩量企稳再考虑"
    elif position >= 0.5:
        zone = "中高位"
        advice = "处于回撤中继，关注 0.5 与 0.618 的支撑力度"
    elif position >= 0.236:
        zone = "中低位"
        advice = "已回吐较多涨幅，等待 0.618 附近企稳信号，跌破 0.786 需谨慎"
    else:
        zone = "低位区"
        advice = "接近前低，趋势偏弱；仅在前低附近出现放量止跌时再关注"
    return {
        "code": code,
        "days": len(rows),
        "current": round(current, 2),
        "low": round(lo, 2),
        "high": round(hi, 2),
        "position": round(position * 100, 1),
        "zone": zone,
        "advice": advice,
        "levels": levels,
        "trend": trend,
        "ma20": round(ma20, 2),
        "ma60": round(ma60, 2),
        "rsi": round(rsi, 1),
        "disclaimer": "黄金分割与筹码分布均为技术参考，不构成投资建议。",
    }
