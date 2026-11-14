# Changelog · 更新记录

[中文](#中文) · [English](#english)

## 中文

### 1.12.0

- **Ollama 本地辅助判断（仅 macOS / Windows）**：新增 `backend/ollama.py` 与 `/api/ollama/config|health|models|advice`；设置页可配地址、模型、温度、超时、最大 tokens，支持测试连接与保存。每日策略和量化模型页显示结构化第二意见（倾向/仓位/依据/风险/动作），默认关闭；未检测到 Ollama 或模型时给出中文提示，不自动生成。
- **模型 2.2.0**：HMM 2.1.0（过滤后在线状态、state_separation/separation_label、quality、risk_score、suggested_exposure）；渗流 2.1.0（12 次 bootstrap 区间/稳定性、trend/history_delta）；九转 1.1.0（quality/freshness/completion/signal_age）；新增透明综合评分（HMM 42% / 渗流 38% / 九转 20%）。
- **数据展示修复**：桌面 `fmt.*` 与 iOS `fmt/pct/shortMoney` 过滤 NaN/Infinity；每日策略补综合分/一致度/质量/分项与 HMM/渗流/九转新字段；模型页补综合评分卡、分项进度条、drivers、过滤后状态、bootstrap、趋势、九转质量/新鲜度；空态与错误可读。
- **文档**：新增 `docs/OLLAMA.md`（macOS/Windows 本地部署、局域网、隐私、FAQ）；README、GUIDE、MODELS、ARCHITECTURE、INSTALL、官网与 iOS README 更新到 1.12.0 / 3.9.0。
- 版本：macOS / Windows **1.12.0**；iOS **3.9.0 (32)**；美股 **1.0.2**。

### 1.11.0

- **HUB 与导航**：中央资产中枢点击直接进入「持仓管理」，不再弹四宫格；右侧「行业要闻」更名为「指数分析」；侧栏新增「使用指南」。原「资产分析」「投资建议」入口收进持仓管理。
- **每日策略重构**：行情、模型结论、主力追踪、行情分析、九转、行业关注、行业要闻、仓位、标的在同一页；行业要闻与行情要闻合并成可筛选列表，每条都能打开东方财富全文。
- **主力追踪修复**：拆成个股净流入 / 个股净流出 / 行业净流入三列，负值按绿色、正值按红色显示；流出榜只保留真正净流出的股票；增加资金榜净额与数据来源；后端修复并发重复请求与空值混入。
- **持仓管理三合一**：持仓总览 / 资产分析 / 投资建议 / 交易流水四个视图；资产分析含资金分配、集中度、月度收益与交易习惯；投资建议含仓位建议、市场温度、未来关注与今日标的；旧路由自动重定向。
- **指数分析页**：原「行业要闻」位置改为「指数分析」，展示 12 个 A 股宽基 + 海外指数的趋势、均线、RSI、MACD、支撑压力与结论；行业要闻内容已迁出。
- **九转模型**：新增 `backend/td.py` 与 `/api/market/td/{code}`；建仓结构 9、倒计时 13；每日策略与量化模型页展示指数、持仓、临界行业龙头的九转状态和中文解读；个股详情增加九转与行业关注卡。
- **HMM 升级**：多起点 Baum-Welch、按均值排序状态、后验置信度、熵、状态年龄、离开概率、每状态日均/年化波动/夏普/胜率；解释改为交易笔记式中文。
- **渗流升级**：稳定哈希排序、最大簇跨越检测、susceptibility、随机重排基线与 p 值、50×50 分块图（不再只看前 2,500 只）、行业/板块分组与关注要点。
- **模型注册表 2.1.0**：HMM 2.0.0、渗流 2.0.0、九转 1.0.0；`scripts/model_selftest.py` 增加九转断言。
- **收益复盘图表**：趋势分析净值/MA20/MA60 三色区分；净值曲线账户/沪深300 区分，基准缺失时隐藏；首日或单点数据不再白屏。
- **地域**：34 个省级行政区可搜索、上一省/下一省、地图点击联动、全部省份列表；省份概览增加行业与龙头，数据缺失时明确提示。
- **个股热图**：单击板块下钻、面包屑返回、单击个股进详情、搜索、只看涨/跌、重置、悬停高亮；隐藏过小方块，避免噪点。
- **性能与容错**：东方财富连续失败后 45 秒短熔断；新浪日线兜底；全市场快照、板块列表、资金流单飞锁；资金流只取净额两端各 900 只。每日策略冷启动从约 3 分钟降到 10 秒级（网络受限时也能在数十秒内返回）。
- **iOS 3.8.0**：HUB 中央直接进持仓管理、右侧入口更名指数分析；每日策略主力追踪三列、新增模型结论与九转卡片；持仓管理顶部增加资产分析与投资建议快捷入口；量化模型页新增九转面板。
- **文档**：README、使用指南、模型说明、架构、官网落地页、桌面与 iOS README 统一到 1.11.0 / 3.8.0；新增九章页内使用指南。
- 版本：macOS / Windows **1.11.0**（源码）；iOS **3.8.0 (31)**；美股 **1.0.2**。

### 1.10.3

- **资产中枢菜单**：点击 HUB 中央资产中枢，直接打开「持仓管理 / 资产分析 / 投资建议 / 指数分析」，不再从「地域」页进入。
- **地域页精简**：移除资产分析、投资建议、指数分析三张跳转卡和对应的重复请求，地域页只保留地图、省份概览、领涨公司和搜索。
- **页面标题补全**：资产分析、投资建议、使用指南、笔记、异常提醒都有独立标题和副标题，不再显示 “StockDesk”。
- **端口与请求**：美股版端口被占用时自动顺延并打印实际地址；桌面端保持自动换端口；地域页不再重复请求组合、每日策略和指数数据。
- **文档与展示**：README、使用指南、安装文档、官网下载区和版本号统一到 macOS/Windows 1.10.3、iOS 3.7.3 (30)、美股 1.0.2；HUB 章节说明资产中枢菜单。

### 1.10.2

- **下载体积**：macOS 安装包从 94.3 MB 降到约 43 MB（DMG）/ 42 MB（ZIP）；Windows 单文件约 52 MB，移除未使用的重型依赖并保持全部功能。
- PyInstaller 现在排除 `pyarrow`、`scipy`、`matplotlib`、`PIL`、`openpyxl` 等未被桌面端实际调用的可选依赖；保留 pandas / numpy / akshare / lxml / curl_cffi 等运行必需项，并逐项做 API 冒烟测试。
- 新增 `desktop/package_macos.sh` 与 `desktop/build_win.ps1`，统一生成 DMG、ZIP、Windows exe 和 macOS SHA256 校验和。
- iOS KDJ 行业卡在东方财富板块分钟线不可达 / 限流时自动回退到标注的 ETF 代理（半导体 512480、通信设备 515880），5m / 30m 不再停在「暂无行情」。
- iOS 板块跟踪在东方财富板块列表不可达时回退到新浪行业 / 概念资金流，行业与概念标签都能出数据；板块分钟请求增加超时，避免长时间空白。
- iOS 修正北证 50 的新浪 `bj899050` 代码。
- 重新构建桌面前端与 macOS 应用包，确保 HUD 深色主题的极值提醒横幅对比度修复真正随包发布；同时加宽提醒底色、边框、文字与图标，并修正 HUB 中央「资产中枢 / 运行中」文字重叠。
- 新增带截图的详细功能与使用指南（`docs/GUIDE.md`），官网下载区统一到 1.10.2，并同步 README / INSTALL / PACKAGES 的版本与下载链接。
- 修复下载后首次打开失败：macOS DMG / ZIP 内置 `Install-StockDesk.command`，自动安装到 Applications 并清除 `com.apple.quarantine`；App 启动时检查前端资源，缺失/后端未启动会弹原生错误提示并写日志，不再静默空白。
- 前端增加启动占位与加载失败提示；Windows CI 增加首页和 JS/CSS 静态资源冒烟，避免只测 API 不测内容。
- 版本：macOS / Windows **1.10.2**；iOS **3.7.2 (29)**；美股 **1.0.1**。


### 1.10.1

- 修复东方财富在 IPv6 网络下 TLS 握手后断连的问题：仅对东方财富域名优先 IPv4，指数、行业、主力资金恢复。
- 全量行情恢复东方财富主路径：5,580 只 A 股，PE / PB / 总市值 / 换手率 / 主力净流入齐全；分页按代码稳定排序，不再漏股。
- 行业板块恢复真实 BK 代码、上涨/下跌家数与领涨股；KDJ 行业在板块分钟数据为空时自动使用 ETF 代理并标注。
- 修复 KDJ 预警横幅在 HUD 主题下白底白字、行业无数据、顶栏标题被裁切。
- 修复 120% / 150% 下热点榜股票名截断；标题栏随字号增高。
- 修复 iOS 源码多余花括号导致无法编译；HUB 启动自动刷新；网络熔断避免上游异常时长时间空白。
- 补齐 PWA manifest；缺失静态资源返回真实 404。
- CI 新增桌面 OpenAPI / 未定义名称检查、Swift 语法检查；容器标签更新。
- macOS / Windows 1.10.1；iOS 3.7.1 (28)；美股 1.0.1。

### 1.10.0

- 新增 KDJ 极值预警，使用 akshare 获取 5m / 30m 行情。
- 入口在 HUB 右侧「行业要闻」下方，独立页面。
- 上轨 `J ≥ 118` 超买，下轨 `J ≤ -14` 超卖；新增中证500、上证50、北证50。
- 行业板块限流时用 ETF 代理并标注；每 60 秒刷新。
- macOS / Windows 更新到 1.10.0。

### 1.9.0 / iOS 3.6 / 美股 1.0.0

- HUB 收敛到 7 个入口：左侧 3 个、右侧 4 个，白色按键更大，管理员名片并入左列。
- 每日策略与右侧第二行对齐，三种主题共用同一套 HUB 首页。
- 字体缩放 100% / 120% / 150%，只改文字，布局自动换行、增行。
- 中英双语：桌面顶栏、设置、iOS 设置、美股顶栏都能切换。
- 子页面支持完整长图分享，不再在 HUB 上显示分享按钮。
- 量化模型补充 HMM、渗流最大连通簇、行业临界和个股仓位建议。
- 新增美股版：指数、自选、搜索、K 线、榜单、宽度。
- macOS 窗口固定从主屏左上角打开；Windows 单文件使用 WebView2 原生窗口。
- 提供 A 股和美股两个 GHCR 容器。

## English

### 1.12.0

- **Local Ollama second opinion (macOS / Windows only)**: new `backend/ollama.py` and `/api/ollama/*` endpoints; Settings can configure host, model, temperature, timeout and max tokens, with connection test. Daily Plan and Models show a structured opinion (stance/exposure/rationale/risks/actions). Off by default; when Ollama or the model is missing the UI explains why and never auto-generates.
- **Model registry 2.2.0**: HMM 2.1.0 (filtered online state, separation/quality, risk score, suggested exposure); percolation 2.1.0 (12-run bootstrap interval/stability, trend/delta); TD 1.1.0 (quality/freshness/completion). Adds a transparent composite score (HMM 42% / percolation 38% / TD 20%).
- **Display fixes**: NaN/Infinity guards in desktop and iOS formatters; Daily Plan shows composite score, agreement, quality and component scores; Models adds a composite card, component bars, drivers, filtered state, bootstrap, trend and TD quality/freshness; readable empty/error states.
- **Docs**: new `docs/OLLAMA.md`; README, guide, models, architecture, install, site and iOS README updated to 1.12.0 / 3.9.0.
- Versions: macOS/Windows **1.12.0**, iOS **3.9.0 (32)**, US **1.0.2**.

### 1.11.0

- **Navigation**: the HUB centre now opens Portfolio directly; the former Industry News entry is Index Analysis; the sidebar gains a full Guide. Asset Analysis and Advice moved into Portfolio.
- **Daily Plan rebuilt**: market snapshot, model conclusion, main-force flow, index analysis, TD (nine-turn), industry focus, industry headlines, position advice and candidates on one page. Industry and market headlines are merged into one filterable list; every item opens the full Eastmoney article.
- **Main-force flow fixed**: split into stock inflow / stock outflow / industry inflow, correct red-up/green-down colours, no null rows leaking into outflow, no duplicate concurrent fetches; adds a flow-leader net figure and data source.
- **Portfolio**: four views — overview, asset analysis, advice, trades. Asset analysis includes allocation, concentration, monthly returns and trading habits; advice includes position sizing, market temperature, watchlist for the next two weeks and today's candidates. Old routes redirect.
- **Index Analysis**: former Industry News slot and page now hold A-share and global index analysis with trend, moving averages, RSI, MACD, support/resistance and conclusions.
- **TD Sequential**: new `backend/td.py` and `/api/market/td/{code}`; 9-bar setup and 13-bar countdown across five indices, portfolio holdings and critical-industry leaders, with plain-language readings. The stock detail page gains TD and industry-focus cards.
- **HMM 2.0**: multi-start Baum-Welch, confidence/entropy, regime age, flip risk and per-state return/volatility/Sharpe/win-rate statistics.
- **Percolation 2.0**: stable-hash lattice, spanning check, susceptibility, random-layout baseline and p-value, block-aggregated 50×50 map, industry/market grouping.
- **Model registry 2.1.0**: HMM 2.0.0, percolation 2.0.0, TD 1.0.0; the offline selftest now covers TD.
- **Review charts**: distinct colours for NAV/MA20/MA60 and account/CSI 300; single-day accounts show a point plus an explanation instead of a blank chart.
- **Regions**: all 34 province-level divisions are switchable with search, previous/next and map linkage; the overview lists industries and leaders.
- **Heatmap**: click-to-drill with breadcrumb, stock click-through, search, up/down filters, reset and hover emphasis; tiny tiles are hidden so the overview is readable.
- **Performance/resilience**: short Eastmoney circuit breaker, Sina daily fallback, single-flight locks for the full snapshot / boards / fund flow, and stale-while-revalidate for the daily brief.
- **iOS 3.8.0**: HUB centre opens Portfolio, Index Analysis entry, three-column main-force flow, model conclusion and TD cards, portfolio shortcuts.
- **Docs**: README, guide, models, architecture, site and screenshots updated to 1.11.0 / 3.8.0; new nine-chapter in-app Guide.
- Versions: macOS/Windows **1.11.0** (source), iOS **3.8.0 (31)**, US **1.0.2**.

### 1.10.3

- **Asset hub menu**: clicking the central hub now opens Portfolio, Asset Analysis, Advice and Index Analysis directly; these entries no longer live under Regions.
- **Regions cleanup**: removed the three jump cards and their duplicate requests; Regions now only keeps the map, province overview, leaders and search.
- **Page titles**: Asset Analysis, Advice, Guide, Notes and Anomalies now have their own titles/subtitles instead of “StockDesk”.
- **Ports and requests**: the US edition picks the next free port and prints the real URL; the desktop launcher keeps auto-port behavior; Regions no longer re-fetches portfolio, daily and index data.
- **Docs/site**: synced to macOS/Windows 1.10.3, iOS 3.7.3 (30), US 1.0.2; the HUB chapter describes the asset-hub menu.

### 1.10.2

- **Download size**: the macOS package drops from 94.3 MB to about 43 MB (DMG) / 42 MB (ZIP); the Windows one-file exe stays around 52 MB after removing unused heavy dependencies, with all features intact.
- PyInstaller now excludes `pyarrow`, `scipy`, `matplotlib`, `PIL`, `openpyxl` and other optional packages the desktop app never imports; pandas / numpy / akshare / lxml / curl_cffi stay, and every endpoint is smoke-tested.
- Added `desktop/package_macos.sh` and `desktop/build_win.ps1` to produce DMG, ZIP, the Windows exe and macOS SHA256 checksums reproducibly.
- iOS KDJ sector cards now fall back to the labelled ETF proxy (semiconductor 512480, communications equipment 515880) when Eastmoney board-minute data is unreachable or rate-limited, so 5m / 30m no longer sit on "no data".
- iOS sector tracking falls back to the Sina industry / concept money-flow list when the Eastmoney board list is unreachable, and board-minute requests now time out quickly instead of leaving a blank panel.
- Fixed the Sina symbol for the BSE 50 index (`bj899050`).
- Rebuilt the desktop frontend and macOS app bundle so the HUD warning-banner contrast fix is actually shipped; widened the banner background, border, text and icon, and fixed the overlapping "asset hub / running" label.
- Added a screenshot-guided feature and usage guide (`docs/GUIDE.md`), moved the site download section to 1.10.2, and synced versions / links across README / INSTALL / PACKAGES.
- Fixed first-launch failures after download: macOS DMG/ZIP now includes `Install-StockDesk.command`, which installs to Applications and clears `com.apple.quarantine`; the app checks bundled frontend assets and shows a native error dialog (plus log) when startup fails instead of a silent blank window.
- Added a frontend boot placeholder/error message; Windows CI now also checks the index page and JS/CSS assets, not just APIs.
- Versions: macOS / Windows **1.10.2**; iOS **3.7.2 (29)**; US **1.0.1**.


### 1.10.1

- Fixed Eastmoney dropping the connection after the TLS handshake on IPv6 networks: Eastmoney hosts now prefer IPv4, restoring indices, sectors and main fund flow.
- The full snapshot uses Eastmoney again: 5,580 A-shares with PE / PB / market cap / turnover / main inflow; pages are sorted by code so no listings are skipped.
- Sector boards return real BK codes, up/down counts and leaders; KDJ sectors fall back to a labelled ETF proxy when board minute bars are empty.
- Fixed the KDJ warning banner being white-on-white in the HUD theme, missing sector data, and clipped page titles.
- Fixed clipped stock names in the heat list at 120% / 150%; the top bar now grows with the font scale.
- Fixed a stray brace that stopped the iOS target from compiling; the HUB refreshes on launch and an outage breaker avoids long blank states.
- Added the PWA manifest and real 404s for missing static assets.
- CI now checks the desktop OpenAPI schema, undefined names and Swift syntax; container tags updated.
- macOS / Windows 1.10.1; iOS 3.7.1 (28); US 1.0.1.

### 1.10.0

- Added KDJ extreme-zone alerts using akshare 5m / 30m bars.
- Entry sits under Industry News in the HUB right column, on a dedicated page.
- `J >= 118` overbought, `J <= -14` oversold; added CSI 500, SSE 50 and BSE 50.
- Sectors fall back to an ETF proxy when rate-limited and are marked as such; 60-second refresh.
- macOS / Windows updated to 1.10.0.

### 1.9.0 / iOS 3.6 / US 1.0.0

- The HUB is now seven entries: three on the left and four on the right, with larger silver buttons and the admin plate tucked under the left column.
- Daily Plan lines up with the second row on the right; HUD, light and dark themes share the same HUB home.
- Font scaling at 100% / 120% / 150% changes text only; layout wraps and grows rows automatically.
- Chinese / English switch in the desktop top bar, Settings, iOS Settings and the US top bar.
- Detail pages can share a full-page image; the HUB no longer shows a share button.
- Quant models now include HMM, percolation giant component, industry criticality and per-stock position guidance.
- New US edition with indices, watchlist, search, candles, movers and breadth.
- The macOS window opens at the top-left of the primary display; the Windows one-file build uses a native WebView2 window.
- Two GHCR containers: A-share and US.
