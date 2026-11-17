"""SQLite storage: trades / watchlist / alerts / settings + a JSON key-value cache."""
from __future__ import annotations

import json
import sqlite3
import threading
import time
from typing import Any

from .config import CACHE_PATH, DB_PATH

_lock = threading.RLock()


def _conn(path) -> sqlite3.Connection:
    c = sqlite3.connect(path, check_same_thread=False)
    c.row_factory = sqlite3.Row
    return c


def _migrate():
    with _lock, _conn(DB_PATH) as c:
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
        c.commit()


def init():
    _migrate()
    with _lock, _conn(CACHE_PATH) as c:
        c.execute("CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, ts REAL NOT NULL, v TEXT NOT NULL)")
        c.commit()


# ---------------------------------------------------------------- cache
def cache_get(key: str, ttl: float | None = None) -> Any | None:
    with _lock, _conn(CACHE_PATH) as c:
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
    with _lock, _conn(CACHE_PATH) as c:
        row = c.execute("SELECT ts FROM kv WHERE k=?", (key,)).fetchone()
    return time.time() - row["ts"] if row else None


def cache_set(key: str, value: Any):
    payload = json.dumps(value, ensure_ascii=False, allow_nan=False, default=str)
    with _lock, _conn(CACHE_PATH) as c:
        c.execute("INSERT OR REPLACE INTO kv(k, ts, v) VALUES(?,?,?)", (key, time.time(), payload))
        c.commit()


def cache_delete(key: str):
    with _lock, _conn(CACHE_PATH) as c:
        c.execute("DELETE FROM kv WHERE k=?", (key,))
        c.commit()


# ---------------------------------------------------------------- settings
def get_setting(key: str, default: Any = None) -> Any:
    with _lock, _conn(DB_PATH) as c:
        row = c.execute("SELECT value FROM settings WHERE key=?", (key,)).fetchone()
    if not row:
        return default
    try:
        return json.loads(row["value"])
    except Exception:
        return row["value"]


def set_setting(key: str, value: Any):
    with _lock, _conn(DB_PATH) as c:
        c.execute(
            "INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)",
            (key, json.dumps(value, ensure_ascii=False)),
        )
        c.commit()


def all_settings() -> dict:
    with _lock, _conn(DB_PATH) as c:
        rows = c.execute("SELECT key, value FROM settings").fetchall()
    out = {}
    for r in rows:
        try:
            out[r["key"]] = json.loads(r["value"])
        except Exception:
            out[r["key"]] = r["value"]
    return out
