"""Market regime: index trends, breadth, turnover, leading sectors and a verdict."""
from __future__ import annotations

import math
import time

from . import clock, db, market

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


def _boards(fs: str, size: int = 40) -> list[dict]:
    url = (
        f"{market.EM_LIST}?pn=1&pz={size}&po=1&np=1&fltt=2&invt=2&fid=f3&fs={fs}"
        "&fields=f12,f14,f3,f62,f104,f105"
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
        })
    return out


def market_state() -> dict:
    cached = db.cache_get("market:state", 60)
    if cached:
        return cached

    # ---- index trend
    idx = market.indices()
    by_code = {i["code"]: i for i in idx}
    details = []
    closes_by_code: dict[str, list[float]] = {}
    for code, sec in INDEX_SECIDS.items():
        rows = market.klines(code, limit=160, adjust="", secid_override=sec)
        closes = [r["close"] for r in rows]
        closes_by_code[code] = closes
        q = by_code.get(code, {})
        ma5, ma10 = _ma(closes, 5), _ma(closes, 10)
        ma20, ma60 = _ma(closes, 20), _ma(closes, 60)
        price = q.get("price") or (closes[-1] if closes else None)
        dif, dea = _macd(closes)
        td_buy, td_sell = _td(closes)
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
    breadth = market.market_breadth()
    spot = db.cache_get("spot:v3", 600)
    if not spot:
        try:
            spot = market.fetch_spot(ttl=600)
            breadth = market.market_breadth()
        except Exception:
            spot = None
    turnover = None
    if spot:
        amounts = [r.get("amount") or 0 for r in spot.get("rows", [])]
        turnover = sum(amounts)

    # ---- sectors
    industries = _boards("m:90+t:2", 60)
    concepts = _boards("m:90+t:3", 40)
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
        "ts": time.time(),
        "indices": details,
        "breadth": {**breadth, "up_ratio": round(up_ratio * 100, 1)},
        "turnover": round(turnover, 2) if turnover else None,
        "sectors": {"top": top_ind, "bottom": bottom_ind, "concepts": top_con},
        "score": score,
        "verdict": {"label": label, "tone": tone, "reasons": reasons},
        "status": clock.market_status(),
    }
    db.cache_set("market:state", result)
    return result


def _board_rows(kind: str = "industry") -> list[dict]:
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
            "kind": kind,
        })
    if not out and kind == "industry":
        for i, r in enumerate(market._sina_industry_flow()):
            name = r.get("name") or ""
            if not name:
                continue
            out.append({
                "code": f"SINA{i}", "name": name,
                "pct": r.get("pct"), "inflow": r.get("inflow"),
                "up": None, "down": None,
                "leader": r.get("leader"), "leader_code": None,
                "leader_pct": r.get("leader_pct"), "kind": kind,
            })
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
    key = f"market:heatmap:{groups_limit}:{per_group}"
    cached = db.cache_get(key, 120)
    if cached:
        return cached
    spot = db.cache_get("spot:v3", 600)
    if not spot:
        try:
            spot = market.fetch_spot(ttl=600)
        except Exception:
            spot = None
    rows = (spot or {}).get("rows", [])
    buckets: dict[str, list[dict]] = {}
    for r in rows:
        if not r.get("mcap") or not r.get("price") or r.get("pct") is None:
            continue
        ind = r.get("industry") or r.get("market") or "其他"
        buckets.setdefault(ind, []).append({
            "code": r["code"],
            "name": r["name"],
            "value": round((r["mcap"] or 0) / 1e8, 2),
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
    result = {"groups": groups[:groups_limit], "updated": time.time(), "total": len(rows)}
    db.cache_set(key, result)
    return result


def limit_pool(direction: str = "up", limit: int = 30) -> list[dict]:
    spot = db.cache_get("spot:v3", 600)
    if not spot:
        try:
            spot = market.fetch_spot(ttl=600)
        except Exception:
            spot = None
    rows = (spot or {}).get("rows", [])
    def _limit_pct(r: dict) -> float:
        code = r.get("code") or ""
        name = (r.get("name") or "").upper()
        if "ST" in name:
            return 4.8
        if code.startswith(("300", "301", "688")):
            return 19.7
        if code.startswith(("8", "4", "92")):
            return 29.5
        return 9.7

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


def hot_board(limit: int = 10) -> dict:
    spot = db.cache_get("spot:v3", 600)
    if not spot:
        try:
            spot = market.fetch_spot(ttl=600)
        except Exception:
            spot = None
    rows = [
        r for r in (spot or {}).get("rows", [])
        if r.get("price") and (r.get("amount") or 0) > 0
        and "退" not in (r.get("name") or "") and "ST" not in (r.get("name") or "").upper()
    ]
    flow = market._fund_flow()
    for r in rows:
        f = flow.get(r.get("code"))
        if f:
            r.update(f)

    def slim(r):
        return {
            "code": r.get("code"), "name": r.get("name"), "price": r.get("price"),
            "pct": r.get("pct"), "amount": r.get("amount"), "mcap": r.get("mcap"),
            "inflow": r.get("main_inflow"), "industry": r.get("industry"),
            "speed": r.get("speed"), "volume_ratio": r.get("volume_ratio"),
        }

    gainers = [slim(r) for r in sorted(rows, key=lambda r: r.get("pct") or -999, reverse=True)[:limit]]
    losers = [slim(r) for r in sorted(rows, key=lambda r: r.get("pct") or 999)[:limit]]
    inflow = [slim(r) for r in sorted(rows, key=lambda r: r.get("main_inflow") or -1e18, reverse=True)[:limit]]
    outflow = [slim(r) for r in sorted(rows, key=lambda r: r.get("main_inflow") or 1e18)[:limit]]
    speeders = [slim(r) for r in sorted(rows, key=lambda r: r.get("speed") or -999, reverse=True)[:limit]]

    industries = boards("industry", "inflow", 100)
    concepts = boards("concept", "inflow", 60)
    return {
        "gainers": gainers,
        "losers": losers,
        "inflow": inflow,
        "outflow": outflow,
        "speeders": speeders,
        "industries_in": industries[:8],
        "industries_out": industries[-5:][::-1],
        "concepts_in": concepts[:6],
        "updated": time.time(),
    }


def industry_trends(limit: int = 8) -> list[dict]:
    cached = db.cache_get(f"industry:trends:{limit}", 300)
    if cached:
        return cached
    inds = boards("industry", "inflow", 100)[:limit]
    out = []
    for b in inds:
        try:
            rows = market.klines(b["code"], limit=160, adjust="", secid_override=f"90.{b['code']}")
            closes = [r["close"] for r in rows]
            if len(closes) < 25:
                continue
            ma5 = _ma(closes, 5)
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
            })
        except Exception:
            continue
    db.cache_set(f"industry:trends:{limit}", out)
    return out


def market_news(limit: int = 12) -> list[dict]:
    cached = db.cache_get(f"market:news:{limit}", 120)
    if cached:
        return cached
    import json
    import urllib.request
    url = "https://newsapi.eastmoney.com/kuaixun/v1/getlist_102_ajaxResult_50_1_.html"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": market.UA, "Referer": "https://finance.eastmoney.com/"})
        text = urllib.request.urlopen(req, timeout=10).read().decode("utf-8", "ignore")
        payload = json.loads(text.split("=", 1)[1].strip().rstrip(";"))
        items = payload.get("LivesList") or []
    except Exception:
        items = []
    out = []
    for x in items[:limit]:
        out.append({
            "title": x.get("title"),
            "time": x.get("showtime"),
            "summary": x.get("digest"),
            "url": x.get("url_w") or x.get("url_unique"),
        })
    db.cache_set(f"market:news:{limit}", out)
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


def index_analysis() -> list[dict]:
    out = []
    for code, name, secid, region, style, desc, note in GLOBAL_INDEXES:
        try:
            rows = market.klines(code, limit=280, adjust="", secid_override=secid)
        except Exception:
            rows = []
        closes = [r["close"] for r in rows]
        if not closes:
            out.append({"code": code, "name": name, "region": region, "style": style, "desc": desc,
                        "price": None, "pct": None, "ma20": None, "ma60": None, "trend": "无数据",
                        "support": None, "resistance": None, "pct7": None, "pct20": None, "pct60": None,
                        "note": note, "bias": "无数据", "score": 50, "action": "等待数据", "conclusion": "暂无数据"})
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
            "note": note, "date": rows[-1].get("date"),
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


def company_distribution() -> dict:
    cached = db.cache_get("market:company-map:v1", 600)
    if cached:
        return cached
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
    out.sort(key=lambda x: x["count"], reverse=True)
    result = {"total": sum(x["count"] for x in out), "provinces": out, "updated": time.time()}
    if out:
        db.cache_set("market:company-map:v1", result)
    return result

def province_leaders() -> dict:
    cached = db.cache_get("market:province-leaders:v1", 600)
    if cached:
        return cached
    dist = company_distribution()
    provinces = dist.get("provinces", [])

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
        db.cache_set("market:province-leaders:v1", result)
    return result
