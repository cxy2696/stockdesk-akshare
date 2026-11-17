"""Optional rflux HMM bridge tests (skipped when rflux is not installed)."""
import numpy as np
import pytest

from backend import models, rflux_engine

pytestmark = pytest.mark.skipif(not rflux_engine.AVAILABLE, reason="rflux not installed")


def test_rflux_fit_shape_and_engine():
    rng = np.random.default_rng(5)
    x = np.concatenate([rng.normal(-1.0, 0.4, 180), rng.normal(1.0, 0.5, 180)])
    fit = rflux_engine.fit_hmm(x, 2, restarts=2, iters=60, seed=11)
    assert fit is not None
    assert fit["engine"].startswith("rflux")
    assert fit["A"].shape == (2, 2)
    assert fit["gamma"].shape == (360, 2)
    assert np.allclose(fit["gamma"].sum(axis=1), 1.0, atol=1e-8)
    assert np.isfinite(fit["loglik"])


def test_stockdesk_hmm_uses_rflux():
    rng = np.random.default_rng(9)
    x = np.concatenate([rng.normal(-0.8, 0.3, 150), rng.normal(0.7, 0.5, 150)])
    h = models._hmm(x, 3, 60)
    assert h.get("engine", "").startswith("rflux")
    assert h["samples"] == 300
    assert len(h["probabilities"]) == 3


def test_adapter_falls_back_when_disabled(monkeypatch):
    old = rflux_engine.AVAILABLE
    rflux_engine.AVAILABLE = False
    try:
        assert rflux_engine.fit_hmm(np.ones(20), 2) is None
    finally:
        rflux_engine.AVAILABLE = old
