"""Chart-pattern screener + TD Sequential (九转序列)."""
from __future__ import annotations

import time
from concurrent.futures import ThreadPoolExecutor

import numpy as np
import pandas as pd

from . import db, market

PATTERNS = [
    {"id": "ma_bull", "name": "均线多头排列", "desc": "收盘价站上 MA5，且 MA5 > MA10 > MA20 > MA60，MA20 向上。", "tag": "趋势"},
    {"id": "macd_golden", "name": "MACD 金叉", "desc": "DIF 在最近 2 个交易日内上穿 DEA，动能由弱转强。", "tag": "动能"},
    {"id": "volume_break", "name": "放量突破", "desc": "收盘突破近 20 日最高价，且成交量放大到 5 日均量的 1.5 倍。", "tag": "突破"},
    {"id": "pullback_ma20", "name": "缩量回踩 20 日线", "desc": "价格回踩 20 日线 ±2%，成交量萎缩，MA20 仍向上。", "tag": "回踩"},
    {"id": "double_bottom", "name": "双底 / W 底", "desc": "60 日内两个低点接近（差 < 3%），且已突破颈线。", "tag": "形态"},
    {"id": "platform_break", "name": "平台突破", "desc": "近 20 日振幅收窄至 8% 以内，随后放量突破平台高点。", "tag": "突破"},
    {"id": "td_buy_9", "name": "九转买入（9）", "desc": "TD 买入结构连续 9 根，收盘价低于 4 日前收盘价，常见于下跌末端。", "tag": "九转"},
    {"id": "td_sell_9", "name": "九转卖出（9）", "desc": "TD 卖出结构连续 9 根，收盘价高于 4 日前收盘价，常见于上涨末端。", "tag": "九转"},
    {"id": "bottom_dull", "name": "底部钝化", "desc": "价格处于 60 日低位，RSI 连续在 35 下方钝化后拐头，或 MACD 绿柱缩短。", "tag": "反转"},
    {"id": "rsi_rebound", "name": "RSI 超卖反弹", "desc": "RSI14 近 5 日内跌破 30 后重新站上 30。", "tag": "反转"},
    {"id": "boll_rebound", "name": "布林下轨反弹", "desc": "价格近 5 日触及布林下轨后重新回到下轨上方。", "tag": "反转"},
]


def td_sequential(closes: list[float]) -> tuple[list[int], list[int]]:
    """Return (buy_setup, sell_setup) counts per bar (classic TD 9)."""
    n = len(closes)
    buy = [0] * n
    sell = [0] * n
    bc = sc = 0
    for i in range(n):
        if i < 4:
            continue
        if closes[i] < closes[i - 4]:
            bc += 1
            sc = 0
        elif closes[i] > closes[i - 4]:
            sc += 1
            bc = 0
        else:
            bc = sc = 0
        buy[i] = min(bc, 9)
        sell[i] = min(sc, 9)
    return buy, sell


def _ema(s: pd.Series, n: int) -> pd.Series:
    return s.ewm(span=n, adjust=False).mean()


def _rsi(close: pd.Series, n: int = 14) -> pd.Series:
    d = close.diff()
    up = d.clip(lower=0).ewm(alpha=1 / n, adjust=False).mean()
    dn = (-d.clip(upper=0)).ewm(alpha=1 / n, adjust=False).mean()
    rs = up / dn.replace(0, np.nan)
    return (100 - 100 / (1 + rs)).fillna(50)


def _detect(df: pd.DataFrame, pattern: str) -> tuple[bool, str, float]:
    close = df["close"]
    high = df["high"]
    low = df["low"]
    vol = df["volume"]
    last = float(close.iloc[-1])
    ma5, ma10, ma20, ma60 = [close.rolling(n).mean() for n in (5, 10, 20, 60)]
    score = 50.0

    if pattern == "ma_bull":
        ok = last > ma5.iloc[-1] > ma10.iloc[-1] > ma20.iloc[-1] > ma60.iloc[-1] and ma20.iloc[-1] > ma20.iloc[-6]
        return ok, f"MA5 {ma5.iloc[-1]:.2f} > MA10 {ma10.iloc[-1]:.2f} > MA20 {ma20.iloc[-1]:.2f} > MA60 {ma60.iloc[-1]:.2f}", 78

    if pattern == "macd_golden":
        dif = _ema(close, 12) - _ema(close, 26)
        dea = _ema(dif, 9)
        cross = dif.iloc[-2] <= dea.iloc[-2] and dif.iloc[-1] > dea.iloc[-1]
        cross_recent = cross or (dif.iloc[-3] <= dea.iloc[-3] and dif.iloc[-2] > dea.iloc[-2])
        return cross_recent, f"DIF {dif.iloc[-1]:.2f} / DEA {dea.iloc[-1]:.2f}", 70

    if pattern == "volume_break":
        hh = high.rolling(20).max().shift(1).iloc[-1]
        vma = vol.rolling(5).mean().shift(1).iloc[-1]
        ok = last > hh and vol.iloc[-1] > 1.5 * vma
        return ok, f"突破 20 日高点 {hh:.2f}，量比 {vol.iloc[-1] / vma:.1f}", 76

    if pattern == "pullback_ma20":
        m = ma20.iloc[-1]
        ok = abs(last / m - 1) < 0.02 and ma20.iloc[-1] > ma20.iloc[-6] and vol.iloc[-1] < 0.8 * vol.rolling(5).mean().iloc[-1] and last > ma60.iloc[-1]
        return ok, f"现价距 MA20 {((last / m - 1) * 100):+.1f}%，缩量回踩", 68

    if pattern == "double_bottom":
        window = df.tail(60)
        lows = window["low"].values
        # local minima
        idx = [i for i in range(2, len(lows) - 2) if lows[i] <= lows[i - 1] and lows[i] <= lows[i + 1] and lows[i] <= lows[i - 2] and lows[i] <= lows[i + 2]]
        for a in idx:
            for b in idx:
                if b - a >= 10 and abs(lows[a] / lows[b] - 1) < 0.03:
                    neck = max(window["high"].iloc[a:b + 1])
                    if last > neck:
                        return True, f"双底 {lows[a]:.2f} / {lows[b]:.2f}，颈线 {neck:.2f} 已突破", 82
        return False, "未形成有效双底", 0

    if pattern == "platform_break":
        window = df.tail(21)
        rng = (window["high"].max() / window["low"].min() - 1) * 100
        hh = window["high"].iloc[:-1].max()
        vma = vol.rolling(5).mean().shift(1).iloc[-1]
        ok = rng < 8 and last > hh and vol.iloc[-1] > 1.3 * vma
        return ok, f"20 日振幅 {rng:.1f}%，平台高点 {hh:.2f}", 72

    if pattern in ("td_buy_9", "td_sell_9"):
        buy, sell = td_sequential(list(close))
        if pattern == "td_buy_9":
            ok = max(buy[-3:]) == 9
            return ok, f"TD 买入结构 {max(buy[-3:])}", 74
        ok = max(sell[-3:]) == 9
        return ok, f"TD 卖出结构 {max(sell[-3:])}", 74

    if pattern == "bottom_dull":
        r = _rsi(close)
        low60 = low.tail(60).min()
        near_low = last <= low60 * 1.04
        rsi_low = (r.tail(5) < 35).sum() >= 3
        rsi_turn = r.iloc[-1] > r.iloc[-2]
        dif = _ema(close, 12) - _ema(close, 26)
        dea = _ema(dif, 9)
        hist = (dif - dea) * 2
        hist_turn = hist.iloc[-1] > hist.iloc[-2] and hist.iloc[-1] < 0
        ok = near_low and rsi_low and (rsi_turn or hist_turn)
        return ok, f"60 日低位，RSI {r.iloc[-1]:.1f} 钝化{'回升' if rsi_turn else '，绿柱缩短'}", 72

    if pattern == "rsi_rebound":
        r = _rsi(close)
        ok = (r.iloc[-6:-1] < 30).any() and r.iloc[-1] > 30
        return ok, f"RSI14 {r.iloc[-1]:.1f}，超卖后回升", 66

    if pattern == "boll_rebound":
        mid = close.rolling(20).mean()
        sd = close.rolling(20).std()
        lower = mid - 2 * sd
        touched = (low.iloc[-6:-1] < lower.iloc[-6:-1]).any()
        ok = touched and last > lower.iloc[-1]
        return ok, f"布林下轨 {lower.iloc[-1]:.2f} 附近止跌", 64

    return False, "", 0


def _candidates(universe: str, limit: int) -> list[dict]:
    spot = db.cache_get("spot:v3", 600)
    if not spot:
        try:
            spot = market.fetch_spot(ttl=600)
        except Exception:
            spot = None
    rows = (spot or {}).get("rows", [])
    if universe == "mcap":
        rows = sorted(rows, key=lambda r: r.get("mcap") or 0, reverse=True)
    else:
        rows = sorted(rows, key=lambda r: r.get("amount") or 0, reverse=True)
    return rows[:max(20, min(limit, 600))]


def scan(pattern: str, universe: str = "amount", limit: int = 200) -> dict:
    key = f"scan:{pattern}:{universe}:{limit}"
    cached = db.cache_get(key, 300)
    if cached:
        return cached
    rows = _candidates(universe, limit)
    out = []
    total = 0
    t0 = time.time()

    def work(r):
        code = r["code"]
        try:
            kl = market.klines(code, period="daily", limit=160, adjust="qfq")
            if len(kl) < 70:
                return None
            df = pd.DataFrame(kl)
            df["date"] = pd.to_datetime(df["date"])
            df = df.sort_values("date").reset_index(drop=True)
            ok, reason, score = _detect(df, pattern)
            if not ok:
                return None
            return {
                "code": code, "name": r.get("name"), "price": r.get("price"), "pct": r.get("pct"),
                "industry": r.get("industry"), "market": r.get("market"),
                "amount": r.get("amount"), "mcap": r.get("mcap"),
                "score": score, "reason": reason,
            }
        except Exception:
            return None

    with ThreadPoolExecutor(max_workers=10) as ex:
        for item in ex.map(work, rows):
            total += 1
            if item:
                out.append(item)
    out.sort(key=lambda x: (-(x["score"] or 0), -(x.get("amount") or 0)))
    result = {
        "pattern": pattern,
        "universe": universe,
        "scanned": total,
        "matches": out[:80],
        "elapsed": round(time.time() - t0, 1),
        "updated": time.time(),
    }
    db.cache_set(key, result)
    return result


PICK_PATTERNS = [
    "ma_bull", "macd_golden", "volume_break", "pullback_ma20", "platform_break",
    "td_buy_9", "rsi_rebound", "boll_rebound", "double_bottom", "bottom_dull",
]
_PATTERN_NAMES = {p["id"]: p["name"] for p in PATTERNS}


def picks(universe: str = "amount", limit: int = 150, top: int = 12) -> dict:
    """Daily stock candidates: any technical signal + liquidity/valuation context."""
    key = f"picks:v2:{universe}:{limit}:{top}"
    cached = db.cache_get(key, 600)
    if cached:
        return cached
    rows = _candidates(universe, limit)
    out = []
    t0 = time.time()

    def work(r):
        code = r.get("code") or ""
        name = r.get("name") or ""
        if "ST" in name.upper() or not code:
            return None
        if (r.get("pct") or 0) >= 9.5 or (r.get("mcap") or 0) < 3e9 or (r.get("amount") or 0) < 1e8:
            return None
        try:
            kl = market.klines(code, period="daily", limit=160, adjust="qfq")
            if len(kl) < 70:
                return None
            df = pd.DataFrame(kl).sort_values("date").reset_index(drop=True)
            signals = []
            for pid in PICK_PATTERNS:
                ok, reason, score = _detect(df, pid)
                if ok:
                    signals.append({"id": pid, "name": _PATTERN_NAMES.get(pid, pid), "reason": reason, "score": score})
            if not signals:
                return None
            closes = df["close"].tolist()
            pct5 = (closes[-1] / closes[-6] - 1) * 100 if len(closes) > 6 else None
            pct20 = (closes[-1] / closes[-21] - 1) * 100 if len(closes) > 21 else None
            best = max(s["score"] for s in signals)
            score = min(99, best + 4 * (len(signals) - 1))
            if pct5 is not None:
                if pct5 > 45:
                    return None
                score += max(-3, min(4, pct5 / 8))
                if pct5 > 25:
                    score -= (pct5 - 25) * 0.35
            if any(s["id"] == "td_buy_9" for s in signals):
                score += 2
            return {
                "code": code, "name": name, "price": r.get("price"), "pct": r.get("pct"),
                "industry": r.get("industry"), "mcap": r.get("mcap"), "amount": r.get("amount"),
                "pe": r.get("pe"), "pb": r.get("pb"),
                "main_inflow": r.get("main_inflow"),
                "pct5": round(pct5, 2) if pct5 is not None else None,
                "pct20": round(pct20, 2) if pct20 is not None else None,
                "score": round(max(0, min(99, score)), 0),
                "signals": signals,
            }
        except Exception:
            return None

    with ThreadPoolExecutor(max_workers=10) as ex:
        for item in ex.map(work, rows):
            if item:
                out.append(item)
    out.sort(key=lambda x: (-(x["score"] or 0), -(x.get("amount") or 0)))
    result = {
        "picks": out[:top],
        "scanned": len(rows),
        "matched": len(out),
        "elapsed": round(time.time() - t0, 1),
        "updated": time.time(),
        "universe": universe,
    }
    db.cache_set(key, result)
    return result
