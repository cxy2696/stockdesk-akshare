"""SQLite storage: trades / watchlist / alerts / settings + a JSON key-value cache.

Two databases are used:
  * ``stockdesk.db`` — user data (trades, watchlist, settings).
  * ``cache.db``      — disposable market-data snapshots (safe to delete).

Both are opened per operation because uvicorn runs requests on a thread pool.
The helper below always closes the connection: ``with sqlite3.connect(...)``
only commits/rolls back, it does not close, so the previous implementation
leaked file descriptors under sustained polling.
"""
from __future__ import annotations

import json
import math
import sqlite3
import threading
import time
from contextlib import contextmanager
from typing import Any, Iterator

from .config import CACHE_PATH, DB_PATH

_lock = threading.RLock()
_initialized = False


def _conn(path) -> sqlite3.Connection:
    c = sqlite3.connect(path, timeout=15, check_same_thread=False)
    c.row_factory = sqlite3.Row
    # Wait instead of immediately raising "database is locked" when the
    # WebSocket loop and a REST request write at the same time.
    c.execute("PRAGMA busy_timeout=5000")
    return c


@contextmanager
def _db(path) -> Iterator[sqlite3.Connection]:
    """Open, yield, commit on success, roll back on error, and always close."""
    c = _conn(path)
    try:
        yield c
        c.commit()
    except BaseException:
        c.rollback()
        raise
    finally:
        c.close()


@contextmanager
def session():
    """Serialized connection to the user database (closed automatically)."""
    with _lock, _db(DB_PATH) as c:
        yield c


def _enable_wal(c: sqlite3.Connection) -> None:
    try:
        c.execute("PRAGMA journal_mode=WAL")
        c.execute("PRAGMA synchronous=NORMAL")
    except sqlite3.DatabaseError:
        # Some network/read-only locations cannot use WAL; the default
        # rollback journal still works, so never fail startup because of it.
        pass


def _migrate():
    with _lock, _db(DB_PATH) as c:
        c.executescript(
            """
            CREATE TABLE IF NOT EXISTS trades (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                code TEXT NOT NULL,
                name TEXT NOT NULL DEFAULT '',
                side TEXT NOT NULL CHECK (side IN ('buy','sell')),
                price REAL NOT NULL,
                qty INTEGER NOT NULL,
                fee REAL NOT NULL DEFAULT 0,
                trade_date TEXT NOT NULL,
                note TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
            );
            CREATE INDEX IF NOT EXISTS idx_trades_date ON trades(trade_date);
            CREATE TABLE IF NOT EXISTS watchlist (
                code TEXT PRIMARY KEY,
                name TEXT NOT NULL DEFAULT '',
                note TEXT NOT NULL DEFAULT '',
                sort INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
            );
            CREATE TABLE IF NOT EXISTS alerts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                code TEXT NOT NULL,
                name TEXT NOT NULL DEFAULT '',
                direction TEXT NOT NULL CHECK (direction IN ('above','below')),
                price REAL NOT NULL,
                enabled INTEGER NOT NULL DEFAULT 1,
                triggered_at TEXT,
                triggered_price REAL,
                note TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
            );
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS signal_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                alert_id INTEGER NOT NULL,
                code TEXT NOT NULL,
                price REAL NOT NULL,
                message TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
            );
            """
        )
        _enable_wal(c)


def init():
    """Create tables once. Safe to call from the app and the warm-up thread."""
    global _initialized
    with _lock:
        if _initialized:
            return
        _migrate()
        with _db(CACHE_PATH) as c:
            c.execute("CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, ts REAL NOT NULL, v TEXT NOT NULL)")
            _enable_wal(c)
        _initialized = True


# ---------------------------------------------------------------- cache
def _sanitize(value: Any) -> Any:
    """Replace NaN/Infinity with None so the JSON encoder cannot fail.

    Market calculations occasionally produce non-finite floats (an index with
    no previous close, a zero denominator, ...). ``allow_nan=False`` would make
    the whole cache write raise and turn a harmless gap into a 500 response.
    """
    if isinstance(value, float):
        return value if math.isfinite(value) else None
    if isinstance(value, dict):
        return {k: _sanitize(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_sanitize(v) for v in value]
    return value


def _dumps(value: Any) -> str:
    try:
        return json.dumps(value, ensure_ascii=False, allow_nan=False, default=str)
    except ValueError:
        return json.dumps(_sanitize(value), ensure_ascii=False, allow_nan=False, default=str)


def cache_get(key: str, ttl: float | None = None) -> Any | None:
    with _lock, _db(CACHE_PATH) as c:
        row = c.execute("SELECT ts, v FROM kv WHERE k=?", (key,)).fetchone()
    if not row:
        return None
    if ttl is not None and time.time() - row["ts"] > ttl:
        return None
    try:
        return json.loads(row["v"])
    except Exception:
        return None


def cache_age(key: str) -> float | None:
    with _lock, _db(CACHE_PATH) as c:
        row = c.execute("SELECT ts FROM kv WHERE k=?", (key,)).fetchone()
    return time.time() - row["ts"] if row else None


def cache_set(key: str, value: Any):
    payload = _dumps(value)
    with _lock, _db(CACHE_PATH) as c:
        c.execute("INSERT OR REPLACE INTO kv(k, ts, v) VALUES(?,?,?)", (key, time.time(), payload))


def cache_delete(key: str):
    with _lock, _db(CACHE_PATH) as c:
        c.execute("DELETE FROM kv WHERE k=?", (key,))


OBSOLETE_CACHE_KEYS = (
    "spot:v3", "spot:v4", "spot:v5", "spot:v6",
    "market:state", "market:daily:v9", "market:daily:v10",
    "market:news:v2", "boards:rows:v1", "model:history:v1",
)

_LAST_PRUNE = 0
_LAST_PRUNE_AT = 0.0
_LAST_VACUUM = 0.0
_TOTAL_PRUNE = 0

# Rows whose schema/semantics changed are not useful even when they are not
# 14 days old.  These TTLs are deliberately conservative; the current core
# caches are protected below.
_TTL_RULES = (
    ("kline:", 7 * 86400),
    ("fund:", 2 * 3600),
    ("market:heatmap:", 2 * 3600),
    ("rank:", 3600),
    ("boards:", 3600),
    ("industry:", 86400),
    ("news:", 86400),
    ("market:news:", 86400),
    ("chip:", 86400),
    ("fib:", 86400),
    ("ml:forecast:", 2 * 86400),
    ("factor:full:", 2 * 86400),
    ("model:history:", 7 * 86400),
    ("profile:", 30 * 86400),
    ("fin:", 30 * 86400),
    ("concepts:", 30 * 86400),
)
_PROTECTED_KEYS = (
    "spot:v7", "market:state:v2", "market:daily:v11", "market:index-analysis:v1",
    "market:models:v12", "model:history:v2:000300:1000",
    "factor:screen:6000:30000000.0:1",
)


def prune_cache(max_age: float = 14 * 86400, obsolete: tuple[str, ...] | None = None) -> int:
    """Drop expired rows, superseded keys and old factor-screen variants.

    This runs after every completed refresh job.  It deliberately uses narrow
    patterns so active caches (spot:v7, state:v2, daily:v11, factor:screen:6000)
    are never touched.
    """
    global _LAST_PRUNE, _LAST_PRUNE_AT, _TOTAL_PRUNE
    deleted = 0
    now = time.time()
    with _lock, _db(CACHE_PATH) as c:
        cur = c.execute("DELETE FROM kv WHERE ts < ?", (now - max_age,))
        deleted += max(0, cur.rowcount)
        obsolete = OBSOLETE_CACHE_KEYS if obsolete is None else obsolete
        if obsolete:
            marks = ",".join("?" for _ in obsolete)
            cur = c.execute(f"DELETE FROM kv WHERE k IN ({marks})", tuple(obsolete))
            deleted += max(0, cur.rowcount)
        # Old UI variants can be recreated by API calls; keep only the current
        # full factor screen and drop the tiny/stale one-off screens.
        cur = c.execute(
            "DELETE FROM kv WHERE k LIKE 'factor:screen:%' "
            "AND k != 'factor:screen:6000:30000000.0:1' AND ts < ?",
            (now - 3600,),
        )
        deleted += max(0, cur.rowcount)
        # Drop superseded heatmap keys older than the current 10-minute window.
        cur = c.execute(
            "DELETE FROM kv WHERE k LIKE 'market:heatmap:%' AND ts < ?", (now - 3600,)
        )
        deleted += max(0, cur.rowcount)

        # K-line caches are keyed by both a plain code and an explicit secid,
        # and by several limits.  Keep only the longest/newest series per
        # code+period+adjust; shorter duplicates are pure redundancy.
        try:
            rows = c.execute("SELECT k, ts FROM kv WHERE k LIKE 'kline:%'").fetchall()
            groups: dict[tuple[str, str, str], list[tuple[str, int, float]]] = {}
            for row in rows:
                parts = str(row["k"]).split(":")
                if len(parts) < 5:
                    continue
                code = parts[1].split(".")[-1]
                try:
                    limit = int(parts[4])
                except ValueError:
                    limit = 0
                groups.setdefault((code, parts[2], parts[3]), []).append((row["k"], limit, float(row["ts"])))
            for items in groups.values():
                if len(items) <= 1:
                    continue
                items.sort(key=lambda x: (x[1], x[2]), reverse=True)
                for key, _, _ in items[1:]:
                    cur = c.execute("DELETE FROM kv WHERE k=?", (key,))
                    deleted += max(0, cur.rowcount)
        except sqlite3.DatabaseError:
            pass

        # TTL cleanup for caches that are stale long before the 14-day floor.
        protected_marks = ",".join("?" for _ in _PROTECTED_KEYS)
        for prefix, ttl in _TTL_RULES:
            cur = c.execute(
                f"DELETE FROM kv WHERE k LIKE ? AND k NOT IN ({protected_marks}) AND ts < ?",
                (prefix + "%", *_PROTECTED_KEYS, now - ttl),
            )
            deleted += max(0, cur.rowcount)

        # Hard value budget: keep current snapshot/state/factor caches, then
        # trim oldest K-lines until the disposable cache is below 40 MB.
        try:
            total = c.execute("SELECT COALESCE(SUM(length(v)),0) FROM kv").fetchone()[0]
            if total > 40 * 1024 * 1024:
                rows = c.execute(
                    "SELECT k, length(v) AS n, ts FROM kv WHERE k LIKE 'kline:%' ORDER BY ts ASC"
                ).fetchall()
                for row in rows:
                    if total <= 40 * 1024 * 1024:
                        break
                    c.execute("DELETE FROM kv WHERE k=?", (row["k"],))
                    total -= int(row["n"] or 0)
                    deleted += 1
                if total > 40 * 1024 * 1024:
                    # Other stale caches may dominate; trim the oldest
                    # non-core rows as a last resort.
                    marks = ",".join("?" for _ in _PROTECTED_KEYS)
                    rows = c.execute(
                        f"SELECT k,length(v) AS n FROM kv WHERE k NOT IN ({marks}) ORDER BY ts ASC",
                        _PROTECTED_KEYS,
                    ).fetchall()
                    for row in rows:
                        if total <= 40 * 1024 * 1024:
                            break
                        c.execute("DELETE FROM kv WHERE k=?", (row["k"],))
                        total -= int(row["n"] or 0)
                        deleted += 1
        except sqlite3.DatabaseError:
            pass
        c.commit()
    _LAST_PRUNE = deleted
    _LAST_PRUNE_AT = now
    _TOTAL_PRUNE += deleted
    if deleted:
        try:
            with _lock, _db(CACHE_PATH) as c:
                c.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        except sqlite3.DatabaseError:
            pass
        # Reclaim free pages after a meaningful prune.  Checkpoint alone leaves
        # the old 70–80 MB file on disk even when most rows are gone.
        try:
            file_bytes = CACHE_PATH.stat().st_size
        except Exception:
            file_bytes = 0
        if (deleted >= 50 or file_bytes > 60 * 1024 * 1024) and now - _LAST_VACUUM > 3600:
            try:
                with _lock, _db(CACHE_PATH) as c:
                    c.execute("VACUUM")
                _LAST_VACUUM = now
            except sqlite3.DatabaseError:
                pass
    return deleted


def cache_stats() -> dict:
    """Cheap observable cache size/row count for the data-status bar."""
    try:
        size = CACHE_PATH.stat().st_size if hasattr(CACHE_PATH, "stat") else 0
    except Exception:
        size = 0
    try:
        with _lock, _db(CACHE_PATH) as c:
            rows = c.execute("SELECT COUNT(*) FROM kv").fetchone()[0]
            bytes_used = c.execute("SELECT COALESCE(SUM(length(v)),0) FROM kv").fetchone()[0]
    except Exception:
        rows = bytes_used = 0
    return {
        "rows": int(rows), "value_bytes": int(bytes_used), "file_bytes": int(size),
        "last_pruned": int(_LAST_PRUNE), "total_pruned": int(_TOTAL_PRUNE),
        "last_pruned_at": _LAST_PRUNE_AT or None,
    }


def cache_clear(prefix: str = ""):
    """Drop cached snapshots (all keys, or those starting with ``prefix``)."""
    with _lock, _db(CACHE_PATH) as c:
        if prefix:
            c.execute("DELETE FROM kv WHERE k LIKE ?", (prefix + "%",))
        else:
            c.execute("DELETE FROM kv")


# ---------------------------------------------------------------- settings
def get_setting(key: str, default: Any = None) -> Any:
    with _lock, _db(DB_PATH) as c:
        row = c.execute("SELECT value FROM settings WHERE key=?", (key,)).fetchone()
    if not row:
        return default
    try:
        return json.loads(row["value"])
    except Exception:
        return row["value"]


def set_setting(key: str, value: Any):
    payload = _dumps(value)
    with _lock, _db(DB_PATH) as c:
        c.execute(
            "INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)",
            (key, payload),
        )


def all_settings() -> dict:
    with _lock, _db(DB_PATH) as c:
        rows = c.execute("SELECT key, value FROM settings").fetchall()
    out = {}
    for r in rows:
        try:
            out[r["key"]] = json.loads(r["value"])
        except Exception:
            out[r["key"]] = r["value"]
    return out
