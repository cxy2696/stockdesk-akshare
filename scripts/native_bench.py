#!/usr/bin/env python3
"""Small benchmark for the C++/NumPy driver paths.

Run from the repository root:  python scripts/native_bench.py
"""
from __future__ import annotations

import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "desktop"))

import numpy as np  # noqa: E402

from backend import models, native  # noqa: E402


def bench(label, fn, repeat=50):
    fn()
    start = time.perf_counter()
    for _ in range(repeat):
        fn()
    ms = (time.perf_counter() - start) / repeat * 1000
    print(f"{label:28s} {ms:8.3f} ms")
    return ms


def main() -> int:
    rng = np.random.default_rng(7)
    rows = [
        {"code": f"{i:06d}", "name": f"S{i}", "price": 10.0, "amount": 1e8,
         "pct": (i % 7 - 3) * 1.2, "industry": f"I{i % 20}", "market": "主板"}
        for i in range(5500)
    ]
    cols = int(np.ceil(np.sqrt(len(rows))))
    grid = np.zeros(cols * cols, dtype=np.uint8)
    grid[:len(rows)] = [1 if r["pct"] > 0 else 0 for r in rows]
    x = rng.normal(size=420)
    mu, var, pi = [-1.0, 0.0, 1.0], [1.0, 1.0, 1.0], [1 / 3] * 3
    A = [0.1] * 9
    for i in range(3):
        A[i * 3 + i] = 0.8

    batch = (rng.random((15, cols * cols)) < 0.5).astype(np.uint8)
    pct = np.array([r["pct"] for r in rows], dtype=float)
    price = np.array([r["price"] for r in rows], dtype=float)
    limits = np.full(len(rows), 10.0)
    codes = np.arange(len(rows), dtype=np.int64)
    expected = codes.copy()

    print("engine:", native.status()["backend"], native.status()["version"])
    bench("grid kernel", lambda: native.native.grid_largest(grid, cols), 500)
    bench("grid batch 15", lambda: native.native.grid_batch(batch, cols), 200)
    bench("percolation wrapper", lambda: models._percolation(rows, with_grid=False), 20)
    bench("HMM kernel", lambda: native.native.baum_welch(x, mu, var, pi, A, 80), 100)
    bench("breadth census", lambda: native.native.breadth_census(pct, price, limits), 500)
    bench("coverage audit", lambda: native.native.coverage_audit(codes, expected, 20), 100)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
