"""FastAPI surface tests: no live market calls, isolated SQLite."""
import pytest
from fastapi.testclient import TestClient

from backend import market


@pytest.fixture()
def client(temp_db, monkeypatch, tmp_path):
    import backend.app as app_module

    # Do not depend on `frontend/dist` being built in the Python CI job: give
    # the app a tiny self-contained SPA shell and exercise the routing logic.
    front = tmp_path / "frontend"
    (front / "assets").mkdir(parents=True)
    (front / "index.html").write_text("<!doctype html><title>StockDesk test shell</title>", encoding="utf-8")
    (front / "assets" / "index-test.js").write_text("console.log('ok')", encoding="utf-8")
    monkeypatch.setattr(app_module, "FRONT", front)

    monkeypatch.setattr(market, "resolve_name", lambda code: f"股票{code}")
    monkeypatch.setattr(market, "quotes", lambda codes: {})
    return TestClient(app_module.create())


def test_health_and_openapi(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert body["data"]["version"]
    assert body["data"]["engine"]["backend"] in ("C++", "NumPy")

    schema = client.get("/api/openapi.json").json()
    for path in ("/api/health", "/api/portfolio/account", "/api/backtest/run", "/api/market/spot"):
        assert path in schema["paths"]


def test_account_get_and_update(client):
    response = client.get("/api/portfolio/account")
    assert response.status_code == 200
    assert response.json()["data"]["assets"] == 200000.0

    response = client.put("/api/portfolio/account", json={"assets": 345678})
    assert response.status_code == 200
    assert response.json()["data"]["assets"] == 345678.0
    assert client.get("/api/portfolio/account").json()["data"]["assets"] == 345678.0


def test_trade_ledger_crud(client):
    payload = {"code": "600519", "side": "buy", "price": 10.0, "qty": 100,
               "trade_date": "2026-01-05", "fee": 5, "name": "贵州茅台"}
    created = client.post("/api/portfolio/trades", json=payload)
    assert created.status_code == 200
    trade_id = created.json()["data"]["id"]

    rows = client.get("/api/portfolio/trades").json()["data"]
    assert len(rows) == 1 and rows[0]["code"] == "600519"

    updated = client.put(f"/api/portfolio/trades/{trade_id}", json={"note": "补录"})
    assert updated.status_code == 200
    assert updated.json()["data"]["note"] == "补录"

    assert client.delete(f"/api/portfolio/trades/{trade_id}").status_code == 200
    assert client.get("/api/portfolio/trades").json()["data"] == []


def test_trade_validation_returns_400(client):
    response = client.post("/api/portfolio/trades", json={
        "code": "600519", "side": "sell", "price": 10, "qty": 100,
        "trade_date": "2026-01-05", "name": "贵州茅台",
    })
    assert response.status_code == 400
    assert response.json()["ok"] is False


def test_watchlist_crud(client):
    created = client.post("/api/watchlist", json={"code": "600519", "name": "贵州茅台"})
    assert created.status_code == 200
    items = client.get("/api/watchlist").json()["data"]
    assert [i["code"] for i in items] == ["600519"]
    assert client.delete("/api/watchlist/600519").status_code == 200
    assert client.get("/api/watchlist").json()["data"] == []


def test_watchlist_decisions_are_a_separate_payload(client, monkeypatch):
    import backend.api as api_module

    monkeypatch.setattr(api_module.decision, "stock_plan",
                        lambda code: {"code": code, "rating": "好", "tier": "确认"})
    client.post("/api/watchlist", json={"code": "600519", "name": "贵州茅台"})
    response = client.get("/api/watchlist/decisions")
    assert response.status_code == 200
    payload = response.json()["data"]
    assert payload["600519"]["rating"] == "好"


def test_forecast_endpoint_is_independent_of_the_decision_scan(client, monkeypatch):
    import backend.api as api_module

    monkeypatch.setattr(api_module.decision, "forecast_overview", lambda: {
        "market": {"label": "震荡", "score": 50, "breadth": {"up": 1, "down": 2}},
        "forecast": {"state": "震荡", "expected_5d": 0.0},
        "universe_total": 3,
    })
    response = client.get("/api/market/forecast")
    assert response.status_code == 200
    assert response.json()["data"]["forecast"]["state"] == "震荡"


def test_backtest_metadata(client):
    strategies = client.get("/api/backtest/strategies").json()["data"]
    assert len(strategies) >= 9
    assert any(s["id"] == "ma_cross" for s in strategies)
    assert client.get("/api/backtest/benchmarks").status_code == 200


def test_spa_and_unknown_api(client):
    index = client.get("/")
    assert index.status_code == 200
    assert "StockDesk test shell" in index.text
    assert client.get("/assets/index-test.js").status_code == 200
    assert client.get("/assets/missing.js").status_code == 404
    assert client.get("/api/not-a-real-endpoint").status_code == 404
