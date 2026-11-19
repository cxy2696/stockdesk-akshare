"""HTTP API surface for the StockDesk desktop app."""
from __future__ import annotations

import asyncio
import time

import numpy as np
from typing import Optional

from fastapi import APIRouter, Body, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from . import advice, backtest, clock, daily, db, decision, factors as factor_lib, market, ml, native, ollama as ollama_lib, patterns as pattern_lib, portfolio, repo, rflux_engine, screener, state, td as td_model, technical
from .config import APP_VERSION

router = APIRouter()


def _json_safe(value):
    """Convert NaN/Inf to null so one bad metric cannot 500 a whole page."""
    if isinstance(value, float):
        return value if np.isfinite(value) else None
    if isinstance(value, dict):
        return {k: _json_safe(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_safe(v) for v in value]
    return value


def ok(data):
    return {"ok": True, "data": _json_safe(data)}


def fail(msg: str, code: int = 400):
    return JSONResponse({"ok": False, "error": msg}, status_code=code)


# ================================================================ data health
@router.get("/api/data/status")
def data_status():
    from . import data_status as ds
    return ok(ds.snapshot())


@router.get("/api/data/sources")
def data_sources():
    from . import data_status as ds
    return ok(ds.snapshot()["sources"])


@router.get("/api/data/coverage")
def data_coverage():
    return market_coverage()


class RefreshIn(BaseModel):
    target: str = "spot"


@router.post("/api/data/refresh")
def data_refresh(body: RefreshIn):
    from . import data_status as ds
    try:
        return ok(ds.refresh(body.target))
    except ValueError as exc:
        return fail(str(exc))


# ================================================================ market
@router.get("/api/health")
def health():
    return ok({"version": APP_VERSION, "time": time.strftime("%Y-%m-%d %H:%M:%S"),
               "status": clock.market_status(), "engine": native.status(),
               "hmm_engine": rflux_engine.status()})


class OllamaConfigIn(BaseModel):
    enabled: Optional[bool] = None
    host: Optional[str] = None
    model: Optional[str] = None
    temperature: Optional[float] = None
    timeout: Optional[int] = None
    num_predict: Optional[int] = None


@router.get("/api/ollama/config")
def ollama_config():
    return ok(ollama_lib.config())


@router.put("/api/ollama/config")
def ollama_config_save(body: OllamaConfigIn):
    try:
        cfg = ollama_lib.save_config(body.model_dump(exclude_none=True))
    except ValueError as e:
        raise HTTPException(400, str(e))
    return ok(cfg)


@router.get("/api/ollama/health")
def ollama_health():
    return ok(ollama_lib.health())


@router.get("/api/ollama/models")
def ollama_models():
    return ok({"models": ollama_lib.models(), "host": ollama_lib.config()["host"]})


@router.post("/api/ollama/advice")
def ollama_advice(force: bool = Query(False), cached_only: bool = Query(False)):
    return ok(ollama_lib.advice(force=force, cached_only=cached_only))


@router.get("/api/market/indices")
def get_indices():
    return ok(market.indices())


@router.get("/api/market/province-leaders")
def province_leaders():
    from .state import province_leaders as _pl
    return ok(_pl())


@router.get("/api/models/meta")
def models_meta():
    from . import model_registry
    return ok(model_registry.meta())


@router.get("/api/ml/forecast")
def ml_forecast(code: str = "000300"):
    """Local LightGBM + Alpha158 + 48-feature forecast (no external service)."""
    return ok(ml.forecast(code))


@router.get("/api/market/models")
def market_models():
    from .models import model_snapshot
    return ok(model_snapshot())


@router.get("/api/models/history")
def models_history(code: str = "000300", limit: int = Query(1000, ge=300, le=1600),
                   lookback: int = Query(220, ge=80, le=420),
                   horizon: int = Query(5, ge=2, le=20)):
    """Walk-forward evaluation of the HMM regime model."""
    from . import evaluation
    try:
        return ok(evaluation.model_history(code=code, limit=limit,
                                           lookback=lookback, horizon=horizon))
    except ValueError as exc:
        raise HTTPException(400, str(exc))


@router.get("/api/market/company-map")
def company_map():
    from .state import company_distribution
    return ok(company_distribution())


@router.get("/api/market/td/{code}")
def market_td(code: str, limit: int = Query(220, ge=30, le=800)):
    """TD Sequential state for one index or stock."""
    try:
        kl = market.klines(code, limit=limit, adjust="")
    except Exception:
        kl = []
    if not kl:
        raise HTTPException(404, "没有可用的历史行情")
    seq = td_model.td_sequence(
        [r["close"] for r in kl],
        [r.get("high") for r in kl] if all(r.get("high") is not None for r in kl) else None,
        [r.get("low") for r in kl] if all(r.get("low") is not None for r in kl) else None,
    )
    return ok({"code": code, "bars": len(kl), "td": seq,
               "source": kl[0].get("source") or "eastmoney"})


@router.get("/api/market/industry-focus")
def market_industry_focus():
    """Industry breadth + flow + key names from the cached model snapshot."""
    snap = db.cache_get("market:models:v13", 900)
    if snap:
        return ok({"focus": snap.get("industry_focus") or [], "td": snap.get("td") or {},
                   "conclusion": snap.get("conclusion") or {}, "cached": True})
    from .models import model_snapshot
    snap = model_snapshot()
    return ok({"focus": snap.get("industry_focus") or [], "td": snap.get("td") or {},
               "conclusion": snap.get("conclusion") or {}, "cached": False})


@router.get("/api/market/index-analysis")
def index_analysis():
    from .state import index_analysis as _ia
    return ok(_ia())


@router.get("/api/market/state")
def market_state(light: bool = False):
    return ok(state.market_state(light=light))


@router.get("/api/market/overview")
def overview():
    # First paint must not wait for the full 5,581-row snapshot. Breadth comes
    # from the cached snapshot only; the market page fetches a fresh one when
    # the user actually opens it. This keeps the HUD usable on a cold install
    # even when the quote host is slow.
    idx = market.indices()
    breadth = market.market_breadth()
    return ok({"indices": idx, "breadth": breadth, "status": clock.market_status()})


@router.get("/api/market/spot")
def spot(sort: str = "pct", limit: int = 30, page: int = 1):
    try:
        s = market.fetch_spot()
    except Exception as e:
        raise HTTPException(502, f"行情获取失败: {e}")
    rows = s.get("rows", [])
    flow = market._fund_flow()
    for r in rows:
        f = flow.get(r.get("code"))
        if f:
            r.update(f)
    key = {"pct": "pct", "turnover": "turnover", "amount": "amount", "inflow": "main_inflow"}.get(sort, "pct")
    rows = [r for r in rows if r.get(key) is not None]
    rows.sort(key=lambda r: r.get(key) or 0, reverse=True)
    # Count all listed companies, not only the rows with a live quote.
    total = int(s.get("total") or len(rows))
    start = max(0, (page - 1) * limit)
    return ok({"rows": rows[start:start + limit], "total": total, "ts": s.get("ts"), "date": s.get("date")})


@router.get("/api/market/search")
def search(q: str = Query("", alias="q"), limit: int = 20):
    return ok(market.search(q, limit))


@router.get("/api/market/quote/{code}")
def quote_one(code: str):
    q = market.quote(code)
    if not q:
        raise HTTPException(404, "未找到该股票行情")
    return ok(q)


@router.get("/api/market/quotes")
def quotes(codes: str = ""):
    lst = [c.strip() for c in codes.split(",") if c.strip()]
    return ok(market.quotes(lst))


@router.get("/api/market/kline/{code}")
def kline(code: str, period: str = "daily", limit: int = 260, adjust: str = "qfq"):
    rows = market.klines(code, period=period, limit=limit, adjust=adjust)
    if not rows:
        raise HTTPException(404, "没有取到历史行情")
    return ok({"code": code, "period": period, "adjust": adjust, "rows": rows})


@router.get("/api/market/stock/{code}")
def stock_detail(code: str):
    try:
        q = market.quote(code) or {}
    except Exception:
        q = {}
    try:
        prof = market.profile(code)
    except Exception:
        prof = {}
    try:
        fin = market.financials(code, periods=8)
    except Exception:
        fin = []
    # never trigger a full-market download just to decorate a detail page;
    # use the cached snapshot if it is already warm
    sp = None
    try:
        s = db.cache_get(market.SPOT_KEY, 600)
        if s:
            sp = next((r for r in s.get("rows", []) if r["code"] == code), None)
    except Exception:
        sp = None
    data = {**(sp or {}), **{k: v for k, v in q.items() if v is not None}}
    if data.get("pct60") is None or data.get("pct_ytd") is None:
        try:
            kl = market.klines(code, limit=300, adjust="")
            if len(kl) > 61:
                last = kl[-1]["close"]
                data.setdefault("pct60", round((last / kl[-61]["close"] - 1) * 100, 2))
                year = kl[-1]["date"][:4]
                ytd_base = next((r["close"] for r in kl if r["date"].startswith(year)), last)
                data.setdefault("pct_ytd", round((last / ytd_base - 1) * 100, 2))
        except Exception:
            pass
    data["code"] = code
    try:
        data["name"] = data.get("name") or market.resolve_name(code)
    except Exception:
        data["name"] = data.get("name") or code
    data["profile"] = prof
    data["financials"] = fin
    # Fill only missing quote fields from data already on hand.  A partial
    # Sina snapshot should not turn a valid stock page into a wall of "--".
    price = float(data.get("price") or 0)
    bps = next((float(x["bps"]) for x in fin if x.get("bps")), None)
    if data.get("pb") is None and price > 0 and bps:
        data["pb"] = round(price / bps, 2)
    if data.get("mcap") is None and price > 0 and prof.get("reg_capital"):
        # reg_capital is 万元 in Eastmoney F10.
        data["mcap"] = round(price * float(prof["reg_capital"]) * 1e4, 2)
    if data.get("turnover") is None and data.get("volume") and price > 0:
        # mcap/price gives total shares; fall back to free-float cap when present.
        cap = float(data.get("fcap") or data.get("mcap") or 0)
        shares = cap / price if cap > 0 else 0
        if shares > 0:
            data["turnover"] = round(float(data["volume"]) / shares * 100, 2)
    try:
        data["concepts"] = market.concepts(code)
    except Exception:
        data["concepts"] = []
    data["industry"] = (prof or {}).get("industry")
    try:
        data["watch"] = repo.watch_has(code)
    except Exception:
        data["watch"] = False
    try:
        data["technical"] = {
            "chips": technical.chips(code),
            "fib": technical.fibonacci(code),
        }
    except Exception:
        data["technical"] = {}

    # TD Sequential (九转) on the same daily history used by the chart.
    try:
        kl = market.klines(code, limit=220, adjust="")
        data["td"] = td_model.td_sequence(
            [r["close"] for r in kl],
            [r.get("high") for r in kl] if all(r.get("high") is not None for r in kl) else None,
            [r.get("low") for r in kl] if all(r.get("low") is not None for r in kl) else None,
        )
    except Exception:
        data["td"] = {}

    # Industry focus: use the cached model snapshot instead of triggering a
    # full-market recompute while the user is just opening a stock.
    try:
        snap = db.cache_get("market:models:v13", 900)
        if snap:
            ind = data.get("industry") or ""
            focus = next((x for x in (snap.get("industry_focus") or []) if x.get("name") == ind), None)
            conclusion = snap.get("conclusion") or {}
            if focus:
                data["industry_context"] = {
                    "name": ind,
                    "status": focus.get("status"),
                    "ratio": focus.get("ratio"),
                    "giant_occupied": focus.get("giant_occupied"),
                    "flow": focus.get("flow"),
                    "pct": focus.get("pct"),
                    "focus": focus.get("focus"),
                    "watch": focus.get("watch") or [],
                }
            elif conclusion:
                data["industry_context"] = {
                    "name": ind or "行业数据尚未就绪",
                    "focus": conclusion.get("text"),
                    "watch": [],
                }
    except Exception:
        pass
    try:
        data["decision"] = decision.stock_plan(code)
    except Exception:
        data["decision"] = {}
    return ok(data)


@router.get("/api/market/coverage")
def market_coverage():
    """Full-universe coverage audit, including duplicates and unpriced rows."""
    spot = market.fetch_spot(ttl=600)
    rows = spot.get("rows", [])
    expected_codes = [str(c).zfill(6) for c in (spot.get("expected_codes") or [])]
    if not expected_codes:
        expected_codes = [str(c).zfill(6) for c, _ in market.universe_symbols()]
    codes = [str(r.get("code") or "").zfill(6) for r in rows]
    try:
        if native.NATIVE:
            audit = native.native.coverage_audit(
                np.asarray([int(c) for c in codes], dtype=np.int64),
                np.asarray([int(c) for c in expected_codes], dtype=np.int64),
                20,
            )
            duplicates = int(audit["duplicates"])
            missing = [str(c).zfill(6) for c in audit["missing_sample"]]
            missing_count = int(audit["missing"])
            present = int(audit["present"])
        else:
            raise RuntimeError("native unavailable")
    except Exception:
        actual, wanted = set(codes), set(expected_codes)
        duplicates = len(codes) - len(actual)
        missing_set = sorted(wanted - actual)
        missing_count = len(missing_set)
        missing = missing_set[:20]
        present = len(actual)
    by_board: dict[str, int] = {}
    for r in rows:
        by_board[r.get("market") or "其他"] = by_board.get(r.get("market") or "其他", 0) + 1
    a_share = sum(n for k, n in by_board.items() if "北交" not in k)
    eligible = sum(1 for r in rows if (r.get("price") or 0) > 0 and (r.get("amount") or 0) >= 1e7
                   and "ST" not in (r.get("name") or "").upper() and "退" not in (r.get("name") or ""))
    suspended = sorted(str(r.get("code")).zfill(6) for r in rows if r.get("quote_status") == "suspended")
    unpriced = sorted(str(r.get("code")).zfill(6) for r in rows if r.get("quote_status") in ("missing", "stale", "suspended"))
    return ok({
        "schema": spot.get("schema"),
        "total": len(rows),
        "expected": len(expected_codes),
        "all_symbols": len(expected_codes),
        "present": present,
        "duplicates": duplicates,
        "missing": missing_count,
        "missing_sample": missing,
        "unpriced": len(unpriced),
        "unpriced_sample": unpriced[:20],
        "suspended": len(suspended),
        "suspended_sample": suspended[:20],
        "complete": bool(spot.get("complete", False)),
        "data_complete": bool(spot.get("data_complete", False)),
        "fully_quoted": bool(spot.get("fully_quoted", False)),
        "pages_failed": int(spot.get("pages_failed", 0)),
        "sources": spot.get("sources") or [],
        "status_counts": spot.get("status_counts") or {},
        "field_missing": spot.get("field_missing") or {},
        "a_share": a_share,
        "eligible": eligible,
        "boards": by_board,
        "date": spot.get("date"),
        "ts": spot.get("ts"),
    })


@router.get("/api/decision")
def decision_overview(scan: int = Query(300, ge=30, le=6000), seed: int | None = Query(None)):
    return ok(decision.overview(scan, seed))


@router.get("/api/decision/stock/{code}")
def decision_stock(code: str):
    return ok(decision.stock_plan(code))


@router.get("/api/portfolio/advice")
def portfolio_advice():
    return ok(advice.position_advice())


@router.get("/api/market/news")
def market_news(limit: int = 12):
    return ok(state.market_news(limit))


@router.get("/api/market/industry-trends")
def market_industry_trends(limit: int = 8):
    return ok(state.industry_trends(limit))


@router.get("/api/market/hot")
def market_hot():
    return ok(state.hot_board())


@router.get("/api/market/daily")
def market_daily():
    return ok(daily.daily_brief())


@router.get("/api/market/forecast")
def market_forecast():
    """Regime forecast without the decision candidate scan."""
    return ok(decision.forecast_overview())


@router.get("/api/market/picks")
def market_picks(universe: str = "amount", limit: int = 150, top: int = 12):
    return ok(pattern_lib.picks(universe, limit, top))


@router.get("/api/market/patterns")
def market_patterns():
    return ok(pattern_lib.PATTERNS)


@router.get("/api/market/patterns/scan")
def market_pattern_scan(pattern: str, universe: str = "amount", limit: int = 200):
    return ok(pattern_lib.scan(pattern, universe, limit))


@router.get("/api/market/boards")
def market_boards(kind: str = "industry", sort: str = "pct", limit: int = 60):
    return ok(state.boards(kind, sort, limit))


@router.get("/api/market/board/{code}")
def market_board_detail(code: str):
    return ok(state.board_detail(code))


@router.get("/api/market/heatmap")
def market_heatmap(groups: int = 40, per_group: int = 30):
    return ok(state.heatmap(groups_limit=groups, per_group=per_group))


@router.get("/api/market/limitpool")
def market_limit_pool(direction: str = "up", limit: int = 30):
    return ok(state.limit_pool(direction, limit))


@router.get("/api/market/technical/{code}")
def technical_data(code: str, days: int = 120):
    return ok({"chips": technical.chips(code, days=days), "fib": technical.fibonacci(code, days=days)})


@router.get("/api/market/ranking")
def ranking(by: str = "pct", limit: int = 10):
    cache_key = f"rank:{by}"
    cached = db.cache_get(cache_key, 60)
    if cached:
        return ok(cached)
    spot_data = market.fetch_spot()
    rows = spot_data.get("rows", [])
    key = {"pct": "pct", "turnover": "turnover", "amount": "amount", "inflow": "main_inflow"}.get(by, "pct")
    clean = [r for r in rows if r.get(key) is not None and r.get("price") is not None]
    clean.sort(key=lambda r: r.get(key) or 0, reverse=True)
    db.cache_set(cache_key, clean[:limit])
    return ok(clean[:limit])


# ================================================================ watchlist
@router.get("/api/watchlist")
def get_watchlist(with_decision: bool = Query(False)):
    items = repo.watchlist()
    qs = market.quotes([i["code"] for i in items])
    for i in items:
        q = qs.get(i["code"]) or {}
        i.update({"price": q.get("price"), "pct": q.get("pct"), "chg": q.get("chg"),
                  "high": q.get("high"), "low": q.get("low"), "open": q.get("open"),
                  "prev_close": q.get("prev_close"), "amount": q.get("amount"),
                  "turnover": q.get("turnover"), "pe": q.get("pe"), "pb": q.get("pb"),
                  "mcap": q.get("mcap")})
        i["name"] = i.get("name") or q.get("name") or i["code"]
    if with_decision:
        from concurrent.futures import ThreadPoolExecutor

        def enrich(item):
            try:
                item["decision"] = decision.stock_plan(item["code"])
            except Exception:
                item["decision"] = {}
            return item

        with ThreadPoolExecutor(max_workers=8) as ex:
            list(ex.map(enrich, items))
    return ok(items)


@router.get("/api/watchlist/decisions")
def get_watchlist_decisions():
    """Decision plans keyed by code, fetched separately from the quote rows.

    A watchlist of 20+ names can need 20+ K-line histories.  Returning them in
    the same request kept the whole table on a skeleton until the slowest
    symbol finished; the page now paints quotes first and merges this payload
    when it arrives.
    """
    from concurrent.futures import ThreadPoolExecutor

    items = repo.watchlist()
    if not items:
        return ok({})

    def enrich(item):
        code = str(item.get("code") or "")
        try:
            return code, decision.stock_plan(code)
        except Exception:
            return code, {}

    with ThreadPoolExecutor(max_workers=8) as ex:
        return ok(dict(ex.map(enrich, items)))


class WatchIn(BaseModel):
    code: str
    name: str = ""
    note: str = ""


@router.post("/api/watchlist")
def add_watch(body: WatchIn):
    name = body.name or market.resolve_name(body.code)
    return ok(repo.watch_add(body.code, name, body.note))


@router.delete("/api/watchlist/{code}")
def del_watch(code: str):
    repo.watch_remove(code)
    return ok({"removed": code})


# ================================================================ portfolio
@router.get("/api/portfolio/summary")
def p_summary(with_decision: bool = Query(False)):
    data = portfolio.summary()
    if with_decision:
        from concurrent.futures import ThreadPoolExecutor

        def enrich(p):
            try:
                p["decision"] = decision.stock_plan(p["code"])
            except Exception:
                p["decision"] = {}

        with ThreadPoolExecutor(max_workers=6) as ex:
            list(ex.map(enrich, data.get("positions") or []))
    return ok(data)


@router.get("/api/portfolio/trades")
def p_trades(with_realized: bool = True):
    rows = portfolio.load_trades()
    return ok(portfolio.trades_with_realized(rows) if with_realized else rows)


class TradeIn(BaseModel):
    code: str
    side: str
    price: float
    qty: int
    trade_date: str
    fee: float = 0
    name: str = ""
    note: str = ""


@router.post("/api/portfolio/trades")
def p_add_trade(body: TradeIn):
    try:
        t = portfolio.add_trade(body.code, body.side, body.price, body.qty, body.trade_date, body.fee, body.name, body.note)
    except ValueError as e:
        return fail(str(e))
    return ok(t)


@router.put("/api/portfolio/trades/{tid}")
def p_update_trade(tid: int, body: dict = Body(...)):
    try:
        return ok(portfolio.update_trade(tid, **body))
    except ValueError as e:
        return fail(str(e))


@router.delete("/api/portfolio/trades/{tid}")
def p_delete_trade(tid: int):
    portfolio.delete_trade(tid)
    return ok({"deleted": tid})


@router.delete("/api/portfolio/trades")
def p_clear_trades():
    portfolio.clear_trades()
    return ok({"cleared": True})


@router.get("/api/portfolio/positions")
def p_positions():
    return ok(portfolio.positions())


@router.get("/api/portfolio/analytics")
def p_analytics(benchmark: str = "000300"):
    try:
        return ok(portfolio.equity_curve(benchmark))
    except Exception as e:
        raise HTTPException(500, f"分析失败: {e}")


@router.get("/api/portfolio/account")
def get_account():
    return ok(repo.account())


class AccountIn(BaseModel):
    assets: Optional[float] = None


@router.put("/api/portfolio/account")
def put_account(body: AccountIn):
    return ok(repo.set_account(body.assets))




# ================================================================ screener
@router.post("/api/screener")
def run_screen(body: dict = Body(default={})):
    limit = int(body.pop("limit", 100)) if isinstance(body, dict) else 100
    try:
        return ok(screener.screen(body, limit))
    except Exception as e:
        raise HTTPException(500, f"筛选失败: {e}")


@router.get("/api/screener/presets")
def get_presets():
    return ok(screener.presets())


class PresetIn(BaseModel):
    name: str = Field(min_length=1)
    filters: dict = {}


@router.post("/api/screener/presets")
def post_preset(body: PresetIn):
    return ok(screener.save_preset(body.name, body.filters))


@router.delete("/api/screener/presets/{name}")
def del_preset(name: str):
    return ok(screener.delete_preset(name))


# ================================================================ backtest
@router.get("/api/factors")
def factor_snapshot(limit: int = Query(100, ge=10, le=6000),
                    min_amount: float = Query(30_000_000, ge=0),
                    exclude_st: bool = Query(True)):
    """Cross-sectional factor screen + classification over the full snapshot."""
    key = f"factor:screen:{limit}:{min_amount}:{int(exclude_st)}"
    cached = db.cache_get(key, 300)
    if cached:
        return ok(cached)
    out = factor_lib.snapshot(limit=limit, min_amount=min_amount,
                              exclude_st=exclude_st)
    if out.get("ready"):
        db.cache_set(key, out)
    return ok(out)


@router.get("/api/backtest/strategies")
def strategies():
    return ok(backtest.STRATEGIES)


@router.get("/api/backtest/benchmarks")
def benchmarks():
    return ok(backtest.BENCHMARKS)


class BacktestIn(BaseModel):
    code: str
    strategy: str = "ma_cross"
    params: dict = {}
    start: Optional[str] = None
    end: Optional[str] = None
    capital: float = 100000
    commission: float = 0.00025
    slippage: float = 0.0005
    benchmark: str = "000001"


@router.post("/api/backtest/run")
def run_bt(body: BacktestIn):
    try:
        return ok(backtest.run(body.code, body.strategy, body.params, body.start, body.end,
                               body.capital, body.commission, body.slippage, body.benchmark))
    except ValueError as e:
        return fail(str(e))
    except Exception as e:
        raise HTTPException(500, f"回测失败: {e}")


@router.get("/api/backtest/last")
def last_bt():
    return ok(db.get_setting("last_backtest"))


class PortfolioBacktestIn(BaseModel):
    mode: str = "recommended"
    holdings: list[dict] = []
    universe: list[str] = []
    start: Optional[str] = None
    end: Optional[str] = None
    capital: float = 1_000_000
    benchmark: str = "000001"
    top_n: int = 5
    rebalance_days: int = 20
    commission: float = 0.00025
    slippage: float = 0.0005


@router.post("/api/backtest/portfolio")
def run_portfolio_bt(body: PortfolioBacktestIn):
    from . import portfolio_backtest
    try:
        mode = str(body.mode or "recommended").lower()
        if mode == "recommended":
            return ok(portfolio_backtest.run_recommended(
                body.universe, body.start, body.end, body.capital, body.benchmark,
                body.top_n, body.rebalance_days, body.commission, body.slippage))
        if mode == "custom":
            return ok(portfolio_backtest.run_custom(
                body.holdings, body.start, body.end, body.capital, body.benchmark,
                body.rebalance_days, body.commission, body.slippage))
        if mode == "ledger":
            return ok(portfolio_backtest.run_ledger(
                body.end, body.capital, body.benchmark,
                body.commission, body.slippage))
        raise ValueError("未知回测模式")
    except ValueError as e:
        return fail(str(e))
    except Exception as e:
        raise HTTPException(500, f"组合回测失败: {e}")


# ================================================================ streams
@router.websocket("/ws/quotes")
async def ws_quotes(ws: WebSocket):
    await ws.accept()
    try:
        while True:
            msg = await ws.receive_text()
            codes = [c.strip() for c in msg.split(",") if c.strip()][:60]
            await ws.send_json({"type": "quotes", "data": market.quotes(codes), "ts": time.time()})
            await asyncio.sleep(0)
    except WebSocketDisconnect:
        return
    except Exception:
        return


@router.websocket("/ws/overview")
async def ws_overview(ws: WebSocket):
    await ws.accept()
    try:
        while True:
            data = {"indices": market.indices(), "breadth": market.market_breadth(), "status": clock.market_status(), "ts": time.time()}
            await ws.send_json({"type": "overview", "data": data})
            await asyncio.sleep(20)
    except WebSocketDisconnect:
        return
    except Exception:
        return
