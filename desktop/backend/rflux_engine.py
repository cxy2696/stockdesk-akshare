"""Optional rflux bridge for the HMM model.

rflux is a separate C++17 library with a stable C ABI and pybind11 wheel.
StockDesk keeps its own native/NumPy fallback, but when rflux is installed its
multi-start Gaussian HMM trainer is used for the market regime model.  Keeping
this behind a tiny adapter means the app still runs when rflux is absent or its
shared library cannot be loaded.
"""
from __future__ import annotations

from typing import Any

import numpy as np

try:
    import rflux as _rflux

    AVAILABLE = True
    VERSION = str(getattr(_rflux, "__version__", "unknown"))
    NATIVE_VERSION = str(_rflux.native_version())
    ERROR = ""
except Exception as exc:  # pragma: no cover - depends on local install
    _rflux = None
    AVAILABLE = False
    VERSION = ""
    NATIVE_VERSION = ""
    ERROR = str(exc)


def status() -> dict[str, Any]:
    return {
        "backend": "rflux C++" if AVAILABLE else "StockDesk native/NumPy",
        "available": AVAILABLE,
        "version": VERSION,
        "native_version": NATIVE_VERSION,
        "module": getattr(_rflux, "__file__", None) if AVAILABLE else None,
        "error": ERROR,
    }


def fit_hmm(x: np.ndarray, k: int, *, restarts: int = 3, iters: int = 80,
            seed: int = 42) -> dict[str, Any] | None:
    """Fit a diagonal Gaussian HMM with rflux's multi-start C++ trainer.

    Returns plain NumPy values aligned with StockDesk's existing model fields,
    or ``None`` when rflux is unavailable/fails.  The caller owns fallback.
    """
    if not AVAILABLE or _rflux is None:
        return None
    observations = np.ascontiguousarray(np.asarray(x, dtype=np.float64).reshape(-1, 1))
    if observations.shape[0] < 2 or not np.all(np.isfinite(observations)):
        return None
    model = None
    try:
        model = _rflux.regimelab.GaussianHMM(int(k), 1)
        model.fit(
            observations,
            max_iter=max(1, int(iters)),
            n_init=max(1, int(restarts)),
            tol=1e-6,
            variance_floor=1e-8,
            seed=int(seed),
            sort_states=False,
        )
        params = model.parameters
        info = model.fit_info
        gamma = np.asarray(model.smoothed(observations), dtype=float)
        filtered = np.asarray(model.filtered(observations), dtype=float)[-1]
        mu = np.asarray(params.means, dtype=float).reshape(-1)
        var = np.asarray(params.variances, dtype=float).reshape(-1)
        A = np.asarray(params.transition, dtype=float)
        if gamma.shape != (observations.shape[0], int(k)):
            return None
        if not (np.all(np.isfinite(mu)) and np.all(np.isfinite(var)) and np.all(np.isfinite(A))):
            return None
        return {
            "mu": mu,
            "var": np.maximum(var, 1e-8),
            "A": A,
            "gamma": gamma,
            "filtered": filtered,
            "loglik": float(info.log_likelihood),
            "iterations": int(info.iterations),
            "converged": bool(info.converged),
            "engine": f"rflux {VERSION}",
        }
    except Exception:
        return None
    finally:
        if model is not None:
            try:
                model.close()
            except Exception:
                pass
