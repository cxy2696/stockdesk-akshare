"""Versioned model registry.

Keeping parameters and versions here makes model upgrades reviewable and
testable without hunting through HMM/percolation/KDJ implementations.
"""
from __future__ import annotations

import time

MODEL_VERSION = "2.0.0"

MODELS = {
    "hmm": {
        "version": "1.1.0",
        "name": "Gaussian HMM market regime",
        "params": {"states": 3, "iterations": 60, "lookback": 420, "min_samples": 60},
        "description": "Three-state Gaussian HMM on daily log returns of five A-share indices.",
    },
    "percolation": {
        "version": "1.1.0",
        "name": "Breadth percolation",
        "params": {"threshold": 0.592746, "neighbours": 4, "min_samples": 100},
        "description": "Maps advancing stocks to a 2-D lattice and measures the largest four-neighbour cluster.",
    },
    "kdj": {
        "version": "1.2.0",
        "name": "KDJ extreme-zone alerts",
        "params": {"n": 9, "k_smooth": 3, "d_smooth": 3, "upper": 118, "lower": -14, "bars": 180},
        "description": "KDJ(9,3,3) on 5m/30m bars with an approximate central zone and reference metrics.",
    },
}


def meta() -> dict:
    return {
        "registry_version": MODEL_VERSION,
        "updated": time.time(),
        "update_policy": "Frontend polls; backend caches with TTL and falls back across quote sources.",
        "models": MODELS,
    }
