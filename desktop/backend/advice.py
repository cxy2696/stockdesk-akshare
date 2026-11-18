"""Position-sizing advice derived from the account and the market regime.

The wording is deliberately written like a desk note: short sentences, concrete
numbers, no "the system automatically generated" boilerplate.
"""
from __future__ import annotations

from . import db, factors, portfolio, state


def _target_range(score: float) -> tuple[int, int]:
    if score >= 70:
        return 70, 85
    if score >= 58:
        return 60, 75
    if score >= 45:
        return 45, 60
    if score >= 32:
        return 30, 45
    return 15, 30


def _portfolio_plan(summary: dict, low: int, high: int, single_cap: int) -> dict:
    """Build a factor-based model portfolio and concrete rebalance orders.

    The selection is deliberately mechanical and traceable: top cross-sectional
    factor scores, at most five names, at most two per industry, with the
    market-regime target position split equally.  It is a research suggestion,
    not an order; every row carries its data source and reason.
    """
    try:
        snap = factors.snapshot(limit=120)
    except Exception:
        snap = {}
    rows = snap.get("stocks") or []
    if not snap.get("ready") or not rows:
        return {"recommended": [], "rebalance": [], "recommend_method": "因子快照暂不可用", "recommend_asof": snap.get("date")}

    model = db.cache_get("market:models:v9") or {}
    focus = {str(x.get("name")) for x in (model.get("industry_focus") or []) if x.get("name")}

    def rank(row):
        industry = str(row.get("industry") or "")
        return (1 if industry in focus else 0, float(row.get("score") or 0))

    ordered = sorted(rows, key=rank, reverse=True)
    # Do not propose buying a stock already locked at the limit; it is not an
    # executable price and would overstate the model's entry quality.
    liquid = [r for r in ordered if abs(float(r.get("pct") or 0)) < 9.5]
    if len(liquid) >= 5:
        ordered = liquid
    picked = []
    per_industry: dict[str, int] = {}
    for row in ordered:
        code = str(row.get("code") or "")
        industry = str(row.get("industry") or "未分类")
        # Sina full-market fallback has no industry field.  Do not collapse all
        # of those names into one bucket; only enforce the two-per-industry cap
        # when the classification is actually known.
        bucket = industry if industry and industry != "未分类" else f"unknown:{code}"
        if not code or per_industry.get(bucket, 0) >= 2:
            continue
        picked.append(row)
        per_industry[bucket] = per_industry.get(bucket, 0) + 1
        if len(picked) >= 5:
            break

    target_total = round((low + high) / 2, 1)
    per_weight = round(min(float(single_cap), target_total / max(1, len(picked))), 1)
    selected: dict[str, dict] = {}
    recommended = []
    for row in picked:
        code = str(row.get("code"))
        selected[code] = row
        recommended.append({
            "code": code, "name": row.get("name") or code,
            "industry": row.get("industry") or "未分类",
            "price": row.get("price"), "pct": row.get("pct"),
            "score": row.get("score"), "percentile": row.get("percentile"),
            "target_weight": per_weight,
            "target_value": round(float(summary.get("total") or 0) * per_weight / 100, 2),
            "reason": f"因子分 {row.get('score')} / 百分位 {round(float(row.get('percentile') or 0) * 100)}%；"
                      f"{'行业关注；' if (row.get('industry') in focus) else ''}按目标仓位等权分配",
            "source": "横截面因子 + 行业关注",
        })

    positions = summary.get("positions") or []
    total = float(summary.get("total") or 0)
    held = {str(p.get("code")): p for p in positions}
    rebalance = []
    for code, p in held.items():
        target = per_weight if code in selected else 0.0
        cur = float(p.get("weight") or 0)
        delta = round(target - cur, 1)
        price = float(p.get("price") or 0)
        value = total * abs(delta) / 100
        qty = int(value / price / 100) * 100 if price > 0 else 0
        if delta < -1 and qty > int(p.get("qty") or 0):
            qty = int(p.get("qty") or 0)
        action = "加仓" if delta > 1 else "减仓" if delta < -1 else "持有"
        if action == "减仓" and target <= 0:
            action = "清仓/换出"
        rebalance.append({
            "code": code, "name": p.get("name") or code, "action": action,
            "current_weight": round(cur, 1), "target_weight": target,
            "delta_weight": delta, "delta_value": round(value, 2), "qty": qty,
            "price": round(price, 2),
            "reason": "在本次推荐组合内，按目标仓位平衡" if code in selected else "不在本次推荐组合，优先回笼现金/换入更高分标的",
            "source": "账户持仓 + 推荐组合",
        })
    for code, row in selected.items():
        if code in held:
            continue
        price = float(row.get("price") or 0)
        value = total * per_weight / 100
        qty = int(value / price / 100) * 100 if price > 0 else 0
        rebalance.append({
            "code": code, "name": row.get("name") or code, "action": "买入/建仓",
            "current_weight": 0.0, "target_weight": per_weight,
            "delta_weight": per_weight, "delta_value": round(value, 2), "qty": qty,
            "price": round(price, 2), "reason": "推荐组合新标的，按目标权重建仓",
            "source": "横截面因子 + 行业关注",
        })
    rebalance.sort(key=lambda x: (x["action"] == "持有", x["action"].startswith("买入"), -abs(x["delta_weight"])))
    return {
        "recommended": recommended,
        "rebalance": rebalance,
        "target_total": target_total,
        "target_cash": round(100 - target_total, 1),
        "recommend_method": "横截面因子前 5（行业关注优先、单行业最多 2 只）+ 市场状态目标仓位；单票不超过 "
                            f"{single_cap}%；目标总仓位取建议区间中值 {target_total}%。",
        "recommend_asof": snap.get("date"),
    }


def position_advice() -> dict:
    s = portfolio.summary()
    m = state.market_state()
    score = m.get("score") or 50
    low, high = _target_range(score)

    trend = {}
    metrics = {}
    try:
        curve = portfolio.equity_curve()
        trend = curve.get("trend") or {}
        metrics = curve.get("metrics") or {}
    except Exception:
        pass
    dd = float(trend.get("dd_now") or 0)
    if dd <= -15:
        low -= 10
        high -= 10
    vol = float(metrics.get("volatility") or 0)
    if vol >= 30:
        low -= 5
        high -= 5
    low = max(10, min(90, low))
    high = max(low + 10, min(95, high))

    total = float(s.get("total") or 0)
    mv = float(s.get("market_value") or 0)
    cash = float(s.get("cash") or 0)
    cur = (mv / total * 100) if total else 0
    mid = (low + high) / 2
    gap = cur - mid
    positions = s.get("positions") or []
    top = max(positions, key=lambda p: p.get("weight") or 0) if positions else None
    top_w = float(top.get("weight") or 0) if top else 0
    single_cap = 25 if score >= 70 else (20 if score >= 45 else 15)

    if gap > 8:
        action, urgency = "减仓", ("高" if gap > 20 else "中")
    elif gap < -8:
        action, urgency = "加仓", ("高" if gap < -20 else "中")
    else:
        action, urgency = "持有", "低"

    verdict = m.get("verdict", {}).get("label") or "震荡"
    reasons = [
        f"市场温度 {score} 分，属于{verdict}环境，对应总仓位 {low}%–{high}%。",
        f"你现在仓位 {cur:.1f}%，持仓市值 {mv:,.0f} 元，可用现金 {cash:,.0f} 元。",
    ]
    if trend.get("label"):
        reasons.append(f"{trend['label']}，账户当前回撤 {dd:.2f}%。")
    if top:
        reasons.append(f"第一大持仓是{top.get('name')}，占 {top_w:.1f}%，单票上限先按 {single_cap}% 控。")

    warnings = []
    if top_w > single_cap:
        warnings.append(f"{top.get('name')} 权重 {top_w:.1f}%，已经超过 {single_cap}% 的单票上限，建议分两批降下来。")
    if 0 < len(positions) < 3:
        warnings.append("持仓少于 3 只，一只票出问题就会明显拖累账户，考虑再分散一点。")
    if len(positions) > 10:
        warnings.append("持仓超过 10 只，跟踪成本太高，弱逻辑的可以合并掉。")
    if total and cash / total * 100 < 8:
        warnings.append("现金不到 8%，回撤时没有补仓和周转的余地。")
    losers = [p for p in positions if (p.get("total_pnl_pct") or 0) <= -15]
    for p in losers[:3]:
        warnings.append(f"{p.get('name')} 累计亏损 {p.get('total_pnl_pct'):.1f}%，先看有没有跌破支撑，跌破就按纪律处理。")

    risk_positions = []
    for p in positions:
        price, sup = p.get("price"), p.get("support")
        if price and sup and price < sup:
            risk_positions.append({
                "code": p.get("code"), "name": p.get("name"), "price": price,
                "support": sup, "loss_pct": p.get("total_pnl_pct"),
            })
    if risk_positions:
        warnings.append(f"{len(risk_positions)} 只持仓跌破最近支撑：" + "、".join(x["name"] for x in risk_positions[:4]) + "。")

    actions = []
    if action == "减仓":
        actions.append(f"把总仓位从 {cur:.0f}% 降到 {low}%–{high}%，先减权重超 {single_cap}% 和跌破支撑的。")
        actions.append("减出来的钱先放现金，不急着换股；等市场温度回到 55 以上再考虑进攻。")
    elif action == "加仓":
        actions.append(f"分 2–3 批把仓位从 {cur:.0f}% 提到 {low}%–{high}%，单次别超过 10% 仓位。")
        actions.append("优先选均线多头、放量突破或刚出现九转买结构的票，涨停板上不追。")
    else:
        actions.append(f"仓位维持在 {low}%–{high}%，单票不超过 {single_cap}%，现金留 {100 - high}% 左右。")
    actions.append("跌破最近支撑的持仓设好止损；浮盈超过 15% 的，把止盈线往上移。")

    if action == "减仓":
        headline = f"仓位偏高，先降到 {low}%–{high}% 再谈进攻。"
    elif action == "加仓":
        headline = f"仓位偏低，可以分批加到 {low}%–{high}%，但别一次打满。"
    else:
        headline = f"仓位合适，维持 {low}%–{high}%，把精力放在选股和止损上。"

    return {
        "score": score,
        "regime": verdict,
        "current_pct": round(cur, 1),
        "target_low": low,
        "target_high": high,
        "target_mid": round(mid, 1),
        "gap": round(gap, 1),
        "action": action,
        "urgency": urgency,
        "single_cap": single_cap,
        "cash_floor": round(100 - high, 1),
        "headline": headline,
        "reasons": reasons,
        "warnings": warnings,
        "actions": actions,
        "risk_positions": risk_positions,
        **(_portfolio_plan(s, low, high, single_cap)),
        "updated": m.get("ts"),
    }
