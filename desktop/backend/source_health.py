"""Small, dependency-free source health registry.

The UI must never claim a source is healthy just because it is configured.
Only real call sites update this registry; the data-status endpoint reports
"未使用" until a source has actually succeeded or failed in this process.
"""
from __future__ import annotations

import threading
import time

_LOCK = threading.Lock()
_STATE: dict[str, dict] = {}

LABELS = {
    "eastmoney": "东方财富",
    "sina": "新浪财经",
    "tencent": "腾讯行情",
    "akshare": "akshare 聚合",
    "ths": "同花顺",
    "cninfo": "巨潮资讯",
}


def mark(source: str, ok: bool, latency: float | None = None, note: str = "") -> None:
    now = time.time()
    with _LOCK:
        row = _STATE.setdefault(source, {
            "source": source, "label": LABELS.get(source, source),
            "ok": None, "last_ok": None, "last_fail": None,
            "success": 0, "failure": 0, "latency_ms": None, "note": "",
        })
        row["ok"] = bool(ok)
        row["note"] = str(note or "")[:200]
        if latency is not None:
            row["latency_ms"] = round(max(0.0, float(latency)) * 1000, 1)
        if ok:
            row["success"] += 1
            row["last_ok"] = now
        else:
            row["failure"] += 1
            row["last_fail"] = now


def snapshot() -> list[dict]:
    with _LOCK:
        rows = [dict(v) for v in _STATE.values()]
    return sorted(rows, key=lambda r: r["source"])
