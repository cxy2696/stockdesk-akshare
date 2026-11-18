"""Buy/sell plans, good/bad ratings and a market forecast.

This module is the bridge between the raw market/model endpoints and the
decision page.  It deliberately keeps every number traceable:

* the **market forecast** comes from the HMM transition matrix and the
  per-state return/volatility statistics (a regime-conditional estimate);
* a **stock plan** comes from price/MA/ATR/support/resistance/TD/flow;
* the **rating** is a transparent rules table, not a black box.

Nothing here places an order or promises a price.  A plan is a checklist:
buy zone, stop, target, risk/reward and the reason for the judgement.
"""
from __future__ import annotations

import math
import random
import statistics
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any

from . import db, market, models, state, td

CACHE_TTL = 300
# Only the best pre-scores get an expensive 160-bar K-line check.  The table
# returns at most 24 rows, so 32 covers the display with a small failure
# buffer; scanning all 80 made the first decision/forecast paint wait on 80
# serialised quote requests.
SHORTLIST_LIMIT = 32
MAX_CANDIDATES = 24
# Cap the K-line verification wall time.  A slow quote host must not keep the
# page on a skeleton for minutes; whatever finished is returned and the rest
# is reported as pending.  The 8-worker pool continues in the background.
SCAN_DEADLINE_S = 18.0
PLAN_LABELS = {
    "执行": "状态与趋势允许，可按计划分批",
    "确认": "方向成立但尚未完全确认，等回调或小仓",
    "预警": "评分靠前但受市场/位置约束，先观察",
    "观察": "未形成可执行结构，暂不操作",
}
RATING_TEXT = {
    "好": "评分、趋势与结构共振",
    "中": "有优势也有不确定",
    "差": "趋势或风险结构偏弱",
}


def _num(v: Any) -> float | None:
    try:
        x = float(v)
        return x if math.isfinite(x) else None
    except (TypeError, ValueError):
        return None


def _clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def _normal_cdf(x: float) -> float:
    try:
        return statistics.NormalDist().cdf(x)
    except Exception:
        return 0.5


def _market_context() -> dict:
    """Prefer the already-computed full market state, else use the light one.

    The full state fetches five index K-line histories and two board lists.
    Decision/forecast only need the verdict, score, breadth and turnover; when
    the daily page has not populated the full cache yet, the light state gives
    those fields immediately instead of blocking the page on the K-line host.
    """
    try:
        # A full snapshot up to half an hour old is still a better context
        # than a light state that may have no cached breadth at all; the daily
        # page refreshes it every two minutes in normal use.
        cached = db.cache_get("market:state:v2", 1800)
        if cached:
            return cached
        return state.market_state(light=True)
    except Exception:
        return {}


def _model_context() -> dict:
    try:
        return models.model_snapshot()
    except Exception:
        return {}


def market_forecast(ctx: dict | None = None, snap: dict | None = None) -> dict:
    """HMM-conditional five-day market forecast.

    ``stats.mean`` is the historical daily log return in percent for each
    state.  Multiplying by five is an estimate, not a promise.  The five-day
    state distribution is obtained from P^5, then the state means are mixed.

    ``ctx``/``snap`` let a caller that already fetched the market state or the
    model snapshot reuse them instead of paying for the same cached work twice.
    """
    if ctx is None:
        ctx = _market_context()
    if snap is None:
        snap = _model_context()
    hmm = (snap or {}).get("hmm") or {}
    fallback = {
        "state": (ctx.get("verdict") or {}).get("label") or "震荡",
        "score": ctx.get("score"),
        "expected_5d": None,
        "prob_up": None,
        "confidence": None,
        "next_probs": [],
        "states": [],
        "method": "market-regime fallback",
        "caveat": "HMM 尚未就绪；当前只显示市场温度，不生成收益预测。",
    }
    if not hmm or not hmm.get("stats"):
        return fallback

    labels = [str(x.get("label")) for x in hmm.get("stats") or []]
    stats = hmm.get("stats") or []
    probs = {str(x.get("label")): float(x.get("p") or 0) for x in hmm.get("probabilities") or []}
    p = [max(0.0, probs.get(label, 0.0)) for label in labels]
    total = sum(p)
    p = [x / total for x in p] if total > 0 else [1 / max(1, len(labels))] * len(labels)

    # transition[from].to is a list in label order.
    A = []
    trans = {str(x.get("from")): [float(v) for v in (x.get("to") or [])] for x in hmm.get("transition") or []}
    for label in labels:
        row = trans.get(label) or [1 / max(1, len(labels))] * len(labels)
        row = [max(0.0, x) for x in row]
        s = sum(row)
        A.append([x / s for x in row] if s > 0 else [1 / max(1, len(labels))] * len(labels))
    if len(A) != len(labels):
        A = [[1 / max(1, len(labels))] * len(labels) for _ in labels]

    def matmul(a, b):
        return [[sum(a[i][k] * b[k][j] for k in range(len(b))) for j in range(len(b))] for i in range(len(a))]

    P5 = [row[:] for row in A]
    for _ in range(4):
        P5 = matmul(P5, A)
    p5 = [sum(p[i] * P5[i][j] for i in range(len(p))) for j in range(len(labels))]

    states = []
    exp_num = 0.0
    exp_den = 0.0
    var_num = 0.0
    for i, s in enumerate(stats):
        mean_d = _num(s.get("mean")) or 0.0
        vol_d = _num(s.get("vol")) or 0.0
        mean5 = mean_d * 5 / 100.0
        vol5 = vol_d * math.sqrt(5) / 100.0
        exp_num += p5[i] * mean5
        exp_den += p5[i]
        var_num += p5[i] * (vol5 ** 2 + mean5 ** 2)
        states.append({
            "label": labels[i],
            "mean_5d": round(mean5, 5),
            "vol_5d": round(vol5, 5),
            "win_rate": s.get("win_rate"),
            "days": s.get("days"),
            "next_prob": round(p5[i], 4),
            "confidence": round(p[i], 4),
        })
    expected = exp_num / exp_den if exp_den > 0 else None
    variance = max(1e-12, var_num / exp_den - (expected or 0) ** 2) if exp_den > 0 else None
    prob = _normal_cdf((expected or 0.0) / math.sqrt(variance)) if expected is not None and variance else None
    return {
        "state": hmm.get("state") or fallback["state"],
        "score": ctx.get("score"),
        "expected_5d": round(expected, 5) if expected is not None else None,
        "prob_up": round(prob, 4) if prob is not None else None,
        "confidence": hmm.get("confidence"),
        "next_probs": sorted(
            [{"label": x["label"], "p": x["next_prob"], "mean_5d": x["mean_5d"],
              "win_rate": x["win_rate"], "days": x["days"]} for x in states],
            key=lambda x: -x["p"],
        ),
        "states": states,
        "method": "HMM transition^5 × state daily mean",
        "caveat": "状态条件估算，不是点位预测；样本/状态质量不足时只作弱参考。",
        "updated": time.time(),
    }


def _plan_from_klines(code: str, name: str, price: float, rows: list[dict],
                      quote: dict | None = None, pattern_score: float | None = None,
                      signals: list[dict] | None = None, market_label: str | None = None) -> dict:
    closes = [float(r["close"]) for r in rows if _num(r.get("close"))]
    highs = [float(r["high"]) for r in rows if _num(r.get("high"))]
    lows = [float(r["low"]) for r in rows if _num(r.get("low"))]
    if len(closes) < 30 or price <= 0:
        return {
            "code": code, "name": name, "price": price, "rating": "中",
            "action": "观察", "tier": "观察", "tier_text": PLAN_LABELS["观察"],
            "buy_zone": [None, None], "stop": None, "target": None, "risk_reward": None,
            "reasons": ["历史不足 30 个交易日，暂不生成买卖点。"],
            "risk_notes": ["数据不足"],
        }
    ma20 = sum(closes[-20:]) / 20
    ma60 = sum(closes[-60:]) / 60 if len(closes) >= 60 else None
    pct20 = (price / closes[-21] - 1) * 100 if len(closes) > 21 else 0.0
    pct5 = (price / closes[-6] - 1) * 100 if len(closes) > 6 else 0.0
    trs = []
    for i in range(max(1, len(closes) - 14), len(closes)):
        tr = max(highs[i] - lows[i], abs(highs[i] - closes[i - 1]), abs(lows[i] - closes[i - 1]))
        trs.append(tr)
    atr = (sum(trs) / len(trs) / price) if trs else 0.025
    support = min(lows[-20:]) if len(lows) >= 20 else price * 0.94
    resistance = max(highs[-20:]) if len(highs) >= 20 else price * 1.06
    q = quote or {}
    rsi = _num(q.get("rsi"))
    if rsi is None:
        gains = losses = 0.0
        for i in range(len(closes) - 14, len(closes)):
            ch = closes[i] - closes[i - 1]
            gains += max(ch, 0)
            losses += max(-ch, 0)
        rsi = 100.0 if losses == 0 else 100 - 100 / (1 + gains / losses)

    # Technical structure score, 0-100.
    score = 50.0
    if price > ma20:
        score += 9
    if ma60 and ma20 > ma60:
        score += 9
    if ma60 and price < ma60:
        score -= 8
    score += _clamp(pct20 / 3, -10, 10)
    if 35 <= rsi <= 62:
        score += 5
    elif rsi >= 78:
        score -= 10
    elif rsi <= 28:
        score -= 3
    if pattern_score is not None:
        score = max(score, 0.7 * float(pattern_score) + 0.3 * score)
    td_data = td.td_sequence(closes, highs if len(highs) == len(closes) else None,
                             lows if len(lows) == len(closes) else None)
    td_buy = int((td_data.get("buy") or {}).get("count") or 0)
    td_sell = int((td_data.get("sell") or {}).get("count") or 0)
    if td_buy >= 7:
        score += 4
    if td_sell >= 7:
        score -= 5
    score = _clamp(score, 0, 100)

    trend_up = bool(ma60 and price > ma20 > ma60)
    trend_down = bool(ma60 and price < ma20 < ma60)

    # Buy zone: support/MA20 as lower reference, current price cap.
    low = max(support, price * (1 - _clamp(atr * 0.8, 0.02, 0.06)))
    buy_low = min(low, price * 0.995)
    buy_high = min(price * 1.02, max(price, buy_low * 1.015))
    raw_stop = min(support * 0.985, price * (1 - _clamp(atr * 2.2, 0.03, 0.10)))
    stop = max(raw_stop, price * 0.90)
    stop = min(stop, price * 0.985)
    target_raw = max(resistance, price * (1 + _clamp(atr * 4.0, 0.06, 0.20)))
    target = max(price * 1.03, min(target_raw, price * 1.20))
    rr = (target - price) / max(1e-9, price - stop)

    extended = pct20 > 30 or price > ma20 * 1.18
    weak_market = str(market_label or "") in ("弱势", "偏弱")
    severe = (td_sell >= 7) or (rsi >= 78) or (price < support * 0.97) or (rr < 1.0)
    good = (score >= 66 and not trend_down and not severe and rr >= 1.5
            and pct20 < 30 and not extended)
    bad = score < 44 or trend_down or td_sell >= 9 or rr < 0.9
    rating = "好" if good else "差" if bad else "中"
    if rating == "好":
        action = "等待企稳" if weak_market else ("回调买入" if pct5 > 5 else "买入")
    elif rating == "中":
        action = "观察"
    else:
        action = "回避" if (td_sell >= 9 or trend_down) else "减仓/回避"
    if rating == "好":
        tier = "确认" if (weak_market or extended) else "执行"
    elif rating == "中" and score >= 55:
        tier = "预警"
    else:
        tier = "观察"

    reasons = []
    reasons.append(f"价格 {price:.2f}，MA20 {ma20:.2f}" + (f"，MA60 {ma60:.2f}" if ma60 else ""))
    reasons.append(f"20 日涨跌 {pct20:+.1f}%，RSI {rsi:.0f}，趋势{'向上' if trend_up else '向下' if trend_down else '震荡'}")
    if pattern_score is not None:
        reasons.append(f"形态扫描评分 {pattern_score:.0f}")
    if td_buy:
        reasons.append(f"九转买入结构 {td_buy}/9")
    if td_sell:
        reasons.append(f"九转卖出结构 {td_sell}/9")
    if (q.get("main_inflow") or 0) > 0:
        reasons.append("主力资金净流入")
    risk_notes = []
    if rsi >= 75:
        risk_notes.append("RSI 偏高，追高风险")
    if price < ma20:
        risk_notes.append("价格在 MA20 下方")
    if trend_down:
        risk_notes.append("均线空头排列")
    if td_sell >= 7:
        risk_notes.append("九转卖出结构接近完成")
    if extended:
        risk_notes.append("20 日涨幅偏大/偏离 MA20，追高风险")
    if rr < 1.5:
        risk_notes.append(f"盈亏比仅 {rr:.1f}，不足 1.5")
    if not risk_notes:
        risk_notes.append("暂无硬性风险，但仍需按止损执行")

    return {
        "code": code, "name": name, "price": round(price, 2),
        "rating": rating, "rating_text": RATING_TEXT[rating],
        "action": action, "tier": tier, "tier_text": PLAN_LABELS[tier],
        "score": round(score, 1), "buy_zone": [round(buy_low, 2), round(buy_high, 2)],
        "stop": round(stop, 2), "target": round(target, 2), "risk_reward": round(rr, 2),
        "support": round(support, 2), "resistance": round(resistance, 2),
        "ma20": round(ma20, 2), "ma60": round(ma60, 2) if ma60 else None,
        "rsi": round(rsi, 1), "pct5": round(pct5, 2), "pct20": round(pct20, 2),
        "atr_pct": round(atr * 100, 2), "td_buy": td_buy, "td_sell": td_sell,
        "reasons": reasons, "risk_notes": risk_notes,
        "summary": (f"{rating} · {action}；买区 {buy_low:.2f}-{buy_high:.2f}，"
                    f"止损 {stop:.2f}，目标 {target:.2f}，盈亏比 {rr:.1f}。"),
        "updated": time.time(),
    }


def stock_plan(code: str) -> dict:
    code = str(code).strip()
    key = f"decision:stock:v2:{code}"
    cached = db.cache_get(key, CACHE_TTL)
    if cached:
        return cached
    q = market.quote(code) or {}
    name = q.get("name") or market.resolve_name(code)
    price = _num(q.get("price")) or 0.0
    rows = market.klines(code, limit=160, adjust="qfq")
    if not rows:
        return {"code": code, "name": name, "price": price, "rating": "中",
                "action": "观察", "tier": "观察", "tier_text": PLAN_LABELS["观察"],
                "buy_zone": [None, None], "stop": None, "target": None,
                "risk_reward": None, "reasons": ["没有取到日线，暂不生成买卖点。"],
                "risk_notes": ["行情不可用"]}
    price = price or float(rows[-1]["close"])
    market_label = ((_market_context().get("verdict") or {}).get("label"))
    plan = _plan_from_klines(code, name, price, rows, q, market_label=market_label)
    db.cache_set(key, plan)
    return plan


def _pick_plan(pick: dict, market_ctx: dict) -> dict:
    plan = dict(pick)
    plan.pop("_rows", None)
    plan.pop("_quote", None)
    code = str(pick.get("code") or "")
    price = _num(pick.get("price")) or 0.0
    rows = pick.get("_rows") or []
    if rows:
        p = _plan_from_klines(code, pick.get("name") or code, price, rows, pick.get("_quote"),
                              pick.get("score"), pick.get("signals"),
                              (market_ctx.get("verdict") or {}).get("label"))
        p["signals"] = pick.get("signals") or []
        p["industry"] = pick.get("industry")
        p["pct"] = pick.get("pct")
        p["score"] = max(float(p.get("score") or 0), float(pick.get("score") or 0))
        plan.update(p)
    else:
        plan.update({
            "rating": "中" if (pick.get("score") or 0) >= 55 else "差",
            "action": "观察",
            "tier": "预警" if (pick.get("score") or 0) >= 60 else "观察",
            "tier_text": PLAN_LABELS["预警" if (pick.get("score") or 0) >= 60 else "观察"],
            "buy_zone": [None, None],
            "stop": None,
            "target": None,
            "risk_reward": None,
            "reasons": [s.get("reason") for s in (pick.get("signals") or []) if s.get("reason")],
            "risk_notes": ["仅有形态信号，未取到日线结构"],
        })
    return plan


def _spot_rows() -> list[dict]:
    try:
        spot = market.fetch_spot(ttl=300)
    except Exception:
        spot = {}
    rows = []
    for r in spot.get("rows") or []:
        name = str(r.get("name") or "")
        if not r.get("code") or not r.get("price") or (r.get("price") or 0) <= 0:
            continue
        if "ST" in name.upper() or "退" in name:
            continue
        if (r.get("amount") or 0) < 1e7:
            continue
        rows.append(r)
    return rows


def _pre_score(r: dict) -> float:
    """Fast full-market snapshot score used only to pick which random names get a K-line check.

    It is intentionally simple and shown in the response: momentum/flow/liquidity
    tilts, not a hidden model.  The final rating always comes from the K-line plan.
    """
    s = 50.0
    s += _clamp(float(r.get("pct60") or 0) / 4, -12, 12)
    s += _clamp(float(r.get("pct") or 0) / 3, -5, 5)
    s += _clamp((float(r.get("turnover") or 0) - 2) * 0.8, -4, 4)
    amount = float(r.get("amount") or 0)
    inflow = float(r.get("main_inflow") or 0)
    if amount > 0:
        s += _clamp(inflow / amount * 120, -6, 6)
    pe = _num(r.get("pe"))
    if pe is not None and pe > 0:
        s += _clamp((30 - pe) / 10, -4, 4)
    return round(max(0, min(100, s)), 1)


def _plan_for_spot(r: dict, market_label: str) -> dict | None:
    code = str(r.get("code") or "")
    if not code:
        return None
    try:
        rows = market.klines(code, limit=160, adjust="qfq")
        if len(rows) < 30:
            return None
        p = _plan_from_klines(code, r.get("name") or code, float(r.get("price") or rows[-1]["close"]),
                              rows, r, _pre_score(r), None, market_label)
        p["industry"] = r.get("industry")
        p["pct"] = r.get("pct")
        p["main_inflow"] = r.get("main_inflow")
        p["pre_score"] = _pre_score(r)
        p["sample"] = "random"
        p["trace"] = {"method": "random sample → spot pre-score → 160-bar K-line",
                      "bars": 160, "pre_score": _pre_score(r),
                      "rating_rule": "good≥66+RR≥1.5; bad<44/空头/九转卖9"}
        return p
    except Exception:
        return None


def overview(scan: int = 300, seed: int | None = None) -> dict:
    """Random-sample the whole A-share snapshot, then K-line-check the shortlist.

    ``scan`` is a custom sample size from 50 up to the full universe.  Sampling
    is random (seeded so a refresh can be reproduced); for very large samples
    only the top pre-score shortlist gets a full K-line plan so a full-A scan
    remains usable on a laptop.
    """
    rows = _spot_rows()
    total = len(rows)
    if total == 0:
        return {"ts": time.time(), "market": {}, "forecast": market_forecast(),
                "candidates": [], "scanned": 0, "universe_total": 0,
                "good_count": 0, "priority_note": "全市场快照不可用，请稍后重试。", "updated": time.time()}
    scan = max(30, min(int(scan or 300), total))
    if seed is None:
        seed = random.randrange(1, 2_000_000_000)
    rng = random.Random(seed)
    sample = rows if scan >= total else rng.sample(rows, scan)
    shortlist = sorted(sample, key=_pre_score, reverse=True)[:min(SHORTLIST_LIMIT, len(sample))]
    ctx = _market_context()
    label = (ctx.get("verdict") or {}).get("label") or "震荡"
    candidates: list[dict] = []
    ex = ThreadPoolExecutor(max_workers=8)
    futures = [ex.submit(lambda r=r: _plan_for_spot(r, label)) for r in shortlist]
    unfinished = 0
    try:
        for fut in as_completed(futures, timeout=SCAN_DEADLINE_S):
            try:
                p = fut.result()
            except Exception:
                p = None
            if p:
                candidates.append(p)
    except TimeoutError:
        pass
    finally:
        unfinished = sum(1 for f in futures if not f.done())
        for f in futures:
            f.cancel()
        ex.shutdown(wait=False, cancel_futures=True)
    rating_rank = {"好": 0, "中": 1, "差": 2}
    tier_rank = {"执行": 0, "确认": 1, "预警": 2, "观察": 3}
    candidates.sort(key=lambda c: (
        rating_rank.get(c.get("rating"), 9),
        tier_rank.get(c.get("tier"), 9),
        -(float(c.get("score") or 0)),
        -(float(c.get("risk_reward") or 0)),
    ))
    candidates = candidates[:MAX_CANDIDATES]
    out = {
        "ts": time.time(),
        "market": {
            "label": label,
            "score": ctx.get("score"),
            "breadth": ctx.get("breadth"),
            "turnover": ctx.get("turnover"),
        },
        "forecast": market_forecast(),
        "candidates": candidates,
        "scanned": scan,
        "universe_total": total,
        "all_total": len((market.fetch_spot(ttl=300) or {}).get("rows") or []),
        "sampled_all": scan >= total,
        "sample_seed": seed,
        "matched": len(candidates),
        "shortlist": len(shortlist),
        "partial": unfinished > 0,
        "pending": unfinished,
        "deadline_s": SCAN_DEADLINE_S,
        "method": "random.sample → snapshot pre-score → 160-bar K-line plan",
        "tier_guide": PLAN_LABELS,
        "rating_guide": RATING_TEXT,
        "good_count": sum(1 for c in candidates if c.get("rating") == "好"),
        "priority_note": "随机抽样 → 快照预分 → K线复核；按评级好→中→差、层级、评分、盈亏比排序。",
        "updated": time.time(),
    }
    return out


def forecast_overview() -> dict:
    """Fast market-forecast payload.

    The forecast page only needs the regime, the five-day distribution and the
    current market context.  It used to call ``overview`` just for those fields,
    which also scanned 300 stocks and fetched K-line histories; on a slow quote
    host that left the page on a skeleton for minutes.  This path keeps the
    same market/forecast contract without the candidate scan.
    """
    ctx = _market_context()
    # Never trigger a fresh full-market snapshot just to print a universe
    # count; use whatever is cached (the field is informational only).
    try:
        spot = market.cached_spot() or {}
    except Exception:
        spot = {}
    return {
        "ts": time.time(),
        "market": {
            "label": (ctx.get("verdict") or {}).get("label") or "震荡",
            "score": ctx.get("score"),
            "breadth": ctx.get("breadth"),
            "turnover": ctx.get("turnover"),
            "verdict": ctx.get("verdict"),
        },
        "forecast": market_forecast(ctx=ctx),
        "universe_total": len(spot.get("rows") or []),
        "method": "state.market_state → HMM transition^5",
        "updated": time.time(),
    }
