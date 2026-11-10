"""Account book: trades -> positions -> P&L / NAV / statistics."""
from __future__ import annotations

import math
from collections import defaultdict
from datetime import date, datetime, timedelta
from typing import Any

from . import db, market, technical

FEE_KEYS = {"commission": "佣金", "stamp": "印花税", "transfer": "过户费", "other": "其他"}


def _today() -> str:
    return date.today().isoformat()


def load_trades() -> list[dict]:
    with db._lock, db._conn(db.DB_PATH) as c:
        rows = c.execute("SELECT * FROM trades ORDER BY trade_date, id").fetchall()
    return [dict(r) for r in rows]


def _get_trade(tid: int) -> dict | None:
    with db._lock, db._conn(db.DB_PATH) as c:
        r = c.execute("SELECT * FROM trades WHERE id=?", (tid,)).fetchone()
    return dict(r) if r else None


def add_trade(code: str, side: str, price: float, qty: int, trade_date: str, fee: float = 0, name: str = "", note: str = "") -> dict:
    code = str(code).strip()
    if not code.isdigit() or len(code) != 6:
        raise ValueError("股票代码需为 6 位数字")
    if side not in ("buy", "sell"):
        raise ValueError("交易方向无效")
    price = round(float(price), 3)
    qty = int(qty)
    if price <= 0 or qty <= 0:
        raise ValueError("价格和数量必须大于 0")
    if qty % 100 != 0 and market.market_of(code) not in ("科创板",):
        raise ValueError("A 股买卖数量需为 100 股（1 手）的整数倍")
    fee = round(float(fee or 0), 2)
    try:
        date.fromisoformat(trade_date)
    except Exception:
        raise ValueError("日期格式应为 YYYY-MM-DD")
    if side == "sell":
        pos = {p["code"]: p for p in positions()}.get(code)
        held = pos["qty"] if pos else 0
        if held < qty:
            raise ValueError(f"卖出数量超过持仓（当前持有 {held} 股）")
    if not name:
        name = market.resolve_name(code)
    with db._lock, db._conn(db.DB_PATH) as c:
        cur = c.execute(
            "INSERT INTO trades(code,name,side,price,qty,fee,trade_date,note) VALUES(?,?,?,?,?,?,?,?)",
            (code, name, side, price, qty, fee, trade_date, note or ""),
        )
        c.commit()
        tid = cur.lastrowid
    return _get_trade(tid) or {}


def update_trade(tid: int, **fields) -> dict:
    allowed = {"code", "name", "side", "price", "qty", "fee", "trade_date", "note"}
    sets, vals = [], []
    for k, v in fields.items():
        if k not in allowed or v is None:
            continue
        if k in ("price", "fee"):
            v = round(float(v), 2)
        if k == "qty":
            v = int(v)
        sets.append(f"{k}=?")
        vals.append(v)
    if not sets:
        raise ValueError("没有可更新的字段")
    vals.append(tid)
    with db._lock, db._conn(db.DB_PATH) as c:
        c.execute(f"UPDATE trades SET {','.join(sets)} WHERE id=?", vals)
        c.commit()
    return _get_trade(tid) or {}


def delete_trade(tid: int):
    with db._lock, db._conn(db.DB_PATH) as c:
        c.execute("DELETE FROM trades WHERE id=?", (tid,))
        c.commit()


def clear_trades():
    with db._lock, db._conn(db.DB_PATH) as c:
        c.execute("DELETE FROM trades")
        c.commit()


def positions(trades: list[dict] | None = None) -> list[dict]:
    """Moving-average cost basis. Returns open positions only."""
    trades = load_trades() if trades is None else trades
    book: dict[str, dict] = {}
    for t in trades:
        code = t["code"]
        p = book.setdefault(
            code,
            {"code": code, "name": t.get("name") or "", "qty": 0, "cost": 0.0,
             "realized": 0.0, "fees": 0.0, "buys": 0, "sells": 0, "first_date": t["trade_date"],
             "last_date": t["trade_date"]},
        )
        p["fees"] += t["fee"] or 0
        p["last_date"] = t["trade_date"]
        if t.get("name"):
            p["name"] = t["name"]
        if t["side"] == "buy":
            p["cost"] += t["price"] * t["qty"] + (t["fee"] or 0)
            p["qty"] += t["qty"]
            p["buys"] += 1
        else:
            if p["qty"] <= 0:
                continue
            avg = p["cost"] / p["qty"]
            sell_qty = min(t["qty"], p["qty"])
            p["realized"] += (t["price"] - avg) * sell_qty - (t["fee"] or 0)
            p["cost"] -= avg * sell_qty
            p["qty"] -= sell_qty
            p["sells"] += 1
            if p["qty"] == 0:
                p["cost"] = 0.0
    out = []
    for p in book.values():
        if p["qty"] > 0:
            p["avg_cost"] = round(p["cost"] / p["qty"], 4)
            p["cost"] = round(p["cost"], 2)
            p["realized"] = round(p["realized"], 2)
            try:
                p["hold_days"] = max(0, (date.today() - date.fromisoformat(p["first_date"])).days)
            except Exception:
                p["hold_days"] = None
            out.append(p)
    return out


def _positions_with_quotes() -> list[dict]:
    pos = positions()
    qs = market.quotes([p["code"] for p in pos])
    out = []
    for p in pos:
        q = qs.get(p["code"]) or {}
        price = q.get("price")
        if price is None:
            kl = market.klines(p["code"], limit=5, adjust="")
            price = kl[-1]["close"] if kl else None
        p["price"] = price
        p["pct"] = q.get("pct")
        p["name"] = p["name"] or q.get("name") or p["code"]
        mv = (price or 0) * p["qty"]
        p["market_value"] = round(mv, 2)
        p["float_pnl"] = round(mv - p["cost"], 2)
        p["float_pct"] = round((mv / p["cost"] - 1) * 100, 2) if p["cost"] else None
        p["total_pnl"] = round(p["float_pnl"] + p["realized"], 2)
        p["total_pct"] = round(p["total_pnl"] / p["cost"] * 100, 2) if p["cost"] else None
        prev = q.get("prev_close")
        if prev is None and price is not None and q.get("pct") is not None:
            prev = price / (1 + q["pct"] / 100)
        p["today_pnl"] = round((price - prev) * p["qty"], 2) if (price is not None and prev) else None
        p["weight"] = None
        try:
            c = technical.chips(p["code"])
            fib = technical.fibonacci(p["code"])
            fsup = fres = None
            if fib and price:
                sups = [l["price"] for l in fib.get("levels", []) if l["price"] < price]
                ress = [l["price"] for l in fib.get("levels", []) if l["price"] > price]
                fsup = max(sups) if sups else None
                fres = min(ress) if ress else None
            supports = [x for x in (c.get("support"), fsup) if x]
            resistances = [x for x in (c.get("resistance"), fres) if x]
            p["support"] = max(supports) if supports else None
            p["resistance"] = min(resistances) if resistances else None
            if price and p["support"]:
                p["support_dist"] = round((p["support"] / price - 1) * 100, 2)
            if price and p["resistance"]:
                p["resistance_dist"] = round((p["resistance"] / price - 1) * 100, 2)
        except Exception:
            p["support"] = p["resistance"] = None
        out.append(p)
    return out


def _cash_flow(trades: list[dict]) -> dict:
    buy_total = sum(t["price"] * t["qty"] + (t["fee"] or 0) for t in trades if t["side"] == "buy")
    sell_total = sum(t["price"] * t["qty"] - (t["fee"] or 0) for t in trades if t["side"] == "sell")
    fees = sum((t["fee"] or 0) for t in trades)
    return {
        "buy_total": round(buy_total, 2),
        "sell_total": round(sell_total, 2),
        "fees": round(fees, 2),
        "net_invested": round(buy_total - sell_total, 2),
    }


def account_assets() -> float:
    cfg = db.get_setting("account", {}) or {}
    try:
        return float(cfg.get("assets") or cfg.get("capital") or cfg.get("cash") or 0)
    except Exception:
        return 0.0


def summary() -> dict:
    """Account assets is the single anchor; cash is derived from the trade book."""
    assets = account_assets()
    trades = load_trades()
    flow = _cash_flow(trades)
    cash = round(assets - flow["net_invested"], 2)
    pos = _positions_with_quotes()
    mv = sum(p["market_value"] for p in pos)
    total = cash + mv
    for p in pos:
        p["weight"] = round(p["market_value"] / total * 100, 2) if total else 0
    cost = sum(p["cost"] for p in pos)
    float_pnl = sum(p["float_pnl"] for p in pos)
    realized = sum(p["realized"] for p in pos)
    total_pnl = total - assets if trades else 0.0
    base = assets if assets > 0 else 1.0
    return {
        "assets": round(assets, 2),
        "initial_assets": round(assets, 2),
        "cash": cash,
        "market_value": round(mv, 2),
        "total": round(total, 2),
        "cost": round(cost, 2),
        "float_pnl": round(float_pnl, 2),
        "float_pct": round(float_pnl / cost * 100, 2) if cost else 0,
        "realized": round(realized, 2),
        "total_pnl": round(total_pnl, 2),
        "total_pct": round(total_pnl / base * 100, 2) if assets else 0,
        "start_capital": round(assets, 2),
        "cash_pct": round(cash / total * 100, 2) if total else 0,
        "position_pct": round(mv / total * 100, 2) if total else 0,
        "buy_total": flow["buy_total"],
        "sell_total": flow["sell_total"],
        "fees": flow["fees"],
        "net_invested": flow["net_invested"],
        "positions": pos,
        "has_trades": bool(trades),
        "trade_count": len(trades),
    }


def trades_any() -> bool:
    with db._lock, db._conn(db.DB_PATH) as c:
        r = c.execute("SELECT 1 FROM trades LIMIT 1").fetchone()
    return r is not None


# ---------------------------------------------------------------- analytics
def _daily_closes(codes: list[str], start: str) -> dict[str, dict[str, float]]:
    out = {}
    for code in codes:
        kl = market.klines(code, period="daily", limit=1500, adjust="")
        out[code] = {r["date"]: r["close"] for r in kl if r["close"] is not None and r["date"] >= start}
    return out


def equity_curve(benchmark: str = "000300") -> dict:
    trades = load_trades()
    if not trades:
        return {"series": [], "equity": [], "benchmark": [], "metrics": {}, "empty": True,
                "monthly": [], "drawdown": [], "trade_stats": {}, "by_stock": []}
    cfg = {"assets": account_assets()}
    start = min(t["trade_date"] for t in trades)
    today = _today()
    end = today
    if end < start:
        end = start

    held = sorted({t["code"] for t in trades})
    closes = _daily_closes(held, start)
    bench = {r["date"]: r["close"] for r in market.klines(benchmark, period="daily", limit=3000, adjust="") if r["date"] >= start}

    # calendar days from the first trade to today, filled forward with last close
    day_list: list[str] = []
    d0 = date.fromisoformat(start)
    d1 = date.fromisoformat(end)
    cur = d0
    while cur <= d1:
        day_list.append(cur.isoformat())
        cur += timedelta(days=1)
    if not day_list:
        day_list = [start]

    trades_by_day: dict[str, list[dict]] = defaultdict(list)
    for t in trades:
        trades_by_day[t["trade_date"]].append(t)

    # The account assets anchor the whole curve; daily flows move cash.
    capital0 = float(cfg.get("assets", 0) or 0)
    cash0 = capital0

    qty: dict[str, int] = defaultdict(int)
    last_price: dict[str, float] = {}
    for code in held:
        series = closes.get(code) or {}
        if not series:
            continue
        # mark at the last close strictly before the period starts (no look-ahead)
        prior = [d for d in series if d < start]
        last_price[code] = series[max(prior)] if prior else series[min(series)]

    b0 = None
    for d in sorted(bench):
        if d >= start and bench[d]:
            b0 = bench[d]
            break

    # ---- deterministic daily replay (no flow adjustment: the curve tracks the
    #      account's real value; NAV is rebased so it starts at 1.0) ----------
    prior_close: dict[str, float] = {}
    for code in held:
        series = closes.get(code) or {}
        prior = [x for x in series if x < start]
        if prior:
            prior_close[code] = series[max(prior)]
        elif series:
            prior_close[code] = series[min(series)]

    cash = capital0 if capital0 > 0 else cash0
    qty: dict[str, int] = defaultdict(int)
    mark: dict[str, float] = dict(prior_close)
    nav_idx = 1.0
    first_total: float | None = None
    base0 = capital0 if capital0 > 0 else 1.0
    nav, equity, bench_series, dd_series = [], [], [], []
    peak = nav_idx
    bench_last = b0 or 1.0

    for d in day_list:
        flow_today = 0.0
        for t in trades_by_day.get(d, []):
            if t["side"] == "buy":
                amt = t["price"] * t["qty"] + (t["fee"] or 0)
                flow_today += amt
                cash -= amt
                qty[t["code"]] += t["qty"]
            else:
                amt = t["price"] * t["qty"] - (t["fee"] or 0)
                flow_today -= amt
                cash += amt
                qty[t["code"]] = max(0, qty[t["code"]] - t["qty"])
        for code in held:
            px = (closes.get(code) or {}).get(d)
            if px is not None:
                mark[code] = px
        mv = sum(mark.get(c, 0) * q for c, q in qty.items() if q > 0)
        total = cash + mv
        if first_total is None:
            first_total = total
        nav_idx = total / first_total if first_total else 1.0
        bv = bench.get(d)
        if bv is not None:
            bench_last = bv
        bn = (bench_last / b0) if b0 else 1.0
        peak = max(peak, nav_idx)
        dd = nav_idx / peak - 1
        nav.append({"date": d, "nav": round(nav_idx, 6), "total": round(total, 2), "cash": round(cash, 2), "mv": round(mv, 2),
                    "pos_pct": round(mv / total * 100, 2) if total else 0})
        equity.append({"date": d, "total": round(total, 2), "cash": round(cash, 2), "mv": round(mv, 2), "flow": round(flow_today, 2)})
        bench_series.append({"date": d, "bench": round(bn, 6)})
        dd_series.append({"date": d, "dd": round(dd * 100, 2)})

    days = len(nav)
    final_nav = nav[-1]["nav"] if nav else 1.0
    total_ret = final_nav - 1
    years = max(days / 244, 1 / 244)
    annual = (final_nav ** (1 / years) - 1) if final_nav > 0 else -1
    rets = [nav[i]["nav"] / nav[i - 1]["nav"] - 1 for i in range(1, days)]
    mean_r = sum(rets) / len(rets) if rets else 0.0
    vol = (sum((r - mean_r) ** 2 for r in rets) / len(rets)) ** 0.5 * math.sqrt(244) if len(rets) > 1 else 0.0
    sharpe = (mean_r * 244) / vol if vol > 0 else 0.0
    mdd = min((x["dd"] for x in dd_series), default=0.0) / 100
    bench_ret = (bench_series[-1]["bench"] - 1) if bench_series else 0.0
    bench_rets = [bench_series[i]["bench"] / bench_series[i - 1]["bench"] - 1 for i in range(1, len(bench_series))]
    beta = None
    if len(rets) > 1 and len(bench_rets) == len(rets):
        mb = sum(bench_rets) / len(bench_rets)
        cov = sum((rets[i] - mean_r) * (bench_rets[i] - mb) for i in range(len(rets))) / len(rets)
        vb = sum((b - mb) ** 2 for b in bench_rets) / len(bench_rets)
        beta = cov / vb if vb else None
    bench_annual = ((1 + bench_ret) ** (1 / years) - 1) if bench_ret > -1 else -1
    alpha = (annual - (beta or 0) * bench_annual) if beta is not None else None

    metrics = {
        "total_return": round(total_ret * 100, 2),
        "annual_return": round(annual * 100, 2),
        "max_drawdown": round(mdd * 100, 2),
        "volatility": round(vol * 100, 2),
        "sharpe": round(sharpe, 2),
        "benchmark_return": round(bench_ret * 100, 2),
        "excess_return": round((total_ret - bench_ret) * 100, 2),
        "beta": round(beta, 2) if beta is not None else None,
        "alpha": round(alpha * 100, 2) if alpha is not None else None,
        "days": days,
        "calmar": round(annual / abs(mdd), 2) if mdd else None,
        "final_nav": round(final_nav, 4),
    }

    monthly = []
    by_month: dict[str, list] = defaultdict(list)
    for n in nav:
        by_month[n["date"][:7]].append(n["nav"])
    prev = 1.0
    for m in sorted(by_month):
        vals = by_month[m]
        if not vals:
            continue
        month_points = [p for p in nav if p["date"].startswith(m)]
        pnl_amt = (month_points[-1]["total"] - month_points[0]["total"]) if month_points else 0
        monthly.append({"month": m, "ret": round((vals[-1] / prev - 1) * 100, 2),
                        "nav": round(vals[-1], 4), "pnl": round(pnl_amt, 2)})
        prev = vals[-1]

    # ---- trend context
    nav_vals = [x["nav"] for x in nav]
    def _avg(vals, n):
        return sum(vals[-n:]) / n if len(vals) >= n else None
    nav_ma20 = _avg(nav_vals, 20)
    nav_ma60 = _avg(nav_vals, 60)
    last_nav = nav_vals[-1] if nav_vals else 1
    dd_now = dd_series[-1]["dd"] if dd_series else 0
    pos_now = nav[-1].get("pos_pct", 0) if nav else 0
    bench20 = (bench_series[-1]["bench"] / bench_series[-21]["bench"] - 1) * 100 if len(bench_series) > 21 else None
    if nav_ma20 and nav_ma60:
        if last_nav > nav_ma20 > nav_ma60:
            trend_label = "净值处于上升趋势"
        elif last_nav < nav_ma20 < nav_ma60:
            trend_label = "净值处于回撤趋势"
        else:
            trend_label = "净值处于震荡整理"
    else:
        trend_label = "样本不足，暂不判断趋势"
    trend = {
        "nav_ma20": round(nav_ma20, 4) if nav_ma20 else None,
        "nav_ma60": round(nav_ma60, 4) if nav_ma60 else None,
        "last_nav": round(last_nav, 4),
        "above20": bool(nav_ma20 and last_nav > nav_ma20),
        "above60": bool(nav_ma60 and last_nav > nav_ma60),
        "dd_now": dd_now,
        "pos_now": pos_now,
        "bench_pct20": round(bench20, 2) if bench20 is not None else None,
        "label": trend_label,
    }

    # ---- benchmark comparison: 沪深300 + 上证指数
    benchmarks = []
    for bcode, bname, bsec in (("000300", "沪深300", "1.000300"), ("000001", "上证指数", "1.000001")):
        try:
            rows = market.klines(bcode, period="daily", limit=3000, adjust="", secid_override=bsec)
            window = [r for r in rows if start <= r["date"] <= end]
            if len(window) >= 2:
                bret = (window[-1]["close"] / window[0]["close"] - 1) * 100
                b20 = (window[-1]["close"] / window[-21]["close"] - 1) * 100 if len(window) > 21 else None
                benchmarks.append({
                    "code": bcode, "name": bname,
                    "return": round(bret, 2),
                    "excess": round(total_ret * 100 - bret, 2),
                    "pct20": round(b20, 2) if b20 is not None else None,
                    "start": window[0]["date"], "end": window[-1]["date"],
                })
        except Exception:
            continue

    trade_stats, by_stock = _trade_stats(trades)
    pos_pcts = [x.get("pos_pct", 0) for x in nav]
    metrics["avg_exposure"] = round(sum(pos_pcts) / len(pos_pcts), 1) if pos_pcts else 0
    holds = [c.get("hold_days") for c in trade_stats.get("closed", []) if c.get("hold_days") is not None]
    metrics["avg_hold_days"] = round(sum(holds) / len(holds), 1) if holds else None
    cur_w = cur_l = win_streak = lose_streak = 0
    for c in trade_stats.get("closed", []):
        if c["pnl"] > 0:
            cur_w += 1; cur_l = 0
        else:
            cur_l += 1; cur_w = 0
        win_streak = max(win_streak, cur_w)
        lose_streak = max(lose_streak, cur_l)
    metrics["win_streak"] = win_streak
    metrics["lose_streak"] = lose_streak
    return {
        "series": nav,
        "equity": equity,
        "benchmark": bench_series,
        "drawdown": dd_series,
        "metrics": metrics,
        "monthly": monthly,
        "trade_stats": trade_stats,
        "by_stock": by_stock,
        "trend": trend,
        "benchmarks": benchmarks,
        "empty": False,
        "start": start,
        "end": end,
    }


def trades_with_realized(trades: list[dict] | None = None) -> list[dict]:
    """Attach FIFO realized P&L to every sell for the ledger UI."""
    trades = load_trades() if trades is None else trades
    lots: dict[str, list[list]] = defaultdict(list)
    out = []
    for t in trades:
        row = dict(t)
        if t["side"] == "buy":
            fee_ps = (t["fee"] or 0) / t["qty"] if t["qty"] else 0
            lots[t["code"]].append([t["qty"], t["price"], fee_ps, t["trade_date"]])
            row["realized"] = None
            row["matched"] = []
        else:
            fee_ps = (t["fee"] or 0) / t["qty"] if t["qty"] else 0
            need = t["qty"]
            pnl = 0.0
            matched = []
            while need > 0 and lots[t["code"]]:
                lot = lots[t["code"]][0]
                take = min(need, lot[0])
                part = (t["price"] - lot[1] - lot[2] - fee_ps) * take
                pnl += part
                matched.append({"open_date": lot[3], "buy_price": round(lot[1], 3), "qty": take, "pnl": round(part, 2)})
                lot[0] -= take
                need -= take
                if lot[0] <= 0:
                    lots[t["code"]].pop(0)
            row["realized"] = round(pnl, 2)
            row["matched"] = matched
        out.append(row)
    return out


def _trade_stats(trades: list[dict]) -> tuple[dict, list[dict]]:
    """FIFO round-trip matching for win rate / profit factor, per stock aggregation."""
    lots: dict[str, list[list]] = defaultdict(list)  # code -> [qty, price, fee_per_share, date]
    closed = []
    for t in trades:
        if t["side"] == "buy":
            fee_ps = (t["fee"] or 0) / t["qty"] if t["qty"] else 0
            lots[t["code"]].append([t["qty"], t["price"], fee_ps, t["trade_date"]])
        else:
            need = t["qty"]
            fee_ps = (t["fee"] or 0) / t["qty"] if t["qty"] else 0
            while need > 0 and lots[t["code"]]:
                lot = lots[t["code"]][0]
                take = min(need, lot[0])
                pnl = (t["price"] - lot[1] - lot[2] - fee_ps) * take
                try:
                    hold_days = max(0, (date.fromisoformat(t["trade_date"]) - date.fromisoformat(lot[3])).days)
                except Exception:
                    hold_days = None
                closed.append({"code": t["code"], "name": t["name"], "close_date": t["trade_date"],
                               "open_date": lot[3], "qty": take, "pnl": round(pnl, 2),
                               "ret": round((t["price"] / lot[1] - 1) * 100, 2),
                               "hold_days": hold_days,
                               "buy_price": lot[1], "sell_price": t["price"]})
                lot[0] -= take
                need -= take
                if lot[0] <= 0:
                    lots[t["code"]].pop(0)
    wins = [c for c in closed if c["pnl"] > 0]
    losses = [c for c in closed if c["pnl"] <= 0]
    gross_win = sum(c["pnl"] for c in wins)
    gross_loss = abs(sum(c["pnl"] for c in losses))
    holds = [c["hold_days"] for c in closed if c.get("hold_days") is not None]
    stats = {
        "avg_hold_days": round(sum(holds) / len(holds), 1) if holds else None,
        "closed_count": len(closed),
        "win_count": len(wins),
        "loss_count": len(losses),
        "win_rate": round(len(wins) / len(closed) * 100, 2) if closed else None,
        "avg_win": round(gross_win / len(wins), 2) if wins else 0,
        "avg_loss": round(-gross_loss / len(losses), 2) if losses else 0,
        "profit_factor": round(gross_win / gross_loss, 2) if gross_loss else None,
        "best": max(closed, key=lambda c: c["pnl"]) if closed else None,
        "worst": min(closed, key=lambda c: c["pnl"]) if closed else None,
        "closed": closed[-50:],
    }
    agg: dict[str, dict] = {}
    for c in closed:
        a = agg.setdefault(c["code"], {"code": c["code"], "name": c["name"], "pnl": 0.0, "count": 0, "wins": 0})
        a["pnl"] += c["pnl"]
        a["count"] += 1
        a["wins"] += 1 if c["pnl"] > 0 else 0
    by_stock = sorted(agg.values(), key=lambda a: a["pnl"], reverse=True)
    for a in by_stock:
        a["pnl"] = round(a["pnl"], 2)
        a["win_rate"] = round(a["wins"] / a["count"] * 100, 1) if a["count"] else 0
    return stats, by_stock
