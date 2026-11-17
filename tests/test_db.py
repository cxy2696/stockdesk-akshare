import json
import os

from backend import db


def test_settings_roundtrip(temp_db):
    db.set_setting("account", {"assets": 123456.0})
    assert db.get_setting("account") == {"assets": 123456.0}
    assert db.get_setting("missing", default=7) == 7
    assert db.all_settings()["account"] == {"assets": 123456.0}


def test_cache_ttl_and_delete(temp_db):
    db.cache_set("quote:600519", {"price": 1500.0})
    assert db.cache_get("quote:600519") == {"price": 1500.0}
    assert db.cache_get("quote:600519", ttl=3600) == {"price": 1500.0}
    assert db.cache_get("quote:600519", ttl=-1) is None
    db.cache_delete("quote:600519")
    assert db.cache_get("quote:600519") is None


def test_cache_sanitizes_non_finite_numbers(temp_db):
    """NaN/Infinity from market calculations used to abort the whole write."""
    db.cache_set("nan", {"a": float("nan"), "b": [1.0, float("inf")], "c": "ok"})
    value = db.cache_get("nan")
    assert value == {"a": None, "b": [1.0, None], "c": "ok"}
    # The stored payload must be valid strict JSON.
    json.loads(json.dumps(value, allow_nan=False))


def test_cache_clear_by_prefix(temp_db):
    db.cache_set("spot:v3", {"rows": []})
    db.cache_set("models:v9", {"score": 1})
    db.cache_clear("spot")
    assert db.cache_get("spot:v3") is None
    assert db.cache_get("models:v9") == {"score": 1}
    db.cache_clear()
    assert db.cache_get("models:v9") is None


def test_connections_are_closed(temp_db):
    """Each call must release its file descriptor; the old context manager did not."""
    before = len(os.listdir("/dev/fd"))
    for i in range(150):
        db.cache_set(f"k{i}", {"i": i})
        db.cache_get(f"k{i}")
        db.set_setting("counter", i)
        db.get_setting("counter")
    after = len(os.listdir("/dev/fd"))
    assert after - before < 5


def test_wal_mode_enabled(temp_db):
    with db.session() as c:
        assert c.execute("PRAGMA journal_mode").fetchone()[0].lower() == "wal"
