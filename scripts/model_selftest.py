"""Offline model smoke tests for CI and maintenance.

No network is used. Run: python scripts/model_selftest.py
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "desktop"))

from backend import kdj, model_registry  # noqa: E402
from backend.models import _hmm, _percolation  # noqa: E402

meta = model_registry.meta()
assert meta["registry_version"]
assert {"hmm", "percolation", "kdj"} <= set(meta["models"])
assert meta["models"]["kdj"]["params"]["upper"] == 118
assert meta["models"]["kdj"]["params"]["lower"] == -14
assert 0 < meta["models"]["percolation"]["params"]["threshold"] < 1

rng = np.random.default_rng(7)
returns = rng.normal(0, 1.2, 260)
regime = _hmm(returns)
assert regime and regime["state"] in ("强势", "震荡", "弱势")
assert len(regime["probabilities"]) == 3
assert "aic" in regime and "transition" in regime

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

bars = []
for i in range(180):
    close = 10 + np.sin(i / 8) * 0.6
    bars.append({"date": str(i), "open": close - 0.1, "high": close + 0.2,
                 "low": close - 0.2, "close": close, "volume": 1000 + i})
k = kdj._kdj(bars)
assert k["j"] is not None and "metrics" in k
assert k["metrics"]["trend"] in ("多头", "空头", "震荡")

print("model selftest ok")
print("registry", meta["registry_version"], {k: v["version"] for k, v in meta["models"].items()})
print("hmm", regime["state"], "percolation", p["status"], "kdj", k["j"])
