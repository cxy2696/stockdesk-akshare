# StockDesk Desktop · 桌面端

[中文](#中文) · [English](#english)

完整使用流程：[使用教程](../docs/GUIDE.md) · 安装与打包：[安装文档](../docs/INSTALL.md)

## 中文

macOS / Windows 桌面端：FastAPI + React + ECharts + pywebview。账户数据只写入本地 SQLite，行情按需请求东方财富公开接口。

![HUD](docs/preview-hud.png)

![HUD English](docs/preview-hud-en.png)

| 每日策略 | 量化模型 |
| --- | --- |
| ![每日策略](docs/preview-daily.png) | ![量化模型](docs/preview-models.png) |

| 持仓 | 筹码 | 复盘 |
| --- | --- | --- |
| ![持仓](docs/preview-portfolio.png) | ![筹码](docs/preview-chips.png) | ![复盘](docs/preview-analytics.png) |

### 功能

- **HUB**：7 个入口、资产中枢、管理员名片、状态栏
- **行情**：自选、指数、板块、个股详情、筹码、资金流
- **每日策略**：市场状态、仓位区间、候选标的
- **持仓 / 复盘**：流水、成本、已实现/浮动盈亏、净值、回撤
- **回测**：均线、动量、RSI、布林、KDJ 等 10 套规则
- **量化模型**：5 指数 HMM + 渗流最大连通簇
- **KDJ 预警**：右侧独立白色按键，5m / 30m J 值与近似中枢
- **分享**：子页面长图；macOS 原生分享面板，Windows 资源管理器
- **缩放**：100% / 120% / 150%，文字重排，卡片自动增行
- **主题**：指挥舱 / 明亮 / 深色；中英双语

### KDJ 极值预警

入口：任意页面右侧固定白色 **KDJ 预警** 按键。

- 上轨：`J ≥ 118` 超买
- 下轨：`J ≤ -14` 超卖
- 标的：半导体、通信设备、上证、沪深300、创业板、深证、科创50、中证1000
- 5 分钟看即时，30 分钟看质量
- 黄色框为最近摆动高低点重叠区的近似中枢
- 面板内的操作建议不是交易指令；极值可以持续

### 运行

```bash
cd desktop
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cd frontend && npm ci && npm run build && cd ..
python main.py

# 浏览器调试
python main.py --browser
```

Windows：

```powershell
cd desktop
py -3.10 -m venv .venv
.venv\Scripts\pip install -r requirements.txt
cd frontend; npm ci; npm run build; cd ..
python main.py
```

常用参数：

| 参数 | 说明 |
| --- | --- |
| `--port 8765` | 指定端口 |
| `--headless` | 只启动 API + 静态前端 |
| `--browser` | 用默认浏览器打开 |
| `STOCKDESK_DATA=/path` | 自定义数据目录 |

### 打包

macOS：

```bash
./build_app.sh
```

若提示 Xcode license：

```bash
DEVELOPER_DIR=/Library/Developer/CommandLineTools ./build_app.sh
```

Windows：见 [`.github/workflows/build-windows.yml`](../.github/workflows/build-windows.yml)，PyInstaller 单文件 + WebView2。

### 目录

```text
desktop/
├── backend/       FastAPI、行情、模型、KDJ、SQLite
├── frontend/      React + TypeScript + ECharts
├── docs/          界面截图
├── main.py        pywebview / headless 入口
├── stockdesk.spec PyInstaller 配置
└── build_app.sh
```

### 数据与隐私

- 账户、交易、设置、缓存全部在本机
- 无账号、无云端同步
- 行情来自东方财富公开接口，可能延迟或缺失
- 仅用于研究，不构成投资建议

### 版本

- macOS / Windows：1.10.1
- 下载：<https://cxy2696.github.io/stockdesk-akshare/#download>

---

## English

macOS / Windows desktop app: FastAPI + React + ECharts + pywebview. Account data lives in local SQLite; quotes come from Eastmoney public endpoints.

![HUD](docs/preview-hud.png)

### Features

- Seven-entry HUD, asset hub, admin plate and live status bar
- Watchlist, indices, sectors, stock detail, chips and money flow
- Daily plan, portfolio ledger, review, 10 backtest rules
- 3-state HMM on five A-share indices + percolation giant component
- KDJ alerts from a fixed white right-rail button; 5m/30m J and approximate zones
- Full-page image sharing; native macOS share sheet and Windows Explorer
- 100% / 120% / 150% scaling; HUD / light / dark themes; Chinese / English

### KDJ alerts

- Upper band: `J ≥ 118` overbought
- Lower band: `J ≤ -14` oversold
- Targets: semiconductors, communications equipment, SSE, CSI 300, ChiNext, SZSE, STAR 50, CSI 1000
- The yellow box is an approximate central zone, not strict Chan theory
- Guidance in the panel is not a trading instruction; extremes can persist

### Run

```bash
cd desktop
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cd frontend && npm ci && npm run build && cd ..
python main.py

python main.py --browser   # browser-only
```

Windows:

```powershell
cd desktop
py -3.10 -m venv .venv
.venv\Scripts\pip install -r requirements.txt
cd frontend; npm ci; npm run build; cd ..
python main.py
```

### Build

```bash
./build_app.sh
```

Windows uses the workflow at [`.github/workflows/build-windows.yml`](../.github/workflows/build-windows.yml).

### Data & privacy

Local-only account data, no login and no cloud sync. Quotes may be delayed or incomplete. Research only, not investment advice.

### Version

macOS / Windows: **1.10.1** · [Download](https://cxy2696.github.io/stockdesk-akshare/#download)
