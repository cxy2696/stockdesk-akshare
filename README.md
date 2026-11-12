# StockDesk · akshare

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Python](https://img.shields.io/badge/Python-3.10%2B-3776AB?logo=python&logoColor=white)](desktop/backend)
[![TypeScript](https://img.shields.io/badge/TypeScript-React-3178C6?logo=typescript&logoColor=white)](desktop/frontend)
[![Swift](https://img.shields.io/badge/Swift-SwiftUI-F05138?logo=swift&logoColor=white)](ios)
[![JavaScript](https://img.shields.io/badge/JavaScript-ECharts-F7DF1E?logo=javascript&logoColor=black)](us/static)

**个人股票投资台 / Personal equity investment desk**  
Mac · Windows · iOS · US Equities

[项目主页](https://cxy2696.github.io/stockdesk-akshare/) · [使用指南](docs/GUIDE.md) · [安装构建](docs/INSTALL.md) · [Releases](https://github.com/cxy2696/stockdesk-akshare/releases/tag/v1.10.2) · [容器](docs/PACKAGES.md) · [English](#english)

![Mac HUB](screenshots/mac-hub.png)

## 下载 / Download

| 平台 Platform | 文件 File | 大小 Size | 安装 Install |
| --- | --- | --- | --- |
| macOS 12+ Apple Silicon | `StockDesk-macOS-1.10.2.dmg` | 43 MB | 打开 DMG，双击 `Install-StockDesk.command` |
| macOS 12+ Apple Silicon | `StockDesk-macOS-1.10.2.zip` | 42 MB | 解压后双击 `Install-StockDesk.command` |
| Windows 10/11 x64 | `StockDesk.exe` | 52 MB | 双击；需要 WebView2；SmartScreen 选「更多信息 → 仍要运行」 |
| iPhone iOS 17+ | `StockDesk-iOS-3.7.2-unsigned.ipa` | 1.9 MB | 用 Sideloadly / AltStore / Xcode 重签 |
| 浏览器 / NAS | GHCR 容器 | — | 见 [PACKAGES](docs/PACKAGES.md) |

- 全部文件在 [Releases v1.10.2](https://github.com/cxy2696/stockdesk-akshare/releases/tag/v1.10.2)；macOS 用 `SHA256SUMS-macOS.txt` 校验。
- macOS App 为 ad-hoc 签名，下载后需运行安装脚本清除 `com.apple.quarantine`。脚本被拦截时右键 → 打开；手动命令：
  ```bash
  xattr -dr com.apple.quarantine /Applications/StockDesk.app
  ```
- macOS 仅 Apple Silicon；Intel Mac 请从源码运行或使用容器。iOS IPA 未签名，必须重签。

## 这是什么 / What it is

StockDesk 是一个本地优先、单用户的股票投资工作台：持仓、行情、复盘、策略回测、HMM/渗流模型、KDJ 极值和地域/行业数据，都在一个 HUD 风格界面里。账户和缓存只保存在本机。

A local-first, single-user equity desk: portfolio, quotes, review, backtests, HMM/percolation models, KDJ alerts and regional/industry views in one HUD. Account data and caches stay on your machine.

> 本仓库是独立副本，不影响你当前本地正在使用的 StockDesk。<br>
> This is an independent snapshot and does not affect your existing StockDesk install.

## 1.10.2 更新 / What's new

- macOS 安装包从 94.3 MB 降到 **43 MB DMG / 42 MB ZIP**；新增 `Install-StockDesk.command`，自动安装并清除下载隔离。
- iOS KDJ 行业卡在东方财富不可达时回退到标注的 ETF 代理；板块跟踪回退到新浪行业/概念资金流；修正北证 50 代码。
- App 启动失败、前端资源缺失或页面 JS 加载失败时，会弹出/显示错误提示并写日志，不再静默空白。
- Windows 仍为约 52 MB 单文件；新增 SmartScreen、WebView2、`--browser` 和日志排查说明。
- 新增带截图的[使用指南](docs/GUIDE.md)。

## 功能 / Features

| 模块 | 说明 |
| --- | --- |
| HUD 指挥舱 | 资产中枢、7 个入口、管理员名片、LIVE 状态栏 |
| 每日策略 | 市场状态、仓位建议、今日标的、行业趋势、要闻 |
| 持仓与复盘 | 交易流水、移动成本、已实现/浮动盈亏、净值、回撤、夏普 |
| 自选与个股 | 实时行情、日/周/月 K、MACD、九转、筹码、黄金分割、支撑压力 |
| 板块跟踪 | 行业/概念、市场情绪、涨停池、个股热图、形态选股 |
| 策略回测 | 10 套策略、手续费/印花税/滑点、资金曲线、交易明细 |
| 量化模型 | 5 指数 3 状态 HMM、渗流最大连通簇、行业临界、个股仓位建议 |
| KDJ 预警 | 半导体/通信设备 + 9 个 A 股指数，5m/30m K/D/J、RSV、MA5/20、量比、中枢 |
| 地域与要闻 | 中国上市公司地图、省份龙头、行业新闻与关键标的 |
| 分享与缩放 | 子页面长图分享；100% / 120% / 150% 文字缩放，自动换行 |

English modules: HUD, Daily Plan, Portfolio & Review, Watchlist/Stock Detail, Sectors, Backtest, Quant Models, KDJ Alerts, Regions/Industry News, Sharing & Scaling.

## 快速开始 / Quick start

```bash
# macOS / Linux
cd desktop
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cd frontend && npm ci && npm run build && cd ..
python main.py            # 原生窗口；--browser 用浏览器
```

```powershell
# Windows
cd desktop
py -3.10 -m venv .venv
.venv\Scripts\pip install -r requirements.txt
cd frontend && npm ci && npm run build && cd ..
python main.py
```

```bash
# iOS
cd ios && xcodegen generate && open StockDesk.xcodeproj
# US edition
cd us && python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt && python run.py
```

完整步骤、打包与发版见 [安装构建](docs/INSTALL.md)；第一次使用见 [使用指南](docs/GUIDE.md)。

## 数据与缩放 / Data & scaling

- A 股/指数：东方财富公开行情接口；美股：东方财富美股公开接口；HTTP 直连，`akshare` 用于部分分钟线/板块回退。
- 缩放只改文字：按钮/卡片自动增高，表格自动换行；地图和图表不拉伸；120%/150% 隐藏 ticker；iOS 150% 单列 HUB。
- 所有行情仅用于研究，不构成投资建议。

## 项目结构 / Layout

```
stockdesk-akshare/
├── desktop/        FastAPI + React 桌面端
├── ios/            SwiftUI iOS
├── us/             美股独立仪表盘
├── docs/           指南、安装、架构、模型、容器
├── screenshots/    Mac / iOS / US 截图
└── .github/        CI
```

## 版本 / Versions

| 平台 | 版本 |
| --- | --- |
| macOS / Windows | **1.10.2** |
| iOS | **3.7.2 (29)** |
| US | **1.0.1** |
| 容器 | `stockdesk-akshare-a-share:1.10.2` / `stockdesk-akshare-us:1.0.1` |

## English

StockDesk is a local-first, single-user equity research desk for macOS, Windows, iOS and the web. It combines portfolio tracking, quotes, review analytics, backtests, HMM/percolation models, KDJ alerts and regional/industry views in a HUD-style interface. Account data and market caches stay local.

**Download:** use the table above. macOS is Apple Silicon only; run `Install-StockDesk.command` after downloading to clear Gatekeeper quarantine. Windows needs WebView2; choose More info → Run anyway if SmartScreen blocks it. The iOS IPA is unsigned and must be re-signed.

**Features:** HUD, Daily Plan, Portfolio/Review, Watchlist/Stock Detail, Sectors, Backtest, Quant Models, KDJ Alerts, Regions/Industry News, sharing and 100%/120%/150% scaling. See the [Guide](docs/GUIDE.md) for screenshots and the daily workflow; see [Install](docs/INSTALL.md) for source builds and packaging.

**Versions:** macOS/Windows 1.10.2 · iOS 3.7.2 (29) · US 1.0.1.<br>
**License:** MIT. Market data is for research only, not investment advice.
