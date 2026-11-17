"""Offline model smoke tests for CI and maintenance.

No network is used. Run: python scripts/model_selftest.py
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "desktop"))

from backend import model_registry, native, td  # noqa: E402
from backend.models import _hmm, _percolation  # noqa: E402

meta = model_registry.meta()
assert meta["registry_version"]
assert {"hmm", "percolation", "td"} <= set(meta["models"])
assert 0 < meta["models"]["percolation"]["params"]["threshold"] < 1

rng = np.random.default_rng(7)
returns = rng.normal(0, 1.2, 260)
regime = _hmm(returns)
if native.NATIVE:
    old = native.NATIVE
    try:
        native.NATIVE = False
        fallback = _hmm(returns)
    finally:
        native.NATIVE = old
    assert abs(regime["loglik"] - fallback["loglik"]) < 1e-5
    assert abs(regime["confidence"] - fallback["confidence"]) < 1e-4
assert regime and regime["state"] in ("强势", "震荡", "弱势")
assert len(regime["probabilities"]) == 3
assert "aic" in regime and "transition" in regime
assert "filtered" in regime and "quality" in regime and regime["quality"] >= 0

rows = []
for i in range(220):
    rows.append({
        "code": f"{i:06d}", "name": f"T{i}", "price": 10 + i * 0.01,
        "amount": 1e8, "pct": 1.2 if i % 3 else -0.8, "industry": "测试",
    })
p = _percolation(rows)
assert p and p["total"] == 220
assert 0 <= p["giant_occupied"] <= 1
assert p["threshold"] == meta["models"]["percolation"]["params"]["threshold"]
assert "bootstrap" in p and p["bootstrap"]["stability"] >= 0

# Nine consecutive lower closes must produce a completed buy setup.
td_closes = [10 - 0.1 * i for i in range(24)]
td_now = td.td_sequence(td_closes, [c + 0.2 for c in td_closes], [c - 0.2 for c in td_closes])
assert td_now["available"] and td_now["buy"]["count"] == 9
assert td_now["bias"] == "偏多" and td_now["signal"] in ("buy_9", "buy_13")
assert "quality" in td_now and td_now["quality"] >= 0


print("native", native.status())
print("model selftest ok")
print("registry", meta["registry_version"], {k: v["version"] for k, v in meta["models"].items()})
print("hmm", regime["state"], "percolation", p["status"])
