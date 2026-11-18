"""Data freshness, coverage and source traceability for the UI.

Every value here is read from the real cache/snapshot or from actual call-site
health marks.  There are no synthetic success flags.
"""
from __future__ import annotations

import threading
import time
from datetime import datetime

from . import clock, db, market, scheduler, source_health

_SOURCE_REGISTRY = [
    {"id": "eastmoney", "label": "东方财富", "role": "全市场快照 / K 线 / 板块", "fallback": "sina"},
    {"id": "sina", "label": "新浪财经", "role": "全市场行情 / K 线 / 新闻", "fallback": "tencent"},
    {"id": "tencent", "label": "腾讯行情", "role": "个股与指数行情 / K 线", "fallback": "akshare"},
    {"id": "akshare", "label": "akshare 聚合", "role": "东财/同花顺/新浪兜底", "fallback": ""},
    {"id": "ths", "label": "同花顺", "role": "行业板块兜底", "fallback": ""},
]

_CACHE_ITEMS = [
    ("spot", market.SPOT_KEY, "全市场快照", 180),
    ("state", "market:state", "行情状态", 120),
    ("daily", "market:daily:v9", "每日策略", 120),
    ("index", "market:index-analysis:v1", "指数分析", 300),
    ("models", "market:models:v9", "量化模型", 600),
    ("evaluation", "model:history:v2:000300:1000", "历史测评", 1800),
]

_REFRESH_LOCK = threading.Lock()
_REFRESHING: set[str] = set()


def _iso(ts: float | None) -> str | None:
    if not ts:
        return None
    return datetime.fromtimestamp(float(ts)).strftime("%Y-%m-%d %H:%M:%S")


def _age(key: str) -> float | None:
    try:
        return db.cache_age(key)
    except Exception:
        return None


def _cache_rows() -> list[dict]:
    rows = []
    for name, key, label, ttl in _CACHE_ITEMS:
        age = _age(key)
        rows.append({
            "name": name,
            "label": label,
            "key": key,
            "age": round(age, 1) if age is not None else None,
            "ttl": ttl,
            "stale": bool(age is None or age > ttl),
            "updated_at": _iso(time.time() - age) if age is not None else None,
        })
    return rows


def snapshot() -> dict:
    now = time.time()
    status = clock.market_status()
    spot = db.cache_get(market.SPOT_KEY) or {}
    age = _age(market.SPOT_KEY)
    open_now = bool(status.get("open"))
    fresh_limit = 300 if open_now else 3600
    delayed_limit = 900 if open_now else 6 * 3600
    if spot.get("ts") is None and age is None:
        freshness = "missing"
    elif age is None or age <= fresh_limit:
        freshness = "fresh"
    elif age <= delayed_limit:
        freshness = "delayed"
    else:
        freshness = "stale"

    used_raw = {str(x) for x in (spot.get("sources") or [])}
    used = set()
    for raw in used_raw:
        if raw.startswith("eastmoney"):
            used.add("eastmoney")
        elif raw.startswith("sina"):
            used.add("sina")
        elif raw.startswith("tencent"):
            used.add("tencent")
        elif raw.startswith("akshare"):
            used.add("akshare")
        elif raw.startswith("ths"):
            used.add("ths")
    health = {row["source"]: row for row in source_health.snapshot()}
    sources = []
    for item in _SOURCE_REGISTRY:
        row = dict(item)
        h = health.get(item["id"])
        row["used_in_snapshot"] = item["id"] in used
        row["health"] = h
        sources.append(row)

    coverage = {
        "schema": spot.get("schema"),
        "expected": spot.get("expected"),
        "present": spot.get("present", spot.get("total")),
        "captured": spot.get("captured", spot.get("total")),
        "missing": spot.get("missing"),
        "unpriced": spot.get("unpriced"),
        "suspended": spot.get("suspended"),
        "duplicates": spot.get("duplicates"),
        "pages_failed": spot.get("pages_failed"),
        "data_complete": bool(spot.get("data_complete", False)),
        "fully_quoted": bool(spot.get("fully_quoted", False)),
        "sources": spot.get("sources") or [],
        "date": spot.get("date") or clock.last_session_date(),
    }
    scheduler_row = scheduler.status()
    return {
        "ts": now,
        "updated_at": _iso(spot.get("ts")) if spot.get("ts") else None,
        "snapshot_date": coverage["date"],
        "age_seconds": round(age, 1) if age is not None else None,
        "freshness": freshness,
        "market": status,
        "coverage": coverage,
        "sources": sources,
        "cache": _cache_rows(),
        "scheduler": scheduler_row,
        "refresh_in_progress": sorted(_REFRESHING),
    }


def _refresh_worker(target: str) -> None:
    try:
        if target == "spot":
            market.fetch_spot_now()
        elif target == "state":
            db.cache_delete("market:state")
            from . import state
            state.market_state(light=False)
        elif target == "daily":
            db.cache_delete("market:daily:v9")
            from . import daily
            daily.daily_brief()
        elif target == "index":
            db.cache_delete("market:index-analysis:v1")
            from . import state
            state.index_analysis()
        elif target == "models":
            db.cache_delete("market:models:v9")
            from . import models
            models.model_snapshot()
        elif target == "evaluation":
            for key in ("model:history:v2:000300:1000",):
                db.cache_delete(key)
            from . import evaluation
            evaluation.model_history("000300", 1000)
        else:
            scheduler.request()
    except Exception as exc:
        print(f"[stockdesk] manual refresh {target} failed: {exc}")
    finally:
        with _REFRESH_LOCK:
            _REFRESHING.discard(target)


def refresh(target: str = "spot") -> dict:
    target = str(target or "spot")
    if target not in {"spot", "state", "daily", "index", "models", "evaluation", "all"}:
        raise ValueError(f"未知刷新目标：{target}")
    with _REFRESH_LOCK:
        if target in _REFRESHING:
            return {"accepted": False, "target": target, "reason": "already refreshing"}
        _REFRESHING.add(target)
    if target != "all":
        # Keep the old cache readable while the new request runs.  Deleting
        # here would make every page show an empty state during the refresh.
        pass
    threading.Thread(target=_refresh_worker, args=(target,), name=f"data-refresh-{target}", daemon=True).start()
    return {"accepted": True, "target": target}
