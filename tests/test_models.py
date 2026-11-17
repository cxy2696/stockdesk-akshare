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
