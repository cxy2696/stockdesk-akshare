"""Cross-sectional factor screening and classification for the full A market.

The factor lab works on the same full-market snapshot as the rest of StockDesk,
so it adds no extra network calls.  It is deliberately transparent:

* each factor is rank-normalised across the current cross-section;
* factors are screened by data coverage and a per-category quota;
* category scores are combined with regime-aware weights;
* the result is a ranked stock list plus a factor table with rejection reasons.

Historical IC (the HP Quant screen) requires a stored daily cross-section.  This
module does not fabricate one; it labels itself as a cross-sectional screen and
can be extended later by persisting daily snapshots.
"""
from __future__ import annotations

import math
from functools import lru_cache
from statistics import NormalDist, median, pstdev

from . import db, market

CATEGORY_LABELS = {
    "momentum": "动量",
    "value": "价值",
    "volatility": "波动",
    "liquidity": "流动性",
    "flow": "资金",
    "sentiment": "情绪",
    "size": "规模",
}

DIRECTION_LABELS = {1: "正向", -1: "反向"}
_NORMAL = NormalDist()


@lru_cache(maxsize=65536)
def _normal_z(p: float) -> float:
    """Cached inverse normal CDF.

    The same percentile grid repeats across factors; caching turns ~66k calls
    per snapshot into ~5k unique evaluations without changing any z-score.
    """
    return _NORMAL.inv_cdf(p)

FACTOR_SPECS = [
    {"name": "mom60", "label": "60日动量", "category": "momentum", "direction": 1,
     "horizon": "中长期", "source": "行情", "field": "pct60",
     "desc": "近 60 个交易日涨幅；越高代表中期趋势越强。"},
    {"name": "intraday_mom", "label": "日内动量", "category": "momentum", "direction": 1,
     "horizon": "短期", "source": "行情", "field": "open", "calc": "intraday",
     "desc": "（现价-今开）/今开；衡量当日盘中承接，是快照源没有60日涨幅时的短期动量代理。"},
    {"name": "mom_ytd", "label": "年内涨幅", "category": "momentum", "direction": 1,
     "horizon": "长期", "source": "行情", "field": "pct_ytd",
     "desc": "年初至今涨幅；代表长期动量与资金偏好。"},
    {"name": "ep", "label": "盈利收益率", "category": "value", "direction": 1,
     "horizon": "快照", "source": "估值", "field": "pe", "transform": "inverse",
     "desc": "1/PE；盈利收益率越高，估值相对越低。"},
    {"name": "bp", "label": "账面收益率", "category": "value", "direction": 1,
     "horizon": "快照", "source": "估值", "field": "pb", "transform": "inverse",
     "desc": "1/PB；账面收益率越高，市净率相对越低。"},
    {"name": "low_amp", "label": "低振幅", "category": "volatility", "direction": -1,
     "horizon": "短期", "source": "行情", "field": "amplitude", "calc": "amplitude",
     "desc": "当日振幅；反向因子，振幅越低越稳健。缺少振幅字段时用最高/最低/昨收计算。"},
    {"name": "turnover", "label": "换手率", "category": "liquidity", "direction": 1,
     "horizon": "快照", "source": "行情", "field": "turnover",
     "desc": "当日换手率；代表交易活跃度与流动性。"},
    {"name": "amount_log", "label": "成交额", "category": "liquidity", "direction": 1,
     "horizon": "快照", "source": "行情", "field": "amount", "transform": "log",
     "desc": "成交额对数；大成交额更容易进出。"},
    {"name": "flow_ratio", "label": "主力净流入占比", "category": "flow", "direction": 1,
     "horizon": "快照", "source": "资金", "field": "main_inflow", "transform": "flow",
     "desc": "主力净流入 / 成交额；衡量资金方向。"},
    {"name": "today", "label": "当日涨跌", "category": "sentiment", "direction": 1,
     "horizon": "短期", "source": "行情", "field": "pct",
     "desc": "当日涨跌幅；短期情绪代理。"},
    {"name": "range_pos", "label": "日内位置", "category": "sentiment", "direction": 1,
     "horizon": "短期", "source": "行情", "field": "price", "calc": "range_pos",
     "desc": "(现价-最低)/(最高-最低)；收在日内高位代表买盘更强。"},
    {"name": "size", "label": "市值规模", "category": "size", "direction": -1,
     "horizon": "快照", "source": "行情", "field": "mcap", "transform": "log",
     "desc": "总市值对数；反向因子，小市值通常弹性更大、风险也更高。"},
    {"name": "volume_ratio", "label": "量比", "category": "sentiment", "direction": 1,
     "horizon": "短期", "source": "行情", "field": "volume_ratio",
     "desc": "量比；放量代表关注度上升，也需配合价格位置。"},
]

DEFAULT_SCREEN = {
    "min_coverage": 0.50,
    "max_per_category": 2,
    "max_factors": 10,
    "min_factors": 4,
}

REGIME_WEIGHTS = {
    "强势": {"momentum": 0.28, "sentiment": 0.15, "flow": 0.17,
             "liquidity": 0.13, "value": 0.09, "volatility": 0.12, "size": 0.06},
    "弱势": {"value": 0.24, "volatility": 0.25, "liquidity": 0.13,
             "flow": 0.15, "momentum": 0.08, "sentiment": 0.09, "size": 0.06},
    "震荡": {"momentum": 0.19, "value": 0.19, "volatility": 0.17,
             "liquidity": 0.15, "flow": 0.15, "sentiment": 0.09, "size": 0.06},
}


def _num(v):
    try:
        x = float(v)
        return x if math.isfinite(x) else None
    except (TypeError, ValueError):
        return None


def _value(row: dict, spec: dict) -> float | None:
    x = _num(row.get(spec.get("field")))
    calc = spec.get("calc")
    if calc == "amplitude":
        if x is None:
            high, low, prev = _num(row.get("high")), _num(row.get("low")), _num(row.get("prev_close"))
            if high is not None and low is not None and prev and prev > 0:
                x = (high - low) / prev * 100.0
        if x is None:
            return None
    elif calc == "intraday":
        price, open_ = _num(row.get("price")), _num(row.get("open"))
        if price is None or open_ is None or open_ <= 0:
            return None
        return (price - open_) / open_ * 100.0
    elif calc == "range_pos":
        price, high, low = _num(row.get("price")), _num(row.get("high")), _num(row.get("low"))
        if price is None or high is None or low is None or high <= low:
            return None
        return max(0.0, min(1.0, (price - low) / (high - low)))
    if x is None:
        return None
    transform = spec.get("transform")
    if transform == "inverse":
        return 1.0 / x if x > 0 else None
    if transform == "log":
        return math.log1p(x) if x > 0 else None
    if transform == "flow":
        amount = _num(row.get("amount"))
        if not amount or amount <= 0:
            return None
        return x / amount * 100.0
    return x


def _rank_normal(values: list[float | None]) -> list[float]:
    """Normalised cross-sectional rank; missing values become neutral 0."""
    valid = sorted((v, i) for i, v in enumerate(values) if v is not None)
    n = len(valid)
    out = [0.0] * len(values)
    if n < 5:
        return out
    for rank, (_, i) in enumerate(valid):
        pct = (rank + 1) / (n + 1)
        out[i] = max(-3.5, min(3.5, _normal_z(pct)))
    return out


def _stats(values: list[float | None]) -> dict:
    clean = [v for v in values if v is not None]
    if not clean:
        return {"n": 0, "mean": None, "median": None, "std": None, "min": None, "max": None}
    return {
        "n": len(clean),
        "mean": round(sum(clean) / len(clean), 4),
        "median": round(median(clean), 4),
        "std": round(pstdev(clean), 4) if len(clean) > 1 else 0.0,
        "min": round(min(clean), 4),
        "max": round(max(clean), 4),
    }


def classify() -> dict:
    def group(key, label, items):
        buckets: dict[str, list[dict]] = {}
        for spec in FACTOR_SPECS:
            buckets.setdefault(str(spec.get(key)), []).append(spec)
        return [
            {"key": k, "label": label(k), "count": len(v),
             "factors": [x["name"] for x in v],
             "labels": [x["label"] for x in v]}
            for k, v in buckets.items()
        ]

    return {
        "category": group("category", lambda k: CATEGORY_LABELS.get(k, k), FACTOR_SPECS),
        "horizon": group("horizon", lambda k: k, FACTOR_SPECS),
        "source": group("source", lambda k: k, FACTOR_SPECS),
        "direction": group("direction", lambda k: DIRECTION_LABELS.get(int(k), k), FACTOR_SPECS),
    }


def _regime() -> tuple[str, dict]:
    cached = db.cache_get("market:state:v2", 180) or {}
    label = str(((cached.get("verdict") or {}).get("label")) or "震荡")
    if label not in REGIME_WEIGHTS:
        label = "震荡"
    return label, REGIME_WEIGHTS[label]


def screen(rows: list[dict]) -> tuple[list[dict], dict]:
    cfg = DEFAULT_SCREEN
    total = max(1, len(rows))
    factors: list[dict] = []
    for spec in FACTOR_SPECS:
        values = [_value(r, spec) for r in rows]
        coverage = sum(1 for v in values if v is not None) / total
        factors.append({**spec, "coverage": round(coverage, 3), "values": values,
                        "stats": _stats(values)})
    accepted = [f for f in factors if f["coverage"] >= cfg["min_coverage"]]
    accepted.sort(key=lambda f: (-f["coverage"], f["name"]))
    selected: list[dict] = []
    per_cat: dict[str, int] = {}
    rejected: list[dict] = []
    for f in accepted:
        if len(selected) >= cfg["max_factors"]:
            rejected.append({**f, "selected": False, "reason": f"超过总上限 {cfg['max_factors']}"})
            continue
        cat = f["category"]
        if per_cat.get(cat, 0) >= cfg["max_per_category"]:
            rejected.append({**f, "selected": False,
                             "reason": f"类别「{CATEGORY_LABELS.get(cat, cat)}」配额已满"})
            continue
        selected.append({**f, "selected": True, "reason": "入选"})
        per_cat[cat] = per_cat.get(cat, 0) + 1
    for f in factors:
        if f["coverage"] < cfg["min_coverage"]:
            rejected.append({**f, "selected": False,
                             "reason": f"覆盖率 {f['coverage']:.0%} < {cfg['min_coverage']:.0%}"})
    # Keep the model usable when the snapshot is sparse.
    if len(selected) < cfg["min_factors"]:
        pool = [f for f in factors if f not in selected
                and f["coverage"] > 0 and all(f["name"] != x["name"] for x in selected)]
        pool.sort(key=lambda f: -f["coverage"])
        for f in pool:
            if len(selected) >= cfg["min_factors"]:
                break
            selected.append({**f, "selected": True, "reason": "补充：覆盖率最高"})
    selected_names = {f["name"] for f in selected}
    rejected = [r for r in rejected if r["name"] not in selected_names]
    return selected, {
        "thresholds": cfg,
        "selected_count": len(selected),
        "total": len(factors),
        "summary": f"{len(selected)}/{len(factors)} 个因子入选，覆盖 "
                   f"{len({f['category'] for f in selected})} 个类别。",
        "rejected": rejected,
    }


def snapshot(limit: int = 100, min_amount: float = 30_000_000,
             exclude_st: bool = True) -> dict:
    spot = market.fetch_spot()
    rows = spot.get("rows", []) or []
    if not rows:
        return {"ready": False, "date": spot.get("date"), "ts": spot.get("ts"),
                "factors": [], "stocks": [], "classification": classify()}
    selected, screening = screen(rows)
    z_by_name: dict[str, list[float]] = {}
    for f in selected:
        dirn = int(f.get("direction") or 1)
        z_by_name[f["name"]] = [z * dirn for z in _rank_normal(f["values"])]
    state, weights = _regime()
    cat_z: dict[str, list[float | None]] = {}
    for cat in CATEGORY_LABELS:
        factors = [f for f in selected if f["category"] == cat]
        if not factors:
            continue
        cat_z[cat] = []
        for i in range(len(rows)):
            vals = [z_by_name[f["name"]][i] for f in factors
                    if f["values"][i] is not None]
            cat_z[cat].append(sum(vals) / len(vals) if vals else None)
    composite: list[float | None] = []
    category_hits: list[int] = []
    for i in range(len(rows)):
        available = [(c, cat_z[c][i]) for c in cat_z if cat_z[c][i] is not None]
        category_hits.append(len(available))
        if not available:
            composite.append(None)
            continue
        denom = sum(weights.get(c, 0.0) for c, _ in available)
        composite.append(sum(v * weights.get(c, 0.0) for c, v in available) / (denom or 1.0))
    # Cross-sectional percentile -> 0-100 score, calculated only over stocks
    # that have at least one complete factor category.
    valid_indices = [i for i, v in enumerate(composite) if v is not None]
    order = sorted(valid_indices, key=lambda i: composite[i])
    pct: list[float | None] = [None] * len(composite)
    for rank, i in enumerate(order):
        pct[i] = (rank + 0.5) / max(1, len(order))
    selected_names = [f["name"] for f in selected]
    stocks = []
    for i, row in enumerate(rows):
        price = _num(row.get("price"))
        if not price or price <= 0 or composite[i] is None:
            continue
        amount = _num(row.get("amount")) or 0
        if amount < min_amount:
            continue
        name = str(row.get("name") or "")
        if exclude_st and ("ST" in name.upper() or "退" in name):
            continue
        scores = {c: round(cat_z[c][i], 3) for c in cat_z if cat_z[c][i] is not None}
        factor_hits = sum(1 for f in selected if f["values"][i] is not None)
        # Shrink extreme percentiles when the candidate has narrow coverage.
        # This is an overfit guard: a high score built from two categories and
        # few factors is moved toward neutral instead of being treated as a
        # fully observed cross-section.
        cat_cov = category_hits[i] / max(len(cat_z), 1)
        fac_cov = factor_hits / max(len(selected_names), 1)
        reliability = math.sqrt(max(0.0, min(1.0, cat_cov * fac_cov)))
        raw_score = float(pct[i]) * 100.0
        adjusted = 50.0 + (raw_score - 50.0) * reliability
        stocks.append({
            "code": row.get("code"), "name": name,
            "price": round(price, 2), "pct": _num(row.get("pct")),
            "market": row.get("market"),
            "industry": row.get("industry") or market.industry_name(str(row.get("code") or "")),
            "pe": _num(row.get("pe")), "pb": _num(row.get("pb")),
            "turnover": _num(row.get("turnover")), "amount": amount,
            "main_inflow": _num(row.get("main_inflow")),
            "main_inflow_ratio": round((_num(row.get("main_inflow")) or 0) / amount * 100, 3) if amount else None,
            "pct60": _num(row.get("pct60")),
            "pct_ytd": _num(row.get("pct_ytd")),
            "intraday": (round((price / float(row["open"]) - 1) * 100, 2)
                         if _num(row.get("open")) and float(row["open"]) > 0 else None),
            "percentile": round(float(pct[i]), 4), "raw_score": round(raw_score, 1),
            "score": round(adjusted, 1), "reliability": round(reliability, 3),
            "coverage": round(category_hits[i] / max(len(cat_z), 1), 3),
            "factor_coverage": round(factor_hits / max(len(selected_names), 1), 3),
            "factor_hits": factor_hits,
            "factor_total": len(selected_names),
            "scores": scores,
        })
    stocks.sort(key=lambda r: r["score"], reverse=True)
    factors = [{k: v for k, v in f.items() if k != "values"} for f in selected]
    factor_rows = []
    for f in factors:
        factor_rows.append({**f, "selected": True})
    for r in screening["rejected"]:
        factor_rows.append({**{k: v for k, v in r.items() if k != "values"}, "selected": False})
    screening_out = {
        **screening,
        "rejected": [{k: v for k, v in r.items() if k != "values"}
                     for r in screening["rejected"]],
    }
    return {
        "ready": True,
        "date": spot.get("date"),
        "ts": spot.get("ts"),
        "source": spot.get("source"),
        "total": len(rows),
        "scanned": len(stocks),
        "state": state,
        "weights": weights,
        "classification": classify(),
        "factors": factor_rows,
        "screening": screening_out,
        "stocks": stocks[: max(1, min(limit, 6000))],
        "trace": {
            "algorithm": "cross-sectional-factor-v2",
            "snapshot_ts": spot.get("ts"),
            "snapshot_date": spot.get("date"),
            "rows": len(rows),
            "candidates": len(stocks),
            "selected_factors": selected_names,
            "regime": state,
            "category_weights": weights,
            "rank_transform": "normal-inverse-cdf",
            "missing_policy": "category-neutral-with-coverage",
            "momentum_coverage": next((f["coverage"] for f in factor_rows if f["name"] == "mom60"), None),
            "intraday_momentum_coverage": next((f["coverage"] for f in factor_rows if f["name"] == "intraday_mom"), None),
            "flow_coverage": next((f["coverage"] for f in factor_rows if f["name"] == "flow_ratio"), None),
            "min_amount": min_amount,
            "exclude_st": bool(exclude_st),
        },
        "note": "横截面因子筛选；按类别计算可用因子均值，缺失类别不强行补 0；每只候选显示类别/因子覆盖率。动量/资金因子的覆盖率取决于当前快照源，缺失时明确排除而不是编造。历史 IC 需持久化每日快照后计算，本页不伪造 IC。",
    }
