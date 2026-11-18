"""Portfolio backtest mode contract tests (no network)."""
from __future__ import annotations

import pandas as pd

from backend import portfolio_backtest as pb


def _frame(step=0.1, n=320):
    dates = pd.bdate_range("2024-01-02", periods=n)
    close = pd.Series([10 + i * step for i in range(n)], index=dates)
    return pd.DataFrame({"open": close * 0.999, "close": close, "high": close * 1.01, "low": close * 0.99})


def _index(n=320):
    dates = pd.bdate_range("2024-01-02", periods=n)
    close = pd.Series([3000 + i for i in range(n)], index=dates)
    return pd.DataFrame({"close": close, "name": "测试指数"})


def test_custom_buy_and_hold(monkeypatch):
    frames = {"600000": _frame(), "000001": _frame(0.08)}
    monkeypatch.setattr(pb, "_load_frames", lambda codes: {c: frames[c] for c in codes if c in frames})
    monkeypatch.setattr(pb, "_index_frame", lambda code: _index())
    result = pb.run_custom(
        [{"code": "600000", "weight": 0.6}, {"code": "000001", "weight": 0.4}],
        start="2024-02-01", capital=1_000_000, rebalance_days=0,
    )
    assert result["mode"] == "custom"
    assert result["metrics"]["days"] > 100
    assert result["equity"][0]["equity"] == result["equity"][0]["equity"]
    assert len(result["trades"]) >= 2
    assert result["holdings"][0]["weight"] > 0
    assert result["benchmark_name"] == "测试指数"


def test_recommended_walk_forward(monkeypatch):
    frames = {"600000": _frame(0.2), "000001": _frame(0.05), "600036": _frame(0.1)}
    monkeypatch.setattr(pb, "_load_frames", lambda codes: {c: frames[c] for c in codes if c in frames})
    monkeypatch.setattr(pb, "_index_frame", lambda code: _index())
    monkeypatch.setattr(pb, "_hmm_exposures", lambda idx, dates, n: {d: 0.8 for d in dates})
    result = pb.run_recommended(
        ["600000", "000001", "600036"], start="2024-02-01",
        capital=1_000_000, top_n=2, rebalance_days=20,
    )
    assert result["mode"] == "recommended"
    assert result["params"]["universe_size"] == 3
    assert result["metrics"]["trade_count"] >= 2
    assert result["holdings"]


def test_ledger_replay_blocks_same_day_sell(monkeypatch):
    frames = {"600000": _frame()}
    monkeypatch.setattr(pb, "_load_frames", lambda codes: {c: frames[c] for c in codes if c in frames})
    monkeypatch.setattr(pb, "_index_frame", lambda code: _index())
    trades = [
        {"id": 1, "code": "600000", "side": "buy", "price": 10.0, "qty": 1000, "fee": 5, "trade_date": "2024-02-01"},
        {"id": 2, "code": "600000", "side": "sell", "price": 11.0, "qty": 500, "fee": 5, "trade_date": "2024-02-01"},
    ]
    monkeypatch.setattr(pb.portfolio, "load_trades", lambda: trades)
    result = pb.run_ledger(capital=100_000, benchmark="000001")
    assert result["mode"] == "ledger"
    assert result["warnings"]
    assert not any(t["type"] == "sell" for t in result["trades"])
