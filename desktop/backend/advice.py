"""Position-sizing advice derived from the account and the market regime."""
from __future__ import annotations

from . import portfolio, state


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

    reasons = [
        f"市场温度 {score}（{m.get('verdict', {}).get('label')}），对应建议总仓位 {low}%–{high}%。",
        f"当前仓位 {cur:.1f}%（持仓市值 {mv:,.0f} 元，可用现金 {cash:,.0f} 元）。",
    ]
    if trend.get("label"):
        reasons.append(f"{trend['label']}，当前回撤 {dd:.2f}%。")
    if top:
        reasons.append(f"第一大持仓 {top.get('name')} 占 {top_w:.1f}%，单票上限建议 {single_cap}%。")

    warnings = []
    if top_w > single_cap:
        warnings.append(f"{top.get('name')} 权重 {top_w:.1f}% 超过单票上限 {single_cap}%，建议分批降至 {single_cap}% 以内。")
    if len(positions) and len(positions) < 3:
        warnings.append("持仓少于 3 只，个股风险集中，建议适度分散。")
    if len(positions) > 10:
        warnings.append("持仓超过 10 只，跟踪成本偏高，可合并弱逻辑标的。")
    if cash / total * 100 < 8 if total else False:
        warnings.append("现金低于 8%，遇到回撤缺少补仓与机动空间。")
    losers = [p for p in positions if (p.get("total_pnl_pct") or 0) <= -15]
    for p in losers[:3]:
        warnings.append(f"{p.get('name')} 累计亏损 {p.get('total_pnl_pct'):.1f}%，检查是否已跌破支撑并执行止损纪律。")

    risk_positions = []
    for p in positions:
        price, sup = p.get("price"), p.get("support")
        if price and sup and price < sup:
            risk_positions.append({
                "code": p.get("code"), "name": p.get("name"), "price": price,
                "support": sup, "loss_pct": p.get("total_pnl_pct"),
            })
    if risk_positions:
        warnings.append(f"{len(risk_positions)} 只持仓已跌破最近支撑：" + "、".join(x["name"] for x in risk_positions[:4]) + "。")

    actions = []
    if action == "减仓":
        actions.append(f"将总仓位从 {cur:.0f}% 降至 {low}%–{high}%，优先减持权重超 {single_cap}% 或跌破支撑的标的。")
        actions.append("减仓资金先留作现金，不急于切换，等待市场温度回到 55 以上。")
    elif action == "加仓":
        actions.append(f"分 2–3 批将总仓位从 {cur:.0f}% 提升至 {low}%–{high}%，单次不超过 10% 仓位。")
        actions.append("优先选择均线多头、放量突破或九转买入信号，且不追涨停。")
    else:
        actions.append(f"维持总仓位 {low}%–{high}%，单票不超过 {single_cap}%，现金保留 {100 - high}% 左右。")
    actions.append("对跌破最近支撑的持仓设置止损；盈利超过 15% 的标的可上移止盈线。")

    return {
        "score": score,
        "regime": m.get("verdict", {}).get("label"),
        "current_pct": round(cur, 1),
        "target_low": low,
        "target_high": high,
        "target_mid": round(mid, 1),
        "gap": round(gap, 1),
        "action": action,
        "urgency": urgency,
        "single_cap": single_cap,
        "cash_floor": round(100 - high, 1),
        "reasons": reasons,
        "warnings": warnings,
        "actions": actions,
        "risk_positions": risk_positions,
        "updated": m.get("ts"),
    }
