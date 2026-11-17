"""Full-market coverage, snapshot integrity and breadth tests."""
from __future__ import annotations

import numpy as np

from backend import market, native


def row(code, name="", price=None, pct=None, **extra):
    data = {"code": code, "name": name, "price": price, "pct": pct, **extra}
    return data


def test_market_and_limit_classification():
    assert market.market_of("302132") == "创业板"
    assert market.market_of("689009") == "科创板"
    assert market.market_of("920309") == "北交所"
    assert market.limit_pct({"code": "000001", "name": "ST测试"}) == 5.0
    assert market.limit_pct({"code": "300001", "name": ""}) == 20.0
    assert market.limit_pct({"code": "920001", "name": ""}) == 30.0
    assert market.limit_pct({"code": "600001", "name": ""}) == 10.0


def test_assemble_snapshot_is_lossless_and_drops_delisted():
    expected = [("000001", "平安银行"), ("000002", "万科A"), ("920309", "N菊乐")]
    seen = {
        "000001": row("000001", "平安银行", 10.0, 1.0, prev_close=9.9, amount=1000),
        "920309": row("920309", "N菊乐", 56.78, 30.0, prev_close=40, amount=1000),
        # Delisted / private-placement codes from Sina must not inflate the universe.
        "810014": row("810014", "莱特定转", None, None, prev_close=100),
        "833994": row("833994", "翰博高新", None, None, prev_close=32.9),
    }
    quotes = {"000002": {"code": "000002", "name": "万科A", "price": None, "pct": None}}
    snapshot = market._assemble_snapshot(seen, expected, quotes, {}, em_total=3, pages_failed=0,
                                          sources=["test"])
    codes = {r["code"] for r in snapshot["rows"]}
    assert codes == {"000001", "000002", "920309"}          # every expected represented
    assert snapshot["missing"] == 0
    assert snapshot["expected"] == 3
    assert snapshot["captured"] == 3
    assert snapshot["complete"] is True
    assert snapshot["data_complete"] is False                # 000002 has no quote
    assert snapshot["fully_quoted"] is False
    statuses = {r["code"]: r["quote_status"] for r in snapshot["rows"]}
    assert statuses["000001"] == "ok"
    assert statuses["000002"] == "missing"
    assert snapshot["unpriced"] == 1


def test_assemble_pages_failed_marks_incomplete():
    snapshot = market._assemble_snapshot(
        {"000001": row("000001", "平安银行", 10, 1)}, [("000001", "平安银行")], {}, {},
        em_total=10, pages_failed=2, sources=["eastmoney"])
    assert snapshot["pages_failed"] == 2
    assert snapshot["complete"] is False
    assert snapshot["missing"] == 0     # represented, but the source was partial


def test_assemble_marks_suspended_when_prev_close_exists():
    snapshot = market._assemble_snapshot(
        {"000635": row("000635", "英力特", None, None, prev_close=11.0, amount=None)},
        [("000635", "英力特")], {}, {}, em_total=1, pages_failed=0)
    assert snapshot["rows"][0]["quote_status"] == "suspended"
    assert snapshot["suspended"] == 1
    assert snapshot["fully_quoted"] is False


def _breadth_snapshot():
    rows = [
        row("600001", "浦发银行", 10, 10.0),    # 10% limit
        row("300001", "特锐德", 20, 20.0),      # 20% limit
        row("000001", "ST测试", 5, 5.0),        # 5% limit
        row("000002", "万科A", 5, 0.0),         # flat
        row("000003", "停牌A", None, None, prev_close=1.0),
        row("000004", "无行情", None, None),
    ]
    return market._assemble_snapshot(
        {r["code"]: r for r in rows}, [(r["code"], r["name"]) for r in rows], {}, {},
        em_total=len(rows), pages_failed=0)


def test_breadth_native_and_fallback_match(monkeypatch):
    snapshot = _breadth_snapshot()
    monkeypatch.setattr(market.db, "cache_get", lambda key, ttl=None: snapshot)
    if not native.NATIVE:
        expected = market._breadth_reference(snapshot["rows"])
        assert market.market_breadth()["up"] == expected["up"]
        return

    native_counts = market.market_breadth()
    monkeypatch.setattr(native, "NATIVE", False)
    fallback_counts = market.market_breadth()
    for key in ("total", "traded", "up", "down", "flat", "limit_up", "limit_down", "suspended", "missing"):
        assert native_counts[key] == fallback_counts[key], key
    assert native_counts["up"] == 3 and native_counts["flat"] == 1
    assert native_counts["limit_up"] == 3 and native_counts["limit_down"] == 0
    assert native_counts["suspended"] == 1 and native_counts["missing"] == 1
    assert native_counts["traded"] == 4


def test_cached_partial_snapshot_forces_refresh(monkeypatch):
    partial = {"schema": market.SPOT_SCHEMA, "total": 2, "complete": False, "expected": 3}
    calls = []

    def fake_get(key, ttl=None):
        return partial

    monkeypatch.setattr(market.db, "cache_get", fake_get)
    monkeypatch.setattr(market.db, "cache_age", lambda key: 100.0)
    monkeypatch.setattr(market, "_fetch_spot_unlocked", lambda ttl=180, progress=None: (calls.append(1), partial)[1])
    assert market.fetch_spot(ttl=180) is partial
    assert calls == [1]


def test_cached_complete_snapshot_skips_fetch(monkeypatch):
    complete = {"schema": market.SPOT_SCHEMA, "total": 3, "complete": True, "expected": 3}
    calls = []
    monkeypatch.setattr(market.db, "cache_get", lambda key, ttl=None: complete)
    monkeypatch.setattr(market.db, "cache_age", lambda key: 1.0)
    monkeypatch.setattr(market, "_fetch_spot_unlocked", lambda ttl=180, progress=None: calls.append(1))
    assert market.fetch_spot(ttl=180)["complete"] is True
    assert calls == []


def test_c_coverage_audit_counts_duplicates_and_missing():
    if not native.NATIVE:
        return
    audit = native.native.coverage_audit(
        np.asarray([1, 2, 2, 5], dtype=np.int64),
        np.asarray([1, 2, 3, 4], dtype=np.int64),
        10,
    )
    assert audit["present"] == 3
    assert audit["duplicates"] == 1
    assert audit["missing"] == 2
    assert audit["extra"] == 1
    assert list(audit["missing_sample"]) == [3, 4]


def test_c_breadth_census_handles_nan_and_limits():
    if not native.NATIVE:
        return
    pct = np.asarray([1.0, -1.0, 0.0, np.nan, np.nan, 10.0, -20.0], dtype=float)
    price = np.asarray([10, 10, 10, 10, np.nan, 10, 10], dtype=float)
    limits = np.asarray([10, 10, 10, 10, 10, 10, 20], dtype=float)
    counts = native.native.breadth_census(pct, price, limits)
    assert counts["total"] == 7
    assert counts["traded"] == 5
    assert counts["missing"] == 1
    assert counts["suspended"] == 1
    assert counts["limit_up"] == 1
    assert counts["limit_down"] == 1


def test_missing_row_is_classified_as_suspended_from_old_kline(monkeypatch):
    monkeypatch.setattr(market, "klines", lambda *args, **kwargs: [{"date": "2026-11-10", "close": 9.5}])
    snapshot = market._assemble_snapshot(
        {}, [("000635", "英力特")], {}, {},
        em_total=1, pages_failed=0, classify_suspended=True)
    assert snapshot["rows"][0]["quote_status"] == "suspended"
    assert snapshot["suspended"] == 1
    assert snapshot["data_complete"] is True
    assert snapshot["fully_quoted"] is False
