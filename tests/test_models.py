"""Model-layer checks that do not depend on the network."""
from backend import models


def _rows(n=300):
    return [
        {"code": f"{i:06d}", "name": f"S{i}", "price": 10.0, "amount": 1e8,
         "pct": (i % 7 - 3) * 1.2, "industry": f"I{i % 9}", "market": "主板"}
        for i in range(n)
    ]


def test_light_percolation_keeps_displayed_fields():
    rows = _rows()
    full = models._percolation(rows, with_grid=False)
    light = models._percolation(rows, with_grid=False, light=True)
    for key in ("total", "up", "ratio", "largest", "giant_ratio", "giant_occupied",
                "spanning", "status", "clusters", "top_clusters"):
        assert light[key] == full[key]
    assert light["bootstrap"]["width"] == 0


def test_percolation_trace_is_reproducible():
    rows = _rows(600)
    first = models._percolation(rows, with_grid=False)
    second = models._percolation(rows, with_grid=False)
    trace = first["trace"]
    assert trace["algorithm"] == "breadth-lattice-union-find-v1"
    assert trace["layout"] == "crc32-stable-order"
    assert trace["seeds"]["baseline"] == [11, 23, 37]
    assert trace["grid_sha"] == second["trace"]["grid_sha"]
    assert first["largest"] == second["largest"]

    light = models._percolation(rows, with_grid=False, light=True)
    assert light["trace"]["light"] is True
    assert light["trace"]["grid_sha"] == trace["grid_sha"]


def test_percolation_random_baseline_is_not_a_noop():
    """The robust baseline must reshuffle occupancy, not the all-ones values."""
    rows = _rows(600)
    p = models._percolation(rows, with_grid=False)
    assert p["random_baseline"] != p["giant_occupied"]
    assert 0.0 <= p["p_value"] <= 1.0
    assert p["robustness"]["min"] <= p["robustness"]["mean"] <= p["robustness"]["max"]


def test_hmm_trace_contract():
    import numpy as np
    x = np.random.default_rng(3).normal(size=180)
    h = models._hmm(x, 3, 40)
    trace = h["trace"]
    assert trace["algorithm"] == "gaussian-hmm-baum-welch-v1"
    assert trace["k"] == 3
    assert trace["samples"] == 180
    assert trace["engine"] == h["engine"]
    assert trace["converged"] == h["converged"]
