"""Data freshness/source registry contract tests (no network)."""
from __future__ import annotations

from backend import data_status, source_health


def test_source_health_only_reports_real_calls():
    source_health.mark("tencent", True, 0.012, "test")
    source_health.mark("sina", False, 0.020, "blocked")
    rows = {r["source"]: r for r in source_health.snapshot()}
    assert rows["tencent"]["ok"] is True
    assert rows["tencent"]["success"] >= 1
    assert rows["sina"]["ok"] is False
    assert rows["sina"]["failure"] >= 1


def test_data_status_is_honest_when_cache_missing(temp_db):
    status = data_status.snapshot()
    assert status["freshness"] == "missing"
    assert status["coverage"]["expected"] is None
    assert status["scheduler"]["enabled"] is False
    assert status["snapshot_date"]
