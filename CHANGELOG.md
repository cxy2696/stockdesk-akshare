# Changelog · 更新记录

[中文](#中文) · [English](#english)

## 中文

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
