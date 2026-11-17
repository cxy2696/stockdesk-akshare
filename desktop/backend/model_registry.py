"""Versioned model registry.

Keeping parameters and versions here makes model upgrades reviewable and
testable without hunting through HMM/percolation/TD implementations.
"""
from __future__ import annotations

import time

MODEL_VERSION = "2.7.0"

MODELS = {
    "hmm": {
        "version": "2.1.0",
        "name": "Gaussian HMM market regime",
        "params": {"states": 3, "iterations": 80, "lookback": 420, "min_samples": 60, "restarts": 3},
        "description": (
            "Three-state Gaussian HMM on daily log returns of five A-share indices. "
            "Multi-start Baum-Welch (rflux C++ trainer when installed, StockDesk native/NumPy fallback), "
            "ordered weak→range→strong, with posterior "
            "confidence, filtered (online) state, regime age, state quality, risk score "
            "and per-state return/volatility/Sharpe/win-rate statistics."
        ),
    },
    "percolation": {
        "version": "2.1.0",
        "name": "Breadth percolation",
        "params": {"threshold": 0.592746, "neighbours": 4, "min_samples": 100, "layout": "stable-hash", "bootstrap": 12},
        "description": (
            "Maps advancing stocks to a 2-D lattice in stable hashed order and measures "
            "the largest four-neighbour cluster, its spanning status, susceptibility, "
            "a random-layout baseline and a bootstrap interval / persistence trend."
        ),
    },
    "td": {
        "version": "1.1.0",
        "name": "TD Sequential (九转)",
        "params": {"setup": 9, "countdown": 13, "lookback": 4, "bars": 420},
        "description": (
            "DeMark TD Sequential setup and countdown on index and stock daily bars, "
            "with a separate plain-language reading, signal freshness and quality. "
            "Exhaustion signal, not a forecast."
        ),
    },
    "decision": {
        "version": "1.0.0",
        "name": "Trade decision & market forecast",
        "params": {"zone": "support/MA20 ± ATR", "stop": "support/ATR 2.2, max 10%",
                   "target": "resistance/ATR 4, max 20%", "horizon": 5},
        "description": (
            "Turns price structure, moving averages, RSI, TD, flow and the HMM regime into a "
            "transparent buy zone / stop / target / risk-reward plan and a good/neutral/bad rating. "
            "Market forecast mixes HMM transition^5 with per-state historical return/volatility."
        ),
    },
    "native": {
        "version": "1.2.1",
        "name": "C++ market/model core",
        "params": {"grid": "union-find", "hmm": "diag-Gaussian Baum-Welch",
                   "census": "breadth/coverage audit"},
        "description": (
            "Optional pybind11 acceleration split into pure C++ algorithms and a validating binding layer. "
            "Union-find percolation, scaled Baum-Welch, a one-row-per-stock breadth census and a coverage "
            "audit (duplicates/missing/extra) are deterministic and thread-safe; the NumPy/Python fallback "
            "keeps the public result shape, classification rules and convergence semantics identical."
        ),
    },
}


def meta() -> dict:
    return {
        "registry_version": MODEL_VERSION,
        "updated": time.time(),
        "update_policy": "Frontend polls; backend caches with TTL and falls back across quote sources.",
        "models": MODELS,
    }
