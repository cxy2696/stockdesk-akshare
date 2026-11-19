"""Market regime: index trends, breadth, turnover, leading sectors and a verdict."""
from __future__ import annotations

import threading
import time
import urllib.parse
from concurrent.futures import ThreadPoolExecutor

from . import clock, db, market, source_health, td

INDEX_SECIDS = {
    "000001": "1.000001",
    "399001": "0.399001",
    "399006": "0.399006",
    "000300": "1.000300",
    "000688": "1.000688",
}


def _ma(values: list[float], n: int) -> float | None:
    if len(values) < n:
        return None
    return sum(values[-n:]) / n


def _rsi(values: list[float], n: int = 14) -> float | None:
    if len(values) <= n:
        return None
    gains = losses = 0.0
    for i in range(len(values) - n, len(values)):
        ch = values[i] - values[i - 1]
        gains += max(ch, 0)
        losses += max(-ch, 0)
    if losses == 0:
        return 100.0
    return 100 - 100 / (1 + gains / losses)


def _ema(values: list[float], n: int) -> float | None:
    if not values:
        return None
    k = 2 / (n + 1)
    e = values[0]
    for v in values[1:]:
        e = v * k + e * (1 - k)
    return e


def _td(closes: list[float]) -> tuple[int, int]:
    if len(closes) < 6:
        return 0, 0
    bc = sc = 0
    for i in range(4, len(closes)):
        if closes[i] < closes[i - 4]:
            bc += 1
            sc = 0
        elif closes[i] > closes[i - 4]:
            sc += 1
            bc = 0
        else:
            bc = sc = 0
        if bc == 9:
            bc = 0
        if sc == 9:
            sc = 0
    return min(bc, 9), min(sc, 9)


def _macd(closes: list[float]) -> tuple[float | None, float | None]:
    if len(closes) < 35:
        return None, None
    k12, k26, k9 = 2 / 13, 2 / 27, 2 / 10
    e12 = e26 = closes[0]
    dea = 0.0
    for v in closes[1:]:
        e12 = v * k12 + e12 * (1 - k12)
        e26 = v * k26 + e26 * (1 - k26)
        dif = e12 - e26
        dea = dif * k9 + dea * (1 - k9)
    return round(e12 - e26, 2), round(dea, 2)


def _pct(values: list[float], n: int) -> float | None:
    if len(values) <= n or values[-1 - n] == 0:
        return None
    return (values[-1] / values[-1 - n] - 1) * 100




_STATE_LOCK = threading.Lock()
_STATE_COMPUTE_LOCKS = {"light": threading.Lock(), "full": threading.Lock()}
_STATE_REFRESHING = {"light": False, "full": False}


def _refresh_market_state(light: bool) -> None:
    name = "light" if light else "full"
    try:
        _compute_market_state(light)
    except Exception:
        pass
    finally:
        with _STATE_LOCK:
            _STATE_REFRESHING[name] = False


def market_state(light: bool = False) -> dict:
    """Serve the last state immediately; refresh expired data in the background."""
    name = "light" if light else "full"
    cache_key = "market:state:light" if light else "market:state:v2"
    cached = db.cache_get(cache_key)
    if cached:
        age = time.time() - float(cached.get("ts") or 0)
        stale = age > 120
        if stale:
            with _STATE_LOCK:
                if not _STATE_REFRESHING[name]:
                    _STATE_REFRESHING[name] = True
                    threading.Thread(target=_refresh_market_state, args=(light,), daemon=True).start()
        payload = dict(cached)
        payload["stale"] = stale
        payload["age"] = round(age, 1)
        payload["refreshing"] = bool(_STATE_REFRESHING[name])
        return payload
    # Cold start: single-flight so the startup warm-up and the first HUD/Nav
    # request do not fetch the same 5 index histories and board lists twice.
    with _STATE_COMPUTE_LOCKS[name]:
        cached = db.cache_get(cache_key)
        if cached:
            payload = dict(cached)
            payload["stale"] = False
            payload["age"] = round(time.time() - float(cached.get("ts") or 0), 1)
            return payload
        return _compute_market_state(light)


def _compute_market_state(light: bool = False) -> dict:
    cache_key = "market:state:light" if light else "market:state:v2"

    # The HUD only needs the index quote, breadth and a temperature. Do not
    # fetch six K-line histories and two board lists on first paint; those are
    # filled lazily by the full state and market pages.
    if light:
        idx = market.indices()
        breadth = market.market_breadth()
        spot = market.cached_spot()
        turnover = sum((r.get("amount") or 0) for r in (spot or {}).get("rows", [])) if spot else None
        pcts = [q.get("pct") for q in idx if q.get("pct") is not None]
        avg_pct = sum(pcts) / len(pcts) if pcts else 0.0
        up, down = breadth.get("up", 0), breadth.get("down", 0)
        up_ratio = up / max(up + down, 1)
        limit_ratio = (breadth.get("limit_up", 0) - breadth.get("limit_down", 0)) / max(breadth.get("total", 0), 1)
        score = round(max(0, min(100, 50 + (up_ratio - 0.5) * 70 + avg_pct * 6 - 7.5 + limit_ratio * 150)), 0)
        if score >= 70:
            label, tone = "强势", "up"
        elif score >= 58:
            label, tone = "偏强", "up"
        elif score >= 45:
            label, tone = "震荡", "flat"
        elif score >= 32:
            label, tone = "偏弱", "down"
        else:
            label, tone = "弱势", "down"
        result = {
            "light": True, "ts": time.time(), "indices": idx,
            "breadth": {**breadth, "up_ratio": round(up_ratio * 100, 1)},
            "turnover": round(turnover, 2) if turnover else None,
            "sectors": {"top": [], "bottom": [], "concepts": []},
            "score": score,
            "verdict": {"label": label, "tone": tone, "reasons": []},
            "status": clock.market_status(),
        }
        db.cache_set(cache_key, result)
        return result

    # ---- index trend
    # Quote and history calls hit different endpoints; run them together so a
    # blocked kline host does not make the whole page wait for the quote host.
    def _rows_for(item):
        code, sec = item
        try:
            return code, market.klines(code, limit=160, adjust="", secid_override=sec, allow_akshare=False)
        except Exception:
            return code, []

    with ThreadPoolExecutor(max_workers=6) as ex:
        idx_future = ex.submit(market.indices)
        row_futures = [ex.submit(_rows_for, item) for item in INDEX_SECIDS.items()]
        rows_by_code = dict(f.result() for f in row_futures)
        idx = idx_future.result()

    by_code = {i["code"]: i for i in idx}
    details = []
    closes_by_code: dict[str, list[float]] = {}
    for code, _sec in INDEX_SECIDS.items():
        rows = rows_by_code.get(code) or []
        closes = [r["close"] for r in rows]
        closes_by_code[code] = closes
        q = by_code.get(code, {})
        ma5, ma10 = _ma(closes, 5), _ma(closes, 10)
        ma20, ma60 = _ma(closes, 20), _ma(closes, 60)
        price = q.get("price") or (closes[-1] if closes else None)
        dif, dea = _macd(closes)
        td_now = td.td_sequence(closes,
                                [r.get("high") for r in rows] if rows else None,
                                [r.get("low") for r in rows] if rows else None)
        td_buy = td_now.get("buy", {}).get("count", 0) if td_now.get("available") else 0
        td_sell = td_now.get("sell", {}).get("count", 0) if td_now.get("available") else 0
        rsi_now = _rsi(closes)
        bottom_dull = False
        if len(rows) >= 60 and rsi_now is not None:
            low60 = min(r["low"] for r in rows[-60:])
            rsi_series = []
            for k in range(5, 0, -1):
                rsi_series.append(_rsi(closes[:-k]) if len(closes) > k + 15 else None)
            rsi_series.append(rsi_now)
            vals = [v for v in rsi_series if v is not None]
            low_days = sum(1 for v in vals if v < 35)
            turn = len(vals) >= 2 and vals[-1] > vals[-2]
            bottom_dull = (price or 0) <= low60 * 1.04 and low_days >= 3 and turn
        lows20 = [r["low"] for r in rows[-20:]] if len(rows) >= 20 else []
        highs20 = [r["high"] for r in rows[-20:]] if len(rows) >= 20 else []
        trend = "震荡"
        if price and ma20 and ma60:
            if price > ma20 > ma60:
                trend = "多头"
            elif price < ma20 < ma60:
                trend = "空头"
        details.append({
            "code": code,
            "name": q.get("name") or code,
            "short": q.get("short") or q.get("name") or code,
            "price": price,
            "pct": q.get("pct"),
            "ma5": round(ma5, 2) if ma5 else None,
            "ma10": round(ma10, 2) if ma10 else None,
            "ma20": round(ma20, 2) if ma20 else None,
            "ma60": round(ma60, 2) if ma60 else None,
            "macd_dif": dif,
            "macd_dea": dea,
            "td_buy": td_buy,
            "td_sell": td_sell,
            "td": td_now,
            "bottom_dull": bottom_dull,
            "pct7": round(_pct(closes, 7), 2) if _pct(closes, 7) is not None else None,
            "pct30": round(_pct(closes, 30), 2) if _pct(closes, 30) is not None else None,
            "pct60": round(_pct(closes, 60), 2) if _pct(closes, 60) is not None else None,
            "support": round(min(lows20), 2) if lows20 else None,
            "resistance": round(max(highs20), 2) if highs20 else None,
            "above20": bool(price and ma20 and price > ma20),
            "above60": bool(price and ma60 and price > ma60),
            "rsi": round(_rsi(closes), 1) if _rsi(closes) is not None else None,
            "pct5": round(_pct(closes, 5), 2) if _pct(closes, 5) is not None else None,
            "pct20": round(_pct(closes, 20), 2) if _pct(closes, 20) is not None else None,
            "trend": trend,
        })

    # ---- breadth / turnover
    # Never synchronously pull the full universe here. A cold HUD must paint
    # immediately; the spot page / warm-up thread fills the cache separately.
    breadth = market.market_breadth()
    spot = market.cached_spot()
    turnover = None
    if spot:
        amounts = [r.get("amount") or 0 for r in spot.get("rows", [])]
        turnover = sum(amounts)

    # ---- sectors (skip on the lightweight HUD request)
    if light:
        industries, concepts = [], []
    else:
        industries = boards("industry", "pct", 60)
        concepts = boards("concept", "pct", 40)
    top_ind = [x for x in industries if x["pct"] is not None][:6]
    bottom_ind = [x for x in industries if x["pct"] is not None][-3:][::-1]
    skip = ("昨日", "涨停", "跌停", "连板", "首板", "破净", "融资融券", "标准普尔", "MSCI")
    top_con = [x for x in concepts if x["pct"] is not None and not any(k in (x["name"] or "") for k in skip)][:5]

    # ---- score
    up, down = breadth.get("up", 0), breadth.get("down", 0)
    up_ratio = up / max(up + down, 1)
    pcts = [d["pct"] for d in details if d.get("pct") is not None]
    avg_pct = sum(pcts) / len(pcts) if pcts else 0
    above20 = sum(1 for d in details if d["above20"])
    total = max(breadth.get("total", 0), 1)
    limit_ratio = (breadth.get("limit_up", 0) - breadth.get("limit_down", 0)) / total
    score = 50 + (up_ratio - 0.5) * 70 + avg_pct * 6 + (above20 - 2.5) * 3 + limit_ratio * 150
    score = round(max(0, min(100, score)), 0)

    if score >= 70:
        label, tone = "强势", "up"
    elif score >= 58:
        label, tone = "偏强", "up"
    elif score >= 45:
        label, tone = "震荡", "flat"
    elif score >= 32:
        label, tone = "偏弱", "down"
    else:
        label, tone = "弱势", "down"

    reasons = []
    reasons.append(f"上涨 {up} 家 / 下跌 {down} 家，赚钱效应{'较好' if up_ratio > 0.55 else ('一般' if up_ratio > 0.45 else '偏弱')}")
    reasons.append(f"主要指数平均 {avg_pct:+.2f}%，{above20}/5 站上 20 日线")
    if breadth.get("limit_up") or breadth.get("limit_down"):
        reasons.append(f"涨停 {breadth.get('limit_up', 0)} 家 / 跌停 {breadth.get('limit_down', 0)} 家")
    if turnover:
        reasons.append(f"全市场成交额约 {turnover / 1e8:.0f} 亿元")
    if top_ind:
        reasons.append(f"领涨行业：{'、'.join(x['name'] for x in top_ind[:3])}")

    result = {
        "light": light,
        "ts": time.time(),
        "indices": details,
        "breadth": {**breadth, "up_ratio": round(up_ratio * 100, 1)},
        "turnover": round(turnover, 2) if turnover else None,
        "sectors": {"top": top_ind, "bottom": bottom_ind, "concepts": top_con},
        "score": score,
        "verdict": {"label": label, "tone": tone, "reasons": reasons},
        "status": clock.market_status(),
    }
    db.cache_set(cache_key, result)
    return result


def _sina_concept_rows() -> list[dict]:
    """Sina concept-board list, independent of Eastmoney/THS.

    The newFLJK payload is a JS object whose values are CSV strings:
    code,name,companies,avg_price,chg,pct,volume,amount,leader_code,
    leader_pct,leader_price,leader_chg,leader_name.
    """
    import json
    import urllib.request

    t0 = time.time()
    try:
        url = "https://money.finance.sina.com.cn/q/view/newFLJK.php?param=class"
        req = urllib.request.Request(url, headers={"User-Agent": market.UA, "Referer": "https://finance.sina.com.cn/"})
        text = urllib.request.urlopen(req, timeout=10).read().decode("gbk", "ignore")
        payload = json.loads(text.split("=", 1)[1].strip().rstrip(";")) if "=" in text else {}
        out = []
        for key, row in payload.items():
            p = str(row).split(",")
            if len(p) < 9 or not p[1]:
                continue
            out.append({
                "code": key, "name": p[1], "pct": market._num(p[5]),
                "inflow": None, "amount": market._num(p[7]),
                "up": None, "down": None,
                "leader": p[12] if len(p) > 12 else None,
                "leader_code": p[8] if p[8] else None,
                "leader_pct": market._num(p[9]),
                "companies": int(market._num(p[2]) or 0),
                "kind": "concept", "source": "sina",
            })
        out.sort(key=lambda r: r.get("pct") or -999, reverse=True)
        source_health.mark("sina", bool(out), time.time() - t0, "concept")
        return out
    except Exception as exc:
        source_health.mark("sina", False, time.time() - t0, f"concept: {exc}")
        return []


def _ths_industry_flow() -> list[dict]:
    """90-industry board fallback with breadth, net inflow and leader.

    Uses the THS industry summary, which stays available when Eastmoney's
    push2 clist is blocked. Falls back to the narrower fund-flow table.
    """
    try:
        import akshare as ak
        df = ak.stock_board_industry_summary_ths()
        out = []
        for i, r in df.iterrows():
            name = str(r.get("板块") or "").strip()
            if not name:
                continue
            net = market._num(r.get("净流入"))
            up = market._num(r.get("上涨家数"))
            down = market._num(r.get("下跌家数"))
            amount = market._num(r.get("总成交额"))
            out.append({
                "code": f"THS{i}", "name": name,
                "pct": market._num(r.get("涨跌幅")),
                "inflow": round(net * 1e8, 2) if net is not None else None,
                "outflow": None,
                "amount": round(amount * 1e8, 2) if amount is not None else None,
                "up": int(up) if up is not None else None,
                "down": int(down) if down is not None else None,
                "leader": r.get("领涨股"), "leader_code": None,
                "leader_pct": market._num(r.get("领涨股-涨跌幅")),
                "companies": int(up + down) if up is not None and down is not None else None,
                "kind": "industry", "source": "ths",
            })
        if out:
            source_health.mark("ths", True)
            return out
    except Exception:
        pass
    try:
        import akshare as ak
        df = ak.stock_fund_flow_industry(symbol="即时")
        out = []
        for i, r in df.iterrows():
            name = str(r.get("行业") or "").strip()
            if not name:
                continue
            net = market._num(r.get("净额"))
            inflow = market._num(r.get("流入资金"))
            outflow = market._num(r.get("流出资金"))
            companies = market._num(r.get("公司家数"))
            out.append({
                "code": f"THS{i}", "name": name,
                "pct": market._num(r.get("行业-涨跌幅")),
                "inflow": round(net * 1e8, 2) if net is not None else None,
                "inflow_raw": round(inflow * 1e8, 2) if inflow is not None else None,
                "outflow": round(outflow * 1e8, 2) if outflow is not None else None,
                "up": None, "down": None,
                "leader": r.get("领涨股"), "leader_code": None,
                "leader_pct": market._num(r.get("领涨股-涨跌幅")),
                "companies": int(companies) if companies is not None else None,
                "kind": "industry",
            })
        return out
    except Exception:
        return []


def _ths_board_rows(name: str) -> list[dict]:
    """Daily K-line history for a THS industry board."""
    try:
        import akshare as ak
        end = time.strftime("%Y%m%d")
        start = time.strftime("%Y%m%d", time.localtime(time.time() - 420 * 86400))
        df = ak.stock_board_industry_index_ths(symbol=name, start_date=start, end_date=end)
        out = []
        for _, r in df.iterrows():
            close = market._num(r.get("收盘价"))
            if close is None:
                continue
            out.append({
                "date": str(r.get("日期")),
                "open": market._num(r.get("开盘价")),
                "high": market._num(r.get("最高价")),
                "low": market._num(r.get("最低价")),
                "close": close,
                "volume": market._num(r.get("成交量"), 0),
                "amount": market._num(r.get("成交额"), 0),
            })
        return out
    except Exception:
        return []


_BOARD_LOCKS: dict[str, threading.Lock] = {}


def _board_rows(kind: str = "industry") -> list[dict]:
    # Single-flight: the daily brief, hot board, industry focus and industry
    # trends all ask for the same list at the same time on first paint.  One
    # thread fetches; the rest wait and read the freshly cached copy.
    lock = _BOARD_LOCKS.setdefault(kind, threading.Lock())
    with lock:
        return _board_rows_inner(kind)


def _board_rows_inner(kind: str = "industry") -> list[dict]:
    # Cache the raw list for 30 s so one page does not fetch it five times.
    cache_key = f"boards:rows:v4:{kind}"
    cached = db.cache_get(cache_key, 30)
    if cached:
        return cached
    fs = "m:90+t:2" if kind == "industry" else "m:90+t:3"
    url = (
        f"{market.EM_LIST}?pn=1&pz=120&po=1&np=1&fltt=2&invt=2&fid=f3&fs={fs}"
        "&fields=f12,f14,f3,f62,f104,f105,f128,f140,f136"
    )
    try:
        d = market._http_json(url)
        rows = ((d or {}).get("data") or {}).get("diff") or []
    except Exception:
        rows = []
    out = []
    for r in rows:
        out.append({
            "code": r.get("f12"),
            "name": r.get("f14"),
            "pct": market._num(r.get("f3")),
            "inflow": market._num(r.get("f62")),
            "up": market._num(r.get("f104")),
            "down": market._num(r.get("f105")),
            "leader": r.get("f128"),
            "leader_code": r.get("f140"),
            "leader_pct": market._num(r.get("f136")),
            "kind": kind, "source": "eastmoney",
        })
    if not out and kind == "industry":
        # Sina first: it is a plain HTTP table and normally returns in a few
        # seconds, while the akshare/THS path can block for tens of seconds on
        # a rate-limited host. THS remains the second fallback for breadth.
        for i, r in enumerate(market._sina_industry_flow()):
            name = r.get("name") or ""
            if not name:
                continue
            out.append({
                "code": r.get("code") or f"SINA{i}", "name": name,
                "pct": r.get("pct"), "inflow": r.get("inflow"),
                "up": None, "down": None,
                "leader": r.get("leader"), "leader_code": None,
                "leader_pct": r.get("leader_pct"), "kind": kind, "source": "sina",
            })
        if not out:
            out = _ths_industry_flow()
        # Attach real breadth/leader codes to the Sina industry rows from the
        # cached snapshot.  Previously the fallback table only had name/pct and
        # every detail drawer said "no constituent data".
        imap = market.sina_industry_map()
        if imap.get("by_name"):
            spot = market.cached_spot() or {}
            by_code = {r.get("code"): r for r in spot.get("rows") or []}
            for b in out:
                node = imap["by_name"].get(b.get("name") or "")
                if node:
                    b["code"] = node
                codes = imap.get("members", {}).get(node or "", [])
                pcts = [by_code[c].get("pct") for c in codes if c in by_code and by_code[c].get("pct") is not None]
                if pcts:
                    b["up"] = sum(1 for p in pcts if p > 0)
                    b["down"] = sum(1 for p in pcts if p < 0)
                    b["companies"] = len(pcts)
                leaders = sorted((by_code[c] for c in codes if c in by_code), key=lambda x: x.get("pct") or -999, reverse=True)
                if leaders:
                    b["leader"] = leaders[0].get("name") or b.get("leader")
                    b["leader_code"] = leaders[0].get("code")
                    b["leader_pct"] = leaders[0].get("pct")
    if not out and kind == "concept":
        out = _sina_concept_rows()
    if out:
        db.cache_set(cache_key, out)
    return out


def boards(kind: str = "industry", sort: str = "pct", limit: int = 60) -> list[dict]:
    key = f"boards:{kind}:{sort}:{limit}"
    cached = db.cache_get(key, 60)
    if cached:
        return cached
    rows = _board_rows(kind)
    if sort == "inflow":
        rows.sort(key=lambda r: r.get("inflow") or 0, reverse=True)
    else:
        rows.sort(key=lambda r: r.get("pct") or -999, reverse=True)
    rows = rows[:limit]
    # Do not cache the degraded Sina board list: it has synthetic SINA* codes
    # and no breadth, and would otherwise hide a recovered Eastmoney source
    # for a full minute.
    if not rows or all(str(b.get("code", "")).startswith("BK") for b in rows):
        db.cache_set(key, rows)
    return rows


def board_detail(code: str) -> dict:
    key = f"board:detail:{code}"
    cached = db.cache_get(key, 60)
    if cached:
        return cached
    meta = None
    for kind in ("industry", "concept"):
        for b in _board_rows(kind):
            if b["code"] == code:
                meta = b
                break
        if meta:
            break
    if not code.startswith("BK"):
        # Sina industry/concept nodes expose their members directly; use that
        # rather than leaving the drawer empty when Eastmoney is unavailable.
        stocks = market.sina_node_members(code, limit=80, pages=1)
        spot = market.cached_spot() or {}
        by_code = {r.get("code"): r for r in spot.get("rows") or []}
        for st in stocks:
            live = by_code.get(st.get("code")) or {}
            st["price"] = live.get("price") or st.get("price")
            st["pct"] = live.get("pct") if live.get("pct") is not None else st.get("pct")
            st["mcap"] = live.get("mcap") or st.get("mcap")
            st["industry"] = live.get("industry") or st.get("industry") or (meta or {}).get("name") or ""
        stocks.sort(key=lambda x: x.get("pct") or -999, reverse=True)
        if stocks and meta:
            meta = dict(meta)
            pcts = [x.get("pct") for x in stocks if x.get("pct") is not None]
            meta["count"] = len(stocks)
            meta["up"] = sum(1 for p in pcts if p > 0)
            meta["down"] = sum(1 for p in pcts if p < 0)
            meta["leader"] = stocks[0].get("name")
            meta["leader_code"] = stocks[0].get("code")
            meta["leader_pct"] = stocks[0].get("pct")
        result = {"meta": meta or {"code": code, "name": code}, "stocks": stocks, "updated": time.time()}
        db.cache_set(key, result)
        return result
    url = (
        f"{market.EM_LIST}?pn=1&pz=40&po=1&np=1&fltt=2&invt=2&fid=f3&fs=b:{code}"
        "&fields=f12,f14,f2,f3,f20,f100"
    )
    try:
        d = market._http_json(url)
        rows = ((d or {}).get("data") or {}).get("diff") or []
    except Exception:
        rows = []
    stocks = [{
        "code": r.get("f12"),
        "name": r.get("f14"),
        "price": market._num(r.get("f2")),
        "pct": market._num(r.get("f3")),
        "mcap": market._num(r.get("f20")),
        "industry": r.get("f100"),
    } for r in rows]
    result = {"meta": meta or {"code": code, "name": code}, "stocks": stocks, "updated": time.time()}
    db.cache_set(key, result)
    return result


def heatmap(groups_limit: int = 40, per_group: int = 30) -> dict:
    imap = market.sina_industry_map()
    map_ready = bool(imap.get("by_code"))
    key = f"market:heatmap:{groups_limit}:{per_group}:{int(map_ready)}"
    cached = db.cache_get(key, 120)
    if cached:
        return cached
    spot = db.cache_get(market.SPOT_KEY, 600)
    if not spot:
        try:
            spot = market.fetch_spot(ttl=600)
        except Exception:
            spot = None
    rows = (spot or {}).get("rows", [])
    buckets: dict[str, list[dict]] = {}
    for r in rows:
        if not r.get("price") or r.get("pct") is None:
            continue
        ind = r.get("industry") or (imap.get("by_code") or {}).get(str(r.get("code"))) or "未分类"
        buckets.setdefault(ind, []).append({
            "code": r["code"],
            "name": r["name"],
            "value": round((r.get("mcap") or r.get("amount") or 0) / 1e8, 2),
            "pct": r.get("pct"),
            "price": r.get("price"),
        })
    groups = []
    for name, items in buckets.items():
        items.sort(key=lambda x: x["value"], reverse=True)
        total = sum(x["value"] for x in items)
        if total <= 0:
            continue
        avg = sum((x["pct"] or 0) * x["value"] for x in items) / total
        groups.append({
            "name": name,
            "value": round(total, 2),
            "pct": round(avg, 2),
            "children": items[:per_group],
        })
    groups.sort(key=lambda g: g["value"], reverse=True)
    unclassified = next((g["value"] for g in groups if g["name"] == "未分类"), 0)
    groups = [g for g in groups if g["name"] != "未分类"]
    result = {"groups": groups[:groups_limit], "updated": time.time(), "total": len(rows),
              "unclassified": unclassified}
    db.cache_set(key, result)
    return result


def limit_pool(direction: str = "up", limit: int = 30) -> list[dict]:
    spot = db.cache_get(market.SPOT_KEY, 600)
    if not spot:
        try:
            spot = market.fetch_spot(ttl=600)
        except Exception:
            spot = None
    rows = (spot or {}).get("rows", [])
    def _limit_pct(r: dict) -> float:
        return market.limit_pct(r) - 0.2

    if direction == "down":
        pool = [r for r in rows if (r.get("pct") or 0) <= -_limit_pct(r)]
        pool.sort(key=lambda r: r.get("pct") or 0)
    else:
        pool = [r for r in rows if (r.get("pct") or 0) >= _limit_pct(r)]
        pool.sort(key=lambda r: r.get("pct") or 0, reverse=True)
    return [{
        "code": r["code"], "name": r["name"], "price": r.get("price"), "pct": r.get("pct"),
        "mcap": r.get("mcap"), "industry": r.get("industry"), "market": r.get("market"),
        "amount": r.get("amount"),
    } for r in pool[:limit]]


def _hot_timing(msg: str) -> None:
    import os
    if os.environ.get("STOCKDESK_DEBUG_TIMING") == "1":
        print(f"[hot] {msg}", file=__import__("sys").stderr, flush=True)


def hot_board(limit: int = 10) -> dict:
    """Main-force flow board.

    Eastmoney spot rows already carry f62 (main net inflow).  Sina's money-flow
    snapshot fills the gaps when Eastmoney is rate-limited.  The two sources are
    merged by code instead of overwriting each other, so a partial Sina response
    no longer blanks the whole card — the previous behaviour looked like
    "主力追踪没有数据" even though Eastmoney had returned f62.
    """
    key = f"market:hot:v2:{limit}"
    cached = db.cache_get(key, 60)
    if cached:
        return cached
    t0 = time.time()
    spot = db.cache_get(market.SPOT_KEY, 600)
    if not spot:
        try:
            spot = market.fetch_spot(ttl=600)
        except Exception:
            spot = None
    _hot_timing(f"spot {time.time() - t0:.1f}s")
    rows = [
        dict(r) for r in (spot or {}).get("rows", [])
        if r.get("code") and r.get("price") and (r.get("amount") or 0) > 0
        and "退" not in (r.get("name") or "") and "ST" not in (r.get("name") or "").upper()
    ]
    t1 = time.time()
    flow = market._fund_flow()
    _hot_timing(f"fund_flow {time.time() - t1:.1f}s rows={len(flow)}")
    for r in rows:
        f = flow.get(r.get("code")) or {}
        if f.get("main_inflow") is not None:
            r["main_inflow"] = f["main_inflow"]
        if f.get("inflow") is not None:
            r["inflow"] = f["inflow"]
        if f.get("outflow") is not None:
            r["outflow"] = f["outflow"]
        amount = r.get("amount") or 0
        if r.get("main_inflow") is not None and amount > 0:
            r["main_pct"] = round(r["main_inflow"] / amount * 100, 2)

    def slim(r):
        return {
            "code": r.get("code"), "name": r.get("name"), "price": r.get("price"),
            "pct": r.get("pct"), "amount": r.get("amount"), "mcap": r.get("mcap"),
            "inflow": r.get("main_inflow"), "main_pct": r.get("main_pct"),
            "industry": r.get("industry"), "speed": r.get("speed"),
            "volume_ratio": r.get("volume_ratio"),
        }

    # Only genuinely negative rows may appear in the outflow list: sorting with
    # a large sentinel used to pull in stocks whose flow was null.
    inflow_rows = [r for r in rows if (r.get("main_inflow") or 0) > 0]
    outflow_rows = [r for r in rows if (r.get("main_inflow") or 0) < 0]
    inflow_rows.sort(key=lambda r: r.get("main_inflow") or 0, reverse=True)
    outflow_rows.sort(key=lambda r: r.get("main_inflow") or 0)

    gainers = [slim(r) for r in sorted(rows, key=lambda r: r.get("pct") or -999, reverse=True)[:limit]]
    losers = [slim(r) for r in sorted(rows, key=lambda r: r.get("pct") or 999)[:limit]]
    inflow = [slim(r) for r in inflow_rows[:limit]]
    outflow = [slim(r) for r in outflow_rows[:limit]]
    speeders = [slim(r) for r in sorted(rows, key=lambda r: r.get("speed") or -999, reverse=True)[:limit]]

    t2 = time.time()
    industries = boards("industry", "inflow", 100)
    _hot_timing(f"industry_boards {time.time() - t2:.1f}s")
    # When the Eastmoney board endpoint is blocked we still have stock-level
    # flow plus industry labels: aggregate them so the right-hand column is
    # never empty.
    if not industries or all(x.get("inflow") is None for x in industries):
        groups: dict[str, dict] = {}
        for r in rows:
            name = r.get("industry") or r.get("market") or "其他"
            g = groups.setdefault(name, {"name": name, "code": "LOCAL-" + name, "pct": 0.0,
                                         "inflow": 0.0, "up": 0, "down": 0, "count": 0, "_pct_sum": 0.0})
            g["count"] += 1
            g["_pct_sum"] += r.get("pct") or 0
            g["inflow"] += r.get("main_inflow") or 0
            if (r.get("pct") or 0) > 0:
                g["up"] += 1
            elif (r.get("pct") or 0) < 0:
                g["down"] += 1
        industries = []
        for g in groups.values():
            g["pct"] = round(g.pop("_pct_sum") / max(g["count"], 1), 2)
            g["inflow"] = round(g["inflow"], 2)
            industries.append(g)
        industries.sort(key=lambda x: x.get("inflow") or 0, reverse=True)

    t3 = time.time()
    concepts = boards("concept", "inflow", 60)
    _hot_timing(f"concept_boards {time.time() - t3:.1f}s")
    # Sum the whole market, not the top lists, so the three numbers on the
    # card add up (inflow + outflow = net) and users can trust the total.
    total_in = sum(r.get("main_inflow") or 0 for r in inflow_rows)
    total_out = sum(r.get("main_inflow") or 0 for r in outflow_rows)
    result = {
        "gainers": gainers,
        "losers": losers,
        "inflow": inflow,
        "outflow": outflow,
        "speeders": speeders,
        "industries_in": industries[:8],
        "industries_out": industries[-5:][::-1],
        "concepts_in": concepts[:6],
        "totals": {"inflow": total_in, "outflow": total_out, "net": total_in + total_out},
        "source": (spot or {}).get("source"),
        "updated": time.time(),
    }
    db.cache_set(key, result)
    _hot_timing(f"total {time.time() - t0:.1f}s")
    return result


def industry_trends(limit: int = 8) -> list[dict]:
    cached = db.cache_get(f"industry:trends:{limit}", 300)
    if cached:
        return cached
    inds = boards("industry", "inflow", 100)[:limit]
    if not inds:
        return []

    name_to_code = {str(v): k for k, v in market.stock_name_map().items() if v}

    def history(b: dict) -> tuple[list[dict], str | None, bool]:
        """Board index history, or a clearly-labelled leader proxy.

        The Sina fallback has today's flow but no board-history endpoint.  In
        that case compute 5/20/60-day trend from the board's leader stock and
        mark it as a proxy; never present it as the official board index.
        """
        try:
            code = str(b.get("code", ""))
            if code.startswith("THS"):
                rows = _ths_board_rows(b["name"])
            elif code.startswith("BK"):
                rows = market.klines(code, limit=160, adjust="", secid_override=f"90.{code}")
            else:
                rows = []
            if len(rows) >= 25:
                return rows, None, False
            leader = str(b.get("leader") or "").strip()
            leader_code = b.get("leader_code") or name_to_code.get(leader)
            if leader_code:
                rows = market.klines(str(leader_code), limit=160, adjust="qfq")
                if len(rows) >= 25:
                    return rows, leader or str(leader_code), True
        except Exception:
            pass
        return [], None, False

    # Board histories are network-bound; fetch them together so the Daily page
    # spends roughly one request time, not eight.
    with ThreadPoolExecutor(max_workers=4) as ex:
        histories = list(ex.map(history, inds))

    out = []
    for b, (rows, proxy_name, proxy) in zip(inds, histories):
        closes = [r["close"] for r in rows]
        if len(closes) < 25:
            continue
        _ma(closes, 5)
        ma20 = _ma(closes, 20)
        ma60 = _ma(closes, 60)
        trend = "震荡"
        if ma20 and ma60:
            if closes[-1] > ma20 > ma60:
                trend = "多头"
            elif closes[-1] < ma20 < ma60:
                trend = "空头"
        out.append({
            **b,
            "pct5": round(_pct(closes, 5), 2) if _pct(closes, 5) is not None else None,
            "pct20": round(_pct(closes, 20), 2) if _pct(closes, 20) is not None else None,
            "pct60": round(_pct(closes, 60), 2) if _pct(closes, 60) is not None else None,
            "trend": trend,
            "ma20": round(ma20, 2) if ma20 else None,
            "ma60": round(ma60, 2) if ma60 else None,
            "proxy": proxy,
            "proxy_name": proxy_name,
            "source": (rows[-1].get("source") if rows else None) or ("leader-proxy" if proxy else "board-index"),
        })
    if out:
        db.cache_set(f"industry:trends:{limit}", out)
    return out


INDUSTRY_KEYWORDS: dict[str, tuple[str, ...]] = {
    "半导体": ("半导体", "芯片", "晶圆", "光刻", "存储", "封测"),
    "通信设备": ("通信", "光模块", "5G", "6G", "基站", "算力网络"),
    "人工智能": ("人工智能", "AI", "大模型", "智能体", "算力"),
    "软件服务": ("软件", "信创", "操作系统", "数据库", "SaaS"),
    "消费电子": ("消费电子", "手机", "苹果链", "折叠屏", "AR", "VR"),
    "新能源": ("光伏", "风电", "储能", "锂电", "电池", "新能源"),
    "汽车": ("汽车", "整车", "零部件", "智能驾驶", "车企"),
    "医药": ("医药", "创新药", "医疗器械", "CXO", "疫苗", "中药"),
    "白酒": ("白酒", "茅台", "五粮液", "酒企"),
    "食品饮料": ("食品", "饮料", "乳业", "调味品"),
    "银行": ("银行", "存款", "信贷", "息差"),
    "保险": ("保险", "保费", "险企"),
    "证券": ("券商", "证券", "两融", "IPO"),
    "房地产": ("房地产", "地产", "楼市", "房企", "土拍"),
    "基建": ("基建", "专项债", "工程", "建筑"),
    "有色金属": ("有色", "铜", "铝", "锂", "稀土", "黄金"),
    "煤炭": ("煤炭", "动力煤", "焦煤"),
    "石油": ("石油", "原油", "油价", "天然气"),
    "电力": ("电力", "电网", "电价", "核电", "水电"),
    "军工": ("军工", "国防", "航天", "航空", "导弹"),
    "传媒": ("传媒", "影视", "游戏", "广告", "出版"),
    "旅游": ("旅游", "酒店", "景区", "出行", "免税"),
    "零售": ("零售", "电商", "商超", "消费"),
    "家电": ("家电", "空调", "冰箱", "白电"),
    "农业": ("农业", "养殖", "猪价", "种业", "饲料"),
    "化工": ("化工", "化纤", "农药", "氟化工"),
    "钢铁": ("钢铁", "钢材", "铁矿"),
    "港口航运": ("港口", "航运", "集运", "运价"),
    "机械设备": ("机械", "工程机械", "机器人", "工业母机"),
}


def _news_tags(text: str) -> list[str]:
    hits = [name for name, words in INDUSTRY_KEYWORDS.items() if any(w in text for w in words)]
    return hits[:3]


def _news_url(x: dict) -> str:
    url = (x.get("url_w") or x.get("url_unique") or x.get("url_m") or "").strip()
    if url.startswith("http://"):
        url = "https://" + url[len("http://"):]
    if not url:
        title = (x.get("title") or "").strip()
        url = "https://so.eastmoney.com/news/s?keyword=" + urllib.parse.quote(title) if title else "https://finance.eastmoney.com/"
    return url


def _sina_news(limit: int = 20) -> list[dict]:
    """Sina rolling-news fallback when the Eastmoney news API is blocked."""
    import json
    import urllib.request

    t0 = time.time()
    try:
        url = ("https://feed.mix.sina.com.cn/api/roll/get?pageid=153&lid=2516"
               f"&num={max(5, limit)}&versionNumber=1.2.3&encode=utf-8")
        req = urllib.request.Request(url, headers={"User-Agent": market.UA, "Referer": "https://finance.sina.com.cn/"})
        payload = json.loads(urllib.request.urlopen(req, timeout=10).read().decode("utf-8", "ignore"))
        rows = (((payload or {}).get("result") or {}).get("data") or [])
        out = []
        seen = set()
        for x in rows:
            title = str(x.get("title") or "").strip()
            if not title or title in seen:
                continue
            seen.add(title)
            summary = str(x.get("intro") or "").strip()
            out.append({
                "title": title,
                "time": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(int(x.get("ctime") or 0))) if x.get("ctime") else "",
                "summary": summary,
                "url": str(x.get("url") or ""),
                "kind": "要闻",
                "industries": _news_tags(f"{title}{summary}"),
                "source": "新浪财经",
            })
        out.sort(key=lambda n: n.get("time") or "", reverse=True)
        out = out[:max(1, limit)]
        source_health.mark("sina", bool(out), time.time() - t0, "news")
        return out
    except Exception as exc:
        source_health.mark("sina", False, time.time() - t0, f"news: {exc}")
        return []


def market_news(limit: int = 20) -> list[dict]:
    cached = db.cache_get(f"market:news:v3:{limit}", 120)
    if cached:
        return cached
    import json
    import urllib.request

    items: list[dict] = []
    for channel, kind in (("102", "快讯"), ("101", "要闻")):
        url = f"https://newsapi.eastmoney.com/kuaixun/v1/getlist_{channel}_ajaxResult_50_1_.html"
        try:
            req = urllib.request.Request(url, headers={"User-Agent": market.UA, "Referer": "https://finance.eastmoney.com/"})
            text = urllib.request.urlopen(req, timeout=10).read().decode("utf-8", "ignore")
            payload = json.loads(text.split("=", 1)[1].strip().rstrip(";"))
            for x in payload.get("LivesList") or []:
                x = dict(x)
                x["_kind"] = kind
                items.append(x)
        except Exception:
            continue

    seen: set[str] = set()
    out = []
    for x in items:
        title = (x.get("title") or "").strip()
        if not title or title in seen:
            continue
        seen.add(title)
        summary = (x.get("digest") or "").strip()
        text = f"{title}{summary}"
        out.append({
            "title": title,
            "time": x.get("showtime") or "",
            "summary": summary,
            "url": _news_url(x),
            "kind": x.get("_kind") or "快讯",
            "industries": _news_tags(text),
            "source": "东方财富",
        })
    out.sort(key=lambda n: n.get("time") or "", reverse=True)
    out = out[:max(1, limit)]
    source_health.mark("eastmoney", bool(out), None, "news")
    # Eastmoney's 101 channel is often sparse/blocked.  Merge Sina's real
    # rolling news so the 要闻 tab is not almost empty; never synthesise items.
    if sum(1 for n in out if n.get("kind") == "要闻") < max(5, limit // 6):
        seen_titles = {n.get("title") for n in out}
        for n in _sina_news(min(limit, 30)):
            if n.get("title") not in seen_titles:
                out.append(n)
                seen_titles.add(n.get("title"))
        out.sort(key=lambda n: n.get("time") or "", reverse=True)
        out = out[:max(1, limit)]
    db.cache_set(f"market:news:v3:{limit}", out)
    return out

GLOBAL_INDEXES = [
    ("000001", "上证指数", "1.000001", "A股", "综合", "沪市全市场加权指数，权重股与金融、能源占比高。", "关注权重股与成交额；政策与流动性变化会放大波动。"),
    ("399001", "深证成指", "0.399001", "A股", "综合", "深市核心指数，制造业与科技成长权重更高。", "弹性大于上证，需结合创业板与中小盘风格判断。"),
    ("399006", "创业板指", "0.399006", "A股", "成长", "创业板龙头指数，新能源、医药、半导体权重高。", "波动大，趋势反转时常伴随估值快速压缩。"),
    ("000688", "科创50", "1.000688", "A股", "硬科技", "科创板市值与流动性代表，半导体权重高。", "高弹性、高估值敏感，注意流动性与解禁压力。"),
    ("000300", "沪深300", "1.000300", "A股", "大盘", "沪深两市大盘蓝筹基准，机构与北向资金常用基准。", "风格切换时相对强弱更明显，适合观察机构态度。"),
    ("000016", "上证50", "1.000016", "A股", "大盘价值", "沪市龙头蓝筹，金融、消费、能源权重集中。", "防御属性较强，但成长行情中可能跑输。"),
    ("000905", "中证500", "1.000905", "A股", "中盘", "剔除沪深300后的中盘代表，制造与周期较多。", "关注中盘风格与盈利修复，流动性弱于大盘。"),
    ("000852", "中证1000", "1.000852", "A股", "小盘", "小市值代表，题材与量化资金敏感。", "波动与换手高，注意微盘流动性和风格拥挤。"),
    ("899050", "北证50", "0.899050", "A股", "北交所", "北交所核心指数，专精特新与小微盘占比高。", "流动性较主板弱，单日波动与情绪影响更大。"),
    ("000510", "中证A500", "1.000510", "A股", "宽基", "覆盖各行业龙头的均衡宽基，行业分布更分散。", "适合观察全市场龙头整体表现与风格均衡度。"),
    ("399303", "国证2000", "0.399303", "A股", "小微盘", "小微盘综合指数，题材与活跃资金相关。", "高波动、高换手，需警惕流动性与退潮风险。"),
    ("000015", "红利指数", "1.000015", "A股", "红利", "高股息、低估值风格代表，防御属性突出。", "利率上行或成长风格占优时可能阶段性跑输。"),
    ("SPX", "标普500", "100.SPX", "美股", "美股宽基", "美国大盘基准，科技与消费权重高。", "隔夜美股受汇率与时差影响；关注利率与盈利预期。"),
    ("NDX", "纳斯达克", "100.NDX", "美股", "科技成长", "美国科技成长代表，对利率敏感。", "波动通常大于标普500，注意隔夜跳空。"),
    ("DJIA", "道琼斯", "100.DJIA", "美股", "价值蓝筹", "美国传统蓝筹与工业权重指数。", "趋势较稳但弹性有限，适合观察风险偏好。"),
]


def _ema(vals: list[float], n: int) -> list[float]:
    k = 2 / (n + 1)
    out = []
    prev = vals[0] if vals else 0
    for v in vals:
        prev = v * k + prev * (1 - k)
        out.append(prev)
    return out


_US_INDEX_SINA = {"SPX": ".INX", "NDX": ".IXIC", "DJIA": ".DJI"}
_US_AK_LOCK = threading.Lock()


def _us_index_klines(code: str) -> list[dict]:
    """Sina daily history for the US indices when Eastmoney is unavailable."""
    symbol = _US_INDEX_SINA.get(code)
    if not symbol:
        return []
    try:
        # akshare's Sina US adapter embeds libmini_racer; initialise it from one
        # thread at a time or the V8 isolate can abort the process.
        with _US_AK_LOCK:
            import akshare as ak
            df = ak.index_us_stock_sina(symbol=symbol)
        out = []
        prev = None
        for _, r in df.tail(420).iterrows():
            close = market._num(r.get("close"))
            if close is None:
                continue
            out.append({
                "date": str(r.get("date")),
                "open": market._num(r.get("open")),
                "high": market._num(r.get("high")),
                "low": market._num(r.get("low")),
                "close": close,
                "volume": market._num(r.get("volume"), 0),
                "pct": round((close / prev - 1) * 100, 2) if prev else None,
                "chg": round(close - prev, 4) if prev else None,
            })
            prev = close
        return out
    except Exception:
        return []


_INDEX_ANALYSIS_KEY = "market:index-analysis:v2"
_INDEX_ANALYSIS_LOCK = threading.Lock()
_INDEX_ANALYSIS_COMPUTE_LOCK = threading.Lock()
_INDEX_ANALYSIS_REFRESHING = False


def _refresh_index_analysis() -> None:
    global _INDEX_ANALYSIS_REFRESHING
    try:
        with _INDEX_ANALYSIS_COMPUTE_LOCK:
            result = _compute_index_analysis()
        if result:
            db.cache_set(_INDEX_ANALYSIS_KEY, {"rows": result, "_ts": time.time()})
    except Exception:
        pass
    finally:
        with _INDEX_ANALYSIS_LOCK:
            _INDEX_ANALYSIS_REFRESHING = False


def index_analysis() -> list[dict]:
    """Return the last index table immediately and refresh it in the background."""
    global _INDEX_ANALYSIS_REFRESHING
    cached = db.cache_get(_INDEX_ANALYSIS_KEY)
    if isinstance(cached, dict) and cached.get("rows"):
        age = time.time() - float(cached.get("_ts") or 0)
        if age > 300:
            with _INDEX_ANALYSIS_LOCK:
                if not _INDEX_ANALYSIS_REFRESHING:
                    _INDEX_ANALYSIS_REFRESHING = True
                    threading.Thread(target=_refresh_index_analysis, daemon=True).start()
        return cached["rows"]
    with _INDEX_ANALYSIS_COMPUTE_LOCK:
        cached = db.cache_get(_INDEX_ANALYSIS_KEY)
        if isinstance(cached, dict) and cached.get("rows"):
            return cached["rows"]
        result = _compute_index_analysis()
    if result:
        db.cache_set(_INDEX_ANALYSIS_KEY, {"rows": result, "_ts": time.time()})
    return result


def _compute_index_analysis() -> list[dict]:
    # Fifteen indices used to be fetched one by one. Use a small pool so the
    # page paints in roughly the slowest single request instead of the sum.
    from concurrent.futures import ThreadPoolExecutor

    def fetch(item):
        code, _name, secid, _region, _style, _desc, _note = item
        try:
            rows = market.klines(code, limit=280, adjust="", secid_override=secid, allow_akshare=False)
        except Exception:
            rows = []
        if len(rows) < 20:
            rows = _us_index_klines(code) or rows
        return secid, rows

    with ThreadPoolExecutor(max_workers=6) as pool:
        fetched = dict(pool.map(fetch, GLOBAL_INDEXES))

    out = []
    for code, name, secid, region, style, desc, note in GLOBAL_INDEXES:
        rows = fetched.get(secid, [])
        closes = [r["close"] for r in rows]
        if not closes:
            out.append({"code": code, "name": name, "region": region, "style": style, "desc": desc,
                        "price": None, "pct": None, "ma20": None, "ma60": None, "trend": "无数据",
                        "support": None, "resistance": None, "pct7": None, "pct20": None, "pct60": None,
                        "note": note, "bias": "无数据", "score": 50, "action": "等待数据", "conclusion": "暂无数据",
                        "attention": None, "focus": note, "source": None, "as_of": None})
            continue

        def ma(n):
            return round(sum(closes[-n:]) / n, 2) if len(closes) >= n else None

        def ret(n):
            return round((closes[-1] / closes[-1 - n] - 1) * 100, 2) if len(closes) > n else None

        price = closes[-1]
        m5, m10, m20, m60, m120 = ma(5), ma(10), ma(20), ma(60), ma(120)
        trend = "震荡"
        if m20 and m60:
            if price > m20 > m60:
                trend = "多头"
            elif price < m20 < m60:
                trend = "空头"
            elif price > m20:
                trend = "偏强"
            elif price < m20:
                trend = "偏弱"
        gains = losses = 0.0
        for j in range(max(1, len(closes) - 14), len(closes)):
            ch = closes[j] - closes[j - 1]
            if ch > 0:
                gains += ch
            else:
                losses -= ch
        rsi = 100.0 if losses == 0 else 100 - 100 / (1 + gains / losses)
        e12, e26 = _ema(closes, 12), _ema(closes, 26)
        dif = e12[-1] - e26[-1]
        dea = _ema([a - b for a, b in zip(e12, e26)], 9)[-1]
        hist = (dif - dea) * 2
        rets = [(closes[i] / closes[i - 1] - 1) * 100 for i in range(max(1, len(closes) - 20), len(closes))]
        vol20 = (sum((x - sum(rets) / len(rets)) ** 2 for x in rets) / max(len(rets), 1)) ** 0.5
        lows = [r["low"] for r in rows[-20:]]
        highs = [r["high"] for r in rows[-20:]]
        support, resistance = min(lows), max(highs)
        high52 = max(closes[-250:])
        low52 = min(closes[-250:])
        pct1, pct5, pct20, pct60, pct120 = ret(1), ret(5), ret(20), ret(60), ret(120)
        bias20 = (price / m20 - 1) * 100 if m20 else 0
        score = 50.0
        score += 10 if m20 and price > m20 else -10
        score += 10 if m20 and m60 and m20 > m60 else -10
        score += max(-10, min(10, (pct20 or 0) / 2))
        score += max(-8, min(8, (rsi - 50) * 0.32))
        score += max(-6, min(6, pct5 or 0))
        score = max(0, min(100, score))
        if score >= 65:
            bias = "偏多"
            action = "趋势偏多，可维持中性偏积极仓位；跌破 MA20 时减仓。"
        elif score <= 40:
            bias = "偏空"
            action = "结构偏弱，优先降低仓位，等待重新站上 MA20。"
        else:
            bias = "中性"
            action = "震荡格局，控制仓位，等待放量突破压力或回踩支撑。"
        conclusion = f"{trend}结构 · {bias}（{round(score)}分）。{action}"
        attention = f"支撑 {support:.2f} · 压力 {resistance:.2f} · MA20 {m20:.2f}" if m20 else f"支撑 {support:.2f} · 压力 {resistance:.2f}"
        if trend == "多头":
            focus = "站稳 MA20 可继续持有；跌破 MA20 先减仓。"
        elif trend == "空头":
            focus = "先看能否收复 MA20；站不回去，反弹只当减仓。"
        else:
            focus = "区间思路：支撑附近观察承接，压力附近看放量突破。"
        focus = f"{focus} {note or ''}".strip()
        out.append({
            "code": code, "name": name, "region": region, "style": style, "desc": desc,
            "price": round(price, 2), "pct": rows[-1].get("pct"), "chg": rows[-1].get("chg"),
            "ma5": m5, "ma10": m10, "ma20": m20, "ma60": m60, "ma120": m120,
            "trend": trend, "support": round(support, 2), "resistance": round(resistance, 2),
            "high52": round(high52, 2), "low52": round(low52, 2),
            "pct1": pct1, "pct5": pct5, "pct7": ret(7), "pct20": pct20, "pct60": pct60, "pct120": pct120,
            "rsi": round(rsi, 1), "dif": round(dif, 2), "dea": round(dea, 2), "macd_hist": round(hist, 2),
            "vol20": round(vol20, 2), "bias20": round(bias20, 2),
            "score": round(score), "bias": bias, "action": action, "conclusion": conclusion,
            "attention": attention, "focus": focus,
            "note": note, "date": rows[-1].get("date"),
            "source": rows[-1].get("source") or "unknown",
            "as_of": rows[-1].get("date"),
        })
    return out

REGION_SUFFIX = {
    "北京": "北京市", "天津": "天津市", "上海": "上海市", "重庆": "重庆市",
    "河北": "河北省", "山西": "山西省", "辽宁": "辽宁省", "吉林": "吉林省",
    "黑龙江": "黑龙江省", "江苏": "江苏省", "浙江": "浙江省", "安徽": "安徽省",
    "福建": "福建省", "江西": "江西省", "山东": "山东省", "河南": "河南省",
    "湖北": "湖北省", "湖南": "湖南省", "广东": "广东省", "海南": "海南省",
    "四川": "四川省", "贵州": "贵州省", "云南": "云南省", "陕西": "陕西省",
    "甘肃": "甘肃省", "青海": "青海省", "台湾": "台湾省",
    "内蒙古": "内蒙古自治区", "广西": "广西壮族自治区", "西藏": "西藏自治区",
    "宁夏": "宁夏回族自治区", "新疆": "新疆维吾尔自治区",
}


def _sina_region_direct() -> list[dict]:
    """Sina region board summary (newFLJK?param=area), stdlib only.

    The payload includes company count, region pct and the leading stock, so
    the map remains usable when Eastmoney push2 and akshare are rate-limited.
    """
    import json
    import urllib.request

    cached = db.cache_get("region:sina:enrich:v2", 6 * 3600)
    if cached:
        return cached
    t0 = time.time()
    try:
        url = "https://money.finance.sina.com.cn/q/view/newFLJK.php?param=area"
        req = urllib.request.Request(url, headers={"User-Agent": market.UA, "Referer": "https://finance.sina.com.cn/"})
        text = urllib.request.urlopen(req, timeout=10).read().decode("gbk", "ignore")
        payload = json.loads(text.split("=", 1)[1].strip().rstrip(";")) if "=" in text else {}
        full_to_short = {v: k for k, v in REGION_SUFFIX.items()}
        out = []
        for key, row in payload.items():
            p = str(row).split(",")
            if len(p) < 9 or not p[1]:
                continue
            name = p[1]
            short = full_to_short.get(name, name.replace("省", "").replace("市", "").replace("自治区", "").replace("特别行政区", ""))
            leader_code = p[8] if p[8] else None
            if leader_code and len(leader_code) > 2:
                leader_code = leader_code[2:]
            leader = p[12] if len(p) > 12 else None
            out.append({
                "name": name, "short": short, "code": key,
                "count": int(market._num(p[2]) or 0), "up": None, "down": None, "flat": None,
                "pct": market._num(p[5]), "inflow": None,
                "leader": leader, "leader_code": leader_code, "leader_pct": market._num(p[9]),
                "leaders": ([{"code": leader_code, "name": leader, "price": market._num(p[10]),
                              "pct": market._num(p[9]), "inflow": None, "industry": ""}]
                            if leader_code and leader else []),
                "industries": [],
                "source": "sina-area",
            })
        # Enrich the compact area table with its constituent sample.  The
        # old page showed "100 companies" but no up/down/leaders because the
        # area summary has no membership.  Sina's node endpoint does.
        def enrich(b: dict) -> dict:
            try:
                members = market.sina_node_members(b["code"], limit=2000, pages=20)
            except Exception:
                return b
            if not members:
                return b
            pcts = [m.get("pct") for m in members if m.get("pct") is not None]
            b["count"] = len(members)
            b["up"] = sum(1 for x in pcts if x > 0)
            b["down"] = sum(1 for x in pcts if x < 0)
            b["flat"] = len(pcts) - b["up"] - b["down"]
            by_pct = sorted(members, key=lambda m: m.get("pct") or -999, reverse=True)
            leaders = []
            for m in by_pct[:3]:
                code = str(m.get("code") or "")
                leaders.append({
                    "code": code, "name": m.get("name") or "",
                    "price": m.get("price"), "pct": m.get("pct"),
                    "inflow": None, "industry": market.industry_name(code),
                })
            b["leaders"] = leaders
            if leaders:
                b["leader"], b["leader_code"], b["leader_pct"] = leaders[0]["name"], leaders[0]["code"], leaders[0]["pct"]
            counts: dict[str, int] = {}
            for m in members:
                ind = market.industry_name(str(m.get("code") or ""))
                if ind:
                    counts[ind] = counts.get(ind, 0) + 1
            b["industries"] = [k for k, _ in sorted(counts.items(), key=lambda kv: kv[1], reverse=True)[:3]]
            b["sample_capped"] = False
            b["source"] = "sina-area-full"
            return b

        try:
            with ThreadPoolExecutor(max_workers=12) as ex:
                out = list(ex.map(enrich, out))
        except Exception:
            pass
        out.sort(key=lambda x: x["count"], reverse=True)
        if out:
            db.cache_set("region:sina:enrich:v2", out)
        source_health.mark("sina", bool(out), time.time() - t0, "regions")
        return out
    except Exception as exc:
        source_health.mark("sina", False, time.time() - t0, f"regions: {exc}")
        return []


def _sina_region_rows() -> list[dict]:
    """31-region fallback with true counts, breadth and top leaders."""
    direct = _sina_region_direct()
    if direct:
        return direct
    try:
        import akshare as ak
        df = ak.stock_sector_spot(indicator="地域")
    except Exception:
        return []
    out = []
    for _, r in df.iterrows():
        name = str(r.get("板块") or "").strip()
        label = r.get("label")
        if not name or not label:
            continue
        out.append({
            "name": name, "short": name, "code": label,
            "count": int(market._num(r.get("公司家数")) or 0),
            "up": None, "down": None, "flat": None,
            "pct": market._num(r.get("涨跌幅")),
            "inflow": None,
            "leader": r.get("股票名称"), "leader_code": None,
            "leader_pct": market._num(r.get("个股-涨跌幅")),
        })

    def enrich(row: dict) -> dict:
        try:
            import akshare as ak
            detail = ak.stock_sector_detail(sector=row["code"])
        except Exception:
            return row
        if detail is None or len(detail) == 0:
            return row
        detail = detail.sort_values("changepercent", ascending=False)
        row["count"] = len(detail)
        pcts = [market._num(x) for x in detail["changepercent"].tolist()]
        row["up"] = sum(1 for x in pcts if x is not None and x > 0.01)
        row["down"] = sum(1 for x in pcts if x is not None and x < -0.01)
        row["flat"] = len(detail) - row["up"] - row["down"]
        leaders = []
        for _, x in detail.head(3).iterrows():
            code = str(x.get("code") or "")
            leaders.append({
                "code": code, "name": x.get("name") or "",
                "price": market._num(x.get("trade")),
                "pct": market._num(x.get("changepercent")),
                "inflow": None, "industry": "",
            })
        row["leaders"] = leaders
        if leaders:
            row["leader"] = leaders[0]["name"]
            row["leader_code"] = leaders[0]["code"]
            row["leader_pct"] = leaders[0]["pct"]
        return row

    try:
        with ThreadPoolExecutor(max_workers=8) as ex:
            out = list(ex.map(enrich, out))
    except Exception:
        out = [enrich(x) for x in out]
    out.sort(key=lambda x: x["count"], reverse=True)
    return out


def company_distribution() -> dict:
    cached = db.cache_get("market:company-map:v3", 600)
    if cached:
        return cached
    # Sina's compact area table answers in ~0.2 s; Eastmoney's push2 list often
    # blocks for six seconds when rate-limited.  Prefer the fast independent
    # source for first paint; the capped sample is explicitly labelled in UI.
    direct = _sina_region_direct()
    if direct:
        capped = any(bool(x.get("sample_capped")) for x in direct)
        universe = 0
        try:
            spot = market.cached_spot() or {}
            universe = int(spot.get("expected") or 0)
        except Exception:
            universe = 0
        result = {"total": sum(x["count"] for x in direct), "total_universe": universe or None,
                  "capped": capped, "source": (direct[0].get("source") if direct else "sina-area"), "provinces": direct, "updated": time.time()}
        db.cache_set("market:company-map:v3", result)
        return result
    url = (
        "https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=60&po=1&np=1&fltt=2&invt=2&fid=f3"
        "&fs=m:90+t:1&fields=f12,f14,f2,f3,f62,f104,f105,f106"
    )
    try:
        d = market._http_json(url)
        rows = ((d or {}).get("data") or {}).get("diff") or []
    except Exception:
        rows = []
    out = []
    for r in rows:
        raw = str(r.get("f14") or "").replace("板块", "")
        geo = REGION_SUFFIX.get(raw, raw)
        up = int(r.get("f104") or 0)
        down = int(r.get("f105") or 0)
        flat = int(r.get("f106") or 0)
        total = up + down + flat
        if not total:
            continue
        out.append({
            "name": geo, "short": raw, "code": r.get("f12"),
            "count": total, "up": up, "down": down, "flat": flat,
            "pct": r.get("f3"), "inflow": r.get("f62"),
        })
    if not out:
        out = _sina_region_rows()
    out.sort(key=lambda x: x["count"], reverse=True)
    capped = bool(out and out[0].get("source") == "sina-area")
    universe = 0
    try:
        spot = market.cached_spot() or {}
        universe = int(spot.get("expected") or 0)
    except Exception:
        universe = 0
    result = {
        "total": sum(x["count"] for x in out),
        "total_universe": universe or None,
        "capped": capped,
        "source": (out[0].get("source") if out else None) or "eastmoney",
        "provinces": out, "updated": time.time(),
    }
    if out:
        db.cache_set("market:company-map:v3", result)
    return result

def province_leaders() -> dict:
    cached = db.cache_get("market:province-leaders:v3", 600)
    if cached:
        return cached
    dist = company_distribution()
    provinces = dist.get("provinces", [])
    if provinces and provinces[0].get("leaders"):
        result = {"updated": time.time(), "provinces": [{**p, "industries": []} for p in provinces]}
        db.cache_set("market:province-leaders:v3", result)
        return result

    def fetch(p: dict) -> dict:
        code = p.get("code")
        url = (
            f"https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=10&po=1&np=1&fltt=2&invt=2&fid=f3"
            f"&fs=b:{code}&fields=f12,f14,f2,f3,f62,f100"
        )
        try:
            d = market._http_json(url)
            rows = ((d or {}).get("data") or {}).get("diff") or []
        except Exception:
            rows = []
        leaders = []
        for r in rows[:3]:
            leaders.append({
                "code": str(r.get("f12") or ""), "name": r.get("f14") or "",
                "price": r.get("f2"), "pct": r.get("f3"),
                "inflow": r.get("f62"), "industry": r.get("f100") or "",
            })
        counts: dict[str, int] = {}
        for r in rows:
            ind = r.get("f100") or ""
            if ind:
                counts[ind] = counts.get(ind, 0) + 1
        industries = [k for k, _ in sorted(counts.items(), key=lambda kv: kv[1], reverse=True)[:3]]
        return {**p, "leaders": leaders, "industries": industries}

    try:
        from concurrent.futures import ThreadPoolExecutor
        with ThreadPoolExecutor(max_workers=8) as ex:
            out = list(ex.map(fetch, provinces))
    except Exception:
        out = [fetch(p) for p in provinces]
    result = {"updated": time.time(), "provinces": out}
    if out:
        db.cache_set("market:province-leaders:v3", result)
    return result
