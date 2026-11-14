# StockDesk · akshare

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Python](https://img.shields.io/badge/Python-3.10%2B-3776AB?logo=python&logoColor=white)](desktop/backend)
[![TypeScript](https://img.shields.io/badge/TypeScript-React-3178C6?logo=typescript&logoColor=white)](desktop/frontend)
[![Swift](https://img.shields.io/badge/Swift-SwiftUI-F05138?logo=swift&logoColor=white)](ios)
[![JavaScript](https://img.shields.io/badge/JavaScript-ECharts-F7DF1E?logo=javascript&logoColor=black)](us/static)

**个人股票投资台 / Personal equity investment desk**  
Mac · Windows · iPhone · iPad · US Equities

[项目主页](https://cxy2696.github.io/stockdesk-akshare/) · [使用指南](docs/GUIDE.md) · [安装构建](docs/INSTALL.md) · [模型说明](docs/MODELS.md) · [Ollama 指南](docs/OLLAMA.md) · [Releases](https://github.com/cxy2696/stockdesk-akshare/releases) · [English](#english)

![Mac HUB](screenshots/mac-hub.png)

> **1.12.0 安装包**：macOS、Windows 与 iOS 已更新到 1.12.0 / 3.9.0。Ollama 辅助判断仅支持 macOS / Windows，默认关闭；没有本地 Ollama 时不会启用。

## 下载 / Download

| 平台 Platform | 文件 File | 版本 Version | 说明 Notes |
| --- | --- | --- | --- |
| macOS 12+ Apple Silicon | `StockDesk-macOS-1.12.0.dmg` / `.zip` | 1.12.0 | 打开 DMG，双击 `Install-StockDesk.command` |
| Windows 10/11 x64 | `StockDesk.exe` | 1.12.0 | 双击；需要 WebView2 |
| iPhone / iPad iOS 17+ | `StockDesk-iOS-3.9.0-unsigned.ipa` | 3.9.0 | 用 Sideloadly / AltStore / Xcode 重签 |
| 浏览器 / NAS | GHCR 容器 | latest | 见 [PACKAGES](docs/PACKAGES.md) |
| 源码 | `main` 分支 | **1.12.0** | 见下方快速开始 |

- 安装包在 [Releases](https://github.com/cxy2696/stockdesk-akshare/releases)；macOS 用 `SHA256SUMS-macOS.txt` 校验。
- macOS App 为 ad-hoc 签名，下载后需运行安装脚本清除 `com.apple.quarantine`。脚本被拦截时右键 → 打开；手动命令：
  ```bash
  xattr -dr com.apple.quarantine /Applications/StockDesk.app
  ```
- macOS 仅 Apple Silicon；Intel Mac 请从源码运行或使用容器。iOS IPA 未签名，必须重签。

## 这是什么 / What it is

StockDesk 是一个本地优先、单用户的股票投资工作台：持仓、行情、复盘、策略回测、HMM/渗流/九转模型、KDJ 极值和地域/行业数据，都在一个 HUD 风格界面里。账户和缓存只保存在本机。

A local-first, single-user equity desk: portfolio, quotes, review, backtests, HMM/percolation/TD models, KDJ alerts and regional/industry views in one HUD. Account data and caches stay on your machine.

> 本仓库是独立副本，不影响你当前本地正在使用的 StockDesk。<br>
> This is an independent snapshot and does not affect your existing StockDesk install.

## 1.12.0 更新 / What's new

- **本地 Ollama 辅助判断（仅 macOS / Windows）**：设置里新增地址、模型、温度、超时、tokens 与连接测试；每日策略和量化模型页可让本机 Ollama 生成一段结构化第二意见。默认关闭，检测不到 Ollama 或没有模型时不会启用，也不会自动生成。
- **模型 2.2.0**：HMM 增加过滤后状态、状态质量/区分度、风险分与建议暴露；渗流增加 12 次 bootstrap 区间、稳定性和广度趋势；九转增加质量/新鲜度/完成度；新增透明综合评分（HMM 42% / 渗流 38% / 九转 20%）。
- **数据展示修复**：桌面与 iOS 的数字格式化统一过滤 NaN/Infinity；每日策略补综合分、质量、过滤后状态、稳定性与趋势；模型页补综合评分卡、分项进度条和依据；空数据/失败状态不再白屏。
- **文档**：新增 [Ollama 本地部署与配置指南](docs/OLLAMA.md)，模型、架构、安装和使用指南同步到 1.12.0 / 3.9.0。

## 1.11.0 更新 / What's new

- **信息架构收拢**：HUB 中央直接进入「持仓管理」；右侧「行业要闻」更名为「指数分析」。侧栏新增完整「使用指南」。
- **每日策略成为主入口**：行情、模型结论、主力追踪、九转、行业关注、行业要闻、仓位、标的在一个页面里；行业要闻与行情要闻合并，全部可点击打开全文。
- **主力追踪修复**：拆成个股净流入 / 个股净流出 / 行业净流入三列；修正负值标红、空值混入流出榜、并发重复请求的问题；增加资金榜净额与数据来源。
- **持仓管理三合一**：持仓总览 / 资产分析 / 投资建议 / 交易流水四个视图；原「资产分析」「投资建议」页自动重定向。
- **九转模型（TD Sequential）**：建仓结构 9、倒计时 13，覆盖 5 个核心指数、持仓和临界行业龙头，给出中文解读与买卖进度。
- **HMM / 渗流升级**：HMM 多起点拟合、置信度、状态年龄、每状态风险统计；渗流新增跨越、susceptibility、随机重排 p 值、50×50 分块图和行业/板块分组。模型注册表 2.1.0。
- **收益复盘图表**：趋势分析（净值/MA20/MA60）与净值曲线（账户/沪深300）颜色区分清楚；首日单点数据不再空白。
- **地域全省份**：34 个省级行政区可搜索、可逐个切换，地图点击联动，省份概览含行业与龙头。
- **个股热图可交互**：下钻、面包屑、搜索、涨跌筛选、悬停高亮；隐藏过小方块，避免几千个 2px 色块糊成一片。
- **性能与容错**：东方财富短熔断、新浪日线兜底、全市场快照/板块/资金流单飞锁；网络受限时每日策略从数分钟降到数十秒内返回。

## 功能 / Features

| 模块 | 说明 |
| --- | --- |
| HUD 指挥舱 | 中央资产中枢 → 持仓管理；左侧 3 个入口；右侧 5 个模块；LIVE 状态条；管理员名片 |
| 每日策略 | 行情、模型结论、主力追踪、行情分析、九转、行业关注、行业要闻、仓位建议、明日支撑压力、今日标的 |
| 持仓管理 | 持仓总览、资产分析、投资建议、交易流水；移动成本、已实现/浮动盈亏、支撑压力、FIFO |
| 收益复盘 | 净值/回撤、20/60 日均线、双基准、月度热力图、仓位现金、交易统计 |
| 自选与个股 | 实时行情、日/周/月 K、MACD、九转、筹码、黄金分割、支撑压力、九转与行业关注卡 |
| 板块跟踪 | 行业/概念、市场情绪、涨停池、可交互个股热图、形态选股 |
| 策略回测 | 10 套策略、手续费/印花税/滑点、资金曲线、交易明细 |
| 量化模型 | 5 指数 3 状态 HMM、渗流最大连通簇、九转结构、综合评分、行业关注、个股仓位建议 |
| Ollama 辅助 | 仅 macOS / Windows；本机模型生成结构化第二意见，默认关闭，可配地址/模型/温度/超时 |
| 指数分析 | A 股 12 个宽基 + 海外指数：趋势、均线、RSI、MACD、支撑压力与结论 |
| KDJ 预警 | 半导体/通信设备 + 9 个 A 股指数，5m/30m K/D/J、RSV、MA5/20、量比、中枢 |
| 地域与行业 | 中国上市公司地图、34 个省级行政区切换、省份龙头、行业要闻（已并入每日策略） |
| 使用指南 | 9 章：上手、每日流程、页面地图、指标词典、仓位风控、数据隐私、快捷键、FAQ、版本 |
| 分享与缩放 | 子页面长图分享；100% / 120% / 150% 文字缩放，自动换行 |
| iOS / iPad | SwiftUI 原生；HUB 直接进持仓管理、指数分析入口、三列主力追踪、九转卡片、持仓快捷入口 |

English modules: HUD, Daily Plan, Portfolio (overview/analysis/advice/trades), Review, Watchlist/Stock Detail, Sectors, Backtest, Quant Models, Index Analysis, KDJ Alerts, Regions, Guide, Sharing & Scaling.

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

- A 股/指数：东方财富公开行情接口；美股：东方财富美股公开接口；HTTP 直连，`akshare` 用于部分分钟线/板块回退；东方财富不可用时自动回退新浪日线/资金流。
- 单飞锁避免同一时刻重复下载全市场快照；东方财富连续失败会短暂熔断，页面不会卡在超时上。
- 缩放只改文字：按钮/卡片自动增高，表格自动换行；地图和图表不拉伸；120%/150% 隐藏 ticker；iOS 150% 单列 HUB。
- 所有行情仅用于研究，不构成投资建议。

## 项目结构 / Layout

```
stockdesk-akshare/
├── desktop/        FastAPI + React 桌面端
│   ├── backend/    market / portfolio / models / td / daily / api
│   └── frontend/   HUB、每日策略、持仓管理、指数分析、模型、热图
├── ios/            SwiftUI iOS
├── us/             美股独立仪表盘
├── docs/           指南、安装、架构、模型、容器
├── screenshots/    Mac / iOS / US 截图
└── .github/        CI
```

## 版本 / Versions

| 平台 | 版本 |
| --- | --- |
| macOS / Windows | **1.12.0** |
| iOS | **3.9.0 (32)** |
| US | 1.0.2 |
| 容器 | `stockdesk-akshare-a-share:latest` / `stockdesk-akshare-us:1.0.2` |

## English

StockDesk is a local-first, single-user equity research desk for macOS, Windows, iOS and the web. It combines portfolio tracking, quotes, review analytics, backtests, HMM/percolation/TD models, KDJ alerts and regional/industry views in a HUD-style interface. Account data and market caches stay local.

**Download:** macOS, Windows and iOS installers are all updated to 1.12.0 / 3.9.0 and are attached to the v1.12.0 release. The `main` branch matches the installers and can also be built from source with the commands above. macOS is Apple Silicon only; run `Install-StockDesk.command` after downloading to clear Gatekeeper quarantine. Windows needs WebView2; choose More info → Run anyway if SmartScreen blocks it. The iOS IPA is unsigned and must be re-signed.

**1.12.0 highlights:** a local Ollama second opinion on macOS/Windows (off by default; disabled automatically when Ollama or the selected model is missing), model registry 2.2.0 with a filtered HMM state, state quality/separation, bootstrap percolation intervals, TD quality/freshness and a transparent composite score, plus NaN-safe formatting and richer empty states across desktop and iOS.

**1.11.0 highlights:** the HUB centre now opens Portfolio; the former Industry News entry is now Index Analysis; Daily Plan merges market headlines with clickable full-text links, fixes main-force flow, and adds HMM/percolation/TD conclusions plus industry focus; Portfolio combines overview, asset analysis, advice and trades; TD Sequential and upgraded HMM/percolation live on the Models page; Review charts get distinct colours and first-day handling; Regions covers all 34 province-level divisions; the stock heatmap is drillable, searchable and filterable; the in-app Guide is a full nine-chapter manual.

**Versions:** macOS/Windows 1.12.0 · iOS 3.9.0 (32) · US 1.0.2.<br>
**License:** MIT. Market data is for research only, not investment advice.
