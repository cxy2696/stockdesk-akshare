"""HTTP API surface for the StockDesk desktop app."""
from __future__ import annotations

import asyncio
import time
from typing import Optional

from fastapi import APIRouter, Body, FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from . import advice, backtest, clock, daily, db, kdj, market, patterns as pattern_lib, portfolio, repo, screener, state, technical
from .config import APP_VERSION, INDEXES

router = APIRouter()


@router.on_event("startup")
def _startup():
    db.init()
    if not db.get_setting("account"):
        db.set_setting("account", repo.DEFAULT_ACCOUNT)



def ok(data):
    return {"ok": True, "data": data}


def fail(msg: str, code: int = 400):
    return JSONResponse({"ok": False, "error": msg}, status_code=code)


# ================================================================ market
@router.get("/api/health")
def health():
    return ok({"version": APP_VERSION, "time": time.strftime("%Y-%m-%d %H:%M:%S"), "status": clock.market_status()})


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


@router.get("/api/market/models")
def market_models():
    from .models import model_snapshot
    return ok(model_snapshot())


@router.get("/api/market/company-map")
def company_map():
    from .state import company_distribution
    return ok(company_distribution())


@router.get("/api/market/index-analysis")
def index_analysis():
    from .state import index_analysis as _ia
    return ok(_ia())


@router.get("/api/market/state")
def market_state():
    return ok(state.market_state())


@router.get("/api/market/overview")
def overview():
    idx = market.indices()
    breadth = market.market_breadth()
    if not breadth:
        # build breadth lazily from one cached snapshot
        try:
            market.fetch_spot(ttl=60)
            breadth = market.market_breadth()
        except Exception:
            breadth = {}
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
    q = market.quote(code) or {}
    prof = market.profile(code)
    fin = market.financials(code, periods=8)
    # never trigger a full-market download just to decorate a detail page;
    # use the cached snapshot if it is already warm
    sp = None
    try:
        s = db.cache_get("spot:v3", 600)
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
    data["name"] = data.get("name") or market.resolve_name(code)
    data["profile"] = prof
    data["financials"] = fin
    data["concepts"] = market.concepts(code)
    data["industry"] = (prof or {}).get("industry")
    data["watch"] = repo.watch_has(code)
    try:
        data["technical"] = {
            "chips": technical.chips(code),
            "fib": technical.fibonacci(code),
        }
    except Exception:
        data["technical"] = {}
    return ok(data)


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
def get_watchlist():
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
    return ok(items)


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
def p_summary():
    return ok(portfolio.summary())


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


@router.get("/api/market/kdj-alerts")
def kdj_alerts(force: bool = False, industry: str | None = None):
    return ok(kdj.snapshot(force=force, industry=industry))


@router.get("/api/market/kdj-industries")
def kdj_industries():
    return ok(kdj.industries())


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
@router.get("/api/backtest/strategies")
def strategies():
    return ok(backtest.STRATEGIES)


class BacktestIn(BaseModel):
    code: str
    strategy: str = "ma_cross"
    params: dict = {}
    start: Optional[str] = None
    end: Optional[str] = None
    capital: float = 100000
    commission: float = 0.00025
    slippage: float = 0.0005


@router.post("/api/backtest/run")
def run_bt(body: BacktestIn):
    try:
        return ok(backtest.run(body.code, body.strategy, body.params, body.start, body.end,
                               body.capital, body.commission, body.slippage))
    except ValueError as e:
        return fail(str(e))
    except Exception as e:
        raise HTTPException(500, f"回测失败: {e}")


@router.get("/api/backtest/last")
def last_bt():
    return ok(db.get_setting("last_backtest"))


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
