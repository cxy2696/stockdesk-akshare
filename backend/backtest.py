"""Rule-based backtest engine (long-only, single stock, next-bar execution)."""
from __future__ import annotations

import math
import time

import numpy as np
import pandas as pd

from . import db, market

STRATEGIES = [
    {
        "id": "ma_cross",
        "name": "双均线交叉",
        "desc": "短期均线上穿长期均线买入，下穿卖出。趋势跟随的经典入门策略。",
        "params": [
            {"key": "fast", "label": "短周期", "value": 5, "min": 2, "max": 120, "step": 1},
            {"key": "slow", "label": "长周期", "value": 20, "min": 3, "max": 250, "step": 1},
        ],
    },
    {
        "id": "momentum",
        "name": "动量突破",
        "desc": "收盘价突破过去 N 日最高价买入，跌破 M 日最低价卖出。捕捉强势趋势。",
        "params": [
            {"key": "entry_n", "label": "突破周期", "value": 20, "min": 3, "max": 250, "step": 1},
            {"key": "exit_n", "label": "离场周期", "value": 10, "min": 2, "max": 120, "step": 1},
        ],
    },
    {
        "id": "rsi_reversion",
        "name": "RSI 超卖反转",
        "desc": "RSI 低于超卖阈值买入，高于超买阈值或达到止盈卖出。均值回归思路。",
        "params": [
            {"key": "n", "label": "RSI 周期", "value": 14, "min": 3, "max": 60, "step": 1},
            {"key": "buy_level", "label": "超卖阈值", "value": 30, "min": 5, "max": 45, "step": 1},
            {"key": "sell_level", "label": "超买阈值", "value": 65, "min": 55, "max": 95, "step": 1},
        ],
    },
    {
        "id": "macd",
        "name": "MACD 金叉",
        "desc": "DIF 上穿 DEA 且位于零轴上方买入，下穿卖出。兼顾趋势与动能。",
        "params": [
            {"key": "fast", "label": "快线", "value": 12, "min": 3, "max": 60, "step": 1},
            {"key": "slow", "label": "慢线", "value": 26, "min": 5, "max": 120, "step": 1},
            {"key": "signal", "label": "信号线", "value": 9, "min": 2, "max": 60, "step": 1},
            {"key": "above_zero", "label": "仅零轴上方", "value": 1, "min": 0, "max": 1, "step": 1},
        ],
    },
    {
        "id": "boll",
        "name": "布林带回归",
        "desc": "价格跌破下轨买入，回到中轨或触及上轨卖出。震荡市中的均值回归。",
        "params": [
            {"key": "n", "label": "周期", "value": 20, "min": 5, "max": 120, "step": 1},
            {"key": "k", "label": "带宽倍数", "value": 2.0, "min": 0.5, "max": 4.0, "step": 0.1},
        ],
    },
    {
        "id": "turtle",
        "name": "唐奇安通道 + ATR 止损",
        "desc": "突破 N 日最高价入场，跌破 M 日最低价或回撤 ATR 倍数离场。海龟交易法的简化版。",
        "params": [
            {"key": "entry_n", "label": "突破周期", "value": 20, "min": 5, "max": 120, "step": 1},
            {"key": "exit_n", "label": "离场周期", "value": 10, "min": 3, "max": 60, "step": 1},
            {"key": "atr_n", "label": "ATR 周期", "value": 14, "min": 5, "max": 40, "step": 1},
            {"key": "atr_mult", "label": "ATR 倍数", "value": 2.0, "min": 0.5, "max": 5.0, "step": 0.5},
        ],
    },
    {
        "id": "ma_rsi",
        "name": "均线 + RSI 过滤",
        "desc": "短期均线上穿长期均线且 RSI 未过热时买入，均线死叉卖出。减少追高。",
        "params": [
            {"key": "fast", "label": "短周期", "value": 10, "min": 3, "max": 60, "step": 1},
            {"key": "slow", "label": "长周期", "value": 30, "min": 10, "max": 200, "step": 1},
            {"key": "rsi_n", "label": "RSI 周期", "value": 14, "min": 5, "max": 40, "step": 1},
            {"key": "rsi_max", "label": "RSI 上限", "value": 75, "min": 50, "max": 95, "step": 1},
        ],
    },
    {
        "id": "boll_break",
        "name": "布林带突破",
        "desc": "收盘突破布林带上轨买入，跌破中轨卖出。顺势捕捉加速行情。",
        "params": [
            {"key": "n", "label": "周期", "value": 20, "min": 5, "max": 120, "step": 1},
            {"key": "k", "label": "带宽倍数", "value": 2.0, "min": 0.5, "max": 4.0, "step": 0.1},
        ],
    },
    {
        "id": "kdj",
        "name": "KDJ 金叉",
        "desc": "K 线上穿 D 线且处于低位时买入，K 线下穿 D 线卖出。经典摆动指标。",
        "params": [
            {"key": "n", "label": "RSV 周期", "value": 9, "min": 3, "max": 30, "step": 1},
            {"key": "smooth", "label": "平滑周期", "value": 3, "min": 2, "max": 10, "step": 1},
            {"key": "low", "label": "低位阈值", "value": 35, "min": 10, "max": 50, "step": 1},
        ],
    },
    {
        "id": "vol_break",
        "name": "量价突破",
        "desc": "价格突破 N 日新高且成交量放大到均量的 M 倍时买入，跌破 10 日均线卖出。",
        "params": [
            {"key": "n", "label": "突破周期", "value": 20, "min": 5, "max": 120, "step": 1},
            {"key": "vol_mult", "label": "放量倍数", "value": 1.5, "min": 1.0, "max": 4.0, "step": 0.1},
            {"key": "exit_ma", "label": "离场均线", "value": 10, "min": 3, "max": 60, "step": 1},
        ],
    },
]


def _ema(s: pd.Series, n: int) -> pd.Series:
    return s.ewm(span=n, adjust=False).mean()


def _rsi(close: pd.Series, n: int = 14) -> pd.Series:
    d = close.diff()
    up = d.clip(lower=0).ewm(alpha=1 / n, adjust=False).mean()
    dn = (-d.clip(upper=0)).ewm(alpha=1 / n, adjust=False).mean()
    rs = up / dn.replace(0, np.nan)
    return (100 - 100 / (1 + rs)).fillna(50)


def _atr(df: pd.DataFrame, n: int = 14) -> pd.Series:
    high, low, close = df["high"], df["low"], df["close"]
    prev = close.shift(1)
    tr = pd.concat([(high - low).abs(), (high - prev).abs(), (low - prev).abs()], axis=1).max(axis=1)
    return tr.ewm(alpha=1 / n, adjust=False).mean()


def build_signals(df: pd.DataFrame, strategy: str, p: dict) -> pd.Series:
    """Return +1 (want long) / -1 (want flat) per bar, based on that bar's close."""
    close = df["close"]
    sig = pd.Series(0, index=df.index, dtype=int)
    if strategy == "ma_cross":
        f, s = int(p.get("fast", 5)), int(p.get("slow", 20))
        if f >= s:
            f, s = min(f, s), max(f, s)
            if f == s:
                s = f + 1
        ma_f, ma_s = close.rolling(f).mean(), close.rolling(s).mean()
        sig[ma_f > ma_s] = 1
        sig[ma_f <= ma_s] = -1
    elif strategy == "momentum":
        n_in, n_out = int(p.get("entry_n", 20)), int(p.get("exit_n", 10))
        hh = close.rolling(n_in).max().shift(1)
        ll = close.rolling(n_out).min().shift(1)
        sig[close > hh] = 1
        sig[close < ll] = -1
        sig = sig.replace(0, np.nan).ffill().fillna(-1).astype(int)
    elif strategy == "rsi_reversion":
        n = int(p.get("n", 14))
        lo, hi = float(p.get("buy_level", 30)), float(p.get("sell_level", 70))
        r = _rsi(close, n)
        sig[r < lo] = 1
        sig[r > hi] = -1
        sig = sig.replace(0, np.nan).ffill().fillna(-1).astype(int)
    elif strategy == "macd":
        f, s, g = int(p.get("fast", 12)), int(p.get("slow", 26)), int(p.get("signal", 9))
        dif = _ema(close, f) - _ema(close, s)
        dea = _ema(dif, g)
        if int(p.get("above_zero", 1)):
            sig[(dif > dea) & (dif > 0)] = 1
            sig[(dif < dea) | (dif <= 0)] = -1
        else:
            sig[dif > dea] = 1
            sig[dif <= dea] = -1
    elif strategy == "boll":
        n = int(p.get("n", 20))
        k = float(p.get("k", 2.0))
        mid = close.rolling(n).mean()
        sd = close.rolling(n).std()
        lower, upper = mid - k * sd, mid + k * sd
        sig[close < lower] = 1
        sig[(close >= mid) | (close > upper)] = -1
        sig = sig.replace(0, np.nan).ffill().fillna(-1).astype(int)
    elif strategy == "turtle":
        n_in = int(p.get("entry_n", 20))
        n_out = int(p.get("exit_n", 10))
        atr_n = int(p.get("atr_n", 14))
        mult = float(p.get("atr_mult", 2.0))
        hh = close.rolling(n_in).max().shift(1)
        ll = close.rolling(n_out).min().shift(1)
        atr = _atr(df, atr_n)
        state, peak = -1, 0.0
        for i in range(len(df)):
            if state == 1:
                peak = max(peak, close.iloc[i])
                stop = peak - mult * atr.iloc[i]
                if close.iloc[i] < stop or close.iloc[i] < ll.iloc[i]:
                    state = -1
            else:
                if close.iloc[i] > hh.iloc[i]:
                    state, peak = 1, close.iloc[i]
            sig.iloc[i] = state
    elif strategy == "ma_rsi":
        f, s_ = int(p.get("fast", 10)), int(p.get("slow", 30))
        if f >= s_:
            f, s_ = min(f, s_), max(f, s_)
            if f == s_:
                s_ = f + 1
        rn = int(p.get("rsi_n", 14))
        rmax = float(p.get("rsi_max", 75))
        ma_f, ma_s = close.rolling(f).mean(), close.rolling(s_).mean()
        r = _rsi(close, rn)
        state = -1
        for i in range(len(df)):
            if state == -1 and ma_f.iloc[i] > ma_s.iloc[i] and r.iloc[i] < rmax:
                state = 1
            elif state == 1 and ma_f.iloc[i] < ma_s.iloc[i]:
                state = -1
            sig.iloc[i] = state
    elif strategy == "boll_break":
        n = int(p.get("n", 20))
        k = float(p.get("k", 2.0))
        mid = close.rolling(n).mean()
        sd = close.rolling(n).std()
        upper = mid + k * sd
        state = -1
        for i in range(len(df)):
            if state == -1 and close.iloc[i] > upper.iloc[i]:
                state = 1
            elif state == 1 and close.iloc[i] < mid.iloc[i]:
                state = -1
            sig.iloc[i] = state
    elif strategy == "kdj":
        n = int(p.get("n", 9))
        smooth = int(p.get("smooth", 3))
        low_th = float(p.get("low", 35))
        low_n = df["low"].rolling(n).min()
        high_n = df["high"].rolling(n).max()
        rsv = (close - low_n) / (high_n - low_n).replace(0, np.nan) * 100
        k_line = rsv.ewm(alpha=1 / smooth, adjust=False).mean()
        d_line = k_line.ewm(alpha=1 / smooth, adjust=False).mean()
        state = -1
        for i in range(1, len(df)):
            cross_up = k_line.iloc[i] > d_line.iloc[i] and k_line.iloc[i - 1] <= d_line.iloc[i - 1]
            cross_dn = k_line.iloc[i] < d_line.iloc[i] and k_line.iloc[i - 1] >= d_line.iloc[i - 1]
            if state == -1 and cross_up and k_line.iloc[i] < low_th + 30:
                state = 1
            elif state == 1 and (cross_dn or k_line.iloc[i] > 85):
                state = -1
            sig.iloc[i] = state
    elif strategy == "vol_break":
        n = int(p.get("n", 20))
        mult = float(p.get("vol_mult", 1.5))
        exit_ma = int(p.get("exit_ma", 10))
        hh = close.rolling(n).max().shift(1)
        vol_ma = df["volume"].rolling(5).mean()
        ma_exit = close.rolling(exit_ma).mean()
        state = -1
        for i in range(len(df)):
            if state == -1 and close.iloc[i] > hh.iloc[i] and df["volume"].iloc[i] > mult * vol_ma.iloc[i]:
                state = 1
            elif state == 1 and close.iloc[i] < ma_exit.iloc[i]:
                state = -1
            sig.iloc[i] = state
    else:
        raise ValueError(f"未知策略: {strategy}")
    sig.iloc[:1] = -1
    return sig


def run(code: str, strategy: str, params: dict | None = None, start: str | None = None,
        end: str | None = None, capital: float = 100_000, commission: float = 0.00025,
        slippage: float = 0.0005) -> dict:
    t0 = time.time()
    params = params or {}
    kl = market.klines(code, period="daily", limit=3000, adjust="qfq")
    if not kl:
        raise ValueError("没有取到该股票的历史行情")
    df = pd.DataFrame(kl)
    df["date"] = pd.to_datetime(df["date"])
    if not start and len(df) > 1250:
        start = (df["date"].iloc[-1250]).strftime("%Y-%m-%d")
    if start:
        df = df[df["date"] >= pd.to_datetime(start)]
    if end:
        df = df[df["date"] <= pd.to_datetime(end)]
    if len(df) < 30:
        raise ValueError("回测区间数据不足（至少 30 个交易日）")
    df = df.reset_index(drop=True)
    sig = build_signals(df, strategy, params)

    cash = float(capital)
    shares = 0
    entry_price = 0.0
    entry_date = None
    trades: list[dict] = []
    curve = []
    prev_want = int(sig.iloc[0])
    for i in range(len(df)):
        row = df.iloc[i]
        want = int(sig.iloc[i])
        # execute on next bar open when the signal just flipped
        if i > 0 and want != prev_want:
            exec_price = float(df.iloc[i]["open"]) if i < len(df) else float(row["close"])
            if exec_price <= 0:
                exec_price = float(row["close"])
            if want == 1 and shares == 0:
                fill = exec_price * (1 + slippage)
                lots = int(cash // (fill * 100))
                qty = lots * 100
                if qty == 0 and cash > fill:
                    # expensive stock with small capital: allow odd lots
                    qty = int(cash / fill / 10) * 10
                if qty > 0:
                    cost = qty * fill
                    fee = max(5.0, cost * commission)
                    if cost + fee > cash:
                        qty = max(0, int((cash - 5.0) / fill / 10) * 10)
                        cost = qty * fill
                        fee = max(5.0, cost * commission)
                    if qty > 0 and cost + fee <= cash:
                        cash -= cost + fee
                        shares = qty
                        entry_price = fill
                        entry_date = row["date"]
                        trades.append({"type": "buy", "date": row["date"].strftime("%Y-%m-%d"), "price": round(fill, 3),
                                       "qty": qty, "fee": round(fee, 2)})
            elif want == -1 and shares > 0:
                fill = exec_price * (1 - slippage)
                gross = shares * fill
                fee = max(5.0, gross * commission) + gross * 0.0005
                cash += gross - fee
                pnl = (fill - entry_price) * shares - fee
                trades.append({"type": "sell", "date": row["date"].strftime("%Y-%m-%d"), "price": round(fill, 3),
                               "qty": shares, "fee": round(fee, 2), "pnl": round(pnl, 2),
                               "ret": round((fill / entry_price - 1) * 100, 2),
                               "hold_days": (row["date"] - entry_date).days if entry_date is not None else None})
                shares = 0
                entry_price = 0.0
                entry_date = None
        equity = cash + shares * float(row["close"])
        bench_px = float(row["close"]) * (1 if shares == 0 else 1)
        curve.append({"date": row["date"].strftime("%Y-%m-%d"), "equity": round(equity, 2),
                      "px": bench_px, "sig": want})
        prev_want = want

    # close open position marked to market at the final close
    final_equity = curve[-1]["equity"]
    bh0 = float(df.iloc[0]["close"])
    bh = [{"date": r["date"], "bench": round(r["px"] / bh0 * capital, 2)} for r in curve]
    eq = [{"date": r["date"], "equity": r["equity"]} for r in curve]
    vals = np.array([r["equity"] for r in curve], dtype=float)
    rets = np.diff(vals) / vals[:-1] if len(vals) > 1 else np.array([])
    days = len(curve)
    total_ret = final_equity / capital - 1
    years = max(days / 244, 1 / 244)
    annual = (final_equity / capital) ** (1 / years) - 1 if final_equity > 0 else -1
    peak = np.maximum.accumulate(vals)
    dd = (vals / peak - 1)
    mdd = float(dd.min()) if len(dd) else 0.0
    vol = float(rets.std(ddof=1) * math.sqrt(244)) if len(rets) > 1 else 0.0
    mean_r = float(rets.mean()) if len(rets) else 0.0
    sharpe = (mean_r * 244) / vol if vol > 0 else 0.0
    downs = rets[rets < 0]
    sortino = (mean_r * 244) / (float(downs.std(ddof=1)) * math.sqrt(244)) if len(downs) > 1 else None
    bench_ret = float(df.iloc[-1]["close"]) / bh0 - 1
    closed = [t for t in trades if t["type"] == "sell"]
    wins = [t for t in closed if t.get("pnl", 0) > 0]
    losses = [t for t in closed if t.get("pnl", 0) <= 0]
    gross_win = sum(t["pnl"] for t in wins)
    gross_loss = abs(sum(t["pnl"] for t in losses))
    exposure = sum(1 for r in curve if r["sig"] == 1) / days
    metrics = {
        "total_return": round(total_ret * 100, 2),
        "annual_return": round(annual * 100, 2),
        "benchmark_return": round(bench_ret * 100, 2),
        "excess_return": round((total_ret - bench_ret) * 100, 2),
        "max_drawdown": round(mdd * 100, 2),
        "volatility": round(vol * 100, 2),
        "sharpe": round(sharpe, 2),
        "sortino": round(sortino, 2) if sortino is not None else None,
        "calmar": round(annual / abs(mdd), 2) if mdd else None,
        "trade_count": len(closed),
        "win_rate": round(len(wins) / len(closed) * 100, 2) if closed else None,
        "profit_factor": round(gross_win / gross_loss, 2) if gross_loss else None,
        "avg_hold_days": round(sum(t.get("hold_days") or 0 for t in closed) / len(closed), 1) if closed else None,
        "exposure": round(exposure * 100, 1),
        "final_equity": round(final_equity, 2),
        "start_equity": capital,
        "days": days,
        "start": curve[0]["date"],
        "end": curve[-1]["date"],
        "costs": round(sum(t["fee"] for t in trades), 2),
    }
    strat = next((s for s in STRATEGIES if s["id"] == strategy), {"name": strategy})
    result = {
        "code": code,
        "name": market.resolve_name(code),
        "strategy": strategy,
        "strategy_name": strat.get("name"),
        "params": params,
        "metrics": metrics,
        "equity": eq,
        "benchmark": bh,
        "drawdown": [{"date": r["date"], "dd": round(float(d) * 100, 2)} for r, d in zip(curve, dd)],
        "trades": trades,
        "elapsed": round(time.time() - t0, 2),
    }
    db.set_setting("last_backtest", result)
    return result
