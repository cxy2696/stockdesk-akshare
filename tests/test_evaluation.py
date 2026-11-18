"""Walk-forward evaluation contract tests (no network)."""
from __future__ import annotations

import pytest

from backend import decision, evaluation, market, models


def _bars(n=420):
    # A rising series with mild noise so the forward returns are well-defined.
    dates = [f"2024-{(i // 21) + 1:02d}-{(i % 21) + 1:02d}" for i in range(n)]
    closes = [100 + i * 0.2 + (0.4 if i % 2 else -0.2) for i in range(n)]
    return [{"date": d, "close": c, "high": c + 1, "low": c - 1, "open": c, "volume": 1} for d, c in zip(dates, closes)]


def _fake_hmm(_rets):
    return {
        "state": "强势",
        "confidence": 0.82,
        "stats": [{"label": "弱势", "mean": -0.2, "vol": 1.0}, {"label": "震荡", "mean": 0.0, "vol": 1.0}, {"label": "强势", "mean": 0.3, "vol": 1.0}],
        "probabilities": [{"label": "弱势", "p": 0.05}, {"label": "震荡", "p": 0.15}, {"label": "强势", "p": 0.8}],
        "transition": [{"from": "弱势", "to": [0.8, 0.1, 0.1]}, {"from": "震荡", "to": [0.1, 0.8, 0.1]}, {"from": "强势", "to": [0.1, 0.1, 0.8]}],
        "engine": "test",
    }


def test_model_history_metrics(temp_db, monkeypatch):
    monkeypatch.setattr(market, "klines", lambda *args, **kwargs: _bars())
    monkeypatch.setattr(models, "_hmm", _fake_hmm)
    monkeypatch.setattr(decision, "market_forecast", lambda **kwargs: {
        "expected_5d": 0.005, "prob_up": 0.62, "confidence": 0.8,
        "state": "强势", "next_probs": [], "caveat": "",
    })

    result = evaluation.model_history("000300", 420)
    assert result["samples"] > 5
    assert result["hit_rate"] == 1.0
    assert result["strategy_return"] > 0
    assert result["benchmark_return"] > 0
    assert len(result["curve"]) == result["samples"] + 1
    assert {row["state"] for row in result["by_state"]} == {"弱势", "震荡", "强势"}
    assert result["recent"][0]["date"]
    assert result["stale"] is False


def test_model_history_rejects_unknown_index(temp_db):
    with pytest.raises(ValueError):
        evaluation.model_history("999999")


def test_model_history_uses_cache(temp_db, monkeypatch):
    calls = {"n": 0}

    def bars(*args, **kwargs):
        calls["n"] += 1
        return _bars()

    monkeypatch.setattr(market, "klines", bars)
    monkeypatch.setattr(models, "_hmm", _fake_hmm)
    monkeypatch.setattr(decision, "market_forecast", lambda **kwargs: {
        "expected_5d": 0.005, "prob_up": 0.62, "confidence": 0.8,
        "state": "强势", "next_probs": [], "caveat": "",
    })
    first = evaluation.model_history("000300", 420)
    second = evaluation.model_history("000300", 420)
    assert calls["n"] == 1
    assert first["samples"] == second["samples"]
