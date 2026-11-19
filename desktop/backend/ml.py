"""Local LightGBM / Alpha158 feature pipeline.

The model is intentionally local and auditable:

* Alpha158-compatible factors are computed from OHLCV only (no future bars);
* a deterministic feature selector keeps 48 standardised columns;
* LightGBM trains on a chronological split and validates out of sample;
* the live prediction uses the latest completed feature row.

No network service, no GPU and no external model file are required.  If
LightGBM is unavailable the API returns an explicit ``available: false`` object
instead of inventing a prediction.
"""
from __future__ import annotations

import math
import time

import numpy as np
import pandas as pd

from . import db, market, native

ALPHA_COUNT = 158
FEATURE_COUNT = 48
HORIZON = 5
WINDOWS = (5, 10, 15, 20, 30, 40, 60)
CACHE_TTL = 1800

INDEX_SECIDS = {"000300": "1.000300", "000001": "1.000001", "399006": "0.399006", "000688": "1.000688"}


def _num(v):
    try:
        x = float(v)
        return x if math.isfinite(x) else None
    except (TypeError, ValueError):
        return None


def load_bars(code: str, limit: int = 1400) -> list[dict]:
    sec = INDEX_SECIDS.get(code)
    return market.klines(code, limit=limit, adjust="qfq" if sec is None else "",
                         secid_override=sec)


def build_alpha158(rows: list[dict]) -> pd.DataFrame:
    """Return exactly 158 causal OHLCV factors (Alpha158-compatible names)."""
    df = pd.DataFrame(rows)
    if df.empty:
        return pd.DataFrame()
    cols: dict[str, pd.Series] = {}
    o = pd.to_numeric(df["open"], errors="coerce")
    h = pd.to_numeric(df["high"], errors="coerce")
    l = pd.to_numeric(df["low"], errors="coerce")
    c = pd.to_numeric(df["close"], errors="coerce")
    v = pd.to_numeric(df["volume"], errors="coerce").fillna(0.0)
    rng = (h - l).replace(0, np.nan)
    ret1 = c.pct_change()
    logv = np.log1p(v)
    t = pd.Series(np.arange(len(df), dtype=float), index=df.index)

    # 9 KBAR + 4 PRICE + 5 VOLUME = 18 base factors.
    cols["kbar_kmid"] = (c - o) / o.replace(0, np.nan)
    cols["kbar_klen"] = (h - l) / o.replace(0, np.nan)
    cols["kbar_kmid2"] = (c - o) / rng
    cols["kbar_kup"] = (h - np.maximum(o, c)) / o.replace(0, np.nan)
    cols["kbar_kup2"] = (h - np.maximum(o, c)) / rng
    cols["kbar_klow"] = (np.minimum(o, c) - l) / o.replace(0, np.nan)
    cols["kbar_klow2"] = (np.minimum(o, c) - l) / rng
    cols["kbar_ksft"] = (2 * c - h - l) / o.replace(0, np.nan)
    cols["kbar_ksft2"] = (2 * c - h - l) / rng
    cols["price_open"] = o / c
    cols["price_high"] = h / c
    cols["price_low"] = l / c
    cols["price_vwap"] = (o + h + l + c) / 4 / c
    for w in (1, 5, 10, 20, 60):
        cols[f"volume_{w}"] = v / v.rolling(w, min_periods=1).mean()

    # 20 families x 7 windows = 140 factors.
    families = ["ROC", "MA", "STD", "BETA", "RSQR", "RESI", "MAX", "MIN",
                "QTLU", "QTLD", "RANK", "RSV", "IMAX", "IMIN", "IMXD",
                "CORR", "CORD", "CNTP", "CNTN", "CNTD"]
    for w in WINDOWS:
        roll = c.rolling(w, min_periods=max(2, w // 2))
        mean = roll.mean()
        std = roll.std()
        hi = h.rolling(w, min_periods=max(2, w // 2)).max()
        lo = l.rolling(w, min_periods=max(2, w // 2)).min()
        cols[f"roc_{w}"] = c / c.shift(w) - 1
        cols[f"ma_{w}"] = c / mean - 1
        cols[f"std_{w}"] = std / mean.replace(0, np.nan)
        cov_t = c.rolling(w, min_periods=max(2, w // 2)).cov(t)
        var_t = t.rolling(w, min_periods=max(2, w // 2)).var()
        cols[f"beta_{w}"] = cov_t / var_t.replace(0, np.nan)
        corr_t = c.rolling(w, min_periods=max(2, w // 2)).corr(t)
        cols[f"rsqr_{w}"] = corr_t * corr_t
        cols[f"resi_{w}"] = (c - mean) / std.replace(0, np.nan)
        cols[f"max_{w}"] = c / hi.replace(0, np.nan) - 1
        cols[f"min_{w}"] = c / lo.replace(0, np.nan) - 1
        cols[f"qtlu_{w}"] = c / roll.quantile(0.8).replace(0, np.nan) - 1
        cols[f"qtdl_{w}"] = c / roll.quantile(0.2).replace(0, np.nan) - 1
        cols[f"rank_{w}"] = roll.apply(lambda x: float((x <= x[-1]).mean()) if len(x) else np.nan, raw=True)
        cols[f"rsv_{w}"] = (c - lo) / (hi - lo).replace(0, np.nan)
        cols[f"imax_{w}"] = roll.apply(lambda x: float(np.argmax(x)) / w if len(x) else np.nan, raw=True)
        cols[f"imin_{w}"] = roll.apply(lambda x: float(np.argmin(x)) / w if len(x) else np.nan, raw=True)
        cols[f"imxd_{w}"] = cols[f"imax_{w}"] - cols[f"imin_{w}"]
        cols[f"corr_{w}"] = c.rolling(w, min_periods=max(2, w // 2)).corr(v)
        cols[f"cord_{w}"] = c.rolling(w, min_periods=max(2, w // 2)).corr(logv)
        cols[f"cntp_{w}"] = (ret1 > 0).rolling(w, min_periods=max(2, w // 2)).mean()
        cols[f"cntn_{w}"] = (ret1 < 0).rolling(w, min_periods=max(2, w // 2)).mean()
        cols[f"cntd_{w}"] = cols[f"cntp_{w}"] - cols[f"cntn_{w}"]

    # Build once at the end to avoid pandas fragmentation warnings.
    frame = pd.DataFrame(cols, index=df.index)
    factors = [c for c in frame.columns if not c.startswith("_")][:ALPHA_COUNT]
    return frame[factors].replace([np.inf, -np.inf], np.nan)


def _family(name: str) -> str:
    return name.split("_", 1)[0]


def _spearman(a: np.ndarray, b: np.ndarray) -> float | None:
    if len(a) < 8 or len(a) != len(b):
        return None
    ar = np.argsort(np.argsort(a)).astype(float)
    br = np.argsort(np.argsort(b)).astype(float)
    if np.std(ar) <= 1e-12 or np.std(br) <= 1e-12:
        return None
    return float(np.corrcoef(ar, br)[0, 1])


def _forward_returns(closes: np.ndarray, horizon: int = HORIZON) -> np.ndarray:
    out = np.full(len(closes), np.nan, dtype=float)
    for i in range(len(closes) - horizon):
        if closes[i] > 0:
            out[i] = (closes[i + horizon] / closes[i] - 1.0) * 100.0
    return out


def select_features(frame: pd.DataFrame, count: int = FEATURE_COUNT,
                    target: np.ndarray | None = None,
                    train_end: int | None = None) -> list[str]:
    """Family-balanced selector; when target is supplied, require stable IC.

    IC is measured separately on the first/second half of the training prefix.
    A feature must keep the same sign and a meaningful minimum |IC| in both
    halves.  This is a training-only stability filter, not a test-set choice.
    """
    n = len(frame) if train_end is None else min(len(frame), int(train_end))
    y = None if target is None else np.asarray(target[:n], dtype=float)
    stats = []
    for name in frame.columns:
        col = frame[name].to_numpy(float)[:n]
        coverage = float(np.isfinite(col).mean()) if n else 0.0
        std = float(np.nanstd(col)) if np.isfinite(col).any() else 0.0
        if coverage < 0.55 or not math.isfinite(std) or std <= 1e-12:
            continue
        score = coverage
        if y is not None:
            half = n // 2
            valid_a = np.isfinite(col[:half]) & np.isfinite(y[:half])
            valid_b = np.isfinite(col[half:]) & np.isfinite(y[half:])
            ic_a = _spearman(col[:half][valid_a], y[:half][valid_a])
            ic_b = _spearman(col[half:][valid_b], y[half:][valid_b])
            if ic_a is None or ic_b is None or ic_a * ic_b <= 0:
                continue
            score = min(abs(ic_a), abs(ic_b)) * math.sqrt(coverage)
            if score < 0.015:
                continue
        stats.append((name, coverage, std, score))
    by_family: dict[str, list[tuple[str, float, float, float]]] = {}
    for item in stats:
        by_family.setdefault(_family(item[0]), []).append(item)
    for items in by_family.values():
        items.sort(key=lambda x: (-x[3], -x[1], x[0]))
    selected: list[str] = []
    while len(selected) < count:
        progressed = False
        for fam in sorted(by_family):
            items = by_family[fam]
            if items and len(selected) < count:
                selected.append(items.pop(0)[0])
                progressed = True
        if not progressed:
            break
    if len(selected) < count:
        # A pure IC filter can be too strict on a short history; fall back to
        # coverage/variance only for the remaining slots.
        rest = [x for x in stats if x[0] not in selected]
        rest.sort(key=lambda x: (-x[1], -x[2], x[0]))
        selected.extend(x[0] for x in rest[:count - len(selected)])
    return selected


def standardize(matrix: np.ndarray, fit_rows: int | None = None) -> np.ndarray:
    """C++ column standardisation; fit statistics can be restricted to train.

    ``fit_rows`` prevents the validation/live part from leaking its mean and
    volatility into the training transform.
    """
    arr = np.asarray(matrix, dtype=float)
    if fit_rows is None:
        fit_rows = len(arr)
    fit_rows = max(1, min(int(fit_rows), len(arr)))
    if native.NATIVE:
        try:
            return np.asarray(native.native.standardize_matrix_fit(arr, fit_rows), dtype=float)
        except Exception:
            pass
    train = arr[:fit_rows]
    means = np.nanmean(train, axis=0)
    stds = np.nanstd(train, axis=0)
    stds[~np.isfinite(stds) | (stds <= 1e-12)] = 1.0
    out = (arr - means) / stds
    return np.nan_to_num(out, nan=0.0, posinf=0.0, neginf=0.0)





def train_predict(code: str = "000300", limit: int = 1400) -> dict:
    rows = load_bars(code, limit=limit)
    if len(rows) < 320:
        return {"available": False, "reason": f"K线不足（{len(rows)} 根，至少 320 根）",
                "alpha158_count": 0, "feature_count": 0, "code": code}
    frame = build_alpha158(rows)
    closes = pd.to_numeric(pd.Series([r["close"] for r in rows]), errors="coerce").to_numpy(float)
    fwd = _forward_returns(closes)
    raw_split = max(220, int(len(rows) * 0.8))
    train_end = min(raw_split, len(rows) - HORIZON)
    # Feature selection is trained on the past only and requires stable
    # two-half IC, not just high variance.
    feature_names = select_features(frame, target=fwd, train_end=train_end)
    if len(feature_names) < FEATURE_COUNT:
        feature_names = select_features(frame.iloc[:raw_split])
    if len(feature_names) < FEATURE_COUNT:
        return {"available": False, "reason": f"有效因子不足（{len(feature_names)}/48）",
                "alpha158_count": len(frame.columns), "feature_count": len(feature_names), "code": code}
    X_raw = frame[feature_names].to_numpy(float)
    valid = np.isfinite(fwd) & np.isfinite(closes)
    X = X_raw[valid]
    y_return = fwd[valid].astype(float)
    y = (y_return > 0).astype(int)
    n = len(X)
    split = max(200, int(n * 0.8))
    embargo = HORIZON
    valid_start = split + embargo
    if n - valid_start < 40:
        return {"available": False, "reason": "验证样本不足（含 5 日隔离期）",
                "alpha158_count": len(frame.columns), "feature_count": len(feature_names), "code": code}
    X = standardize(X, fit_rows=split)
    # The last completed bar is transformed with training statistics only.
    live_X = np.vstack([X_raw[valid][:split], X_raw[-1:]])
    live_X = standardize(live_X, fit_rows=split)[-1:]
    try:
        # PyInstaller may omit scipy.sparse even though LightGBM imports it for
        # optional sparse-matrix support.  We only pass dense numpy arrays, so
        # a tiny compatible module is sufficient and avoids shipping all of
        # SciPy.  Real SciPy is used whenever it imports successfully.
        try:
            import scipy.sparse  # noqa: F401
        except Exception:
            import sys
            import types
            import scipy
            stub = types.ModuleType("scipy.sparse")
            class _SparseMatrix:  # pragma: no cover - type check only
                pass
            class _CSR(_SparseMatrix):
                def __init__(self, *args, **kwargs):
                    raise NotImplementedError("dense-only LightGBM build")
            class _CSC(_SparseMatrix):
                def __init__(self, *args, **kwargs):
                    raise NotImplementedError("dense-only LightGBM build")
            stub.spmatrix = _SparseMatrix
            stub.csr_matrix = _CSR
            stub.csc_matrix = _CSC
            stub.issparse = lambda x: False
            stub.hstack = lambda *a, **k: None
            sys.modules["scipy.sparse"] = stub
            scipy.sparse = stub
        import lightgbm as lgb
        params = {
            "objective": "binary", "metric": "binary_logloss", "verbosity": -1,
            "num_leaves": 15, "learning_rate": 0.03, "feature_fraction": 0.8,
            "bagging_fraction": 0.8, "bagging_freq": 1, "min_data_in_leaf": 30,
            "lambda_l2": 1.0, "seed": 42, "num_threads": 2,
        }
        dtrain = lgb.Dataset(X[:split], label=y[:split], feature_name=feature_names)
        dvalid = lgb.Dataset(X[valid_start:], label=y[valid_start:], reference=dtrain)
        booster = lgb.train(params, dtrain, num_boost_round=400,
                            valid_sets=[dvalid],
                            callbacks=[lgb.early_stopping(30, verbose=False), lgb.log_evaluation(0)])
        prob_valid = booster.predict(X[valid_start:])
        pred = (prob_valid >= 0.5).astype(int)
        acc = float((pred == y[valid_start:]).mean())
        yv = y[valid_start:]
        # Rank AUC is threshold-free and more honest than accuracy when the
        # positive class is imbalanced.
        order = np.argsort(prob_valid)
        ranks = np.empty_like(order, dtype=float)
        ranks[order] = np.arange(1, len(prob_valid) + 1)
        n_pos = int(yv.sum())
        n_neg = int(len(yv) - n_pos)
        auc = ((ranks[yv == 1].sum() - n_pos * (n_pos + 1) / 2) / (n_pos * n_neg)
               if n_pos and n_neg else 0.5)
        eps = 1e-6
        logloss = float(-np.mean(y[valid_start:] * np.log(np.clip(prob_valid, eps, 1 - eps)) +
                                 (1 - y[valid_start:]) * np.log(np.clip(1 - prob_valid, eps, 1 - eps))))
        prob_up = float(booster.predict(live_X)[0])
        # A regression head is more appropriate for "expected 5-day return";
        # rank IC is threshold-free and complements binary AUC.
        rparams = dict(params)
        rparams.update({"objective": "regression", "metric": "rmse"})
        rtrain = lgb.Dataset(X[:split], label=y_return[:split], feature_name=feature_names)
        rvalid = lgb.Dataset(X[valid_start:], label=y_return[valid_start:], reference=rtrain)
        regression = lgb.train(rparams, rtrain, num_boost_round=400,
                               valid_sets=[rvalid],
                               callbacks=[lgb.early_stopping(30, verbose=False), lgb.log_evaluation(0)])
        expected_valid = regression.predict(X[valid_start:])
        expected_5d = float(regression.predict(live_X)[0])
        rank_ic = _spearman(expected_valid, y_return[valid_start:])
        gain = booster.feature_importance(importance_type="gain")
        top = sorted(zip(feature_names, gain.tolist()), key=lambda kv: kv[1], reverse=True)[:8]
        return {
            "available": True, "code": code, "source": f"LightGBM {lgb.__version__}",
            "alpha158_count": int(frame.columns.size), "feature_count": len(feature_names),
            "train_samples": split, "valid_samples": n - valid_start,
            "embargo": embargo, "standardization": "train-only C++ fit",
            "accuracy": round(acc, 3), "auc": round(float(auc), 3), "logloss": round(logloss, 4),
            "base_rate": round(float(y[valid_start:].mean()), 3),
            "prob_up": round(prob_up, 4), "expected_5d": round(expected_5d, 2),
            "rank_ic": round(rank_ic, 3) if rank_ic is not None else None,
            "selection": "train-only stable rank IC",
            "direction": "偏多" if prob_up >= 0.55 and expected_5d > 0 else ("偏空" if prob_up <= 0.45 and expected_5d < 0 else "中性"),
            "top_features": [{"name": k, "gain": round(float(v), 2)} for k, v in top],
            "feature_names": feature_names,
            "params": {k: params[k] for k in ("num_leaves", "learning_rate", "min_data_in_leaf", "lambda_l2")},
            "bars": len(rows), "updated": time.time(),
            "caveat": "时序验证结果只说明历史样本表现，不是收益承诺；概率接近 50% 或 Rank IC 接近 0 时不要据此重仓。",
        }
    except Exception as exc:
        return {"available": False, "reason": f"LightGBM 训练失败：{exc}",
                "alpha158_count": int(frame.columns.size), "feature_count": len(feature_names),
                "code": code}


def forecast(code: str = "000300") -> dict:
    key = f"ml:forecast:v3:{code}"
    cached = db.cache_get(key, CACHE_TTL)
    if cached:
        return cached
    out = train_predict(code)
    if out.get("available"):
        db.cache_set(key, out)
    return out
