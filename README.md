# StockDesk · akshare

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Release](https://img.shields.io/badge/release-1.10.2-c9ad72)](https://github.com/cxy2696/stockdesk-akshare/releases/tag/v1.10.2)
[![Python](https://img.shields.io/badge/Python-3.10%2B-3776AB?logo=python&logoColor=white)](desktop/backend)
[![TypeScript](https://img.shields.io/badge/TypeScript-React-3178C6?logo=typescript&logoColor=white)](desktop/frontend)
[![Swift](https://img.shields.io/badge/Swift-SwiftUI-F05138?logo=swift&logoColor=white)](ios)
[![JavaScript](https://img.shields.io/badge/JavaScript-ECharts-F7DF1E?logo=javascript&logoColor=black)](us/static)

**个人股票投资台 / A local-first equity desk**  
macOS · Windows · iOS · US Equities

[中文](#中文) · [English](#english) · [Website](https://cxy2696.github.io/stockdesk-akshare/) · [Download](https://cxy2696.github.io/stockdesk-akshare/#download) · [Guide](docs/GUIDE.md) · [Install](docs/INSTALL.md) · [Architecture](docs/ARCHITECTURE.md) · [Languages](LANGUAGES.md) · [Releases](https://github.com/cxy2696/stockdesk-akshare/releases/tag/v1.10.2)

## 项目展示页 / Project site

**https://cxy2696.github.io/stockdesk-akshare/**

43 秒产品影片、五章放映、背景音乐、HUB / 模型 / 美股 / iOS 界面、下载选择器和快速开始；支持中英切换，以及桌面、平板、手机布局。

A 43-second product film with five chapters and music, the HUB / models / US / iOS views, a download picker and quick start. Bilingual, responsive across desktop, tablet and phone.

[**打开展示页 / Open the site →**](https://cxy2696.github.io/stockdesk-akshare/)

![Mac HUB](screenshots/mac-hub.png)

![Mac HUB English](screenshots/mac-hub-en.png)

---

## 中文

### 这是什么

StockDesk 是一个本地优先、单用户的股票投资工作台。它把行情、持仓、复盘、回测、HMM/渗流模型、KDJ 预警和地域/行业视图放在一个安静的命令舱界面里；账户和缓存只保存在本机。

最新版本 **1.10.2**：

- KDJ 极值预警从「量化模型」移出，放在 HUB 右侧「行业要闻」下方，沿用同一套白色按键
- 上轨 `J ≥ 118` 超买，下轨 `J ≤ -14` 超卖
- 新增中证1000，共覆盖 2 个行业 + 6 个指数
- 5 分钟 / 30 分钟双图，绘制近似中枢
- 项目页新增 macOS / Windows / iOS 下载包和保存位置选择器

### 四个版本

| 版本 | 技术 | 说明 |
| --- | --- | --- |
| macOS | FastAPI + React + pywebview | 原生 WebKit 窗口，主力版本 |
| Windows | FastAPI + React + WebView2 | 单文件 exe，原生窗口 |
| iOS | SwiftUI + Swift Charts | 本地存储，不依赖 Mac 后端 |
| US | FastAPI + ECharts | 独立美股看盘页 |

### 功能

| 模块 | 说明 |
| --- | --- |
| HUD 指挥舱 | 资产中枢、7 个入口、管理员名片、状态栏 |
| 持仓与复盘 | 交易流水、成本、已实现/浮动盈亏、净值、回撤 |
| 每日策略 | 市场状态、仓位区间、标的筛选 |
| 板块跟踪 | 行业/概念板块、上涨广度、个股热图 |
| 策略回测 | 均线、动量、RSI、布林、KDJ 等规则 |
| 量化模型 | 5 个 A 股指数 3 状态 HMM、渗流最大连通簇、行业临界 |
| KDJ 预警 | 半导体、通信设备、6 个 A 股指数；5m / 30m J 值与中枢 |
| 地域 / 要闻 | 上市公司地图、省份分布、行业新闻 |
| 图片分享 | 子页面一键生成长图；桌面端调用原生分享 |
| 字体缩放 | 100% / 120% / 150%，文字重排、卡片增行 |

### 下载

[展示页下载区](https://cxy2696.github.io/stockdesk-akshare/#download) 可选择平台；浏览器支持时用保存位置选择器，否则保存到默认下载目录。

| 平台 | 文件 | 版本 |
| --- | --- | --- |
| macOS | `StockDesk-macOS-1.10.2.zip` | 1.10.2 |
| Windows | `StockDesk.exe` | 1.10.2 |
| iOS | `StockDesk-iOS-3.6-unsigned.ipa` | 3.6 |

iOS IPA 未签名，需要自己的 Apple ID 重签。

### 快速开始

完整步骤见 [安装与构建](docs/INSTALL.md)，第一次使用见 [使用教程](docs/GUIDE.md)。

```bash
# macOS / Linux 开发
cd desktop
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cd frontend && npm ci && npm run build && cd ..
python main.py

# 浏览器调试
python main.py --browser
```

```bash
# 美股版
cd us
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python run.py
```

```bash
# iOS
cd ios
xcodegen generate
open StockDesk.xcodeproj
```

### 数据与边界

- A 股 / 指数：东方财富公开行情接口
- 美股：东方财富美股公开接口
- 直连 HTTP；`akshare` 可作为后续适配层
- 行情可能延迟、缺失或错误；仅用于研究，不构成投资建议
- KDJ 是预警层，不是交易系统；极值可以持续，超买不等于立刻下跌

### 仓库结构

```text
stockdesk-akshare/
├── desktop/       FastAPI + React + pywebview
├── ios/           SwiftUI iOS
├── us/            独立美股仪表盘
├── docs/          展示页、教程、架构、安装、FAQ
├── screenshots/   桌面与移动端截图
└── .github/       CI 与 Windows 构建
```

### 文档

| 文档 | 内容 |
| --- | --- |
| [使用教程](docs/GUIDE.md) | 第一次打开、每日顺序、KDJ、备份 |
| [安装与构建](docs/INSTALL.md) | 源码、单文件、iOS、Docker |
| [架构](docs/ARCHITECTURE.md) | 前后端、数据流、模型、KDJ |
| [FAQ](docs/FAQ.md) | 数据、分享、下载、常见问题 |
| [容器](docs/PACKAGES.md) | GHCR 镜像与标签 |
| [美股版](docs/US-MARKET.md) | 独立美股仪表盘 |
| [语言](LANGUAGES.md) | 语言与代码规模 |

### 版本

- macOS：1.10.2
- Windows：1.10.2
- iOS：3.6 (27)
- US：1.0.0

### 许可

MIT License。见 [LICENSE](LICENSE)。

---

## English

### What it is

StockDesk is a local-first, single-user equity desk. Market data, positions, review, backtests, HMM/percolation models, KDJ alerts and regional/industry views live in one quiet command-deck interface. Account data and caches stay on your machine.

Latest **1.10.2**:

- KDJ alerts moved out of Quant Models into the HUB right column, directly under Industry News, using the same white button
- Upper band `J ≥ 118` overbought; lower band `J ≤ -14` oversold
- CSI 1000 added: 2 sectors + 6 indices
- 5m / 30m charts with an approximate central zone
- Website download cards for macOS / Windows / iOS with a save-location picker

### Four editions

| Edition | Stack | Notes |
| --- | --- | --- |
| macOS | FastAPI + React + pywebview | Native WebKit window, primary build |
| Windows | FastAPI + React + WebView2 | Single-file exe, native window |
| iOS | SwiftUI + Swift Charts | Local storage, no Mac backend |
| US | FastAPI + ECharts | Standalone US dashboard |

### Features

| Module | Description |
| --- | --- |
| HUD | Asset hub, seven entries, admin plate, live status |
| Portfolio | Trades, cost basis, realized/unrealized P&L, NAV, drawdown |
| Daily plan | Market regime, position range, candidates |
| Sectors | Industry/concept boards, breadth, heatmap |
| Backtest | MA, momentum, RSI, Bollinger, KDJ and more |
| Quant models | 3-state HMM on five A-share indices, percolation giant component |
| KDJ alerts | Semiconductors, communications equipment and six indices; 5m/30m J and zones |
| Regions / news | Listed-company map, provinces, industry headlines |
| Sharing | Full-page image; native share sheet on desktop |
| Scaling | 100% / 120% / 150%, with text reflow |

### Download

Use the [download section](https://cxy2696.github.io/stockdesk-akshare/#download). Chrome/Edge can choose a save location; Safari and mobile fall back to the default Downloads folder.

| Platform | File | Version |
| --- | --- | --- |
| macOS | `StockDesk-macOS-1.10.2.zip` | 1.10.2 |
| Windows | `StockDesk.exe` | 1.10.2 |
| iOS | `StockDesk-iOS-3.6-unsigned.ipa` | 3.6 |

The iOS IPA is unsigned; re-sign with your own Apple ID.

### Quick start

See [Install & Build](docs/INSTALL.md) for full steps and [Guide & Workflow](docs/GUIDE.md) for the daily routine.

```bash
cd desktop
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cd frontend && npm ci && npm run build && cd ..
python main.py
```

```bash
cd us
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python run.py
```

```bash
cd ios
xcodegen generate
open StockDesk.xcodeproj
```

### Data & limits

- A-shares / indices: Eastmoney public endpoints
- US: Eastmoney US public endpoints
- Direct HTTP today; `akshare` can become an optional adapter
- Quotes may be delayed, missing or wrong; research only, not investment advice
- KDJ is a warning layer, not a trading system; extremes can persist

### Layout

```text
stockdesk-akshare/
├── desktop/       FastAPI + React + pywebview
├── ios/           SwiftUI iOS
├── us/            standalone US dashboard
├── docs/          site, guide, architecture, install, FAQ
├── screenshots/   desktop and mobile screenshots
└── .github/       CI and Windows build
```

### Docs

[Guide](docs/GUIDE.md) · [Install](docs/INSTALL.md) · [Architecture](docs/ARCHITECTURE.md) · [FAQ](docs/FAQ.md) · [Packages](docs/PACKAGES.md) · [US edition](docs/US-MARKET.md) · [Languages](LANGUAGES.md)

### Versions

- macOS: 1.10.2
- Windows: 1.10.2
- iOS: 3.6 (27)
- US: 1.0.0

### License

MIT. See [LICENSE](LICENSE).

> Not investment advice. Trading decisions and risk remain yours.
