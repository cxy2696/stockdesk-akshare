"""DeMark TD Sequential (九转序列) model.

The module keeps the classic two-phase structure:

1. **Setup（建仓/减仓结构）** — nine consecutive closes that are lower
   (buy setup) or higher (sell setup) than the close four bars earlier.
2. **Countdown（倒计时）** — after a completed setup, up to thirteen bars that
   undercut the low two bars back (buy) or exceed the high two bars back
   (sell).

Following DeMark, a finished buy setup describes *exhaustion of selling*, not a
guaranteed bottom.  The output therefore separates the mechanical count from
the interpretation so the UI can show both without pretending to predict.
"""
from __future__ import annotations

from typing import Iterable

SETUP_LEN = 9
COUNTDOWN_LEN = 13


def _f(values: Iterable) -> list[float]:
    out: list[float] = []
    for v in values or []:
        try:
            out.append(float(v))
        except (TypeError, ValueError):
            out.append(float("nan"))
    return out


def _clean(values: list[float]) -> list[float]:
    return [v for v in values if v == v]  # drop NaN


def _setup_counts(closes: list[float]) -> tuple[list[int], list[int], list[int | None], list[int | None]]:
    """Return per-bar buy/sell setup counts and the bar index of each 9."""
    n = len(closes)
    buy = [0] * n
    sell = [0] * n
    buy9: list[int | None] = [None] * n
    sell9: list[int | None] = [None] * n
    bc = sc = 0
    last_buy9: int | None = None
    last_sell9: int | None = None
    for i in range(4, n):
        if closes[i] < closes[i - 4]:
            bc += 1
            sc = 0
            if bc == SETUP_LEN:
                last_buy9 = i
            # a completed structure stays visible until it is negated
            bc = min(bc, SETUP_LEN)
        elif closes[i] > closes[i - 4]:
            sc += 1
            bc = 0
            if sc == SETUP_LEN:
                last_sell9 = i
            sc = min(sc, SETUP_LEN)
        else:
            bc = sc = 0
        buy[i] = bc
        sell[i] = sc
        buy9[i] = last_buy9
        sell9[i] = last_sell9
    return buy, sell, buy9, sell9


def _countdown(
    closes: list[float],
    highs: list[float],
    lows: list[float],
    start: int | None,
    direction: str,
) -> tuple[int, bool, int | None]:
    """Count bars after a completed setup; returns (count, completed, bar_index)."""
    if start is None or start + 1 >= len(closes):
        return 0, False, None
    count = 0
    last: int | None = None
    for i in range(start + 1, len(closes)):
        if direction == "buy":
            ref = lows[i - 2] if i >= 2 and lows[i - 2] == lows[i - 2] else None
            hit = ref is not None and closes[i] <= ref
        else:
            ref = highs[i - 2] if i >= 2 and highs[i - 2] == highs[i - 2] else None
            hit = ref is not None and closes[i] >= ref
        if hit:
            count += 1
            last = i
            if count >= COUNTDOWN_LEN:
                return COUNTDOWN_LEN, True, i
    return count, False, last


def td_sequence(closes: list[float], highs: list[float] | None = None,
                lows: list[float] | None = None) -> dict:
    """Full TD Sequential state for one instrument.

    ``closes`` is oldest → newest.  ``highs``/``lows`` enable the countdown
    phase; without them the setup phase is still returned.
    """
    c = _clean(_f(closes))
    n = len(c)
    if n < 12:
        return {
            "available": False,
            "buy": {"count": 0, "completed": False},
            "sell": {"count": 0, "completed": False},
            "signal": None, "label": "样本不足", "bias": "中性", "score": 50,
            "strength": "无", "read": "历史数据不足，暂不计算九转结构。",
            "countdown": {"direction": None, "count": 0, "completed": False},
        }

    h = _f(highs) if highs is not None else c
    l = _f(lows) if lows is not None else c
    if len(h) != n:
        h = c
    if len(l) != n:
        l = c

    buy, sell, buy9, sell9 = _setup_counts(c)
    b = buy[-1]
    s = sell[-1]
    last_buy9 = buy9[-1]
    last_sell9 = sell9[-1]
    bars_since_buy9 = (n - 1 - last_buy9) if last_buy9 is not None else None
    bars_since_sell9 = (n - 1 - last_sell9) if last_sell9 is not None else None

    cb, cb_done, cb_idx = _countdown(c, h, l, last_buy9, "buy")
    cs, cs_done, cs_idx = _countdown(c, h, l, last_sell9, "sell")

    # Prefer the freshest completed structure.  A setup that finished more
    # than 20 bars ago is background information, not a live signal.
    fresh = 20
    buy_live = last_buy9 is not None and bars_since_buy9 is not None and bars_since_buy9 <= fresh
    sell_live = last_sell9 is not None and bars_since_sell9 is not None and bars_since_sell9 <= fresh
    buy_cd_live = cb_idx is not None and (n - 1 - cb_idx) <= 20
    sell_cd_live = cs_idx is not None and (n - 1 - cs_idx) <= 20

    signal = None
    if cb_done and cb_idx is not None and n - 1 - cb_idx <= 8:
        signal = "buy_13"
    elif cs_done and cs_idx is not None and n - 1 - cs_idx <= 8:
        signal = "sell_13"
    elif buy_live and b >= SETUP_LEN:
        signal = "buy_9"
    elif sell_live and s >= SETUP_LEN:
        signal = "sell_9"
    elif b >= 7:
        signal = "watch_buy"
    elif s >= 7:
        signal = "watch_sell"
    elif buy_cd_live and cb > 0:
        signal = "countdown_buy"
    elif sell_cd_live and cs > 0:
        signal = "countdown_sell"

    if signal in ("buy_13", "buy_9"):
        bias, score = "偏多", 78 if signal == "buy_13" else 70
        strength = "强" if signal == "buy_13" else "中"
    elif signal in ("sell_13", "sell_9"):
        bias, score = "偏空", 24 if signal == "sell_13" else 30
        strength = "强" if signal == "sell_13" else "中"
    elif signal == "watch_buy":
        bias, score, strength = "偏多", 60, "弱"
    elif signal == "watch_sell":
        bias, score, strength = "偏空", 40, "弱"
    elif signal == "countdown_buy":
        bias, score, strength = "偏多", 56, "弱"
    elif signal == "countdown_sell":
        bias, score, strength = "偏空", 44, "弱"
    else:
        bias, score, strength = "中性", 50, "无"

    if signal == "buy_13":
        label = "买入倒计时 13/13"
    elif signal == "sell_13":
        label = "卖出倒计时 13/13"
    elif signal == "buy_9":
        label = "买入九转 9/9"
    elif signal == "sell_9":
        label = "卖出九转 9/9"
    elif signal == "watch_buy":
        label = f"下跌结构 {b}/9"
    elif signal == "watch_sell":
        label = f"上涨结构 {s}/9"
    elif signal == "countdown_buy":
        label = f"买入倒计时 {cb}/13"
    elif signal == "countdown_sell":
        label = f"卖出倒计时 {cs}/13"
    else:
        label = "无有效结构"

    setup_low = min(l[-min(n, 20):])
    setup_high = max(h[-min(n, 20):])
    read = _read(signal, b, s, cb, cs, bars_since_buy9, bars_since_sell9, c[-1], setup_low, setup_high)

    if signal in ("countdown_buy", "countdown_sell", "watch_buy", "watch_sell"):
        signal_age = 0
    elif signal in ("buy_9", "buy_13") and bars_since_buy9 is not None:
        signal_age = bars_since_buy9
    elif signal in ("sell_9", "sell_13") and bars_since_sell9 is not None:
        signal_age = bars_since_sell9
    else:
        age_candidates = [x for x in (bars_since_buy9, bars_since_sell9) if x is not None]
        signal_age = min(age_candidates) if age_candidates else None
    freshness = "新" if signal_age is not None and signal_age <= 2 else (
        "近期" if signal_age is not None and signal_age <= 6 else "过期")
    quality = int(max(0, min(100, round(
        abs(score - 50) * 1.6
        + (18 if signal in ("buy_13", "sell_13") else 10 if signal in ("buy_9", "sell_9") else 4)
        + (8 if signal_age is not None and signal_age <= 6 else 0)
    ))))

    return {
        "available": True,
        "buy": {"count": b, "completed": b >= SETUP_LEN, "bars_since": bars_since_buy9},
        "sell": {"count": s, "completed": s >= SETUP_LEN, "bars_since": bars_since_sell9},
        "quality": quality,
        "completion": {"setup": round(max(b, s) / SETUP_LEN, 2), "countdown": round((cb if buy_cd_live else cs) / COUNTDOWN_LEN, 2)},
        "freshness": freshness,
        "signal_age": signal_age,
        "countdown": {
            "direction": "buy" if buy_cd_live else ("sell" if sell_cd_live else None),
            "count": cb if buy_cd_live else (cs if sell_cd_live else 0),
            "completed": bool(cb_done if buy_cd_live else (cs_done if sell_cd_live else False)),
            "bars_since": ((n - 1 - cb_idx) if buy_cd_live and cb_idx is not None
                           else (n - 1 - cs_idx) if sell_cd_live and cs_idx is not None else None),
        },
        "signal": signal,
        "label": label,
        "bias": bias,
        "score": score,
        "strength": strength,
        "read": read,
        "levels": {"recent_low": round(setup_low, 2), "recent_high": round(setup_high, 2)},
        "series": {
            "buy": buy[-40:],
            "sell": sell[-40:],
        },
    }


def _read(signal: str | None, b: int, s: int, cb: int, cs: int, since_buy: int | None,
          since_sell: int | None, price: float, low: float, high: float) -> str:
    """Plain-language reading of the current structure."""
    if signal == "buy_13":
        return (f"买入倒计时 13 完成：连续 13 根 K 线跌破两日前低点后，卖压衰竭信号较强。"
                f"现价距近 20 日低点 {_pct(low, price):+.1f}%，可等放量收阳再确认，不抢下跌中的刀。")
    if signal == "sell_13":
        return (f"卖出倒计时 13 完成：连续 13 根 K 线突破两日前高点后，上涨动能透支。"
                f"现价距近 20 日高点 {_pct(high, price):+.1f}%，优先考虑分批兑现而不是追高。")
    if signal == "buy_9":
        return (f"买入九转 9/9 完成：连续 9 根收盘价低于 4 日前收盘价，短线抛压进入尾声。"
                f"这是衰竭信号而非反转确认，需要看到放量止跌或收复 5 日线再动手。")
    if signal == "sell_9":
        return (f"卖出九转 9/9 完成：连续 9 根收盘价高于 4 日前收盘价，追涨资金开始拥挤。"
                f"若同时出现放量长上影或跌破 5 日线，兑现比加仓更划算。")
    if signal == "watch_buy":
        return (f"下跌结构走到 {b}/9，卖压仍在释放但已接近衰竭区。"
                f"先观察 3–4 个交易日能否止跌，结构未满 9 之前不把它当成买点。")
    if signal == "watch_sell":
        return (f"上涨结构走到 {s}/9，短线动能偏强但接近过热。"
                f"持仓可以继续拿，新增仓位等回踩，不在第 7–9 根追价。")
    if signal == "countdown_buy":
        return (f"买入倒计时推进到 {cb}/13，卖压正在衰竭但还没走完。"
                f"先放进观察池，等倒计时完成或放量收阳再考虑试仓。")
    if signal == "countdown_sell":
        return (f"卖出倒计时推进到 {cs}/13，上涨动能还没完全释放。"
                f"已有盈利可以分批兑现，但不必因为倒计时中途出现就清仓。")
    if b or s:
        return (f"当前没有完成的反转结构；最近一次买入结构在 {since_buy} 根 K 线前，"
                f"卖出结构在 {since_sell} 根 K 线前。九转更适合当辅助，不单独作为交易理由。")
    return "当前没有连续的九转结构；趋势由均线与资金主导，继续按原有纪律执行。"


def _pct(base: float, now: float) -> float:
    if not base:
        return 0.0
    return (now / base - 1) * 100


def td_brief(closes: list[float], highs: list[float] | None = None,
             lows: list[float] | None = None) -> dict:
    """Compact TD row for tables and daily cards."""
    full = td_sequence(closes, highs, lows)
    if not full.get("available"):
        return full
    return {
        "available": True,
        "signal": full["signal"],
        "label": full["label"],
        "bias": full["bias"],
        "score": full["score"],
        "strength": full["strength"],
        "quality": full.get("quality"),
        "freshness": full.get("freshness"),
        "buy_count": full["buy"]["count"],
        "sell_count": full["sell"]["count"],
        "countdown": full["countdown"]["count"],
        "read": full["read"],
    }
