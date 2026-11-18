"""Background data refresh scheduler.

The desktop app used to refresh only when a page was opened.  This worker keeps
the same on-demand caches warm, paced by the A-share session: fast during the
day, slow after the close, and always sequential so akshare/libmini_racer is
never entered from two refresh jobs at once.
"""
from __future__ import annotations

import os
import threading
import time
import traceback

from . import clock, db

_STARTED_AT: float | None = None
_LAST_TICK: float | None = None
_LAST_JOB: str | None = None
_LAST_OK: bool | None = None
_LAST_ERROR: str = ""
_NEXT_DUE: float | None = None
_JOBS: dict[str, dict] = {}
_LOCK = threading.Lock()
_STOP = threading.Event()
_THREAD: threading.Thread | None = None
_TICK_EVERY = 15.0
_FIRST_DELAY = 30.0
_FORCE: set[str] = set()


def _interval(name: str, is_open: bool) -> float:
    table = {
        "spot": (60, 600),
        "state": (120, 600),
        "daily": (180, 900),
        "index": (300, 1800),
        "models": (600, 1800),
        "evaluation": (1800, 3600),
    }
    return float(table.get(name, (600, 1800))[0 if is_open else 1])


def _cache_keys() -> dict[str, tuple[str, str]]:
    # Imported lazily: this module is imported by the FastAPI lifespan and
    # must not pull the data stack (and its optional akshare dependency) into
    # module import time.
    from . import market
    return {
        "spot": (market.SPOT_KEY, "全市场快照"),
        "state": ("market:state", "行情状态"),
        "daily": ("market:daily:v10", "每日策略"),
        "index": ("market:index-analysis:v1", "指数分析"),
        "models": ("market:models:v9", "量化模型"),
        "evaluation": ("model:history:v2:000300:1000", "历史测评"),
    }


def _job_table():
    from . import daily, evaluation, market, models, state
    return {
        "spot": market.fetch_spot_now,
        "state": lambda: state.market_state(light=False),
        "daily": daily.daily_brief,
        "index": state.index_analysis,
        "models": models.model_snapshot,
        "evaluation": lambda: evaluation.model_history("000300", 1000),
    }


def _set_job(name: str, ok: bool, error: str = "") -> None:
    global _LAST_OK, _LAST_ERROR
    with _LOCK:
        row = _JOBS.setdefault(name, {})
        row.update({
            "name": name,
            "last_run": time.time(),
            "ok": bool(ok),
            "error": str(error or "")[:300],
        })
        _LAST_OK = bool(ok)
        _LAST_ERROR = str(error or "")[:300]


def tick_once(force: bool = False) -> str | None:
    """Run at most one due job.  Safe to call from the worker or a test."""
    global _LAST_TICK, _LAST_JOB, _NEXT_DUE
    status = clock.market_status()
    is_open = bool(status.get("open"))
    keys = _cache_keys()
    jobs = _job_table()
    now = time.time()
    for name in ("spot", "state", "daily", "index", "models", "evaluation"):
        key = keys[name][0]
        age = db.cache_age(key)
        forced = force or name in _FORCE
        due = age is None or age >= _interval(name, is_open) or forced
        if not due:
            continue
        try:
            jobs[name]()
            _set_job(name, True)
            _LAST_ERROR = ""
        except Exception as exc:
            _set_job(name, False, f"{type(exc).__name__}: {exc}")
            _LAST_ERROR = f"{name}: {exc}"
            try:
                print(f"[stockdesk] scheduler {name} failed: {exc}")
                traceback.print_exc(limit=2)
            except Exception:
                pass
        finally:
            with _LOCK:
                _FORCE.discard(name)
                _LAST_TICK = time.time()
                _LAST_JOB = name
                _NEXT_DUE = _LAST_TICK + _TICK_EVERY
        return name
    with _LOCK:
        _LAST_TICK = now
        _NEXT_DUE = now + _TICK_EVERY
    return None


def _loop() -> None:
    if _STOP.wait(_FIRST_DELAY):
        return
    while not _STOP.is_set():
        try:
            tick_once()
        except Exception:
            traceback.print_exc(limit=2)
        _STOP.wait(_TICK_EVERY)


def start() -> bool:
    global _STARTED_AT, _THREAD
    if os.environ.get("STOCKDESK_SCHEDULER", "1") == "0":
        return False
    if _THREAD and _THREAD.is_alive():
        return True
    _STOP.clear()
    _STARTED_AT = time.time()
    _THREAD = threading.Thread(target=_loop, name="data-scheduler", daemon=True)
    _THREAD.start()
    return True


def stop() -> None:
    _STOP.set()


def request(name: str | None = None) -> None:
    with _LOCK:
        if name:
            _FORCE.add(name)
        else:
            _FORCE.update(("spot", "state", "daily", "index", "models", "evaluation"))


def status() -> dict:
    with _LOCK:
        jobs = {k: dict(v) for k, v in _JOBS.items()}
        last_tick = _LAST_TICK
        last_job = _LAST_JOB
        last_ok = _LAST_OK
        last_error = _LAST_ERROR
        next_due = _NEXT_DUE
        forced = sorted(_FORCE)
    return {
        "enabled": os.environ.get("STOCKDESK_SCHEDULER", "1") != "0",
        "running": bool(_THREAD and _THREAD.is_alive()),
        "started_at": _STARTED_AT,
        "last_tick": last_tick,
        "last_job": last_job,
        "last_ok": last_ok,
        "last_error": last_error,
        "next_tick": next_due,
        "force_pending": forced,
        "tick_seconds": _TICK_EVERY,
        "jobs": jobs,
    }
