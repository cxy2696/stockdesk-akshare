"""Quant models: Gaussian HMM market regimes + breadth percolation."""
from __future__ import annotations

import math
import random
import time
from collections import deque
from statistics import mean, pstdev

import numpy as np

from . import db, market, state

PERC_THRESHOLD = 0.592746


def _hmm(x: np.ndarray, k: int = 3, iters: int = 60) -> dict:
    n = len(x)
    if n < 60:
        return {}
    qs = np.quantile(x, [0.2, 0.5, 0.8])
    mu = qs.astype(float)
    var = np.full(k, max(float(np.var(x)), 1e-8))
    pi = np.full(k, 1.0 / k)
    A = np.full((k, k), 0.12 / (k - 1))
    np.fill_diagonal(A, 0.88)

    def emit(t: int) -> np.ndarray:
        return np.exp(-0.5 * (np.log(2 * math.pi * var) + (x[t] - mu) ** 2 / var))

    for _ in range(iters):
        B = np.array([emit(t) for t in range(n)]) + 1e-300
        alpha = np.zeros((n, k))
        c = np.zeros(n)
        alpha[0] = pi * B[0]
        c[0] = alpha[0].sum() or 1e-300
        alpha[0] /= c[0]
        for t in range(1, n):
            alpha[t] = (alpha[t - 1] @ A) * B[t]
            c[t] = alpha[t].sum() or 1e-300
            alpha[t] /= c[t]
        beta = np.zeros((n, k))
        beta[-1] = 1.0
        for t in range(n - 2, -1, -1):
            beta[t] = (A @ (B[t + 1] * beta[t + 1]))
            beta[t] /= (c[t + 1] or 1e-300)
        gamma = alpha * beta
        gamma /= np.maximum(gamma.sum(axis=1, keepdims=True), 1e-300)
        xi = np.zeros((k, k))
        for t in range(n - 1):
            m = alpha[t][:, None] * A * (B[t + 1] * beta[t + 1])[None, :]
            xi += m / max(m.sum(), 1e-300)
        pi = gamma[0] / max(gamma[0].sum(), 1e-300)
        A = xi / np.maximum(xi.sum(axis=1, keepdims=True), 1e-300)
        A = np.maximum(A, 1e-4)
        A /= A.sum(axis=1, keepdims=True)
        w = np.maximum(gamma.sum(axis=0), 1e-6)
        mu = (gamma * x[:, None]).sum(axis=0) / w
        var = (gamma * (x[:, None] - mu) ** 2).sum(axis=0) / w
        var = np.maximum(var, 1e-8)

    B = np.array([emit(t) for t in range(n)]) + 1e-300
    alpha = np.zeros((n, k)); alpha[0] = pi * B[0]
    cs = [max(alpha[0].sum(), 1e-300)]; alpha[0] /= cs[0]
    for t in range(1, n):
        alpha[t] = (alpha[t - 1] @ A) * B[t]
        cs.append(max(alpha[t].sum(), 1e-300))
        alpha[t] /= cs[-1]
    beta = np.zeros((n, k)); beta[-1] = 1
    for t in range(n - 2, -1, -1):
        beta[t] = A @ (B[t + 1] * beta[t + 1])
        beta[t] /= max(beta[t].sum(), 1e-300)
    gamma = alpha * beta
    gamma /= np.maximum(gamma.sum(axis=1, keepdims=True), 1e-300)

    order = np.argsort(mu)
    rank = {int(old): int(new) for new, old in enumerate(order)}
    mu = mu[order]; var = var[order]
    A = A[np.ix_(order, order)]
    gamma = gamma[:, order]
    current = int(np.argmax(gamma[-1]))
    labels = ["弱势", "震荡", "强势"]
    probs = [round(float(v), 4) for v in gamma[-1]]
    trans = [[round(float(v), 4) for v in row] for row in A]
    duration = round(float(1 / max(1 - A[current][current], 1e-4)), 1)
    history = [int(np.argmax(gamma[t])) for t in range(max(0, n - 60), n)]
    loglik = float(np.sum(np.log(cs)))
    params = k * k + 3 * k - 1
    aic = round(2 * params - 2 * loglik, 1)
    bic = round(params * math.log(n) - 2 * loglik, 1)
    interpretation = [
        f"当前处于{labels[current]}状态，后验概率 {probs[current] * 100:.1f}%；该状态历史日均收益 {mu[current]:+.3f}%、日均波动 {math.sqrt(var[current]):.2f}%。",
        f"状态自持概率 {A[current][current] * 100:.1f}%，预计持续约 {duration:.1f} 个交易日；状态切换通常滞后于价格。",
        f"下一交易日最可能仍是{labels[int(np.argmax(A[current]))]}（{A[current].max() * 100:.1f}%），但低概率状态切换需要风控预案。",
        "HMM 使用收益与波动的联合分布，不直接预测点位；应结合仓位、支撑压力与成交额使用。",
    ]
    return {
        "state": labels[current], "state_index": current,
        "loglik": round(loglik, 1), "aic": aic, "bic": bic, "iterations": iters,
        "interpretation": interpretation,
        "probabilities": [{"label": labels[i], "p": probs[i], "mean": round(float(mu[i]), 4),
                           "vol": round(float(math.sqrt(var[i])), 4)} for i in range(k)],
        "transition": [{"from": labels[i], "to": [trans[i][j] for j in range(k)]} for i in range(k)],
        "expected_days": duration,
        "next": [{"label": labels[j], "p": trans[current][j]} for j in range(k)],
        "history": history,
        "signal": ("趋势延续概率较高，可维持现有仓位并关注成交额" if current == 2 else
                   "状态偏弱，优先控制回撤，等待概率转向震荡/强势" if current == 0 else
                   "震荡状态，降低交易频率，区间操作"),
    }


def _largest_component(grid: list[int], cols: int) -> list[int]:
    seen = bytearray(len(grid)); largest: list[int] = []
    for i in range(len(grid)):
        if not grid[i] or seen[i]:
            continue
        q = deque([i]); seen[i] = 1; comp = []
        while q:
            v = q.popleft(); comp.append(v)
            r, c = divmod(v, cols)
            for nr, nc in ((r - 1, c), (r + 1, c), (r, c - 1), (r, c + 1)):
                if 0 <= nr < cols and 0 <= nc < cols:
                    w = nr * cols + nc
                    if grid[w] and not seen[w]:
                        seen[w] = 1; q.append(w)
        if len(comp) > len(largest):
            largest = comp
    return largest


def _percolation(rows: list[dict], min_n: int = 100, with_grid: bool = True) -> dict:
    rows = [r for r in rows if (r.get("price") or 0) > 0 and (r.get("amount") or 0) > 0
            and "退" not in (r.get("name") or "") and "ST" not in (r.get("name") or "").upper()]
    n = len(rows)
    if n < min_n:
        return {}
    cols = int(math.ceil(math.sqrt(n)))
    grid = [0] * (cols * cols)
    for i, r in enumerate(rows):
        grid[i] = 1 if (r.get("pct") or 0) > 0 else 0
    seen = bytearray(len(grid))
    largest: list[int] = []
    clusters: list[int] = []
    for i in range(len(grid)):
        if not grid[i] or seen[i]:
            continue
        q = deque([i]); seen[i] = 1; comp = []
        while q:
            v = q.popleft(); comp.append(v)
            r, c = divmod(v, cols)
            for nr, nc in ((r - 1, c), (r + 1, c), (r, c - 1), (r, c + 1)):
                if 0 <= nr < cols and 0 <= nc < cols:
                    w = nr * cols + nc
                    if grid[w] and not seen[w]:
                        seen[w] = 1; q.append(w)
        clusters.append(len(comp))
        if len(comp) > len(largest):
            largest = comp
    occ = sum(grid)
    ratio = occ / n
    giant = len(largest) / n
    giant_occ = len(largest) / max(occ, 1)
    status = "超临界 · 扩散" if giant_occ >= PERC_THRESHOLD else ("临界附近" if giant_occ >= PERC_THRESHOLD - 0.08 else "亚临界 · 分裂")
    occ_idx = [i for i in range(n) if grid[i]]
    vals = [grid[i] for i in occ_idx]
    robust = []
    for seed in (1, 2, 3):
        random.Random(seed).shuffle(vals)
        g = [0] * (cols * cols)
        for idx, val in zip(occ_idx, vals):
            g[idx] = val
        comp = _largest_component(g, cols)
        robust.append(round(len(comp) / max(occ, 1), 4))
    # visual sample 50x50 from first 2500 nodes
    vis_n = min(2500, n)
    vis_cols = 50
    vis = []
    large_set = set(largest)
    for i in range(vis_cols * vis_cols):
        if i >= vis_n:
            vis.append(0)
        elif i in large_set:
            vis.append(2)
        else:
            vis.append(1 if grid[i] else 0)
    result = {
        "total": n, "up": occ, "ratio": round(ratio, 4), "threshold": PERC_THRESHOLD,
        "largest": len(largest), "giant_ratio": round(giant, 4), "giant_occupied": round(giant_occ, 4),
        "clusters": len(clusters), "top_clusters": sorted(clusters, reverse=True)[:8],
        "status": status, "grid": {"cols": vis_cols, "rows": vis_cols, "cells": vis} if with_grid else None,
        "robustness": {"mean": round(sum(robust) / len(robust), 4), "min": min(robust), "max": max(robust)},
        "note": "将股票按代码顺序映射为二维格点，上涨=占据；统计最大 4 邻接连通簇。仅衡量广度扩散，不代表真实空间关系。",
    }
    if with_grid:
        groups: dict[str, list[dict]] = {}
        for r in rows:
            ind = r.get("industry") or "其他"
            groups.setdefault(ind, []).append(r)
        industries = []
        for name, rr in sorted(groups.items(), key=lambda kv: len(kv[1]), reverse=True)[:20]:
            if len(rr) < 8:
                continue
            p = _percolation(rr, min_n=8, with_grid=False)
            if not p:
                continue
            leaders = sorted(rr, key=lambda r: r.get("pct") or -999, reverse=True)[:3]
            leader = leaders[0]
            distance = round(p["giant_occupied"] - PERC_THRESHOLD, 4)
            industries.append({
                "name": name, "count": len(rr), "up": p["up"], "ratio": p["ratio"],
                "giant_occupied": p["giant_occupied"], "status": p["status"],
                "distance": distance,
                "breadth_distance": round(p["ratio"] - PERC_THRESHOLD, 4),
                "critical": abs(distance) <= 0.08 or abs(p["ratio"] - PERC_THRESHOLD) <= 0.08,
                "leader": leader.get("name"), "leader_code": leader.get("code"),
                "leader_pct": leader.get("pct"),
                "leaders": [{"name": x.get("name"), "code": x.get("code"), "pct": x.get("pct"),
                             "industry": x.get("industry")} for x in leaders],
            })
        result["industries"] = industries
        result["critical"] = [x for x in industries if x["critical"]]
        result["closest"] = sorted(
            industries,
            key=lambda x: min(abs(x.get("distance", 1)), abs(x.get("breadth_distance", 1)))
        )[:5]
        result["key_stocks"] = [
            {"name": s["name"], "code": s["code"], "pct": s["pct"], "industry": s["industry"]}
            for ind in industries for s in ind.get("leaders", []) if s.get("code")
        ][:12]
    return result


def model_snapshot() -> dict:
    cached = db.cache_get("market:models:v3", 600)
    if cached:
        return cached
    rows = (market.fetch_spot(ttl=600) or {}).get("rows") or []
    a_indices = [
        ("000001", "上证指数", "1.000001"),
        ("000300", "沪深300", "1.000300"),
        ("399006", "创业板指", "0.399006"),
        ("399001", "深证成指", "0.399001"),
        ("000688", "科创50", "1.000688"),
    ]
    hmm_indices = []
    hmm = {}
    for code, name, sec in a_indices:
        try:
            kl = market.klines(code, limit=420, adjust="", secid_override=sec)
            closes = [r["close"] for r in kl]
            rets = np.diff(np.log(np.array(closes, dtype=float))) * 100
            h = _hmm(rets)
            if h:
                h["code"] = code
                h["name"] = name
                h["price"] = closes[-1]
                h["pct"] = kl[-1].get("pct")
                hmm_indices.append(h)
                if code == "000300":
                    hmm = h
        except Exception:
            continue
    states = [x.get("state") for x in hmm_indices]
    counts = {s: states.count(s) for s in ("强势", "震荡", "弱势")}
    dominant = max(counts, key=counts.get) if counts else "震荡"
    hmm_summary = {
        "dominant": dominant, "counts": counts,
        "text": f"5 个 A 股核心指数中 {counts.get('强势', 0)} 个强势、{counts.get('震荡', 0)} 个震荡、{counts.get('弱势', 0)} 个弱势；整体以{dominant}为主。",
    }
    perc = _percolation(rows)
    out = {"ts": time.time(), "hmm": hmm, "hmm_indices": hmm_indices, "hmm_summary": hmm_summary, "percolation": perc}
    db.cache_set("market:models:v3", out)
    return out
