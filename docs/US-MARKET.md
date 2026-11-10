# US Edition / 美股版

A standalone US equity dashboard. It does not share processes, ports, databases, or caches with the A-share desktop app.

独立的美国股票仪表盘。与 A 股桌面版不共享进程、端口、数据库或缓存。

## Run

```bash
cd us
python -m venv .venv
source .venv/bin/activate       # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python run.py --port 8770
```

Open `http://127.0.0.1:8770`.

## Features

- Dow Jones / Nasdaq 100 / S&P 500 index strip
- Watchlist with local storage, add/remove symbols
- Symbol/company search
- Daily candlestick + volume chart (3M / 6M / 1Y)
- Gainers / losers momentum board
- Market breadth sample (top-turnover US names)
- Auto-refresh every 60 s
- Responsive layout for desktop and tablet

## API

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/us/health` | health check |
| GET | `/api/us/overview` | indices, gainers, losers, breadth |
| GET | `/api/us/quotes?symbols=AAPL,MSFT` | batch quotes |
| GET | `/api/us/klines/{symbol}?limit=180` | daily candles |
| GET | `/api/us/search?q=apple` | symbol search |

## Data source

Eastmoney US public endpoints:

- List: `push2.eastmoney.com/api/qt/clist/get` with `fs=m:105,m:106,m:107`
- Quote: `push2.eastmoney.com/api/qt/stock/get`
- K-line: `push2his.eastmoney.com/api/qt/stock/kline/get`
- Search: `searchapi.eastmoney.com/api/suggest/get`

No API key is required. Responses are cached in memory for 20–120 seconds.

## Notes

- Prices are scaled using the `f59` decimal field from Eastmoney.
- Some OTC/ADR symbols resolve across market ids 105/106/107; the resolver tries each.
- Breadth uses the top-turnover sample, not the full 13k US list; it is a market-temperature indicator, not an exchange official statistic.
- Quotes may be delayed; research only.

## Optional akshare adapter

The project name references akshare, but the current US adapter uses direct HTTP for portability. To add akshare:

```python
import akshare as ak
spot = ak.stock_us_spot_em()
hist = ak.stock_us_hist(symbol="105.AAPL", period="daily", adjust="qfq")
```

Map the fields into `market_us.quote()` / `klines()` and keep the same API contract.
