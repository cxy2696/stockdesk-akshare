"""Daily market brief: indices, breadth, sectors, models, news and a plan.

The brief is the one page most users open first, so it stitches together the
pieces that used to live on separate screens: market regime, breadth/flow,
TD structures, industry focus and headlines.  Everything is cached and every
section degrades on its own — a blocked news host must not empty the page.
"""
from __future__ import annotations

import os
import sys
import time
from functools import wraps

from . import advice, db, market, state

_DEBUG_TIMING = os.environ.get("STOCKDESK_DEBUG_TIMING") == "1"


def _timed(name, fn):
    """Wrap a section call and log its wall time when debugging is enabled."""
    @wraps(fn)
    def run(*args, **kwargs):
        started = time.time()
        try:
            return fn(*args, **kwargs)
        finally:
            if _DEBUG_TIMING:
                print(f"[daily] {name} {time.time() - started:.1f}s", file=sys.stderr, flush=True)
    return run


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


def _news_for_industries(news: list[dict], industries: list[dict], limit: int = 12) -> list[dict]:
    """Prefer headlines that mention a leading or lagging industry."""
    names = {x.get("name") for x in industries if x.get("name")}
    if not names:
        return news[:limit]
    hit = [n for n in news if set(n.get("industries") or []) & names]
    if len(hit) >= 4:
        rest = [n for n in news if n not in hit]
        return (hit + rest)[:limit]
    return news[:limit]


def _focus_line(market_state: dict, model: dict) -> str:
    hmm = (model.get("hmm") or {})
    perc = (model.get("percolation") or {})
    if not hmm or not perc:
        return ""
    giant = perc.get("giant_occupied") or 0
    regime = "扩散" if giant >= (perc.get("threshold") or 0.5927) else (
        "临界" if giant >= (perc.get("threshold") or 0.5927) - 0.08 else "分裂")
    conf = hmm.get("confidence") or 0
    return (f"模型侧：沪深300处于{hmm.get('state', '震荡')}状态"
            f"（概率 {conf * 100:.0f}%），市场广度{regime}"
            f"（最大连通簇 {giant * 100:.0f}%），"
            f"{'可以按趋势持有' if regime == '扩散' and hmm.get('state') == '强势' else '更适合控制节奏、精选方向'}。")


def _model_snapshot() -> dict:
    try:
        from .models import model_snapshot
        return model_snapshot()
    except Exception:
        return {}


_CACHE_KEY = "market:daily:v5"
_REFRESH_LOCK = __import__("threading").Lock()
_REFRESHING = False


def _refresh_in_background() -> None:
    global _REFRESHING
    try:
        _compute_daily()
    except Exception:
        pass
    finally:
        with _REFRESH_LOCK:
            _REFRESHING = False


def daily_brief() -> dict:
    """Return the last good brief immediately; refresh stale data in a thread.

    The daily page is the first screen after launch.  Recomputing every section
    synchronously after the 120 s TTL made a revisit feel broken on a slow
    network, so a stale-but-valid payload is served at once and refreshed in
    the background.  The timestamp on the card makes the age visible.
    """
    global _REFRESHING
    cached = db.cache_get(_CACHE_KEY)
    if cached:
        age = time.time() - float(cached.get("ts") or 0)
        if age > 120:
            with _REFRESH_LOCK:
                if not _REFRESHING:
                    _REFRESHING = True
                    __import__("threading").Thread(target=_refresh_in_background, daemon=True).start()
        return cached
    return _compute_daily()


def _compute_daily() -> dict:
    cached = db.cache_get(_CACHE_KEY, 120)
    if cached:
        return cached
    from concurrent.futures import ThreadPoolExecutor

    # These sections hit different hosts.  Running them together keeps the
    # first paint at roughly the slowest section instead of the sum of all.
    with ThreadPoolExecutor(max_workers=5) as ex:
        state_f = ex.submit(_timed("state", state.market_state))
        model_f = ex.submit(_timed("models", _model_snapshot))
        news_f = ex.submit(_timed("news", state.market_news), 24)
        hot_f = ex.submit(_timed("hot", state.hot_board))
        trends_f = ex.submit(_timed("trends", state.industry_trends), 8)
        levels_f = ex.submit(_timed("levels", _index_levels))
        adv_f = ex.submit(_timed("advice", advice.position_advice))
        sectors_f = ex.submit(_timed("sectors", state.boards), "industry", "pct", 80)
        m = state_f.result()
        model = model_f.result()
        news = news_f.result()
        hot = hot_f.result()
        trends = trends_f.result()
        levels = levels_f.result()
        adv = adv_f.result()
        sectors = sectors_f.result()

    idx = m.get("indices") or []
    b = m.get("breadth") or {}
    top = [x for x in sectors if (x.get("pct") or 0) > 0][:5]
    bottom = sorted([x for x in sectors if x.get("pct") is not None], key=lambda x: x["pct"])[:3]

    sh = next((x for x in idx if x["code"] == "000001"), None)
    turnover = m.get("turnover")
    verdict = (m.get("verdict") or {}).get("label") or "震荡"
    parts = [f"今天 A 股{verdict}。"]
    if sh:
        parts.append(f"上证指数收在 {sh['price']:.2f} 点，{sh['pct']:+.2f}%；")
    if b:
        parts.append(f"全市场 {b.get('up', 0)} 家上涨、{b.get('down', 0)} 家下跌，"
                     f"涨停 {b.get('limit_up', 0)} 家、跌停 {b.get('limit_down', 0)} 家。")
    if turnover:
        parts.append(f"两市成交约 {turnover / 1e8:.0f} 亿元。")
    if top:
        parts.append(f"资金主要做多{'、'.join(x['name'] for x in top[:3])}，")
    if bottom:
        tag = "杀跌集中在" if (bottom[0].get("pct") or 0) < 0 else "相对靠后的是"
        parts.append(f"{tag}{'、'.join(x['name'] for x in bottom[:2])}。")
    parts.append(f"市场温度 {m.get('score')} 分，仓位参考 {adv['target_low']}%–{adv['target_high']}%。")
    focus = _focus_line(m, model)
    if focus:
        parts.append(focus)
    summary = "".join(parts)

    industry_focus = model.get("industry_focus") or []
    td_snap = model.get("td") or {}
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
        "levels": levels,
        "advice": adv,
        "hot": hot,
        "industry_trends": trends,
        "news": news,
        "industry_news": _news_for_industries(news, top + bottom, 12),
        "industry_focus": industry_focus,
        "model": {
            "hmm": model.get("hmm") or {},
            "hmm_indices": model.get("hmm_indices") or [],
            "hmm_summary": model.get("hmm_summary") or {},
            "percolation": model.get("percolation") or {},
            "td": td_snap,
            "conclusion": model.get("conclusion") or {},
        },
        "td": {
            "indices": [{"code": x.get("code"), "name": x.get("short") or x.get("name"), "td": x.get("td") or {}}
                        for x in idx],
            "counts": td_snap.get("counts") or {},
            "text": td_snap.get("text") or "",
        },
    }
    db.cache_set(_CACHE_KEY, result)
    return result
