"""C++/NumPy parity and edge-case tests for the native model core.

The extension is optional: when it is not built these tests skip, but the
fallback itself is still exercised by test_api/test_backtest.
"""
from __future__ import annotations

import random
import threading

import numpy as np
import pytest

from backend import models, native

pytestmark = pytest.mark.skipif(not native.NATIVE, reason="C++ extension not built")

def reference_component(grid: list[int], cols: int):
    """Independent BFS reference (rows = ceil(n/cols), sorted indices)."""
    n = len(grid)
    rows = (n + cols - 1) // cols
    seen = [False] * n
    largest: list[int] = []
    sizes: list[int] = []
    spanning = False
    for start in range(n):
        if not grid[start] or seen[start]:
            continue
        stack = [start]
        seen[start] = True
        comp = []
        borders = [False, False, False, False]
        while stack:
            v = stack.pop()
            comp.append(v)
            r, c = divmod(v, cols)
            borders[0] |= r == 0
            borders[1] |= r == rows - 1
            borders[2] |= c == 0
            borders[3] |= c == cols - 1
            for nr, nc in ((r - 1, c), (r + 1, c), (r, c - 1), (r, c + 1)):
                if 0 <= nr < rows and 0 <= nc < cols:
                    w = nr * cols + nc
                    if w < n and grid[w] and not seen[w]:
                        seen[w] = True
                        stack.append(w)
        sizes.append(len(comp))
        if len(comp) > len(largest):
            largest = sorted(comp)
            spanning = all(borders)
    return largest, sorted(sizes, reverse=True), spanning


def test_version_and_status():
    assert native.status()["backend"] == "C++"
    assert native.native.__version__ == "1.1.0"


@pytest.mark.parametrize("cols", [1, 2, 3, 4, 5, 7, 12])
def test_percolation_fixed_cases(cols):
    grid = [1, 1, 0, 1, 0, 1, 1, 0, 0, 1, 1, 1]
    got = native.native.grid_largest(np.asarray(grid, dtype=np.uint8), cols)
    expected = reference_component(grid, cols)
    assert [int(v) for v in got["largest"]] == expected[0]
    assert [int(v) for v in got["sizes"]] == expected[1]
    assert bool(got["spanning"]) == expected[2]


def test_percolation_edges():
    empty = native.native.grid_largest(np.asarray([], dtype=np.uint8), 3)
    assert empty["largest"] == [] and empty["sizes"] == [] and empty["spanning"] is False

    full = native.native.grid_largest(np.asarray([1] * 12, dtype=np.uint8), 4)
    assert full["largest"] == list(range(12)) and full["sizes"] == [12] and full["spanning"] is True

    single = native.native.grid_largest(np.asarray([1], dtype=np.uint8), 1)
    assert single["largest"] == [0] and single["spanning"] is True

    no_border = native.native.grid_largest(np.asarray([0, 0, 0, 1, 0, 0, 0, 0, 0], dtype=np.uint8), 3)
    assert no_border["largest"] == [3] and no_border["spanning"] is False


def test_percolation_random_parity():
    rnd = random.Random(11)
    for _ in range(250):
        n = rnd.randint(0, 160)
        cols = rnd.randint(1, 16)
        grid = [rnd.randint(0, 1) for _ in range(n)]
        got = native.native.grid_largest(np.asarray(grid, dtype=np.uint8), cols)
        expected = reference_component(grid, cols)
        assert [int(v) for v in got["largest"]] == expected[0]
        assert [int(v) for v in got["sizes"]] == expected[1]
        assert bool(got["spanning"]) == expected[2]


def test_percolation_rejects_bad_dimensions():
    with pytest.raises(ValueError, match="cols"):
        native.native.grid_largest(np.asarray([1], dtype=np.uint8), 0)
    with pytest.raises(ValueError, match="1-D"):
        native.native.grid_largest(np.asarray([[1]], dtype=np.uint8), 1)


def _hmm_inputs(seed: int = 3, n: int = 240):
    rng = np.random.default_rng(seed)
    x = np.concatenate([
        rng.normal(-1.0, 0.8, n // 3),
        rng.normal(0.2, 0.6, n // 3),
        rng.normal(1.2, 0.9, n - 2 * (n // 3)),
    ])
    k = 3
    mu = np.array([-1.0, 0.0, 1.0])
    var = np.ones(k)
    pi = np.full(k, 1 / k)
    A = np.full((k, k), 0.1)
    np.fill_diagonal(A, 0.8)
    return x, mu, var, pi, A


def test_hmm_matches_numpy_fallback(monkeypatch):
    x, mu, var, pi, A = _hmm_inputs()
    cpp = models._baum_welch(x, mu, var, pi, A, 80)

    monkeypatch.setattr(native, "NATIVE", False)
    py = models._baum_welch(x, mu, var, pi, A, 80)

    for key in ("mu", "var", "pi", "A", "gamma", "loglik"):
        np.testing.assert_allclose(np.asarray(cpp[key]), np.asarray(py[key]), rtol=1e-6, atol=1e-7)
    assert cpp["converged"] == py["converged"]
    assert cpp["iterations"] == py["iterations"] == 8


def test_hmm_shapes_and_single_iteration():
    x, mu, var, pi, A = _hmm_inputs(n=90)
    raw = native.native.baum_welch(x, mu, var, pi, A.ravel().tolist(), 1)
    assert np.asarray(raw["mu"]).shape == (3,)
    assert np.asarray(raw["A"]).shape == (3, 3)
    assert np.asarray(raw["gamma"]).shape == (90, 3)
    assert raw["iterations"] == 1 and raw["converged"] is False
    assert np.isfinite(raw["loglik"])
    assert np.all(np.isfinite(raw["gamma"]))
    np.testing.assert_allclose(np.asarray(raw["gamma"]).sum(axis=1), 1.0, rtol=1e-9)


@pytest.mark.parametrize("mutate", [
    lambda x, mu, var, pi, A: (np.array([1.0, np.nan, 2.0]), mu, var, pi, A),
    lambda x, mu, var, pi, A: (x, mu, np.array([1.0, 0.0, 1.0]), pi, A),
    lambda x, mu, var, pi, A: (x, mu, var, pi, A[:2]),
    lambda x, mu, var, pi, A: (x, np.array([0.0]), np.array([1.0]), np.array([1.0]), np.array([[1.0]])),
])
def test_hmm_rejects_bad_inputs(mutate):
    x, mu, var, pi, A = _hmm_inputs(n=90)
    x, mu, var, pi, A = mutate(x, mu, var, pi, A)
    with pytest.raises(Exception):
        native.native.baum_welch(x, mu, var, pi, A.ravel() if np.ndim(A) == 2 else A, 5)


def test_hmm_rejects_bad_iterations():
    x, mu, var, pi, A = _hmm_inputs(n=90)
    with pytest.raises(ValueError, match="iters"):
        native.native.baum_welch(x, mu, var, pi, A.ravel(), 0)
    with pytest.raises(ValueError, match="iters"):
        native.native.baum_welch(x, mu, var, pi, A.ravel(), 10001)


def test_models_falls_back_when_native_raises(monkeypatch):
    x, mu, var, pi, A = _hmm_inputs(n=90)
    original = native.native.baum_welch

    def boom(*args, **kwargs):
        raise RuntimeError("simulated native failure")

    monkeypatch.setattr(native.native, "baum_welch", boom)
    result = models._baum_welch(x, mu, var, pi, A, 40)
    assert np.isfinite(result["loglik"])
    assert np.asarray(result["gamma"]).shape == (90, 3)
    monkeypatch.setattr(native.native, "baum_welch", original)


def test_native_is_thread_safe():
    x, mu, var, pi, A = _hmm_inputs(n=180)
    expected = native.native.baum_welch(x, mu, var, pi, A.ravel().tolist(), 30)
    results = []

    def worker():
        results.append(native.native.baum_welch(x, mu, var, pi, A.ravel().tolist(), 30))

    threads = [threading.Thread(target=worker) for _ in range(8)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    for result in results:
        np.testing.assert_allclose(np.asarray(result["mu"]), np.asarray(expected["mu"]), rtol=1e-12)
        assert result["loglik"] == expected["loglik"]
