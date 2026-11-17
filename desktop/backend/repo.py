from __future__ import annotations

from . import db


def _rows(sql: str, params: tuple = ()) -> list[dict]:
    with db._lock, db._conn(db.DB_PATH) as c:
        return [dict(r) for r in c.execute(sql, params).fetchall()]


def _one(sql: str, params: tuple = ()) -> dict | None:
    r = _rows(sql, params)
    return r[0] if r else None


# ---------------------------------------------------------------- watchlist
def watchlist() -> list[dict]:
    return _rows("SELECT * FROM watchlist ORDER BY sort, created_at")


def watch_add(code: str, name: str = "", note: str = "") -> dict:
    with db._lock, db._conn(db.DB_PATH) as c:
        sort = (c.execute("SELECT COALESCE(MAX(sort),0)+1 FROM watchlist").fetchone()[0]) or 1
        c.execute(
            "INSERT OR IGNORE INTO watchlist(code,name,note,sort) VALUES(?,?,?,?)",
            (str(code), name or "", note or "", sort),
        )
        if name:
            c.execute("UPDATE watchlist SET name=? WHERE code=? AND (name IS NULL OR name='')", (name, str(code)))
        c.commit()
    return _one("SELECT * FROM watchlist WHERE code=?", (str(code),)) or {}


def watch_remove(code: str):
    with db._lock, db._conn(db.DB_PATH) as c:
        c.execute("DELETE FROM watchlist WHERE code=?", (str(code),))
        c.commit()


def watch_has(code: str) -> bool:
    return _one("SELECT 1 AS x FROM watchlist WHERE code=?", (str(code),)) is not None


# ---------------------------------------------------------------- account
DEFAULT_ACCOUNT = {"assets": 200000.0}


def account() -> dict:
    """Single source of truth: the account's total assets.

    Available cash is derived from the trade book in portfolio.summary(), so the
    user only maintains one number.
    """
    saved = db.get_setting("account", {}) or {}
    if "assets" in saved:
        assets = float(saved.get("assets") or DEFAULT_ACCOUNT["assets"])
    else:
        # migrate old {capital, cash}: the initial capital was the account anchor
        assets = float(saved.get("capital") or saved.get("cash") or DEFAULT_ACCOUNT["assets"])
    return {"assets": round(assets, 2)}


def set_account(assets: float | None = None) -> dict:
    cur = account()
    if assets is not None:
        cur["assets"] = round(float(assets), 2)
        db.set_setting("account", cur)
    return cur
