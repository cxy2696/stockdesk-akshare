import pytest

from backend import market, portfolio


@pytest.fixture()
def no_network(monkeypatch):
    """Portfolio math must not depend on live quotes during tests."""
    monkeypatch.setattr(market, "resolve_name", lambda code: f"股票{code}")
    monkeypatch.setattr(market, "market_of", lambda code: "主板")
    monkeypatch.setattr(market, "quotes", lambda codes: {})


def test_buy_then_partial_sell_average_cost(temp_db, no_network):
    portfolio.add_trade("600519", "buy", 10.0, 200, "2026-01-05", fee=5, name="贵州茅台")
    positions = {p["code"]: p for p in portfolio.positions()}
    p = positions["600519"]
    assert p["qty"] == 200
    assert p["cost"] == pytest.approx(2005.0)
    assert p["avg_cost"] == pytest.approx(10.025)

    portfolio.add_trade("600519", "sell", 12.0, 100, "2026-01-06", fee=2, name="贵州茅台")
    p = portfolio.positions()[0]
    assert p["qty"] == 100
    assert p["cost"] == pytest.approx(1002.5)
    # realized = (12 - 10.025) * 100 - 2
    assert p["realized"] == pytest.approx(195.5)
    assert p["sells"] == 1


def test_sell_more_than_held_is_rejected(temp_db, no_network):
    portfolio.add_trade("600519", "buy", 10.0, 100, "2026-01-05", name="贵州茅台")
    with pytest.raises(ValueError, match="卖出数量超过持仓"):
        portfolio.add_trade("600519", "sell", 12.0, 200, "2026-01-06", name="贵州茅台")


def test_trade_validation(temp_db, no_network):
    with pytest.raises(ValueError, match="6 位数字"):
        portfolio.add_trade("60051", "buy", 10, 100, "2026-01-05")
    with pytest.raises(ValueError, match="方向"):
        portfolio.add_trade("600519", "short", 10, 100, "2026-01-05")
    with pytest.raises(ValueError, match="日期"):
        portfolio.add_trade("600519", "buy", 10, 100, "2026/01/05")
    with pytest.raises(ValueError, match="大于 0"):
        portfolio.add_trade("600519", "buy", 0, 100, "2026-01-05")


def test_fifo_realized_pnl(temp_db, no_network):
    portfolio.add_trade("600519", "buy", 10.0, 100, "2026-01-05", fee=5, name="贵州茅台")
    portfolio.add_trade("600519", "buy", 12.0, 100, "2026-01-06", fee=5, name="贵州茅台")
    portfolio.add_trade("600519", "sell", 15.0, 200, "2026-02-01", fee=4, name="贵州茅台")
    rows = portfolio.trades_with_realized()
    sell = [r for r in rows if r["side"] == "sell"][0]
    # 100 from each lot; fees per share included.
    expected = (15 - 10 - 0.05 - 0.02) * 100 + (15 - 12 - 0.05 - 0.02) * 100
    assert sell["realized"] == pytest.approx(round(expected, 2))
    assert len(sell["matched"]) == 2


def test_update_and_delete_trade(temp_db, no_network):
    trade = portfolio.add_trade("600519", "buy", 10.0, 100, "2026-01-05", name="贵州茅台")
    updated = portfolio.update_trade(trade["id"], price=11.0, note="补录")
    assert updated["price"] == 11.0
    assert updated["note"] == "补录"
    portfolio.delete_trade(trade["id"])
    assert portfolio.load_trades() == []


def test_cash_flow(temp_db, no_network):
    portfolio.add_trade("600519", "buy", 10.0, 100, "2026-01-05", fee=5, name="贵州茅台")
    portfolio.add_trade("600519", "sell", 12.0, 100, "2026-01-06", fee=2, name="贵州茅台")
    flow = portfolio._cash_flow(portfolio.load_trades())
    assert flow["buy_total"] == pytest.approx(1005.0)
    assert flow["sell_total"] == pytest.approx(1198.0)
    assert flow["fees"] == pytest.approx(7.0)
    assert flow["net_invested"] == pytest.approx(-193.0)
