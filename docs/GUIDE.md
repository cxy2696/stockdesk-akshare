# 使用教程与流程 · Guide & Workflow

[中文](#中文) · [English](#english) · [下载页](https://cxy2696.github.io/stockdesk-akshare/#download) · [Release v1.10.2](https://github.com/cxy2696/stockdesk-akshare/releases/tag/v1.10.2)

> 适用版本：macOS / Windows **1.10.2** · iOS **3.7.2** · 美股 **1.0.1**
>
> 这份指南按「安装 → 第一次打开 → 每个页面做什么 → 每天怎么用 → 数据与排错」组织。第一次使用只需要走完前两节；后面的页面详解可以当作字典，需要时再翻。

---

## 中文

### 0. 先选一个适合自己的版本

| 你的情况 | 建议使用 | 直接下载 | 大小 |
| --- | --- | --- | --- |
| macOS 12+，Apple Silicon | macOS App | [`StockDesk-macOS-1.10.2.dmg`](https://github.com/cxy2696/stockdesk-akshare/releases/download/v1.10.2/StockDesk-macOS-1.10.2.dmg) | 约 43 MB |
| macOS，想自己解压 | macOS ZIP | [`StockDesk-macOS-1.10.2.zip`](https://github.com/cxy2696/stockdesk-akshare/releases/download/v1.10.2/StockDesk-macOS-1.10.2.zip) | 约 42 MB |
| Windows 10/11 x64 | Windows exe | [`StockDesk.exe`](https://github.com/cxy2696/stockdesk-akshare/releases/download/v1.10.2/StockDesk.exe) | 约 52 MB |
| iPhone，iOS 17+ | iOS IPA | [`StockDesk-iOS-3.7.2-unsigned.ipa`](https://github.com/cxy2696/stockdesk-akshare/releases/download/v1.10.2/StockDesk-iOS-3.7.2-unsigned.ipa) | 约 1.3 MB |
| 浏览器 / NAS / 服务器 | Docker | `ghcr.io/cxy2696/stockdesk-akshare-a-share:latest` | — |
| 想改代码 | 源码 | 见第 8 节 | — |

- macOS 包只有 Apple Silicon 版本；Intel Mac 请从源码运行或使用容器。
- 所有文件都在 [Releases v1.10.2](https://github.com/cxy2696/stockdesk-akshare/releases/tag/v1.10.2)；macOS 下载目录里有 `SHA256SUMS-macOS.txt` 可校验。
- 1.10.2 的安装包已剔除 `pyarrow`、`scipy`、`matplotlib` 等未使用依赖，macOS 从 94.3 MB 降到约 43 MB，下载和解压时间明显缩短，功能不受影响。

### 1. 安装

#### 1.1 macOS：DMG（推荐）

1. 下载 `StockDesk-macOS-1.10.2.dmg`。
2. 双击打开，双击 **`Install-StockDesk.command`**。如果 macOS 提示无法打开，右键该脚本 → **打开**。
3. 脚本会复制到 Applications、清除浏览器的下载隔离标记并启动 App。
4. 看到 HUD 指挥舱即安装完成。账户数据保存在 `~/Library/Application Support/StockDesk`。

也可以手动把 **StockDesk** 拖进 **Applications**，然后在终端执行：

```bash
xattr -dr com.apple.quarantine /Applications/StockDesk.app
open /Applications/StockDesk.app
```

> 为什么需要这一步：安装包使用本机 ad-hoc 签名，没有付费 Apple Developer ID / 公证。macOS 会给浏览器下载的文件加 `com.apple.quarantine`，Gatekeeper 因此拒绝启动；清除标记不会降低系统安全性，也不会修改 App 内容。

#### 1.2 macOS：ZIP

下载 ZIP → 双击解压 → 双击 `Install-StockDesk.command`。脚本内容与 DMG 完全一致。

#### 1.3 Windows：单文件 exe

1. 下载 `StockDesk.exe`。
2. 双击运行。Windows 10/11 会使用系统自带的 Edge WebView2 打开原生窗口。
3. 如果提示缺少 WebView2 Runtime，安装微软的 [WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/) 后重试；没有 WebView2 时程序会退回默认浏览器。
4. 数据保存在 `%LOCALAPPDATA%\StockDesk`。

#### 1.4 iOS：未签名 IPA

iOS 不允许直接安装未签名 App，需要用你自己的 Apple ID 重签一次：

1. 下载 `StockDesk-iOS-3.7.2-unsigned.ipa`。
2. 用 [Sideloadly](https://sideloadly.io) / AltStore / SideStore 登录 Apple ID 重签并安装；或者用 Xcode 打开 `ios/StockDesk.xcodeproj`，选择自己的 Team 后运行到真机。
3. 首次运行到「设置 → 通用 → VPN 与设备管理」信任开发者证书。
4. 免费 Apple ID 的签名 7 天后过期，重新签一次即可。

> iOS 版完全独立，不需要 Mac 后端；行情、持仓、复盘、回测、KDJ 都在手机本地完成。

#### 1.5 Docker（浏览器 / NAS）

```bash
docker run --rm -p 8765:8765 \
  -v stockdesk-data:/data \
  ghcr.io/cxy2696/stockdesk-akshare-a-share:latest
```

打开 <http://127.0.0.1:8765>。美股版：

```bash
docker run --rm -p 8770:8770 \
  ghcr.io/cxy2696/stockdesk-akshare-us:latest
```

打开 <http://127.0.0.1:8770>。两个容器互不影响，可以同时运行。

### 2. 第一次打开：五分钟走完

![StockDesk HUB 指挥舱](assets/hub.png)

*图 1 · HUB 指挥舱：中央资产中枢，左侧 3 个入口，右侧 5 个模块，底部 LIVE 状态栏。*

1. **看 HUB**：中央是资产中枢，左侧「每日策略 / 板块跟踪 / 收益复盘」，右侧「策略回测 / 地域 / 行业要闻 / 量化模型 / KDJ预警」。顶部图标依次是设置、异常提醒、笔记、自选、搜索。
2. **设置账户**：点顶部齿轮 → 设置初始资产、管理员名称和 UID。初始资产只是收益基准，后面可以改。
3. **记一笔交易**：进入资产中枢查看持仓，点「记一笔交易」，填代码、方向、价格、数量、日期。总资产 = 可用现金 + 持仓市值。
4. **加自选**：点顶部星号，输入代码或名称搜索，加入自选。
5. **看今天的策略**：回到 HUB，点「每日策略」，先看市场状态、仓位建议、风险提示和今日标的。
6. **看量化模型**：点右侧「量化模型」，HMM 给出总仓位区间，渗流给出行业和标的扩散情况。
7. **看 KDJ**：点右侧「KDJ预警」，先看 5m / 30m 是否进入极值区；行业板块数据缺失时会自动使用并标注 ETF 代理。
8. **分享**：进入任意子页面，点右下角分享按钮，生成当前页面的完整长图，可发到微信或 Notes。

### 3. 功能地图

| 模块 | 一句话说明 | 主要看什么 |
| --- | --- | --- |
| HUB 指挥舱 | 所有功能的入口 | 总资产、今日盈亏、仓位、市场温度、LIVE 状态 |
| 每日策略 | 今天该进攻还是防守 | 市场状态、仓位建议、今日标的、行业趋势、要闻 |
| 自选行情 | 关注的标的 | 实时价格、涨跌幅、20/60 日迷你走势 |
| 持仓账簿 | 交易与成本 | 持仓、成本、浮动/已实现盈亏、交易流水 |
| 收益复盘 | 账户表现 | 净值、回撤、年化、夏普、Beta、月度收益、个股贡献 |
| 板块跟踪 | 行业/概念/情绪/热图 | 板块涨跌、主力流入、涨停池、个股热图、形态选股 |
| 策略回测 | 用历史数据检验规则 | 10 套策略、资金曲线、交易明细、夏普/回撤 |
| 量化模型 | 描述当前结构 | HMM 仓位、渗流最大连通簇、行业临界、个股建议 |
| 地域 | 中国上市公司地图 | 省份分布、省份龙头、城市行业偏好 |
| 行业要闻 | 行业新闻与关键标的 | 行业情况、消息面、投资趋势 |
| KDJ 预警 | 极值提示层 | 5m / 30m 的 K/D/J、RSV、MA5/20、量比、中枢 |
| 设置 | 账户与外观 | 初始资产、主题、缩放、语言、缓存、数据目录 |
| 分享 | 导出当前页面 | 完整长图，适合微信/Notes |

### 4. 页面详解

#### 4.1 HUB 指挥舱

![HUB 指挥舱](assets/hub.png)

- **中央资产中枢**：点一下进入持仓管理；显示总资产、运行状态和扫描动画。
- **左侧三个入口**：每日策略、板块跟踪、收益复盘。
- **右侧五个入口**：策略回测、地域、行业要闻、量化模型、KDJ预警。
- **顶部图标**：设置、异常提醒、笔记、自选、搜索。
- **底部 LIVE**：上证指数、涨跌家数、成交额、主力净流入、当前时间、数据时间。
- **管理员名片**：显示名称、UID、资产等级、总资产和今日涨跌。
- **主题与缩放**：设置里可切换 HUD / 亮色 / 深色，100% / 120% / 150%。缩放只放大文字，地图和固定图形不拉伸。

#### 4.2 每日策略

![每日策略](assets/daily.png)

- **每日行情**：指数点位、涨跌家数、涨停/跌停、成交额、市场温度、结论。
- **行情分析**：7 / 20 / 30 / 60 日涨跌，MA5/10/20/60、RSI、MACD、九转、底部钝化、支撑/压力。
- **行业趋势**：资金流入靠前的行业和 5/20/60 日趋势。
- **今日标的**：按形态 + 量价 + 资金筛选出的候选，不是买入指令。
- **仓位建议**：结合市场温度和账户回撤给出总仓位区间。
- **行情要闻**：当天的主要消息，帮助理解异动原因。

#### 4.3 自选行情

- 顶部搜索框输入 6 位代码或名称。
- 每行显示现价、涨跌幅、20/60 日迷你走势；点进去是个股详情。
- 个股详情包含日/周/月 K 线、MA、成交量、MACD、九转、筹码分布、黄金分割、支撑压力、公司概况和财务指标。
- 左滑可以删除自选；数据只保存在本机。

![筹码分布](assets/chips.png)

*图 · 个股详情的筹码分布：平均成本、获利比例、90% 成本区间、集中度和支撑/压力。*

#### 4.4 持仓账簿

![持仓与复盘](assets/portfolio.png)

- **总资产** = 可用现金 + 持仓市值；初始资产只是收益基准。
- **持仓表**：数量、成本价、现价、浮动盈亏、仓位、支撑/压力。
- **交易流水**：新增、编辑、删除交易；支持分红/送转等调整。
- **成本**：移动平均成本；卖出后计算已实现盈亏。
- **单票上限 / 现金下限**：在投资建议里给出风险提示，例如某只票权重超过单票上限会标黄。
- **数据备份**：退出 App 后复制数据目录即可；详见第 7 节。

#### 4.5 收益复盘

- **核心指标**：累计收益、年化、最大回撤、夏普、超额收益。
- **净值曲线**：账户净值 vs 沪深 300 / 上证基准。
- **复盘总结**：自动生成一段可读的总结，指出收益来源和风险。
- **月度收益热力图**：看哪几个月贡献最大/回撤最深。
- **交易统计**：FIFO 胜率、盈亏比、平均持有天数、个股贡献。
- **仓位管理推荐**：当前仓位 vs 建议仓位，以及减仓/加仓的具体动作。

#### 4.6 板块跟踪

![板块跟踪](assets/screener.png)

- **板块跟踪**：行业 / 概念两个标签；显示板块涨跌幅、主力净流入、领涨股。
- **市场情绪**：涨跌家数、涨停池、跌停池、连板高度、成交额。
- **个股热图**：按行业分组的全市场热图，颜色越深波动越大。
- **形态选股**：10 类形态（突破、回踩、放量、九转等）扫描。
- **数据回退**：东方财富板块接口不可达时，行业 / 概念会自动回退到新浪资金流；此时板块代码是 `SINA*`，没有成分股列表，但涨跌和资金流仍可用。

#### 4.7 策略回测

- 10 套策略：双均线、动量突破、RSI、MACD、布林带、唐奇安通道、均线+RSI、布林突破、KDJ、放量突破。
- 参数：快/慢均线、回看天数、阈值、手续费、印花税、滑点、初始资金。
- 结果：总收益、年化、基准、超额、最大回撤、波动率、夏普、Sortino、Calmar、交易次数、胜率、盈亏比、平均持有天数。
- 资金曲线 + 完整交易明细；次日开盘成交，避免未来函数。
- 回测是单标的全仓模型，不处理停牌、涨跌停无法成交等情况，只用于研究。

#### 4.8 量化模型

![量化模型](assets/models.png)

- **HMM**：5 个 A 股核心指数的 3 状态隐马尔可夫模型，输出强势/震荡/弱势和总仓位建议。
- **渗流**：把上涨股票看成 4 邻接网格，找最大连通簇，区分「普涨扩散」和「少数股票在动」。
- **行业临界**：哪些行业接近临界点，可能带动扩散。
- **个股仓位建议**：结合你的真实持仓，给出参考仓位、加减仓区间和理由。
- 模型只描述当前结构，不预测点位；不要把它当成买卖信号。

#### 4.9 KDJ 极值预警

![KDJ 极值预警](assets/kdj.png)

- **阈值**：上轨 `J ≥ 118` 超买，下轨 `J ≤ -14` 超卖。
- **周期**：5 分钟偏即时，30 分钟偏质量；任一周期触发即提示。
- **标的**：半导体、通信设备 + 9 个 A 股指数（上证、深证、创业板、沪深300、中证500、中证1000、科创50、上证50、北证50）。
- **图表**：K 线 + K/D/J 副图 + 近似中枢；指标包括 K、D、J、RSV、MA5、MA20、量比、中枢位置、J 变化、拐头、趋势。
- **数据回退**：东方财富板块分钟线不可达时，行业卡会使用并标注 ETF 代理（半导体 512480、通信设备 515880）；指数走新浪分钟线。iOS 端同样支持。
- **刷新**：每 60 秒自动刷新，也可以点「刷新」手动拉取。
- **提醒横幅**：有标的触发时显示深琥珀色警告条，列出触发标的和方向。
- 只做提示，不是交易指令；极值可以持续，不追涨杀跌。

#### 4.10 地域与行业要闻

- **地域**：中国上市公司分布地图，支持缩放；省份分布、省份龙头、城市行业偏好。
- **行业要闻**：行业情况分析、消息面、投资趋势和关键标的。
- **资产分析 / 投资建议 / 指数分析**：从资产中枢的弹出菜单进入，分别看资金分配、交易偏好、未来趋势和指数结论。

#### 4.11 设置

![设置](assets/settings.png)

- **账户**：初始资产、管理员名称、UID。
- **外观**：HUD / 亮色 / 深色；100% / 120% / 150% 缩放。
- **语言**：中文 / English。
- **数据**：数据目录、缓存清理、账户数据备份提示。
- **屏幕方向**（iOS）：自动旋转 / 锁定竖屏 / 锁定横屏。

#### 4.12 分享

- 进入任意子页面后，右下角出现分享按钮。
- 点击后把当前页面的滚动内容拼接成一张完整长图。
- 支持系统分享面板：微信、Notes、文件等。
- HUB 首页不显示分享按钮，避免分享到一半的页面。

### 5. iOS 版

![iPhone HUB](assets/ios-hub.png)

- 完全独立的 SwiftUI App，不依赖 Mac 后端。
- HUB 顶部：设置、异常提醒、笔记、自选、搜索；中间资产中枢；下方 3+5 个模块。
- 支持 100% / 120% / 150% 缩放；150% 自动切单列 HUB。
- 支持自动旋转 / 锁定竖屏 / 锁定横屏。
- 账户数据保存在 App 沙盒的 `stockdesk.json`，卸载即删除。

![iPhone KDJ](assets/ios-kdj.png)

- KDJ 行业卡在东方财富板块分钟线不可达时自动使用 ETF 代理，并显示「ETF代理」标签。
- 指数卡走新浪分钟线；北证 50 使用 `bj899050`。
- 加载时显示「正在连接行情…」，无数据时显示「暂无」而不是「正常」。

![iPhone 板块跟踪](assets/ios-market.png)

- 行业 / 概念板块在东方财富不可达时回退到新浪资金流，仍能看到涨跌、资金流和领涨股。
- 板块详情里的成分股需要东方财富 BK 代码；回退板块没有成分股列表。

### 6. 美股版

![US dashboard](assets/us.png)

```bash
cd us
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python run.py --port 8770
```

打开 <http://127.0.0.1:8770>。功能包括指数、自选、搜索、日 K、榜单、市场宽度；页面和 ECharts 都在本地，不需要 Node.js 构建。

### 7. 数据、备份、迁移

| 平台 | 数据目录 |
| --- | --- |
| macOS | `~/Library/Application Support/StockDesk` |
| Windows | `%LOCALAPPDATA%\StockDesk` |
| iOS | App 沙盒 |
| Docker | 挂载到 `/data` |

- 备份：退出 App，复制整个目录。
- 恢复：先退出 App，再把目录放回原位置。
- 行情缓存可以丢，账户、交易、自选、笔记和提醒最重要。
- 想重新开始：退出 App，备份并移走数据目录，再启动会创建新的空账户。

### 8. 从源码启动

```bash
git clone https://github.com/cxy2696/stockdesk-akshare.git
cd stockdesk-akshare/desktop
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt

cd frontend
npm ci
npm run build
cd ..

python main.py
```

只想在浏览器调试：

```bash
python main.py --browser
```

macOS 打包：

```bash
cd desktop
VERSION=1.10.2 ./package_macos.sh
```

Windows 打包：

```powershell
cd desktop
powershell -ExecutionPolicy Bypass -File .\build_win.ps1
```

### 9. 每天的使用顺序

```
打开 HUB
  → 看底部 LIVE：指数、涨跌家数、成交额、数据时间
  → 每日策略：今天该进攻还是防守
  → 持仓：有没有需要止损/减仓的标的
  → 板块/情绪/热图：市场扩散还是只剩少数板块
  → 量化模型：HMM 仓位 + 渗流行业 + 个股建议
  → KDJ 预警：5m / 30m 是否进入极值区
  → 复盘：记录今天的判断，必要时分享
```

不建议每天频繁改仓位。HMM 和渗流是「描述现在」，不是预测明天；把它们当成仓位纪律和风险提示，而不是买卖信号。

### 10. 常见问题

- **下载很慢**：优先用 DMG（约 43 MB）或 ZIP（约 42 MB）；Windows exe 已精简到约 52 MB。GitHub Releases 支持断点续传，网络不稳时可以重试。
- **macOS 提示未签名 / 已损坏 / 无法打开**：不要直接双击 App。先运行安装包里的 `Install-StockDesk.command`；或手动执行 `xattr -dr com.apple.quarantine /Applications/StockDesk.app`。如果仍被拦截，到「系统设置 → 隐私与安全性」点「仍要打开」。
- **macOS 打开后空白 / 内容加载失败**：先确认 App 是从 Applications 启动，而不是 DMG 里的临时路径；再查看 `~/Library/Application Support/StockDesk/stockdesk.log`。1.10.2 在启动失败时会弹出原生错误提示，不再只显示空白窗口。
- **Windows 没有窗口 / 请求失败**：确认 WebView2 Runtime 已安装；没有时会退回浏览器。SmartScreen 拦截时点「更多信息 → 仍要运行」；仍无窗口可运行 `StockDesk.exe --browser`，并查看 `%LOCALAPPDATA%\StockDesk\stockdesk.log`。
- **iOS 安装失败**：IPA 未签名，必须用自己的 Apple ID 重签；免费签名 7 天有效。
- **端口被占用**：启动器会自动往后找空闲端口，看终端或日志里的实际地址。
- **数据看起来不对**：先刷新，再检查网络；行情来自公开接口，可能延迟。东方财富不可达时，板块/KDJ 会自动回退到新浪/ETF 代理，并在界面标注。
- **想清空缓存**：设置 → 数据 → 清理行情缓存；不会删除账户和交易。
- **想更新版本**：下载新版本覆盖 App；账户数据在数据目录，不会被覆盖。iOS 重新签名安装会保留沙盒数据，除非卸载。

### 11. 版本与发布流程

```
修改源码
  → 本地 npm build / python compileall / iOS build
  → 提交并推送到 main
  → GitHub Actions CI 编译检查
  → 需要发版时：
       - 打 tag，创建 Release，上传 macOS/Windows/iOS 产物
       - 需要容器时，手动运行 Publish containers
       - GHCR 构建并做 /api/health 或 /api/us/health 冒烟检查
  → 用户从 Release 或 Packages 下载
```

---

## English

### 0. Choose your edition

| Your setup | Recommended | Direct download | Size |
| --- | --- | --- | --- |
| macOS 12+, Apple Silicon | macOS app | [`StockDesk-macOS-1.10.2.dmg`](https://github.com/cxy2696/stockdesk-akshare/releases/download/v1.10.2/StockDesk-macOS-1.10.2.dmg) | ~43 MB |
| macOS, prefer a zip | macOS ZIP | [`StockDesk-macOS-1.10.2.zip`](https://github.com/cxy2696/stockdesk-akshare/releases/download/v1.10.2/StockDesk-macOS-1.10.2.zip) | ~42 MB |
| Windows 10/11 x64 | Windows exe | [`StockDesk.exe`](https://github.com/cxy2696/stockdesk-akshare/releases/download/v1.10.2/StockDesk.exe) | ~52 MB |
| iPhone, iOS 17+ | iOS IPA | [`StockDesk-iOS-3.7.2-unsigned.ipa`](https://github.com/cxy2696/stockdesk-akshare/releases/download/v1.10.2/StockDesk-iOS-3.7.2-unsigned.ipa) | ~1.3 MB |
| Browser / NAS / server | Docker | `ghcr.io/cxy2696/stockdesk-akshare-a-share:latest` | — |
| Want to modify code | Source | See section 8 | — |

The 1.10.2 packages exclude unused heavy dependencies (`pyarrow`, `scipy`, `matplotlib`, etc.); the macOS download dropped from 94.3 MB to about 43 MB without changing features.

### 1. Install

#### macOS (DMG)

1. Download `StockDesk-macOS-1.10.2.dmg`.
2. Open it and double-click **`Install-StockDesk.command`**. If macOS warns, right-click the script → **Open**.
3. The script copies the app to Applications, clears the browser quarantine flag, and launches it.
4. Account data lives in `~/Library/Application Support/StockDesk`.

You can also drag **StockDesk** into **Applications** manually and run:

```bash
xattr -dr com.apple.quarantine /Applications/StockDesk.app
open /Applications/StockDesk.app
```

> Why: the app is ad-hoc signed (no paid Developer ID/notarization), so a downloaded copy carries `com.apple.quarantine` and Gatekeeper refuses to launch it. Clearing the flag does not modify the app and does not disable Gatekeeper.

#### macOS (ZIP)

Download, unzip, and double-click `Install-StockDesk.command`. Same contents as the DMG.

#### Windows

1. Download `StockDesk.exe`.
2. Double-click it. Windows 10/11 uses the Edge WebView2 native window.
3. If WebView2 Runtime is missing, install it from Microsoft and retry; without it the app falls back to the browser.
4. Data lives in `%LOCALAPPDATA%\StockDesk`.

#### iOS

The IPA is unsigned. Re-sign it with your own Apple ID using Sideloadly / AltStore / SideStore, or open `ios/StockDesk.xcodeproj` in Xcode, select your Team and run on a device. Trust the developer certificate under Settings → General → VPN & Device Management. A free Apple ID signature expires after 7 days.

#### Docker

```bash
docker run --rm -p 8765:8765 -v stockdesk-data:/data ghcr.io/cxy2696/stockdesk-akshare-a-share:latest
# US edition
docker run --rm -p 8770:8770 ghcr.io/cxy2696/stockdesk-akshare-us:latest
```

### 2. First five minutes

![StockDesk HUB](assets/hub.png)

1. **HUB**: central asset hub, three actions on the left, five modules on the right, live bar at the bottom.
2. **Settings**: gear icon → initial assets, admin name and UID.
3. **Record a trade**: Portfolio → record a trade (symbol, side, price, quantity, date).
4. **Watchlist**: star icon → search by ticker or name.
5. **Daily Plan**: market state, position advice and candidates.
6. **Quant Models**: HMM exposure + percolation industries/names.
7. **KDJ Alerts**: 5m / 30m extreme zones; sector cards label the ETF proxy when board-minute data is unavailable.
8. **Share**: open any detail page and use the share button for a full-page image.

### 3. Feature map

| Module | What it answers | What to look at |
| --- | --- | --- |
| HUB | Where do I start? | Total assets, today's P&L, exposure, market temperature, live bar |
| Daily Plan | Attack or defend? | Market state, position sizing, candidates, trends, news |
| Watchlist | How are my names doing? | Quote, change, 20/60-day sparkline |
| Portfolio | What do I own? | Positions, cost, unrealized/realized P&L, trades |
| Review | How is the account doing? | NAV, drawdown, annualized, Sharpe, Beta, monthly returns, contribution |
| Sectors | Where is the money? | Industry/concept boards, inflow, mood, heatmap, patterns |
| Backtest | Does the rule work? | 10 strategies, equity curve, trades, Sharpe/drawdown |
| Quant models | What is the market structure? | HMM exposure, percolation cluster, industry criticality, per-stock advice |
| Regions | Where are the companies? | Province map, leaders, city/industry preference |
| Industry news | What happened? | Sector headlines, key names, trend |
| KDJ alerts | Is J at an extreme? | 5m / 30m K/D/J, RSV, MA5/20, volume ratio, central zone |
| Settings | How do I personalize it? | Assets, theme, scale, language, cache, data folder |
| Share | How do I export? | Full-page image for WeChat / Notes |

### 4. Page-by-page

- **HUB**: click the central disc for Portfolio; left entries open Daily Plan, Sectors and Review; right entries open Backtest, Regions, Industry News, Quant Models and KDJ Alerts; top icons open Settings, Anomalies, Notes, Watchlist and Search.
- **Daily Plan**: market snapshot, multi-period analysis, industry trends, candidates, position range, news. The candidate list is research, not a buy signal.
- **Watchlist**: add by code/name, open a stock for candles, MA, volume, MACD, nine-turn, chips, Fibonacci, support/resistance, company profile and financials.
- **Portfolio**: total assets = cash + market value; moving-average cost; add/edit/delete trades; support/resistance per position; realized and unrealized P&L.
- **Review**: cumulative/annualized return, max drawdown, Sharpe, excess return, NAV vs CSI 300 / SSE, monthly heatmap, FIFO win rate, per-stock contribution, position advice.
- **Sectors**: industry/concept boards, mood, limit-up pool, heatmap, pattern screener. If Eastmoney is unreachable, the board list falls back to Sina money flow and is labelled by its `SINA*` code; such boards have no constituent list.
- **Backtest**: 10 strategies, next-open execution, fees/stamp duty/slippage, equity curve and full trade list. It is a single-symbol, full-position research model.
- **Quant Models**: 3-state HMM on five indices, percolation giant component, industry criticality and per-stock position guidance. It describes the present, not the future.
- **KDJ Alerts**: `J >= 118` overbought, `J <= -14` oversold; two sectors + nine indices; 5m/30m; approximate central zone; 60-second refresh; a labelled ETF proxy keeps sector cards live when Eastmoney board-minute bars are unavailable. Desktop and iOS behave the same way.
- **Regions / Industry News**: China listed-company map, province leaders, city/industry preference; sector headlines and key names.
- **Settings**: initial assets, admin name/UID, HUD/light/dark theme, 100%/120%/150% text scale, Chinese/English, cache cleanup, data folder, iOS orientation.
- **Share**: full-page long image from any subpage; the HUB intentionally hides the share button.

### 5. iOS

![iPhone HUB](assets/ios-hub.png)

- Standalone SwiftUI app; no Mac backend required.
- HUB top icons: Settings, Anomalies, Notes, Watchlist, Search; 3+5 module buttons; central asset hub.
- 100% / 120% / 150% scale; 150% switches to a single-column HUB.
- Auto-rotate / lock portrait / lock landscape.
- Account data is stored in the app sandbox (`stockdesk.json`); uninstalling deletes it.

![iPhone KDJ](assets/ios-kdj.png)

- KDJ industry cards fall back to the labelled ETF proxy when Eastmoney board-minute data is unavailable; indices use Sina minute bars; BSE 50 uses `bj899050`.
- The loading state says "connecting"; a card with no data shows "暂无" rather than "正常".

![iPhone sector tracking](assets/ios-market.png)

- Industry/concept boards fall back to Sina money flow when Eastmoney is unreachable; quotes, change and inflow remain usable. Constituent stocks still require Eastmoney BK codes.

### 6. US edition

![US dashboard](assets/us.png)

```bash
cd us
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python run.py --port 8770
```

Open <http://127.0.0.1:8770>. Indices, watchlist, search, daily candles, movers and breadth; the page and ECharts are bundled locally.

### 7. Data and backup

| Platform | Data folder |
| --- | --- |
| macOS | `~/Library/Application Support/StockDesk` |
| Windows | `%LOCALAPPDATA%\StockDesk` |
| iOS | app sandbox |
| Docker | mounted at `/data` |

Quit the app, copy the folder to back up, and put it back to restore. Market caches can be lost; account, trades, watchlist, notes and alerts matter.

### 8. Run from source

```bash
git clone https://github.com/cxy2696/stockdesk-akshare.git
cd stockdesk-akshare/desktop
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cd frontend && npm ci && npm run build && cd ..
python main.py
```

Browser-only: `python main.py --browser`.

macOS packaging: `cd desktop && VERSION=1.10.2 ./package_macos.sh`.

Windows packaging: `cd desktop && powershell -ExecutionPolicy Bypass -File .\build_win.ps1`.

### 9. Daily routine

```
HUB
  → LIVE bar: indices, breadth, turnover, data time
  → Daily Plan: attack or defend?
  → Portfolio: anything to stop out or trim?
  → Sectors / mood / heatmap: broad diffusion or just a few names?
  → Quant Models: HMM exposure + percolation + per-stock guidance
  → KDJ: 5m / 30m extreme zones
  → Review: write down the call, share if useful
```

Do not trade every day. HMM and percolation describe the present; they are risk context, not buy/sell signals.

### 10. FAQ

- **Slow download**: use the DMG (~43 MB) or ZIP (~42 MB); the Windows exe is about 52 MB. GitHub Releases supports resume, so retry on unstable networks.
- **macOS says unsigned / damaged / cannot open**: do not double-click the app directly. Run `Install-StockDesk.command` from the download, or run `xattr -dr com.apple.quarantine /Applications/StockDesk.app`. If it is still blocked, click "Open Anyway" in System Settings → Privacy & Security.
- **macOS opens but content is blank**: make sure you launched the copy in Applications, not the temporary DMG path, then check `~/Library/Application Support/StockDesk/stockdesk.log`. 1.10.2 now shows a native error dialog if startup fails instead of a silent blank window.
- **No window / request failure on Windows**: install WebView2 Runtime; otherwise the app opens in the browser. If SmartScreen blocks it, choose More info → Run anyway. You can also run `StockDesk.exe --browser` and check `%LOCALAPPDATA%\StockDesk\stockdesk.log`.
- **iOS install fails**: the IPA is unsigned; re-sign it with your Apple ID. Free signatures expire after 7 days.
- **Port in use**: the launcher picks the next free port; check the log.
- **Data looks wrong**: refresh and check the network. When Eastmoney is unreachable, sectors/KDJ fall back to Sina/ETF proxy and label it.
- **Clear cache**: Settings → Data → clear market cache; account and trades are untouched.
- **Update**: download the new package and replace the app; account data lives outside the app bundle and is preserved. Re-signing the iOS app keeps sandbox data unless you uninstall.

### 11. Release flow

```
edit source
  → local npm build / python compileall / iOS build
  → commit and push to main
  → GitHub Actions CI
  → release: tag, create Release, upload macOS/Windows/iOS assets
  → optional: run Publish containers
  → GHCR builds and smoke-tests /api/health or /api/us/health
  → users download from Releases or Packages
```
