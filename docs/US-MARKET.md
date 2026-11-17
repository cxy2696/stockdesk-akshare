# US Edition · 美股版

[中文](#中文) · [English](#english)

## 中文

美股版是一个可以单独运行的小型看盘工具。它不依赖 A 股桌面版，也不会读取或修改那边的数据库；两个程序可以同时开着。

### 启动

```bash
cd us
python -m venv .venv
source .venv/bin/activate       # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python run.py --port 8770
```

打开 <http://127.0.0.1:8770>（如端口被占用会自动顺延，以终端打印的地址为准）。

### 能做什么

- 道琼斯、纳斯达克 100、标普 500
- 自选股增删、本地保存
- 按代码或公司名搜索
- 日 K + 成交量，3M / 6M / 1Y
- 涨幅榜 / 跌幅榜
- 成交额样本市场宽度
- 中文 / English 切换
- 60 秒自动刷新

### API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/us/health` | 健康检查 |
| GET | `/api/us/overview` | 指数、榜单、宽度 |
| GET | `/api/us/quotes?symbols=AAPL,MSFT` | 批量报价 |
| GET | `/api/us/klines/{symbol}?limit=180` | 日 K |
| GET | `/api/us/search?q=apple` | 搜索 |

### 数据说明

行情来自东方财富公开接口，价格按 `f59` 小数位缩放。自选搜索会尝试 105/106/107 三个市场。市场宽度只取成交额靠前的样本，适合感受温度，不是交易所官方统计。

## English

The US edition is a small, self-contained market dashboard. It does not depend on the A-share desktop app and never reads or writes its database; you can run both at the same time.

### Start

```bash
cd us
python -m venv .venv
source .venv/bin/activate       # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python run.py --port 8770
```

Open <http://127.0.0.1:8770> (if the port is busy, the launcher picks the next one and prints the URL).

### What it does

- Dow Jones, Nasdaq 100 and S&P 500
- A watchlist that stays local
- Search by ticker or company name
- Daily candles and volume, 3M / 6M / 1Y
- Gainers and losers
- A top-turnover breadth estimate
- 中文 / English switch
- Refresh every 60 seconds

### API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/us/health` | health check |
| GET | `/api/us/overview` | indices, movers, breadth |
| GET | `/api/us/quotes?symbols=AAPL,MSFT` | batch quotes |
| GET | `/api/us/klines/{symbol}?limit=180` | daily candles |
| GET | `/api/us/search?q=apple` | symbol search |

### About the data

Quotes come from Eastmoney's public endpoints. Prices are scaled with the `f59` decimal field. Symbol lookup tries market ids 105/106/107. Breadth uses the top-turnover sample — it is a temperature gauge, not an official exchange statistic.
