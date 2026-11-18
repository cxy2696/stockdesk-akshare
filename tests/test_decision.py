"""Fast decision/forecast contract tests (no network)."""
from __future__ import annotations

from backend import decision


def _rows(n=120):
    return [
        {"code": f"{i:06d}", "name": f"S{i}", "price": 10.0 + i / 100,
         "amount": 1e8, "pct": (i % 5 - 2) * 1.1, "industry": f"I{i % 7}"}
        for i in range(n)
    ]


def _ctx():
    return {
        "verdict": {"label": "震荡", "tone": "neutral"},
        "score": 50.0,
        "breadth": {"up": 2500, "down": 2800, "flat": 81},
        "turnover": 1.2e12,
    }


def test_overview_shortlist_is_bounded_and_matched_is_reported(monkeypatch):
    rows = _rows()
    monkeypatch.setattr(decision, "_spot_rows", lambda: rows)
    monkeypatch.setattr(decision, "_market_context", _ctx)
    monkeypatch.setattr(decision, "market_forecast", lambda **kwargs: {"state": "震荡"})
    monkeypatch.setattr(decision.market, "fetch_spot", lambda **kwargs: {"rows": rows})

    def plan(row, label):
        return {
            "code": row["code"], "name": row["name"], "rating": "好",
            "tier": "确认", "score": 70.0, "risk_reward": 2.0,
        }

    monkeypatch.setattr(decision, "_plan_for_spot", plan)
    out = decision.overview(scan=60, seed=7)

    assert out["scanned"] == 60
    assert out["shortlist"] <= decision.SHORTLIST_LIMIT
    assert out["matched"] == len(out["candidates"])
    assert out["matched"] <= decision.MAX_CANDIDATES
    assert out["matched"] == decision.MAX_CANDIDATES


def test_forecast_overview_does_not_scan_candidates(monkeypatch):
    rows = _rows(30)
    monkeypatch.setattr(decision, "_spot_rows", lambda: rows)
    monkeypatch.setattr(decision, "_market_context", _ctx)
    monkeypatch.setattr(decision, "market_forecast", lambda ctx=None: {"state": "震荡", "expected_5d": 0.001})
    monkeypatch.setattr(decision, "_plan_for_spot", lambda *a, **k: (_ for _ in ()).throw(AssertionError("scan used")))
    monkeypatch.setattr(decision.market, "cached_spot", lambda *a, **k: {"rows": rows})

    out = decision.forecast_overview()
    assert out["market"]["label"] == "震荡"
    assert out["market"]["breadth"]["up"] == 2500
    assert out["forecast"]["state"] == "震荡"
    assert out["universe_total"] == 30
