#!/usr/bin/env python3
"""Seed (or reset) StockDesk with a realistic demo account.

Usage:
    python scripts/seed_demo.py            # seed if empty, top up otherwise
    python scripts/seed_demo.py --reset    # wipe all data and reseed
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from backend import alerts, db, market, portfolio, repo  # noqa: E402

# (code, side, qty, date, note) -- prices are filled from the real close of that day
SPECS = [
    ("601318", "buy", 800, "2026-01-15", "保险板块底仓"),
    ("600036", "buy", 1000, "2026-02-24", "低估值高股息"),
    ("600519", "buy", 100, "2026-03-09", "核心仓位，长期持有"),
    ("300750", "buy", 400, "2026-04-21", "新能源龙头，趋势买入"),
    ("000858", "buy", 500, "2026-05-14", "消费复苏逻辑"),
    ("600519", "buy", 100, "2026-06-15", "中报前加仓"),
    ("000001", "buy", 2000, "2026-06-30", "银行补涨"),
    ("600036", "sell", 500, "2026-07-03", "波段减仓"),
    ("300750", "sell", 200, "2026-08-12", "部分止盈"),
    ("000858", "sell", 500, "2026-09-22", "调整仓位"),
]

WATCH = [
    ("600519", "贵州茅台", "核心"),
    ("300750", "宁德时代", "成长"),
    ("600036", "招商银行", "红利"),
    ("000858", "五粮液", "消费"),
    ("601318", "中国平安", "金融"),
]


def close_on(code: str, day: str) -> float | None:
    rows = market.klines(code, period="daily", limit=3000, adjust="")
    closes = {r["date"]: r["close"] for r in rows if r.get("close")}
    prior = [d for d in closes if d <= day]
    return closes[max(prior)] if prior else None


def seed(reset: bool):
    db.init()
    with db._lock, db._conn(db.DB_PATH) as c:
        if reset:
            for table in ("trades", "watchlist", "alerts", "signal_log", "settings"):
                c.execute(f"DELETE FROM {table}")
        c.commit()

    if not portfolio.trades_any():
        for code, side, qty, day, note in SPECS:
            px = close_on(code, day)
            if not px:
                print(f"  skip {code} {day}: no price")
                continue
            price = round(px * (0.985 if side == "buy" else 1.015), 2)
            portfolio.add_trade(code, side, price, qty, day, 5.0, "", note)
            print(f"  {day} {side:4s} {code} {qty} @ {price}")

    # derive a consistent starting capital and cash from the trade book
    trades = portfolio.load_trades()
    net = sum(
        (t["price"] * t["qty"] + (t["fee"] or 0)) if t["side"] == "buy" else -(t["price"] * t["qty"] - (t["fee"] or 0))
        for t in trades
    )
    capital = 500000.0
    repo.set_account(capital=capital, cash=round(capital - net, 2))

    for code, name, note in WATCH:
        repo.watch_add(code, name, note)

    with db._lock, db._conn(db.DB_PATH) as c:
        if c.execute("SELECT COUNT(*) FROM alerts").fetchone()[0] == 0:
            c.commit()
            alerts.add_alert("600519", "above", 1500, "回到 1500 减仓观察")
            alerts.add_alert("300750", "below", 230, "跌破 230 提示")

    s = portfolio.summary()
    print(f"\n账户: 本金 ¥{s['start_capital']:,.0f} | 总资产 ¥{s['total']:,.0f} | 浮盈 ¥{s['float_pnl']:,.0f} | 已实现 ¥{s['realized']:,.0f}")
    print(f"持仓 {len(s['positions'])} 只 | 自选 {len(repo.watchlist())} 只")


if __name__ == "__main__":
    seed(reset="--reset" in sys.argv)
