"""Portfolio backtests modelled on hp-quant's three modes.

Modes:
* ``recommended`` - walk-forward stock selection from the user's watchlist /
  current positions (or a liquid snapshot fallback), with an HMM market-regime
  exposure overlay.  Signals are observed at the close and filled at the next
  open.
* ``custom`` - user supplied codes and weights; buy-and-hold or periodic
  rebalancing, next-open execution.
* ``ledger`` - replay the real trade journal, enforcing cash and T+1.

The implementation deliberately keeps the stock-selection rule simple and
transparent.  It is not a re-implementation of hp-quant's point-in-time factor
panel; it reuses the data StockDesk already has (daily bars, the HMM snapshot
and the local trade journal) so the page stays useful offline.
"""
from __future__ import annotations

import math
import time
from collections import defaultdict

import numpy as np
import pandas as pd

from . import backtest, market, models, portfolio, repo

COMMISSION = 0.00025
SLIPPAGE = 0.0005
STAMP = 0.0005


def _f(value, default=None):
    try:
        out = float(value)
        return out if math.isfinite(out) else default
    except (TypeError, ValueError):
        return default


def _round(value, digits=4):
    value = _f(value)
    return round(value, digits) if value is not None else None


def _date_text(value) -> str:
    if isinstance(value, str):
        return value[:10]
    try:
        return pd.Timestamp(value).strftime("%Y-%m-%d")
    except Exception:
        return str(value)[:10]


def _stock_frame(code: str) -> pd.DataFrame | None:
    try:
        rows = market.klines(code, period="daily", limit=3000, adjust="qfq", allow_akshare=False)
    except Exception:
        rows = []
    if len(rows) < 30:
        return None
    df = pd.DataFrame(rows)
    df["date"] = pd.to_datetime(df["date"])
    for col in ("open", "close", "high", "low"):
        if col in df:
            df[col] = pd.to_numeric(df[col], errors="coerce")
    df = df.dropna(subset=["date", "close"]).sort_values("date").drop_duplicates("date", keep="last")
    return df.set_index("date")


def _load_frames(codes: list[str]) -> dict[str, pd.DataFrame]:
    """Fetch the small universe in parallel; no akshare fallback here."""
    from concurrent.futures import ThreadPoolExecutor, as_completed

    out: dict[str, pd.DataFrame] = {}
    codes = list(dict.fromkeys(str(c) for c in codes if str(c).strip()))
    if not codes:
        return out
    with ThreadPoolExecutor(max_workers=min(6, len(codes))) as pool:
        futures = {pool.submit(_stock_frame, code): code for code in codes}
        for fut in as_completed(futures):
            code = futures[fut]
            try:
                frame = fut.result()
            except Exception:
                frame = None
            if frame is not None and len(frame) >= 30:
                out[code] = frame
    return out


def _index_frame(code: str) -> pd.DataFrame:
    try:
        series, name = backtest._index_series(code)
    except Exception:
        series, name = pd.Series(dtype=float), ""
    if series.empty:
        return pd.DataFrame()
    return pd.DataFrame({"close": series, "name": name}).sort_index()


def _calendar(index_frame: pd.DataFrame, frames: dict[str, pd.DataFrame],
              start: str | None, end: str | None) -> list[pd.Timestamp]:
    if not index_frame.empty:
        dates = list(index_frame.index)
    else:
        union = sorted({d for f in frames.values() for d in f.index})
        dates = list(pd.to_datetime(union))
    if start:
        dates = [d for d in dates if d >= pd.to_datetime(start)]
    if end:
        dates = [d for d in dates if d <= pd.to_datetime(end)]
    return dates


def _align(frames: dict[str, pd.DataFrame], dates: list[pd.Timestamp]) -> tuple[dict, dict]:
    opens: dict[str, dict] = {}
    closes: dict[str, dict] = {}
    for code, frame in frames.items():
        close = frame["close"].reindex(dates).ffill()
        opens_series = frame["open"].reindex(dates).ffill() if "open" in frame else close
        opens[code] = {d: _f(opens_series.get(d)) for d in dates}
        closes[code] = {d: _f(close.get(d)) for d in dates}
    return opens, closes


def _px(prices: dict, date, fallback: float | None = None) -> float | None:
    value = prices.get(date)
    if value is not None and value > 0:
        return value
    return fallback if fallback and fallback > 0 else None


def _self_benchmark(codes: list[str], closes: dict[str, dict], dates: list[pd.Timestamp],
                    capital: float) -> list[dict]:
    """Equal-weight buy-and-hold curve when no index is available."""
    codes = [c for c in codes if c in closes]
    if not codes:
        return [{"date": _date_text(d), "bench": round(capital, 2)} for d in dates]
    base = {}
    for code in codes:
        first = next((closes[code][d] for d in dates if closes[code].get(d)), None)
        base[code] = first
    curve = []
    for d in dates:
        vals = []
        for code in codes:
            px = closes[code].get(d)
            if px and base.get(code):
                vals.append(px / base[code])
        value = capital * (sum(vals) / len(vals)) if vals else capital
        curve.append({"date": _date_text(d), "bench": round(value, 2)})
    return curve


def _benchmark(index_frame: pd.DataFrame, dates: list[pd.Timestamp], capital: float,
               codes: list[str], closes: dict[str, dict]) -> tuple[list[dict], str, bool]:
    if not index_frame.empty and "close" in index_frame:
        series = index_frame["close"].reindex(dates).ffill()
        valid = series.dropna()
        if not valid.empty:
            base = float(valid.iloc[0])
            curve = []
            for d in dates:
                px = series.get(d)
                curve.append({"date": _date_text(d), "bench": round(capital * (float(px) / base), 2) if px and base else capital})
            name = str(index_frame["name"].iloc[0]) if "name" in index_frame else "指数"
            return curve, name, False
    return _self_benchmark(codes, closes, dates, capital), "等权持有", True


def _metrics(curve: list[dict], benchmark: list[dict], trades: list[dict],
             capital: float, costs: float, exposure: float) -> dict:
    eq = np.asarray([_f(r.get("equity"), capital) or capital for r in curve], dtype=float)
    bench = np.asarray([_f(r.get("bench"), capital) or capital for r in benchmark], dtype=float)
    if len(eq) < 2:
        return {"days": len(eq), "total_return": 0.0}
    rets = np.diff(eq) / np.maximum(eq[:-1], 1e-9)
    brets = np.diff(bench) / np.maximum(bench[:-1], 1e-9)
    total = eq[-1] / capital - 1
    bench_total = bench[-1] / capital - 1
    days = len(eq)
    years = max(days / 244.0, 1e-9)
    annual = (1 + total) ** (1 / years) - 1 if total > -1 else -1.0
    bench_annual = (1 + bench_total) ** (1 / years) - 1 if bench_total > -1 else -1.0
    vol = float(np.std(rets, ddof=1) * math.sqrt(244)) if len(rets) > 1 else 0.0
    sharpe = float(np.mean(rets) / np.std(rets, ddof=1) * math.sqrt(244)) if len(rets) > 1 and np.std(rets, ddof=1) > 1e-12 else None
    downside = rets[rets < 0]
    sortino = float(np.mean(rets) / np.std(downside, ddof=1) * math.sqrt(244)) if len(downside) > 1 and np.std(downside, ddof=1) > 1e-12 else None
    peak = np.maximum.accumulate(eq)
    dd = eq / np.maximum(peak, 1e-9) - 1
    max_dd = float(np.min(dd)) if len(dd) else 0.0
    calmar = annual / abs(max_dd) if max_dd < -1e-12 else None
    excess = rets - brets
    te = float(np.std(excess, ddof=1) * math.sqrt(244)) if len(excess) > 1 else None
    ir = float(np.mean(excess) / np.std(excess, ddof=1) * math.sqrt(244)) if len(excess) > 1 and np.std(excess, ddof=1) > 1e-12 else None
    beta = float(np.cov(rets, brets)[0, 1] / np.var(brets, ddof=1)) if len(brets) > 1 and np.var(brets, ddof=1) > 1e-12 else None
    alpha = annual - (beta * bench_annual if beta is not None else bench_annual)
    sell_trades = [t for t in trades if t.get("type") == "sell"]
    wins = [t for t in sell_trades if (_f(t.get("pnl"), 0) or 0) > 0]
    losses = [t for t in sell_trades if (_f(t.get("pnl"), 0) or 0) < 0]
    gross_win = sum((_f(t.get("pnl"), 0) or 0) for t in wins)
    gross_loss = abs(sum((_f(t.get("pnl"), 0) or 0) for t in losses))
    hold_days = [_f(t.get("hold_days")) for t in sell_trades if _f(t.get("hold_days")) is not None]
    return {
        "total_return": round(total * 100, 2),
        "benchmark_return": round(bench_total * 100, 2),
        "excess_return": round((total - bench_total) * 100, 2),
        "annual_return": round(annual * 100, 2),
        "benchmark_annual": round(bench_annual * 100, 2),
        "volatility": round(vol * 100, 2),
        "sharpe": round(sharpe, 2) if sharpe is not None else None,
        "sortino": round(sortino, 2) if sortino is not None else None,
        "max_drawdown": round(max_dd * 100, 2),
        "calmar": round(calmar, 2) if calmar is not None else None,
        "win_rate": round(len(wins) / len(sell_trades) * 100, 1) if sell_trades else None,
        "profit_factor": round(gross_win / gross_loss, 2) if gross_loss > 1e-9 else None,
        "trade_count": len(trades),
        "closed_trades": len(sell_trades),
        "order_count": len(trades),
        "avg_hold_days": round(float(np.mean(hold_days)), 1) if hold_days else None,
        "exposure": round(max(0.0, min(100.0, exposure * 100)), 1),
        "tracking_error": round(te * 100, 2) if te is not None else None,
        "information_ratio": round(ir, 2) if ir is not None else None,
        "beta": round(beta, 2) if beta is not None else None,
        "alpha": round(alpha * 100, 2),
        "final_equity": round(float(eq[-1]), 2),
        "start_equity": round(capital, 2),
        "days": days,
        "start": curve[0]["date"],
        "end": curve[-1]["date"],
        "costs": round(costs, 2),
    }


def _simulate(dates: list[pd.Timestamp], opens: dict, closes: dict,
              targets: dict[pd.Timestamp, dict[str, float]], capital: float,
              commission: float, slippage: float) -> tuple[list[dict], list[dict], float, float]:
    cash = float(capital)
    shares: dict[str, int] = {}
    avg_cost: dict[str, float] = {}
    buy_date: dict[str, pd.Timestamp] = {}
    pending: dict[str, float] | None = None
    curve: list[dict] = []
    trades: list[dict] = []
    costs = 0.0
    invested_sum = 0.0

    def open_px(code: str, date) -> float | None:
        px = _px(opens.get(code, {}), date)
        if not px:
            px = _px(closes.get(code, {}), date, avg_cost.get(code))
        return px

    def rebalance(date, weights: dict[str, float]):
        nonlocal cash, costs
        value = cash
        for code, qty in shares.items():
            px = open_px(code, date)
            if px:
                value += px * qty
        if value <= 0:
            return
        desired: dict[str, int] = {}
        for code, weight in weights.items():
            if weight <= 0:
                continue
            px = open_px(code, date)
            if not px:
                continue
            fill = px * (1 + slippage)
            desired[code] = int(value * weight / fill / 100) * 100

        # Sell only the excess, so unchanged holdings are not churned.
        for code, qty in list(shares.items()):
            want = desired.get(code, 0)
            if qty <= want:
                continue
            delta = qty - want
            px = open_px(code, date)
            if not px:
                continue
            fill = px * (1 - slippage)
            gross = fill * delta
            fee = max(5.0, gross * commission) + gross * STAMP
            cash += gross - fee
            costs += fee
            pnl = (fill - avg_cost.get(code, fill)) * delta - fee
            trades.append({
                "type": "sell", "date": _date_text(date), "code": code,
                "price": round(fill, 3), "qty": delta, "fee": round(fee, 2),
                "pnl": round(pnl, 2),
                "ret": round((fill / avg_cost[code] - 1) * 100, 2) if avg_cost.get(code) else None,
                "hold_days": (date - buy_date[code]).days if code in buy_date else None,
            })
            if want <= 0:
                shares.pop(code, None)
                avg_cost.pop(code, None)
                buy_date.pop(code, None)
            else:
                shares[code] = want

        # Buy only the shortfall.
        for code, want in desired.items():
            held = shares.get(code, 0)
            delta = want - held
            if delta < 100:
                continue
            px = open_px(code, date)
            if not px:
                continue
            fill = px * (1 + slippage)
            while delta >= 100:
                cost = delta * fill
                fee = max(5.0, cost * commission)
                if cost + fee <= cash + 1e-6:
                    break
                delta -= 100
            if delta < 100:
                continue
            cost = delta * fill
            fee = max(5.0, cost * commission)
            cash -= cost + fee
            costs += fee
            old_qty = shares.get(code, 0)
            old_cost = avg_cost.get(code, 0.0) * old_qty
            shares[code] = old_qty + delta
            avg_cost[code] = (old_cost + cost) / shares[code] if shares[code] else fill
            buy_date.setdefault(code, date)
            trades.append({
                "type": "buy", "date": _date_text(date), "code": code,
                "price": round(fill, 3), "qty": delta, "fee": round(fee, 2),
            })

    for date in dates:
        if pending is not None:
            rebalance(date, pending)
            pending = None
        market_value = 0.0
        for code, qty in shares.items():
            px = _px(closes.get(code, {}), date, avg_cost.get(code))
            market_value += (px or 0) * qty
        equity = cash + market_value
        if equity > 0:
            invested_sum += market_value / equity
        curve.append({"date": _date_text(date), "equity": round(equity, 2)})
        if date in targets:
            pending = targets[date]

    avg_exposure = invested_sum / len(curve) if curve else 0.0
    return curve, trades, costs, avg_exposure

def _drawdown(curve: list[dict]) -> list[dict]:
    peak = -math.inf
    out = []
    for row in curve:
        value = _f(row.get("equity"), 0) or 0
        peak = max(peak, value)
        dd = value / peak - 1 if peak > 0 else 0
        out.append({"date": row["date"], "dd": round(dd * 100, 2)})
    return out


def _targets_custom(dates: list[pd.Timestamp], holdings: list[dict], rebalance_days: int) -> dict:
    weights = {}
    for row in holdings:
        code = str(row.get("code") or "").strip()
        weight = max(0.0, _f(row.get("weight"), 0) or 0)
        if code and weight > 0:
            weights[code] = weight
    total = sum(weights.values())
    if total <= 0:
        raise ValueError("自定义持仓至少需要一个正权重")
    weights = {k: v / total for k, v in weights.items()}
    if not dates:
        return {}
    if rebalance_days <= 0:
        return {dates[0]: weights}
    return {d: weights for i, d in enumerate(dates) if i % rebalance_days == 0}


def _universe_codes() -> list[str]:
    codes = []
    try:
        codes.extend(str(r.get("code")) for r in repo.watchlist() if r.get("code"))
    except Exception:
        pass
    try:
        codes.extend(str(p.get("code")) for p in portfolio.summary().get("positions", []) if p.get("code"))
    except Exception:
        pass
    if not codes:
        try:
            spot = market.fetch_spot(ttl=300) or {}
            rows = sorted(spot.get("rows") or [], key=lambda r: r.get("amount") or 0, reverse=True)
            codes = [str(r.get("code")) for r in rows[:12] if r.get("code")]
        except Exception:
            codes = []
    return list(dict.fromkeys(c for c in codes if len(c) == 6))


def _hmm_exposures(index_frame: pd.DataFrame, dates: list[pd.Timestamp], rebalance_days: int) -> dict:
    if index_frame.empty or "close" not in index_frame:
        return {d: 0.6 for d in dates}
    arr = index_frame["close"].reindex(dates).ffill().to_numpy(dtype=float)
    out = {}
    for i, date in enumerate(dates):
        if i % max(1, rebalance_days) != 0:
            continue
        window = arr[max(0, i - 219):i + 1]
        window = window[np.isfinite(window)]
        if len(window) < 60:
            out[date] = 0.6
            continue
        try:
            hmm = models._hmm(np.diff(np.log(window)) * 100.0)
            state = (hmm or {}).get("state")
            out[date] = {"强势": 0.95, "震荡": 0.65, "弱势": 0.25}.get(state, 0.65)
        except Exception:
            out[date] = 0.65
    return out


def _targets_recommended(dates: list[pd.Timestamp], closes: dict, universe: list[str],
                         top_n: int, rebalance_days: int, exposures: dict) -> dict:
    universe = [c for c in universe if c in closes]
    if not universe:
        raise ValueError("推荐组合没有可用股票，请先添加自选或持仓")
    out = {}
    lookback = 60
    for i, date in enumerate(dates):
        if i % max(1, rebalance_days) != 0 or date not in exposures:
            continue
        scores = []
        for code in universe:
            series = closes[code]
            px = series.get(date)
            if not px:
                continue
            past = [series.get(d) for d in dates[max(0, i - lookback):i + 1]]
            past = [v for v in past if v]
            if len(past) < 30 or not past[0]:
                continue
            mom = px / past[0] - 1
            scores.append((mom, code))
        scores.sort(reverse=True)
        chosen = scores[:max(1, min(top_n, len(scores)))]
        exposure = exposures.get(date, 0.65)
        weight = exposure / len(chosen) if chosen else 0
        out[date] = {code: weight for _, code in chosen}
    return out


def run_custom(holdings: list[dict], start: str | None = None, end: str | None = None,
               capital: float = 1_000_000, benchmark: str = "000001",
               rebalance_days: int = 0, commission: float = COMMISSION,
               slippage: float = SLIPPAGE) -> dict:
    t0 = time.time()
    codes = [str(h.get("code")) for h in holdings if h.get("code")]
    frames = _load_frames(codes)
    if not frames:
        raise ValueError("没有取到持仓标的历史行情")
    idx = _index_frame(benchmark) if benchmark and benchmark != "self" else pd.DataFrame()
    dates = _calendar(idx, frames, start, end)
    if len(dates) < 30:
        raise ValueError("回测区间不足 30 个交易日")
    opens, closes = _align(frames, dates)
    targets = _targets_custom(dates, holdings, rebalance_days)
    curve, trades, costs, exposure = _simulate(dates, opens, closes, targets, capital, commission, slippage)
    bench, bench_name, fallback = _benchmark(idx, dates, capital, list(frames), closes)
    metrics = _metrics(curve, bench, trades, capital, costs, exposure)
    result = {
        "mode": "custom", "mode_name": "自定义持仓", "name": "自定义持仓",
        "strategy_name": "自定义权重", "code": "",
        "params": {"holdings": holdings, "rebalance_days": rebalance_days},
        "holdings": [],
        "metrics": metrics, "equity": curve, "benchmark": bench,
        "benchmark_name": bench_name, "benchmark_fallback": fallback,
        "drawdown": _drawdown(curve), "trades": trades,
        "elapsed": round(time.time() - t0, 2),
    }
    # Keep the actual weights visible in the result for the holdings strip.
    total = sum(max(0.0, _f(h.get("weight"), 0) or 0) for h in holdings) or 1.0
    result["holdings"] = [{"code": str(h["code"]), "weight": round(max(0.0, _f(h.get("weight"), 0) or 0) / total * 100, 1)}
                          for h in holdings if h.get("code")]
    return result


def run_recommended(universe: list[str] | None = None, start: str | None = None,
                    end: str | None = None, capital: float = 1_000_000,
                    benchmark: str = "000001", top_n: int = 5,
                    rebalance_days: int = 20, commission: float = COMMISSION,
                    slippage: float = SLIPPAGE) -> dict:
    t0 = time.time()
    codes = [c for c in (universe or _universe_codes()) if c]
    codes = list(dict.fromkeys(str(c) for c in codes if len(str(c)) == 6))
    frames = _load_frames(codes)
    if not frames:
        raise ValueError("推荐组合没有可用股票，请先添加自选或持仓")
    idx = _index_frame(benchmark) if benchmark and benchmark != "self" else pd.DataFrame()
    dates = _calendar(idx, frames, start, end)
    if len(dates) < 80:
        raise ValueError("推荐组合至少需要 80 个交易日")
    opens, closes = _align(frames, dates)
    exposures = _hmm_exposures(idx, dates, rebalance_days)
    targets = _targets_recommended(dates, closes, list(frames), top_n, rebalance_days, exposures)
    curve, trades, costs, exposure = _simulate(dates, opens, closes, targets, capital, commission, slippage)
    bench, bench_name, fallback = _benchmark(idx, dates, capital, list(frames), closes)
    metrics = _metrics(curve, bench, trades, capital, costs, exposure)
    state_counts = defaultdict(int)
    for date, exp in exposures.items():
        state_counts["强势" if exp >= 0.9 else "弱势" if exp <= 0.3 else "震荡"] += 1
    result = {
        "mode": "recommended", "mode_name": "推荐组合", "name": "推荐组合",
        "strategy_name": "60 日动量 · HMM 仓位", "code": "",
        "params": {"universe_size": len(frames), "top_n": top_n, "rebalance_days": rebalance_days},
        "holdings": [{"code": c, "weight": None} for c in list(frames)],
        "state_counts": dict(state_counts),
        "metrics": metrics, "equity": curve, "benchmark": bench,
        "benchmark_name": bench_name, "benchmark_fallback": fallback,
        "drawdown": _drawdown(curve), "trades": trades,
        "elapsed": round(time.time() - t0, 2),
    }
    return result


def run_ledger(end: str | None = None, capital: float = 1_000_000,
               benchmark: str = "000001", commission: float = COMMISSION,
               slippage: float = SLIPPAGE) -> dict:
    t0 = time.time()
    records = portfolio.load_trades()
    if not records:
        raise ValueError("还没有交易记录，先记一笔买入再回放")
    records = [r for r in records if r.get("trade_date") and r.get("code")]
    records.sort(key=lambda r: (str(r["trade_date"]), int(r.get("id") or 0)))
    codes = list(dict.fromkeys(str(r["code"]) for r in records))
    frames = _load_frames(codes)
    if not frames:
        raise ValueError("交易记录里的标的历史行情不足")
    idx = _index_frame(benchmark) if benchmark and benchmark != "self" else pd.DataFrame()
    first_trade = pd.to_datetime(records[0]["trade_date"])
    # The replay starts at the first recorded trade; a range start before it
    # would only add idle cash and distort exposure/return statistics.
    dates = _calendar(idx, frames, first_trade.strftime("%Y-%m-%d"), end)
    if len(dates) < 2:
        raise ValueError("交易记录回放区间不足")
    opens, closes = _align(frames, dates)
    cash = float(capital)
    shares: dict[str, int] = {}
    avg_cost: dict[str, float] = {}
    bought_today: dict[str, int] = defaultdict(int)
    trades = []
    warnings = []
    costs = 0.0
    equity_curve = []
    exposure_sum = 0.0
    pending_trades = defaultdict(list)
    for r in records:
        d = pd.to_datetime(r["trade_date"])
        if dates and d >= dates[0] and d <= dates[-1]:
            pending_trades[d].append(r)
    last_px: dict[str, float] = {}
    for date in dates:
        for r in pending_trades.get(date, []):
            code = str(r["code"])
            qty = int(r.get("qty") or 0)
            price = _f(r.get("price"))
            if qty <= 0 or not price:
                continue
            side = str(r.get("side") or "")
            fee = _f(r.get("fee"), 0) or 0
            if side == "buy":
                gross = price * qty
                if fee <= 0:
                    fee = max(5.0, gross * commission)
                if gross + fee > cash + 1e-6:
                    warnings.append(f"{date.date()} {code} 买入现金不足，已跳过")
                    continue
                cash -= gross + fee
                old_qty = shares.get(code, 0)
                shares[code] = old_qty + qty
                avg_cost[code] = ((avg_cost.get(code, 0) * old_qty) + gross + fee) / shares[code]
                bought_today[code] += qty
                costs += fee
                trades.append({"type": "buy", "date": _date_text(date), "code": code,
                               "price": round(price, 3), "qty": qty, "fee": round(fee, 2)})
            elif side == "sell":
                held = shares.get(code, 0)
                available = max(0, held - bought_today.get(code, 0))
                if qty > available:
                    warnings.append(f"{date.date()} {code} 卖出超过可卖数量（T+1/持仓），已跳过")
                    continue
                gross = price * qty
                if fee <= 0:
                    fee = max(5.0, gross * commission) + gross * STAMP
                cash += gross - fee
                shares[code] = held - qty
                pnl = (price - avg_cost.get(code, price)) * qty - fee
                costs += fee
                trades.append({"type": "sell", "date": _date_text(date), "code": code,
                               "price": round(price, 3), "qty": qty, "fee": round(fee, 2),
                               "pnl": round(pnl, 2),
                               "ret": round((price / avg_cost[code] - 1) * 100, 2) if avg_cost.get(code) else None})
                if shares.get(code, 0) <= 0:
                    shares.pop(code, None)
                    avg_cost.pop(code, None)
        # daily mark
        mv = 0.0
        for code, qty in shares.items():
            px = closes.get(code, {}).get(date) or last_px.get(code)
            if px:
                last_px[code] = px
            mv += (px or 0) * qty
        total_equity = cash + mv
        equity_curve.append({"date": _date_text(date), "equity": round(total_equity, 2)})
        if total_equity > 0:
            exposure_sum += min(1.0, mv / total_equity)
        bought_today.clear()
    bench, bench_name, fallback = _benchmark(idx, dates, capital, codes, closes)
    exposure = exposure_sum / len(equity_curve) if equity_curve else 0.0
    metrics = _metrics(equity_curve, bench, trades, capital, costs, exposure)
    return {
        "mode": "ledger", "mode_name": "交易记录回放", "name": "我的交易记录",
        "strategy_name": "真实流水", "code": "",
        "params": {"trades": len(records), "capital": capital},
        "holdings": [{"code": c, "weight": None} for c in shares] or [{"code": c, "weight": None} for c in codes],
        "warnings": warnings[-20:], "metrics": metrics, "equity": equity_curve,
        "benchmark": bench, "benchmark_name": bench_name, "benchmark_fallback": fallback,
        "drawdown": _drawdown(equity_curve), "trades": trades,
        "elapsed": round(time.time() - t0, 2),
    }
