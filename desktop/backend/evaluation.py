"""Walk-forward evaluation of the market-regime model.

The live models are useful only if they have been tested out of sample.  This
module refits the HMM on a rolling lookback window for every evaluation step,
turns the fitted state into the same five-day forecast used by the trading
decision page, and compares it with the return that actually followed.

Rules that keep the result honest:

* the HMM at date ``t`` sees bars only through ``t`` (no future leakage);
* the forward return is ``close[t + 5] / close[t] - 1``;
* the evaluation steps by five trading days, so holding periods do not
  overlap and the sample is not inflated by pseudo-replication;
* the hypothetical exposure is a fixed mapping of the state (with a small
  confidence tilt), not an optimised backtest parameter.

Results are cached for half an hour and refreshed in the background when
stale, because a cold run refits roughly 130-200 HMMs.
"""
from __future__ import annotations

import math
import threading
import time

import numpy as np

from . import db, decision, market, models

INDEXES = {
    "000300": ("沪深300", "1.000300"),
    "000001": ("上证指数", "1.000001"),
    "399006": ("创业板指", "0.399006"),
    "000688": ("科创50", "1.000688"),
}

LOOKBACK = 220
HORIZON = 5
STEP = 5
CACHE_TTL = 1800
CACHE_VERSION = "v4"

_LOCK = threading.Lock()
_REFRESHING: set[str] = set()


def _num(value, default=None):
    try:
        if value is None:
            return default
        out = float(value)
        return out if math.isfinite(out) else default
    except (TypeError, ValueError):
        return default


def _round(value, digits=4):
    value = _num(value)
    return round(value, digits) if value is not None else None


def _max_drawdown(curve: list[dict], key: str) -> float:
    peak = -math.inf
    worst = 0.0
    for point in curve:
        value = _num(point.get(key))
        if value is None:
            continue
        peak = max(peak, value)
        if peak > 0:
            worst = min(worst, value / peak - 1)
    return round(worst, 4)


def _state_exposure(state: str, prob_up: float | None) -> float:
    base = {"弱势": 0.20, "震荡": 0.60, "强势": 0.90}.get(state, 0.60)
    if prob_up is not None:
        base += (prob_up - 0.5) * 0.5
    return round(max(0.10, min(1.0, base)), 2)


def _compute(code: str, limit: int, lookback: int = LOOKBACK, horizon: int = HORIZON,
             step: int | None = None) -> dict:
    name, secid = INDEXES[code]
    step = max(1, int(step or horizon))
    try:
        rows = market.klines(code, limit=limit, adjust="", secid_override=secid)
    except Exception:
        rows = []
    if len(rows) < lookback + horizon + 20:
        return {
            "code": code, "name": name, "error": f"历史日线不足（{len(rows)} 根），至少需要 {lookback + horizon + 20} 根。",
            "ts": time.time(),
        }
    closes = [float(r["close"]) for r in rows if _num(r.get("close"))]
    dates = [str(r.get("date") or "")[:10] for r in rows]
    if len(closes) != len(dates):
        # Defensive: keep only rows that have a usable close.
        pairs = [(float(r["close"]), str(r.get("date") or "")[:10]) for r in rows if _num(r.get("close"))]
        closes = [p[0] for p in pairs]
        dates = [p[1] for p in pairs]
    n = len(closes)
    if n < lookback + horizon + 20:
        return {"code": code, "name": name, "error": "历史日线样本不足。", "ts": time.time()}

    records: list[dict] = []
    curve: list[dict] = [{"date": dates[lookback], "strategy": 1.0, "benchmark": 1.0}]
    equity = 1.0
    benchmark = 1.0
    prev_exposure: float | None = None
    engine = ""

    for i in range(lookback, n - horizon, step):
        window = np.asarray(closes[i - lookback:i + 1], dtype=float)
        rets = np.diff(np.log(window)) * 100.0
        try:
            hmm = models._hmm(rets)
        except Exception:
            hmm = None
        if not hmm:
            continue
        try:
            forecast = decision.market_forecast(ctx={"score": None}, snap={"hmm": hmm})
        except Exception:
            forecast = {}
        expected = _num(forecast.get("expected_5d"))
        prob_up = _num(forecast.get("prob_up"))
        confidence = _num(hmm.get("confidence"))
        state = str(hmm.get("state") or forecast.get("state") or "震荡")
        engine = str(hmm.get("engine") or engine)

        actual = closes[i + horizon] / closes[i] - 1.0
        if expected is not None:
            pred_up = expected > 0
        elif prob_up is not None:
            pred_up = prob_up >= 0.5
        else:
            pred_up = None
        actual_up = actual > 0
        hit = bool(pred_up == actual_up) if pred_up is not None else False

        exposure = _state_exposure(state, prob_up)
        cost = 0.0005 if prev_exposure is not None and abs(exposure - prev_exposure) > 0.01 else 0.0
        period_return = exposure * actual - cost
        equity *= 1.0 + period_return
        benchmark *= 1.0 + actual
        prev_exposure = exposure

        records.append({
            "date": dates[i],
            "state": state,
            "confidence": round(confidence, 4) if confidence is not None else None,
            "expected_5d": round(expected * 100, 2) if expected is not None else None,
            "prob_up": round(prob_up, 4) if prob_up is not None else None,
            "actual_5d": round(actual * 100, 2),
            "hit": hit,
            "exposure": exposure,
            "period_return": round(period_return, 6),
        })
        curve.append({
            "date": dates[i + horizon],
            "strategy": round(equity, 4),
            "benchmark": round(benchmark, 4),
        })

    if not records:
        return {"code": code, "name": name, "error": "没有可评估的样本（HMM 拟合全部失败）。", "ts": time.time()}

    directional = [r for r in records if r["expected_5d"] is not None or r["prob_up"] is not None]
    hits = sum(1 for r in directional if r["hit"])
    n_dir = len(directional)
    # Wilson interval: a 58% hit rate on 20 samples is not the same evidence as
    # 58% on 150 samples, and the UI should show that uncertainty.
    if n_dir:
        p_hat = hits / n_dir
        z = 1.959963984540054
        denom = 1 + z * z / n_dir
        center = (p_hat + z * z / (2 * n_dir)) / denom
        half = z * math.sqrt((p_hat * (1 - p_hat) + z * z / (4 * n_dir)) / n_dir) / denom
        hit_ci = [round(max(0.0, center - half), 3), round(min(1.0, center + half), 3)]
    else:
        hit_ci = None
    expected_values = [r["expected_5d"] for r in records if r["expected_5d"] is not None]
    actual_values = [r["actual_5d"] for r in records if r["expected_5d"] is not None]
    correlation = None
    if len(expected_values) >= 3 and np.std(expected_values) > 1e-12 and np.std(actual_values) > 1e-12:
        correlation = float(np.corrcoef(expected_values, actual_values)[0, 1])

    returns = [r["period_return"] for r in records]
    mean_return = float(np.mean(returns))
    std_return = float(np.std(returns, ddof=1)) if len(returns) > 1 else 0.0
    sharpe = mean_return / std_return * math.sqrt(244.0 / horizon) if std_return > 1e-12 else None
    total_return = equity - 1.0
    bench_return = benchmark - 1.0
    years = max(1e-9, len(records) * horizon / 244.0)
    annual = (1.0 + total_return) ** (1.0 / years) - 1.0 if total_return > -1 else -1.0

    by_state = []
    for label in ("弱势", "震荡", "强势"):
        subset = [r for r in records if r["state"] == label]
        if not subset:
            by_state.append({"state": label, "count": 0, "actual_avg": None, "hit_rate": None, "confidence": None})
            continue
        by_state.append({
            "state": label,
            "count": len(subset),
            "actual_avg": round(sum(r["actual_5d"] for r in subset) / len(subset), 2),
            "hit_rate": round(sum(1 for r in subset if r["hit"]) / len(subset), 3),
            "confidence": round(sum(r["confidence"] or 0 for r in subset) / len(subset), 3),
        })

    calibration = []
    for label, low, high in (("低（<45%）", 0.0, 0.45), ("中（45–55%）", 0.45, 0.55), ("高（≥55%）", 0.55, 1.01)):
        subset = [r for r in records if r["prob_up"] is not None and low <= r["prob_up"] < high]
        calibration.append({
            "bucket": label,
            "count": len(subset),
            "actual_up_rate": round(sum(1 for r in subset if r["actual_5d"] > 0) / len(subset), 3) if subset else None,
            "actual_avg": round(sum(r["actual_5d"] for r in subset) / len(subset), 2) if subset else None,
        })

    recent = list(reversed(records[-24:]))

    return {
        "code": code,
        "name": name,
        "ts": time.time(),
        "bars": n,
        "lookback": lookback,
        "horizon": horizon,
        "step": step,
        "start": dates[lookback],
        "end": dates[-1],
        "samples": len(records),
        "hit_rate": round(hits / len(directional), 3) if directional else None,
        "hit_rate_ci95": hit_ci,
        "hit_baseline": 0.5,
        "correlation": round(correlation, 3) if correlation is not None else None,
        "mae": round(sum(abs(a - e) for e, a in zip(expected_values, actual_values)) / len(expected_values), 2) if expected_values else None,
        "expected_avg": round(sum(expected_values) / len(expected_values), 2) if expected_values else None,
        "actual_avg": round(sum(r["actual_5d"] for r in records) / len(records), 2),
        "strategy_return": round(total_return, 4),
        "strategy_annual": round(annual, 4),
        "benchmark_return": round(bench_return, 4),
        "excess_return": round(total_return - bench_return, 4),
        "max_drawdown": _max_drawdown(curve, "strategy"),
        "benchmark_drawdown": _max_drawdown(curve, "benchmark"),
        "sharpe": round(sharpe, 2) if sharpe is not None else None,
        "win_rate": round(sum(1 for r in records if r["period_return"] > 0) / len(records), 3),
        "engine": engine or "StockDesk C++",
        "curve": curve,
        "by_state": by_state,
        "calibration": calibration,
        "recent": recent,
        "method": f"滚动 {lookback} 日重训 HMM；每 {step} 个交易日评估；次日不调仓，持有 {horizon} 日；不计滑点外的额外成本。",
        "caveat": "这是对历史状态条件预测的检验，不是策略收益承诺。样本只有约 5 年、单一指数，且 HMM 状态切换有滞后；请结合交易决策和风险约束使用。",
    }


def _refresh_async(key: str, code: str, limit: int, lookback: int, horizon: int, step: int) -> None:
    with _LOCK:
        if key in _REFRESHING:
            return
        _REFRESHING.add(key)

    def run():
        try:
            data = _compute(code, limit, lookback, horizon, step)
            if not data.get("error"):
                db.cache_set(key, data)
        except Exception:
            pass
        finally:
            with _LOCK:
                _REFRESHING.discard(key)

    threading.Thread(target=run, daemon=True, name=f"model-history-{code}").start()


def model_history(code: str = "000300", limit: int = 1000,
                  lookback: int = LOOKBACK, horizon: int = HORIZON,
                  step: int | None = None) -> dict:
    """Cached walk-forward history; horizon/lookback are configurable."""
    code = str(code or "000300")
    if code not in INDEXES:
        raise ValueError(f"不支持的指数代码：{code}")
    lookback = max(80, min(int(lookback or LOOKBACK), 420))
    horizon = max(2, min(int(horizon or HORIZON), 20))
    step = max(1, min(int(step or horizon), horizon))
    limit = max(lookback + horizon + 100, min(int(limit or 1000), 1600))
    key = f"model:history:{CACHE_VERSION}:{code}:{limit}:{lookback}:{horizon}:{step}"
    cached = db.cache_get(key)
    if cached:
        age = time.time() - float(cached.get("ts") or 0)
        stale = age > CACHE_TTL
        if stale:
            _refresh_async(key, code, limit, lookback, horizon, step)
        return {**cached, "stale": stale, "age": round(age, 1)}
    data = _compute(code, limit, lookback, horizon, step)
    if not data.get("error"):
        db.cache_set(key, data)
    data["stale"] = False
    data["age"] = 0
    return data
