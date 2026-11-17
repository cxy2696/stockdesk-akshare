"""Factor-screen correctness and traceability tests (no network)."""
from backend import factors


def _rows(n=80):
    rows = []
    for i in range(n):
        px = 10 + i * 0.1
        rows.append({
            "code": f"{600000 + i:06d}", "name": f"测试{i}",
            "price": px, "pct": (i % 9 - 4) * 0.7,
            "pct60": (i % 13 - 6) * 2.0,
            "pct_ytd": (i % 17 - 8) * 1.5,
            "pe": 8 + (i % 11), "pb": 0.8 + (i % 5) * 0.2,
            "amplitude": 1.5 + (i % 4) * 0.4,
            "turnover": 1 + (i % 6) * 0.5,
            "amount": 2e8 + i * 1e6,
            "main_inflow": (i % 7 - 3) * 1e7,
            "high": px * 1.02, "low": px * 0.98, "prev_close": px * 0.995,
            "mcap": 2e10 + i * 1e9, "volume_ratio": 0.8 + (i % 4) * 0.2,
            "market": "沪市主板", "industry": f"行业{i % 5}",
        })
    return rows


def test_rank_normal_is_cached_and_bounded():
    vals = [float(i) for i in range(40)] + [None]
    first = factors._rank_normal(vals)
    second = factors._rank_normal(vals)
    assert first == second
    assert first[-1] == 0.0
    assert all(-3.5 <= v <= 3.5 for v in first)


def test_screen_selects_with_coverage_and_reasons():
    selected, info = factors.screen(_rows())
    assert selected
    assert info["selected_count"] == len(selected)
    assert all(0 <= f["coverage"] <= 1 for f in selected)
    assert all(f["reason"] for f in selected)
    assert info["rejected"] is not None


def test_snapshot_reports_stock_coverage_and_trace(temp_db, monkeypatch):
    rows = _rows()
    # Remove one factor field from every third stock; coverage must reflect it.
    for i, r in enumerate(rows):
        if i % 3 == 0:
            r["pct60"] = None
    spot = {"rows": rows, "date": "2026-11-18", "ts": 1.0, "source": "test"}
    monkeypatch.setattr(factors.market, "fetch_spot", lambda *a, **k: spot)
    data = factors.snapshot(limit=10, min_amount=0)
    assert data["ready"] is True
    assert data["trace"]["algorithm"] == "cross-sectional-factor-v2"
    assert data["trace"]["rows"] == len(rows)
    assert data["stocks"]
    for s in data["stocks"]:
        assert 0 <= s["coverage"] <= 1
        assert 0 <= s["factor_coverage"] <= 1
        assert s["factor_hits"] <= s["factor_total"]
        assert s["factor_total"] == len(data["trace"]["selected_factors"])
