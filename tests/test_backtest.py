import numpy as np
import pandas as pd
import pytest

from backend import backtest, market


def synthetic_klines(days: int = 160) -> list[dict]:
    """Deterministic trend + pullbacks; enough bars for every strategy."""
    rows = []
    price = 10.0
    for i in range(days):
        # smooth uptrend with a mid-series drawdown so both buy and sell fire
        drift = 0.006 if i < days * 0.6 else -0.004
        wave = 0.012 * np.sin(i / 3.0)
        close = price * (1 + drift + wave)
        open_ = price * (1 + 0.002 * np.cos(i / 2.0))
        high = max(open_, close) * 1.01
        low = min(open_, close) * 0.99
        rows.append({
            "date": (pd.Timestamp("2025-01-01") + pd.Timedelta(days=i)).strftime("%Y-%m-%d"),
            "open": round(open_, 3), "high": round(high, 3), "low": round(low, 3),
            "close": round(close, 3), "volume": 1_000_000 + i * 1000,
        })
        price = close
    return rows


def test_all_strategies_build_valid_signals():
    df = pd.DataFrame(synthetic_klines())
    for item in backtest.STRATEGIES:
        signals = backtest.build_signals(df, item["id"], {})
        assert len(signals) == len(df), item["id"]
        assert not signals.isna().any(), item["id"]
        assert set(signals.unique()) <= {-1, 0, 1}, item["id"]


def test_unknown_strategy_is_rejected():
    df = pd.DataFrame(synthetic_klines())
    with pytest.raises(ValueError, match="未知策略"):
        backtest.build_signals(df, "does_not_exist", {})


def test_run_produces_serialisable_metrics(temp_db, monkeypatch):
    monkeypatch.setattr(market, "klines", lambda *a, **kw: synthetic_klines())
    monkeypatch.setattr(market, "resolve_name", lambda code: "测试股票")
    monkeypatch.setattr(backtest, "_index_series", lambda code: (pd.Series(dtype=float), ""))

    result = backtest.run("600519", "ma_cross", {"fast": 5, "slow": 20},
                          capital=100_000, benchmark="self")

    assert result["code"] == "600519"
    assert result["strategy"] == "ma_cross"
    assert len(result["equity"]) == len(synthetic_klines())
    assert len(result["trades"]) >= 2
    for key in ("total_return", "max_drawdown", "sharpe", "win_rate", "trade_count"):
        assert key in result["metrics"], key
    # JSON columns must not contain NaN/Infinity: the HTTP layer uses allow_nan=False.
    import json
    json.dumps(result, allow_nan=False)


def test_run_rejects_short_history(monkeypatch):
    monkeypatch.setattr(market, "klines", lambda *a, **kw: synthetic_klines(20))
    with pytest.raises(ValueError, match="数据不足"):
        backtest.run("600519", "ma_cross", benchmark="self")
