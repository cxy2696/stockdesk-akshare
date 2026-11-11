# Architecture · 架构

[中文](#中文) · [English](#english)

## 中文

### 一眼看懂

StockDesk 由四个相对独立的部分组成，彼此通过简单的 HTTP 接口或本地数据连接：

```
macOS / Windows 桌面端
  React + Vite + AntD + ECharts
          ↕ /api
  FastAPI + SQLite + 行情适配层
          ↕
  pywebview 原生窗口

iOS
  SwiftUI + Swift Charts + URLSession
  本地 JSON 存储，直接访问东方财富

美股版
  FastAPI + 原生 HTML/CSS/JS + ECharts
  独立端口 8770，内存缓存
```

### 桌面端

- `main.py` 负责挑选空闲端口、启动 uvicorn，并打开 pywebview 窗口；原生窗口不可用时会退回浏览器。
- `backend/app.py` 提供 API 和前端静态文件。
- `backend/market.py` 负责 A 股行情、指数、K 线、搜索和板块数据。
- `backend/models.py` 实现三状态高斯 HMM 和渗流最大连通簇。
- `backend/portfolio.py` 处理交易流水、成本、净值与回撤。
- `backend/db.py` 用 SQLite 保存账户、交易、自选和缓存。
- `frontend/src` 是 HUD、页面、主题和图表所在的位置。

### HMM 与渗流

HMM 的输入是五个 A 股指数的日对数收益，输出强势 / 震荡 / 弱势三种状态、后验概率、转移矩阵和预计持续时间。它回答“现在该拿多少仓位”。

渗流模型把上涨股票放进二维格点，寻找最大的 4 邻接连通簇。上涨家数只说明“有多少”，最大簇说明“有没有连成一片”。阈值 0.592746 来自二维方格点渗流模型，样本较小时只做相对参考。

### KDJ 预警

- `backend/kdj.py` 使用 akshare：指数走新浪分钟线，行业板块走东方财富。
- 5m / 30m 各取 180 根；KDJ(9,3,3)，上轨 118、下轨 -14。
- 行业接口限流时回退到跟踪 ETF，并在响应里标记 `proxy`。
- 前端每 60 秒刷新；中枢为摆动高低点重叠区的近似。

### KDJ alerts

- `backend/kdj.py` uses akshare: Sina for index minute bars, Eastmoney for industry boards.
- 180 bars per 5m / 30m frame; KDJ(9,3,3), bands 118 / -14.
- A tracking ETF is used when the board endpoint is rate-limited and marked as a proxy.
- The UI refreshes every 60 seconds; the central zone is approximate.

### iOS

- `ios/StockDesk/Views` 放 SwiftUI 页面、HUD 和中国地图。
- `ios/StockDesk/Models/QuantModels.swift` 是 Swift 版 HMM 与渗流。
- `ios/StockDesk/Services` 负责行情请求与本地存储。

### 美股版

- `us/market_us.py` 访问美股指数、报价、榜单、搜索和 K 线，并做短时缓存。
- `us/app.py` 提供 API 和静态页面。
- `us/static` 是无需构建的单页仪表盘，ECharts 已放在本地。

### 安全与隐私

服务只监听本机，不需要账号密码；账户数据不会上传。行情来自公开接口，可能有延迟或缺失。

## English

### The short version

StockDesk has four fairly independent pieces, connected by simple HTTP APIs or local data:

```
macOS / Windows desktop
  React + Vite + AntD + ECharts
          ↕ /api
  FastAPI + SQLite + market adapters
          ↕
  pywebview native window

iOS
  SwiftUI + Swift Charts + URLSession
  local JSON storage, Eastmoney requests

US edition
  FastAPI + plain HTML/CSS/JS + ECharts
  its own port 8770, in-memory cache
```

### Desktop

- `main.py` finds a free port, starts uvicorn and opens a pywebview window. If the native window cannot start, it falls back to your browser.
- `backend/app.py` serves both the API and the built frontend.
- `backend/market.py` handles A-share quotes, indices, candles, search and sectors.
- `backend/models.py` contains the three-state Gaussian HMM and the percolation giant component.
- `backend/portfolio.py` handles trades, cost basis, NAV and drawdown.
- `backend/db.py` stores accounts, trades, watchlists and caches in SQLite.
- `frontend/src` is where the HUD, pages, themes and charts live.

### HMM and percolation

The HMM looks at daily log returns of five A-share indices. It gives strong / range / weak states, posterior probabilities, a transition matrix and expected duration. In plain terms: it helps decide how much exposure to carry.

The percolation model places rising stocks on a 2-D lattice and finds the largest four-neighbour cluster. The number of rising stocks tells you *how many*; the largest cluster tells you whether they are *connected*. The 0.592746 threshold comes from the 2-D square-site model; with small samples, treat it as a relative guide.

### iOS

- `ios/StockDesk/Views` contains SwiftUI screens, the HUD and the China map.
- `ios/StockDesk/Models/QuantModels.swift` is the Swift HMM and percolation implementation.
- `ios/StockDesk/Services` handles quotes and local storage.

### US edition

- `us/market_us.py` talks to US index, quote, mover, search and candle endpoints, with short-lived caching.
- `us/app.py` serves the API and static page.
- `us/static` is a no-build dashboard with a local ECharts bundle.

### Security and privacy

The server binds to localhost only. There are no accounts or passwords, and portfolio data is never uploaded. Public market data can be delayed or incomplete.
