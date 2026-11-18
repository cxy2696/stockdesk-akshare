import os
import sys
from pathlib import Path

# Keep unit/API tests deterministic: the production scheduler is opt-in here.
os.environ.setdefault("STOCKDESK_SCHEDULER", "0")

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "desktop"))

from backend import db  # noqa: E402


@pytest.fixture()
def temp_db(tmp_path, monkeypatch):
    """Isolated user DB + cache for every test (no real account data touched)."""
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "stockdesk.db")
    monkeypatch.setattr(db, "CACHE_PATH", tmp_path / "cache.db")
    monkeypatch.setattr(db, "_initialized", False)
    db.init()
    yield
    db._initialized = False
