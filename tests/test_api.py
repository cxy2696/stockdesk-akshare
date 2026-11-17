"""FastAPI surface tests: no live market calls, isolated SQLite."""
import pytest
from fastapi.testclient import TestClient

from backend import market
from backend.app import create


@pytest.fixture()
def client(temp_db, monkeypatch):
    monkeypatch.setattr(market, "resolve_name", lambda code: f"股票{code}")
    monkeypatch.setattr(market, "quotes", lambda codes: {})
    return TestClient(create())


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


def test_backtest_metadata(client):
    strategies = client.get("/api/backtest/strategies").json()["data"]
    assert len(strategies) >= 9
    assert any(s["id"] == "ma_cross" for s in strategies)
    assert client.get("/api/backtest/benchmarks").status_code == 200


def test_spa_and_unknown_api(client):
    index = client.get("/")
    assert index.status_code == 200
    assert "StockDesk" in index.text
    assert client.get("/api/not-a-real-endpoint").status_code == 404
