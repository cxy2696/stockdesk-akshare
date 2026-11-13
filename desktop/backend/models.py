"""Quant models: Gaussian HMM market regimes + breadth percolation + TD (九转).

The three models answer different questions and are intentionally kept
separate:

* **HMM** — what regime is the index in, how confident, and how long does it
  usually last?  It sets the *total* exposure.
* **Percolation** — is the advance broad and connected, or a few isolated
  pockets?  It decides *which industries* deserve risk.
* **TD Sequential** — is short-term momentum exhausted?  It times *entries and
  exits* inside the other two.

Nothing here predicts a price.  The output describes the current structure in
plain language so the UI can show a conclusion instead of a wall of numbers.
"""
from __future__ import annotations

import math
import random
import time
import zlib
from collections import deque
from concurrent.futures import ThreadPoolExecutor
from statistics import mean

import numpy as np

from . import db, market, model_registry, td

PERC_THRESHOLD = float(model_registry.MODELS["percolation"]["params"]["threshold"])
STATE_LABELS = ["弱势", "震荡", "强势"]


# ---------------------------------------------------------------------------
# HMM
# ---------------------------------------------------------------------------

def _baum_welch(x: np.ndarray, mu: np.ndarray, var: np.ndarray, pi: np.ndarray,
                A: np.ndarray, iters: int) -> dict:
    """One Baum-Welch run from a given initialisation."""
    k = len(mu)
    n = len(x)
    loglik = None
    converged = False
    used = 0

    for it in range(iters):
        B = np.exp(-0.5 * (np.log(2 * math.pi * var) + (x[:, None] - mu) ** 2 / var)) + 1e-300
        alpha = np.zeros((n, k))
        c = np.zeros(n)
        alpha[0] = pi * B[0]
        c[0] = max(alpha[0].sum(), 1e-300)
        alpha[0] /= c[0]
        for t in range(1, n):
            alpha[t] = (alpha[t - 1] @ A) * B[t]
            c[t] = max(alpha[t].sum(), 1e-300)
            alpha[t] /= c[t]
        beta = np.zeros((n, k))
        beta[-1] = 1.0
        for t in range(n - 2, -1, -1):
            beta[t] = A @ (B[t + 1] * beta[t + 1])
            beta[t] /= max(c[t + 1], 1e-300)
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
        ll = float(np.sum(np.log(c)))
        used = it + 1
        if loglik is not None and abs(ll - loglik) < max(1e-3, abs(ll) * 1e-4):
            loglik = ll
            converged = True
            break
        loglik = ll

    return {"mu": mu, "var": var, "pi": pi, "A": A, "gamma": gamma,
            "loglik": loglik if loglik is not None else -1e18,
            "iterations": used, "converged": converged}


def _hmm(x: np.ndarray, k: int = int(model_registry.MODELS["hmm"]["params"]["states"]),
         iters: int = int(model_registry.MODELS["hmm"]["params"]["iterations"])) -> dict:
    """Three-state Gaussian HMM with multi-start fitting.

    A single quantile initialisation can land in a poor local optimum, so we
    fit three deterministic starts and keep the best likelihood.  Variances are
    floored to avoid degenerate single-point states.
    """
    n = len(x)
    if n < 60:
        return {}
    k = max(2, min(k, 4))
    x = np.asarray(x, dtype=float)
    var_floor = max(float(np.var(x)), 1e-6)

    starts = []
    for qs in ([0.2, 0.5, 0.8], [0.12, 0.5, 0.88]):
        mu0 = np.quantile(x, qs[:k]).astype(float) if k == 3 else np.linspace(x.min(), x.max(), k)
        starts.append(mu0)
    starts.append(np.sort(x)[[int((i + 0.5) * n / k) for i in range(k)]])

    best = None
    for mu0 in starts:
        A0 = np.full((k, k), 0.12 / max(k - 1, 1))
        np.fill_diagonal(A0, 0.88)
        fit = _baum_welch(x, np.array(mu0, dtype=float), np.full(k, var_floor),
                          np.full(k, 1.0 / k), A0, iters)
        if best is None or fit["loglik"] > best["loglik"]:
            best = fit
    mu, var, A, gamma = best["mu"], best["var"], best["A"], best["gamma"]
    loglik = best["loglik"]

    # Order states by mean return: weak → range → strong.
    order = np.argsort(mu)
    mu = mu[order]
    var = np.maximum(var[order], 1e-8)
    A = A[np.ix_(order, order)]
    gamma = gamma[:, order]
    probs = gamma[-1]
    current = int(np.argmax(probs))

    labels = STATE_LABELS[:k]
    stats = []
    expected_occ = np.maximum(gamma.sum(axis=0), 1e-6)
    hard = np.argmax(gamma, axis=1)
    for i in range(k):
        rows = x[hard == i]
        sd = float(math.sqrt(max(var[i], 1e-9)))
        m = float(mu[i])
        win = float((rows > 0).mean()) if len(rows) else 0.5
        stats.append({
            "label": labels[i],
            "mean": round(m, 4),
            "vol": round(sd, 4),
            "annual_vol": round(sd * math.sqrt(244), 2),
            "sharpe": round(m / sd * math.sqrt(244), 2) if sd > 1e-9 else None,
            "win_rate": round(win * 100, 1),
            "days": int(round(float(expected_occ[i]))),
            "weight": round(float(expected_occ[i] / n), 3),
            "persistence": round(float(A[i][i]), 3),
            "duration": round(float(1 / max(1 - A[i][i], 1e-4)), 1),
        })

    duration = round(float(1 / max(1 - A[current][current], 1e-4)), 1)
    trans = [[round(float(v), 4) for v in row] for row in A]
    conf = float(probs[current])
    entropy = float(-(probs * np.log(np.maximum(probs, 1e-12))).sum() / math.log(k))
    age = 0
    for j in range(n - 1, -1, -1):
        if hard[j] == current:
            age += 1
        else:
            break
    next_day_switch = round(float(1 - A[current][current]), 3)
    history = [int(h) for h in hard[-60:]]

    interpretation = _hmm_read(current, labels, conf, entropy, mu, var, A, duration, age, next_day_switch, stats)

    return {
        "state": labels[current],
        "state_index": current,
        "confidence": round(conf, 4),
        "entropy": round(entropy, 3),
        "regime_age": age,
        "flip_risk": next_day_switch,
        "loglik": round(loglik, 1),
        "aic": round(2 * (k * k + 3 * k - 1) - 2 * loglik, 1),
        "bic": round((k * k + 3 * k - 1) * math.log(n) - 2 * loglik, 1),
        "iterations": best["iterations"],
        "converged": best["converged"],
        "interpretation": interpretation,
        "probabilities": [
            {"label": labels[i], "p": round(float(probs[i]), 4),
             "mean": round(float(mu[i]), 4), "vol": round(float(math.sqrt(var[i])), 4)}
            for i in range(k)
        ],
        "transition": [{"from": labels[i], "to": trans[i]} for i in range(k)],
        "expected_days": duration,
        "next": [{"label": labels[j], "p": trans[current][j]} for j in range(k)],
        "history": history,
        "stats": stats,
        "signal": ("趋势状态仍在延续，可以拿住强势仓位；如果成交额开始萎缩，把加仓节奏放慢" if current == k - 1 else
                   "市场处于弱势，先保住本金；反弹用来减仓，不用来抄底" if current == 0 else
                   "震荡市，减少追涨杀跌；区间下沿低吸、上沿兑现，比预测方向更重要"),
        "summary": _hmm_summary_text(current, labels, conf, duration, age, stats),
    }


def _hmm_read(current: int, labels: list[str], conf: float, entropy: float,
              mu, var, A, duration: float, age: int, flip: float, stats: list[dict]) -> list[str]:
    sd = math.sqrt(max(float(var[current]), 1e-9))
    lines = [
        f"模型判断当前处在「{labels[current]}」，后验概率 {conf * 100:.0f}%；"
        f"这一状态的历史日均涨跌 {float(mu[current]):+.2f}%，日均波动 {sd:.2f}%。",
        f"该状态平均持续 {duration:.0f} 个交易日，本次已持续 {age} 天；"
        f"明天离开当前状态的概率约 {flip * 100:.0f}%。",
    ]
    if conf >= 0.7 and entropy < 0.6:
        lines.append("三种状态的概率差距明显，模型对当前判断比较有把握；仓位可以按状态执行，不必频繁切换。")
    elif conf >= 0.5:
        lines.append("状态概率只是中等分化，说明市场处在过渡期。此时适合小幅调整，不适合一次性把仓位打满或清空。")
    else:
        lines.append("三种状态概率接近，模型本身也看不清方向。把仓位降到自己能安心的水平，等概率重新分化。")
    strong = stats[-1]
    weak = stats[0]
    lines.append(f"参考：强势状态年化波动约 {strong['annual_vol']:.0f}%，弱势状态约 {weak['annual_vol']:.0f}%；"
                 f"同样的仓位，在弱势状态里承受的回撤会明显更大。")
    return lines


def _hmm_summary_text(current: int, labels: list[str], conf: float, duration: float,
                      age: int, stats: list[dict]) -> str:
    return (f"当前{labels[current]}状态概率 {conf * 100:.0f}%，已持续 {age} 天，"
            f"历史平均持续 {duration:.0f} 天。操作上以「{('控制回撤' if current == 0 else '区间应对' if current == 1 else '持有趋势')}」为主。")


# ---------------------------------------------------------------------------
# Percolation
# ---------------------------------------------------------------------------

def _largest_component(grid: list[int], cols: int, collect_all: bool = False):
    seen = bytearray(len(grid))
    largest: list[int] = []
    sizes: list[int] = []
    spanning = False
    for i in range(len(grid)):
        if not grid[i] or seen[i]:
            continue
        q = deque([i]); seen[i] = 1; comp = []
        touches = {"top": False, "bottom": False, "left": False, "right": False}
        while q:
            v = q.popleft(); comp.append(v)
            r, c = divmod(v, cols)
            touches["top"] |= r == 0
            touches["bottom"] |= r == cols - 1
            touches["left"] |= c == 0
            touches["right"] |= c == cols - 1
            for nr, nc in ((r - 1, c), (r + 1, c), (r, c - 1), (r, c + 1)):
                if 0 <= nr < cols and 0 <= nc < cols:
                    w = nr * cols + nc
                    if grid[w] and not seen[w]:
                        seen[w] = 1; q.append(w)
        sizes.append(len(comp))
        if len(comp) > len(largest):
            largest = comp
            spanning = all(touches.values())
    if collect_all:
        return largest, sorted(sizes, reverse=True), spanning
    return largest


def _stable_order(rows: list[dict]) -> list[dict]:
    """Deterministic pseudo-random order.

    Listing order groups stocks by exchange, which makes neighbouring lattice
    sites highly correlated and inflates clusters.  A stable hash spreads codes
    across the lattice while keeping the result reproducible between calls.
    """
    return sorted(rows, key=lambda r: zlib.crc32(str(r.get("code", "")).encode()))


def _visual_grid(grid: list[int], cols: int, giant: set[int], out_cols: int = 50) -> list[int]:
    """Downsample the full lattice into a 50×50 overview without dropping rows.

    The old implementation only looked at the first 2,500 stocks, so the map
    showed one corner of the market.  Block aggregation keeps every stock in
    the picture: a block is giant (2) if any giant-cluster stock falls in it,
    up (1) if any advancing stock does, otherwise 0.
    """
    n = len(grid)
    if n == 0:
        return [0] * (out_cols * out_cols)
    block = max(1, math.ceil(cols / out_cols))
    out = [0] * (out_cols * out_cols)
    for i, v in enumerate(grid):
        r, c = divmod(i, cols)
        br, bc = min(out_cols - 1, r // block), min(out_cols - 1, c // block)
        j = br * out_cols + bc
        if i in giant:
            out[j] = 2
        elif v and out[j] == 0:
            out[j] = 1
    return out


def _percolation(rows: list[dict], min_n: int = 100, with_grid: bool = True) -> dict:
    rows = [r for r in rows if (r.get("price") or 0) > 0 and (r.get("amount") or 0) > 0
            and "退" not in (r.get("name") or "") and "ST" not in (r.get("name") or "").upper()]
    n = len(rows)
    if n < min_n:
        return {}
    rows = _stable_order(rows)
    cols = int(math.ceil(math.sqrt(n)))
    grid = [1 if (r.get("pct") or 0) > 0 else 0 for r in rows]
    grid += [0] * (cols * cols - len(grid))  # pad the last lattice row
    largest, sizes, spanning = _largest_component(grid, cols, collect_all=True)
    occ = sum(grid)
    ratio = occ / n
    giant = len(largest) / n
    giant_occ = len(largest) / max(occ, 1)
    # susceptibility: mean cluster size weighted by size, excluding the giant.
    others = [s for s in sizes if s != (sizes[0] if sizes else -1)]
    chi = sum(s * s for s in others) / max(occ, 1)
    status = ("超临界 · 扩散" if giant_occ >= PERC_THRESHOLD
              else "临界附近" if giant_occ >= PERC_THRESHOLD - 0.08
              else "亚临界 · 分裂")
    distance = giant_occ - PERC_THRESHOLD

    # Random-layout baseline: how much of the cluster is just luck of ordering?
    occ_idx = [i for i in range(n) if grid[i]]
    vals = [grid[i] for i in occ_idx]
    robust = []
    for seed in (11, 23, 37):
        random.Random(seed).shuffle(vals)
        g = [0] * (cols * cols)
        for idx, val in zip(occ_idx, vals):
            g[idx] = val
        comp = _largest_component(g, cols)
        robust.append(round(len(comp) / max(occ, 1), 4))
    baseline = sum(robust) / len(robust)
    p_value = sum(1 for x in robust if x >= giant_occ) / len(robust)

    if giant_occ >= PERC_THRESHOLD:
        confidence = min(0.95, 0.55 + distance * 2 + (0.2 if spanning else 0))
        note = (f"上涨家数 {occ}/{n}，最大连通簇覆盖上涨股的 {giant_occ * 100:.0f}%，"
                f"超过临界值 {PERC_THRESHOLD * 100:.1f}%，说明上涨是连成片的，"
                f"行业扩散有基础。")
    elif giant_occ >= PERC_THRESHOLD - 0.08:
        confidence = 0.5
        note = (f"最大连通簇 {giant_occ * 100:.0f}%，离临界值只差 {abs(distance) * 100:.1f} 个百分点。"
                f"方向未定，仓位别押一边，等广度继续扩大或明显收缩。")
    else:
        confidence = max(0.35, 0.6 + distance)
        note = (f"最大连通簇只有 {giant_occ * 100:.0f}%，上涨股彼此孤立，"
                f"属于少数主线的结构性行情；追扩散型普涨容易落空。")
    if p_value >= 0.66:
        note += " 随机重排也能得到相近结果，当前广度本身偏强，不是排序造成的假象。"
    elif p_value <= 0.33:
        note += " 随机重排的结果明显更弱，说明真实行业结构对扩散有贡献。"

    result = {
        "total": n, "up": occ, "ratio": round(ratio, 4), "threshold": PERC_THRESHOLD,
        "largest": len(largest), "giant_ratio": round(giant, 4), "giant_occupied": round(giant_occ, 4),
        "clusters": len(sizes), "top_clusters": sizes[:8],
        "susceptibility": round(chi, 3), "spanning": spanning,
        "status": status, "distance": round(distance, 4), "confidence": round(confidence, 2),
        "random_baseline": round(baseline, 4), "p_value": round(p_value, 2),
        "grid": {"cols": 50, "rows": 50, "cells": _visual_grid(grid, cols, set(largest))} if with_grid else None,
        "robustness": {"mean": round(baseline, 4), "min": min(robust), "max": max(robust)},
        "note": note,
    }
    if with_grid:
        groups: dict[str, list[dict]] = {}
        missing_industry = sum(1 for r in rows if not r.get("industry"))
        group_by_market = missing_industry > n * 0.6
        for r in rows:
            key = r.get("industry") if not group_by_market else (r.get("market") or "其他")
            groups.setdefault(key or "其他", []).append(r)
        industries = []
        for name, rr in sorted(groups.items(), key=lambda kv: len(kv[1]), reverse=True)[:20]:
            if len(rr) < 8:
                continue
            p = _percolation(rr, min_n=8, with_grid=False)
            if not p:
                continue
            leaders = sorted(rr, key=lambda r: r.get("pct") or -999, reverse=True)[:3]
            leader = leaders[0]
            distance_i = round(p["giant_occupied"] - PERC_THRESHOLD, 4)
            industries.append({
                "name": name, "count": len(rr), "up": p["up"], "ratio": p["ratio"],
                "giant_occupied": p["giant_occupied"], "status": p["status"],
                "distance": distance_i,
                "breadth_distance": round(p["ratio"] - PERC_THRESHOLD, 4),
                "critical": abs(distance_i) <= 0.08 or abs(p["ratio"] - PERC_THRESHOLD) <= 0.08,
                "leader": leader.get("name"), "leader_code": leader.get("code"),
                "leader_pct": leader.get("pct"),
                "leaders": [{"name": x.get("name"), "code": x.get("code"), "pct": x.get("pct"),
                             "industry": x.get("industry")} for x in leaders],
            })
        result["industries"] = industries
        result["grouping"] = "market" if group_by_market else "industry"
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


# ---------------------------------------------------------------------------
# TD snapshot + industry focus
# ---------------------------------------------------------------------------

A_INDICES = [
    ("000001", "上证指数", "1.000001"),
    ("000300", "沪深300", "1.000300"),
    ("399006", "创业板指", "0.399006"),
    ("399001", "深证成指", "0.399001"),
    ("000688", "科创50", "1.000688"),
]


def _td_from_klines(kl: list[dict]) -> dict:
    if len(kl) < 12:
        return td.td_sequence([])
    return td.td_sequence(
        [r["close"] for r in kl],
        [r.get("high") for r in kl] if all(r.get("high") is not None for r in kl) else None,
        [r.get("low") for r in kl] if all(r.get("low") is not None for r in kl) else None,
    )


def _td_snapshot(hmm_indices: list[dict], kl_map: dict[str, list[dict]], perc: dict, rows: list[dict]) -> dict:
    indices = []
    for h in hmm_indices:
        kl = kl_map.get(h["code"]) or []
        t = _td_from_klines(kl)
        indices.append({**{k: h[k] for k in ("code", "name", "state", "confidence") if k in h}, "td": t})

    portfolio_stocks = []
    try:
        from . import portfolio
        positions = (portfolio.summary() or {}).get("positions") or []
        for p in positions[:8]:
            try:
                kl = market.klines(p["code"], limit=160, adjust="")
                portfolio_stocks.append({"code": p["code"], "name": p.get("name") or p["code"],
                                         "weight": p.get("weight"), "float_pct": p.get("float_pct"),
                                         "td": _td_from_klines(kl)})
            except Exception:
                continue
    except Exception:
        pass

    # TD of the leaders in the industries closest to criticality: the most
    # actionable names when breadth is deciding direction.
    leader_td = []
    seen = set()
    targets = (perc.get("critical") or perc.get("closest") or [])[:6]
    codes = []
    for x in targets:
        for s in (x.get("leaders") or [])[:2]:
            if s.get("code") and s["code"] not in seen:
                seen.add(s["code"]); codes.append((s["code"], s.get("name") or s["code"], x.get("name")))

    def fetch(item):
        code, name, ind = item
        try:
            kl = market.klines(code, limit=160, adjust="")
            return {"code": code, "name": name, "industry": ind, "td": _td_from_klines(kl)}
        except Exception:
            return None

    if codes:
        with ThreadPoolExecutor(max_workers=4) as ex:
            leader_td = [x for x in ex.map(fetch, codes) if x]

    all_td = [indices, portfolio_stocks, leader_td]
    buys = sum(1 for group in all_td for x in group if x["td"].get("signal") in ("buy_9", "buy_13"))
    sells = sum(1 for group in all_td for x in group if x["td"].get("signal") in ("sell_9", "sell_13"))
    watching_buy = sum(1 for group in all_td for x in group if x["td"].get("signal") == "watch_buy")
    watching_sell = sum(1 for group in all_td for x in group if x["td"].get("signal") == "watch_sell")
    if buys > sells:
        text = f"当前有 {buys} 个买入结构完成、{sells} 个卖出结构完成；短线卖压衰弱的标的更多，低吸比追高舒服。"
    elif sells > buys:
        text = f"当前有 {sells} 个卖出结构完成、{buys} 个买入结构完成；上涨动能透支的标的更多，兑现优先于加仓。"
    else:
        text = f"买卖结构数量相当（买 {buys} / 卖 {sells}），九转没有给出方向，按趋势和资金执行即可。"
    text += f" 另有 {watching_buy} 个下跌结构、{watching_sell} 个上涨结构在途中，值得提前放进观察池。"
    return {
        "indices": indices,
        "portfolio": portfolio_stocks,
        "leaders": leader_td,
        "counts": {"buy": buys, "sell": sells, "watch_buy": watching_buy, "watch_sell": watching_sell},
        "text": text,
    }


def _industry_focus(perc: dict) -> list[dict]:
    """Merge breadth, flow and a plain-language focus line per industry."""
    flow_by_name: dict[str, dict] = {}
    try:
        from . import state
        for b in state.boards("industry", "inflow", 100):
            flow_by_name[b.get("name") or ""] = b
    except Exception:
        pass
    out = []
    for x in (perc.get("industries") or [])[:12]:
        f = flow_by_name.get(x["name"]) or {}
        breadth = x["ratio"] * 100
        giant = x["giant_occupied"] * 100
        inflow = f.get("inflow")
        pct = f.get("pct")
        focus = []
        if x["status"].startswith("超临界"):
            focus.append("广度已经连通，优先看龙头能不能继续放量")
        elif x["status"].startswith("临界"):
            focus.append("正好卡在临界线，等一根放量阳线或阴线确认方向")
        else:
            focus.append("上涨还是散的，只做最强的一两只，不摊大饼")
        leader = x.get("leader")
        if leader:
            focus.append(f"龙头 {leader} 今天 {x.get('leader_pct', 0):+.1f}%")
        if inflow is not None:
            focus.append(f"主力{'净流入' if inflow >= 0 else '净流出'} {abs(inflow) / 1e8:.1f} 亿")
        focus.append(f"上涨 {breadth:.0f}%、最大簇 {giant:.0f}%")
        out.append({
            **x,
            "flow": inflow,
            "pct": pct,
            "focus": "；".join(focus) + "。",
            "watch": [s.get("name") for s in (x.get("leaders") or []) if s.get("name")],
        })
    return out


def _conclusion(hmm: dict, perc: dict, td_snap: dict) -> dict:
    hmm_state = hmm.get("state") or "震荡"
    giant = perc.get("giant_occupied") or 0
    regime = "扩散" if giant >= PERC_THRESHOLD else ("临界" if giant >= PERC_THRESHOLD - 0.08 else "分裂")
    if hmm_state == "强势" and regime == "扩散":
        stance, position = "进攻", "60%–80%"
    elif hmm_state == "弱势" and regime == "分裂":
        stance, position = "防守", "0%–20%"
    elif hmm_state == "强势" or regime == "扩散":
        stance, position = "均衡偏多", "45%–65%"
    else:
        stance, position = "均衡偏防守", "25%–45%"
    bullets = [
        f"仓位：{hmm_state} × {regime}，建议总仓位 {position}；单票不超过 15%，单行业不超过 30%。",
        f"选股：优先上涨占比 ≥ 60% 且最大簇没有收缩的行业，再从里面挑站上 MA20、成交额放大的龙头。",
        f"节奏：九转买结构出现的标的可以分批试仓；卖结构出现、且跌破 5 日线的持仓先减一半。",
    ]
    if td_snap.get("counts", {}).get("sell", 0) > td_snap.get("counts", {}).get("buy", 0):
        bullets.append("提醒：当前卖出结构多于买入结构，别在放量长阳后追价，等回踩再说。")
    elif td_snap.get("counts", {}).get("buy", 0) > 0:
        bullets.append("提醒：已有买入结构完成，低吸机会比追涨多，但必须等止跌信号，不接下跌中的飞刀。")
    text = (f"模型给结论：{hmm_state}状态（概率 {hmm.get('confidence', 0) * 100:.0f}%）"
            f"叠加广度{regime}（最大簇 {giant * 100:.0f}%），策略取「{stance}」，"
            f"总仓位控制在 {position}。")
    return {"stance": stance, "position": position, "regime": regime, "hmm": hmm_state,
            "text": text, "bullets": bullets}


# ---------------------------------------------------------------------------
# Snapshot
# ---------------------------------------------------------------------------

def model_snapshot() -> dict:
    cached = db.cache_get("market:models:v5", 600)
    if cached:
        return cached
    rows = (market.fetch_spot(ttl=600) or {}).get("rows") or []
    hmm_indices = []
    hmm = {}
    kl_map: dict[str, list[dict]] = {}

    def load(item):
        code, name, sec = item
        try:
            kl = market.klines(code, "daily", 420, "", sec)
        except Exception:
            kl = []
        if not kl:
            try:
                kl = market._akshare_klines(code, "daily", 420, "", sec)
            except Exception:
                kl = []
        return code, name, kl

    with ThreadPoolExecutor(max_workers=5) as ex:
        loaded = list(ex.map(load, A_INDICES))

    for code, name, kl in loaded:
        if not kl:
            continue
        kl_map[code] = kl
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

    states = [x.get("state") for x in hmm_indices]
    counts = {s: states.count(s) for s in STATE_LABELS}
    dominant = max(counts, key=counts.get) if counts else "震荡"
    same = sum(1 for s in states if s == dominant)
    hmm_summary = {
        "dominant": dominant, "counts": counts,
        "text": (f"5 个核心指数里 {counts.get('强势', 0)} 个强势、{counts.get('震荡', 0)} 个震荡、"
                 f"{counts.get('弱势', 0)} 个弱势，{same} 个方向一致；整体以{dominant}为主。"),
    }
    perc = _percolation(rows)
    td_snap = _td_snapshot(hmm_indices, kl_map, perc, rows)
    focus = _industry_focus(perc)
    conclusion = _conclusion(hmm, perc, td_snap)
    out = {
        "ts": time.time(),
        "hmm": hmm,
        "hmm_indices": hmm_indices,
        "hmm_summary": hmm_summary,
        "percolation": perc,
        "td": td_snap,
        "industry_focus": focus,
        "conclusion": conclusion,
        "model_meta": model_registry.meta(),
    }
    db.cache_set("market:models:v5", out)
    return out
