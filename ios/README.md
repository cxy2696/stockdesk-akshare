# StockDesk for iOS

[中文](#中文) · [English](#english)

使用流程与常见问题：[使用教程与流程](../docs/GUIDE.md) · Walkthrough: [Guide & Workflow](../docs/GUIDE.md).

## 中文

完全独立的原生 iOS / iPadOS 股票投资 App：**不依赖 Mac 后端**，行情、K 线、财务、持仓、复盘、回测、选股、提醒全部在 iPhone 本地完成。
SwiftUI + Swift Charts，默认 **「指挥舱 HUD」** 深色界面，也可切换明亮/深色；设置内可切换中文 / English。

**v3.9.0 (32)**：桌面 1.12 的模型与展示修复同步到 iOS：量化模型页新增综合评分卡（HMM 42% / 渗流 38% / 九转 20%），每日策略保留三列主力追踪、模型结论与九转卡，数字格式化过滤 NaN/Infinity，空态与错误提示更明确。iOS 不集成 Ollama（该功能仅 macOS / Windows）。

上一版 3.7.3 的内容保留：HUB 3+4、长图分享、个股仓位建议、行业临界、资产快照缓存、指数分析、顶部搜索/自选/笔记/提醒、K 线拖动查看每日数据、筹码与黄金分割、九转与底部钝化。

| 每日策略（多周期/行业） | 板块跟踪 | 投资 HUD |
| --- | --- | --- |
| ![每日](docs/ios-daily.png) | ![板块](docs/ios-market.png) | ![持仓](docs/ios-invest.png) |

| 指数分析 | 投资 HUD 横屏 | 设置（主题 / 横屏） |
| --- | --- | --- |
| ![指数](docs/ios-index.png) | ![横屏](docs/ios-landscape.png) | ![设置](docs/ios-settings.png) |

| 个股热图 | 黄金分割 + 筹码 | 复盘总结 |
| --- | --- | --- |
| ![热图](docs/ios-heat.png) | ![黄金分割](docs/ios-fib.png) | ![复盘](docs/ios-analytics.png) |

| 持仓（撑/压） | 自选（20/60 日） | 回测 |
| --- | --- | --- |
| ![持仓](docs/ios-portfolio.png) | ![自选](docs/ios-watch.png) | ![回测](docs/ios-backtest.png) |

---

## 交付物

| 文件 | 用途 |
| --- | --- |
| `dist/StockDesk-unsigned.ipa` | 未签名 IPA，用 Sideloadly / AltStore / Xcode 签名安装到真机 |
| `dist/StockDesk-simulator.app` | 已编译 App，可直接装进 iOS 模拟器 |
| `StockDesk.xcodeproj` | Xcode 工程，真机安装最稳妥的方式 |

> App 完全离线于你的数据：不登录、不上传，账户数据保存在 App 沙盒内。

## 安装到 iPhone（本地运行）

> 本仓库提供的是**未签名 IPA**，iOS 不允许直接安装未签名 App，需要用你的 Apple ID 重签一次。不需要 Mac 后端，安装后所有数据都在手机本地。

### 方式 A：Xcode 直接跑真机（推荐，免费 Apple ID 即可）

1. 用 Xcode 打开 `StockDesk.xcodeproj`
2. 选中 `StockDesk` target → Signing & Capabilities → Team 选择你的 Apple ID（没有就 Add Account）
3. Bundle Identifier 改成唯一值（如 `com.你的名字.stockdesk`）
4. 连上 iPhone，选中设备，⌘R 运行
5. 首次运行到 iPhone「设置 → 通用 → VPN 与设备管理」信任你的开发者证书

免费 Apple ID 签名的 App 有效期为 7 天，到期重新运行一次即可。

### 方式 B：侧载 IPA

1. 把 `dist/StockDesk-unsigned.ipa` 传到电脑
2. 用 [Sideloadly](https://sideloadly.io) 或 AltStore / SideStore 登录 Apple ID 重签并安装
3. 在 iPhone「设置 → 通用 → VPN 与设备管理」信任证书

也可以在有 Apple ID 的 Mac 上运行：

```bash
./install_to_iphone.sh <你的 Team ID>
```

Team ID 在 Xcode → Settings → Accounts → 选中 Apple ID → Team ID 查看。

### 方式 C：先装到模拟器（无需签名）

```bash
xcrun simctl boot "iPhone 18 Pro"   # 或任意已安装的模拟器
xcrun simctl install booted dist/StockDesk-simulator.app
xcrun simctl launch booted com.stockdesk.app
```

## 功能

- **总览**：总资产、持仓市值、可用现金、今日盈亏、浮动/已实现盈亏、累计收益率、账户净值迷你曲线、自选列表、涨幅/资金流榜
- **自选**：实时价格与涨跌幅、搜索添加（代码/名称）、左滑删除、涨跌家数
- **个股**：实时报价、日/周/月 K 线（MA5/10/20 + 成交量 + **MACD 副图**）、**拖动查看每日 OHLC/涨跌**、**九转序列 9 标记**、**筹码分布与筹码分析**、**黄金分割位**、支撑/压力、**完整公司概况（董事长/董秘/法人/地址/网站/主营/经营范围等）**、近 8 期财务指标
- **HUD 首页**：HUB 即启动页，没有底部 Tab；总览、自选、持仓、复盘、回测、设置都从左右模块进
- **持仓（持仓管理）**：顶部「资产分析 / 投资建议」快捷入口；**总资产 = 可用现金 + 持仓市值**、初始资产基准、移动平均成本、数量、成本价、现价、浮动盈亏、仓位、**每只持仓的支撑/压力**；**单笔删除交易、整只删除持仓（带确认）**；交易流水增删改
- **复盘**：**复盘总结、仓位管理推荐、趋势分析（净值 vs 20/60 日线）、行情判断、市场情况**、净值曲线（沪深300 + 上证双基准）、回撤、累计/年化/超额收益、夏普、Beta、月度收益热力图、FIFO 胜率/盈亏比、个股贡献
- **回测**：双均线、动量突破、RSI、MACD、布林带、唐奇安通道、均线+RSI、布林突破、KDJ、放量突破 **10 套策略**；次日开盘成交、手续费/印花税/滑点、资金曲线与完整交易明细
- **每日策略**：每日行情、模型结论（温度 + MA20 + 九转 → 进攻 / 均衡 / 防守）、主力追踪三列（个股流入 / 个股流出 / 行业流入）、行情分析（7/20/30/60 日 + MA5/10/20/60 + RSI + MACD + 九转 + 底部钝化 + 支撑压力）、九转模型（5 个指数的买卖进度与倒计时）、行业趋势、行业要闻（点标题读全文）、指标说明、仓位管理推荐、今日标的
- **板块跟踪**：行业/概念板块、市场情绪与涨停池、全市场个股热图、10 类形态选股
- **自选**：20 日 / 60 日迷你走势、涨跌家数、搜索添加
- **本地运行**：无服务器、无登录、无上传；行情来自东方财富公开接口，账户数据保存在 App 沙盒
- **横竖屏**：设置 → 账户与主题 → 屏幕方向，可选自动旋转 / 锁定竖屏 / 锁定横屏，立即生效
- **iPad 适配**：HUB 放大资产中枢与左右模块，Dashboard 四列 KPI，KDJ 双列图表，地域地图加高，设置页限制阅读宽度；iPhone 保持原布局
- **指挥舱 HUD**：取消底部选择，14 个银色模块；底部 StockDesk 卡片显示当前时间（秒）与数据更新时间
- **顶栏交互**：放大镜搜索股票名称/代码、星号自选、信封笔记、铃铛异常提醒
- **资产中枢**：中央圆盘点击直接进持仓管理，不再弹「资产分析 / 投资建议 / 指数分析」菜单；名称与 UID 在设置里改
- **HUB 右侧**：策略回测、地域、指数分析、量化模型、KDJ 预警；`industry-news` 旧路由也解析到指数分析
- **量化模型**：5 个 A 股核心指数 HMM 切换；个股仓位/买卖建议；行业临界、关键标的、细分行业渗流、随机重排稳健性；九转模型卡片与综合评分卡（HMM 42% / 渗流 38% / 九转 20%），版本显示 v2.2.0
- **指数分析**：A 股宽基与海外指数的多周期、均线、RSI、MACD、支撑压力与偏多/偏空评分
- **九转怎么看**：建仓结构 9 根（收盘价对比 4 日前）、倒计时 13 根（对比 2 日前高/低）；9/9 只说明这一段动能衰竭，不是反转保证。买结构完成后等放量收阳或收复 5 日线再试仓，卖结构完成且跌破 5 日线先减一半；7/9 只观察
- **KDJ 预警**：半导体 / 通信设备 + 9 个 A 股指数，5m / 30m 的 K/D/J、RSV、MA5/20、量比与近似中枢；板块分钟数据不可达时自动使用并标注 ETF 代理，不再停在「暂无行情」
- **稳定性**：资产快照本地缓存，启动先展示上次资产再刷新
- **分享**：HUD 顶栏及详情页浮动按钮可分享当前界面截图
- **界面缩放**：设置 → 界面缩放，支持 100% / 120% / 150%；120% 两列，150% 自动切单列 HUB，全部页面同步
- **管理员名片**：名称与 UID 在设置中修改，立即同步到中枢左下角
- **异常提醒**：页面顶部列出 5 条触发条件，并给出当前命中项
- **添加自选**：热门展示涨速最高的 10 只股票（名称、代码、行业、涨速）
- **竖版/横版**：竖版地图+2 列模块，横版左右三栏

## 数据与隐私

- 行情、K 线、指数、财务数据来自**东方财富公开接口**（与桌面版同源）。
- 账户、交易、自选、提醒保存在 App 沙盒的 `stockdesk.json`，卸载即删除。
- 行情缓存位于沙盒 Caches，设置页可一键清空。
- 所有数据仅在设备本地处理，无任何上传。

## 架构

```
StockDesk/
├── StockDeskApp.swift        # App 入口 + 主题
├── Models/Models.swift       # Quote / KLine / Trade / Position / Backtest 等
├── Services/
│   ├── Networking.swift      # URLSession + 磁盘 TTL 缓存
│   ├── MarketService.swift   # 东财行情/K线/财务/指数/搜索/榜单
│   ├── AppStore.swift        # 本地持久化 + 状态编排
│   ├── PortfolioEngine.swift # 移动平均成本、净值、回撤、FIFO 统计
│   ├── BacktestEngine.swift  # 5 种策略 + 指标 + 回测撮合
│   ├── ScreenerEngine.swift  # 多因子筛选与评分
│   └── Theme.swift           # 亮色设计系统
└── Views/                    # SwiftUI 页面与组件（Swift Charts）
```

## 重新构建

```bash
cd ios
xcodegen generate          # 由 project.yml 生成 StockDesk.xcodeproj
open StockDesk.xcodeproj   # ⌘R 跑真机或模拟器；Product → Archive 打 IPA
```

依赖：Xcode 15+、XcodeGen（`brew install xcodegen`）。工程版本由 `project.yml` 的 `MARKETING_VERSION` / `CURRENT_PROJECT_VERSION` 决定，当前 3.9.0 (32)。

## 已知限制

- 仅支持 A 股；港股/美股/基金未覆盖。
- 价格提醒仅在 App 前台运行时检查（iOS 后台限制），后续可接本地通知做定时检查。
- 回测为单标的全仓模型，不处理停牌、涨跌停无法成交等情况。
- 行情来自公开接口，可能有延迟，交易请以券商行情为准。
- 未签名 IPA 需要自行重签；上架 App Store 需要 Apple Developer 付费账号并走 Archive/TestFlight 流程。

## License

个人学习与研究用途，不构成投资建议。


---


## English

StockDesk for iOS is a fully standalone SwiftUI app, now at **3.9.0 (32)**. It does **not** require the Mac backend: quotes, candles, fundamentals, portfolio, review, backtest, screening and alerts all run on the iPhone.

- SwiftUI + Swift Charts
- HUB home with three left actions and five right modules (Backtest, Regions, Index Analysis, Quant Models, KDJ Alerts); the central disc opens Portfolio directly
- Daily Plan: three-column main-force flow (inflow / outflow / industry), a model-conclusion card (temperature + MA20 + TD) and a TD Sequential card
- Portfolio: asset-analysis and advice shortcuts at the top, plus positions and trade history
- Index Analysis for A-share broad indices and overseas markets; the legacy `industry-news` route resolves to the same screen
- 100% / 120% / 150% font scaling; 150% uses a single-column HUB
- Built-in Chinese / English switch in Settings
- Full-page image sharing via the system share sheet (WeChat, Notes, Files)
- HMM, percolation and TD models with per-stock position guidance and a transparent composite score (model registry v2.2.0)
- KDJ extreme-zone panel for two sectors and nine A-share indices, with 5m / 30m K/D/J, RSV, MA5/20, volume ratio and an approximate central zone; a labelled ETF proxy keeps sector cards live when board-minute data is unavailable
- Local-only storage; no login and no uploads

### Install

1. Open `StockDesk.xcodeproj`
2. Select your team under Signing & Capabilities
3. Run on a simulator or a device

The unsigned IPA can be re-signed with Sideloadly, AltStore or Xcode. A free Apple ID signature expires after 7 days.

