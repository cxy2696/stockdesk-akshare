# 使用教程与流程 · Guide & Workflow

[中文](#中文) · [English](#english)

## 中文

### 写在前面

如果你刚打开这个项目，不用急着把每个页面都点一遍。StockDesk 想解决的是一个很具体的问题：让你在一个安静的地方，把“市场怎么样、我的仓位怎么样、今天要不要动手”想清楚。

第一次使用，建议只做三件事：设置初始资产、记一笔真实交易、看一次每日策略。剩下的功能，等你真的需要时再打开。

### 先选一个适合自己的版本

| 你的情况 | 建议使用 | 怎么开始 |
| --- | --- | --- |
| 用 macOS，只想双击打开 | macOS App | 下载 Release 里的 ZIP，解压后打开 `StockDesk.app` |
| 用 Windows 10/11，想要独立窗口 | Windows exe | 下载 Release 里的 `.exe`，双击运行 |
| 主要用 iPhone | iOS App | 下载 IPA 后用 Sideloadly/AltStore 重签，或 Xcode 直接跑 |
| 想在浏览器里用，或部署到 NAS/服务器 | Docker | 运行 A 股或美股容器 |
| 想改代码 | 源码 | 克隆仓库，按下面流程启动 |

> 第一次打开 Mac App 如果被 Gatekeeper 拦住，右键 App → 打开。iOS 的 IPA 没有签名，必须用你自己的 Apple ID 重签。

### 第一次打开：五分钟走完

1. **打开 HUB**：看到中央资产中枢、左侧 3 个按键、右侧 4 个模块。
2. **设置账户**：点右上角齿轮 → 设置初始资产和管理员名称。初始资产只是收益基准，后面可以改。
3. **记一笔交易**：进入持仓，点“记一笔交易”，填代码、方向、价格、数量、日期。
4. **加自选**：点顶栏星号，搜索代码或名称加入自选。
5. **看今天的策略**：回到 HUB，点“每日策略”，先看市场状态、仓位建议和风险提示。
6. **看量化模型**：点右侧“量化模型”，HMM 决定总仓位，渗流决定行业和标的。
7. **分享**：进入任意子页面，点右下角分享，生成完整长图，可发到微信或 Notes。

### KDJ 极值预警

HUB 右侧「行业要闻」下方有一个白色 **KDJ预警** 按键，和其他右侧入口一致；点击进入独立页面，不再占用量化模型。

- 先选半导体、通信设备或指数；共 2 个行业 + 6 个指数（含中证1000）
- 两张图分别是 5 分钟与 30 分钟
- 上轨 `J ≥ 118` 超买，下轨 `J ≤ -14` 超卖
- 图中黄色框是近似中枢，来自最近摆动高低点的重叠区
- 面板里的操作建议只作参考，不是买卖指令；强趋势里 J 可能长期停留在极值区

### 每天的使用顺序

```
打开 HUB
  → 看底部 LIVE：指数、涨跌家数、成交额、数据时间
  → 每日策略：今天该进攻还是防守
  → 持仓：有没有需要止损/减仓的标的
  → 板块/情绪/热图：市场扩散还是只剩少数板块
  → 量化模型：HMM 仓位 + 渗流行业 + 个股建议
  → 右侧 KDJ：5m / 30m 是否进入极值区
  → 复盘：记录今天的判断，必要时分享
```

不建议每天频繁改仓位。HMM 和渗流是“描述现在”，不是预测明天；把它们当成仓位纪律和风险提示，而不是买卖信号。

### 数据放在哪、怎么备份

- macOS：`~/Library/Application Support/StockDesk`
- Windows：`%LOCALAPPDATA%\StockDesk`
- iOS：App 沙盒
- Docker：挂载到 `/data`

备份时复制整个目录即可；恢复时先退出 App，再把这个目录放回原位置。行情缓存可以丢，账户和交易流水最重要。

### 从源码启动

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

### 美股版

```bash
cd stockdesk-akshare/us
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python run.py
```

打开 <http://127.0.0.1:8770>。它和 A 股版互不影响，可以同时开着。

### Docker

A 股：

```bash
docker run --rm -p 8765:8765 \
  -v stockdesk-data:/data \
  ghcr.io/cxy2696/stockdesk-akshare-a-share:latest
```

美股：

```bash
docker run --rm -p 8770:8770 \
  ghcr.io/cxy2696/stockdesk-akshare-us:latest
```

### iOS

```bash
cd stockdesk-akshare/ios
xcodegen generate
open StockDesk.xcodeproj
```

在 Signing & Capabilities 里选自己的 Team，再运行到模拟器或真机。免费 Apple ID 的签名 7 天后过期，重新运行一次即可。

### 从代码到发布：项目流程

```
修改源码
  → 本地 npm build / python compileall
  → 提交并推送到 main
  → GitHub Actions CI 编译检查
  → 需要发版时：
       - 打 tag，创建 Release，上传 macOS/Windows/iOS 产物
       - 需要容器时，手动运行 Publish containers
       - GHCR 构建并做 /api/health 或 /api/us/health 冒烟检查
  → 用户从 Release 或 Packages 下载
```

### 遇到问题

- **端口被占用**：程序会自动找下一个端口，以日志里的地址为准。
- **Mac 没有窗口**：看菜单栏是否已经激活 StockDesk；窗口固定从主屏左上角打开。
- **Windows 没有窗口**：确认 WebView2 Runtime 已安装；没有会回退浏览器。
- **数据看起来不对**：先刷新，再检查网络；行情来自公开接口，可能延迟。
- **想重新开始**：退出 App，备份并移走数据目录，再启动会创建新的空账户。

## English

### Before you start

If you just opened this project, you do not need to click through every screen. StockDesk is built around one specific question: “How is the market, how is my portfolio, and do I need to do anything today?”

For the first run, just do three things: set your initial assets, record one real trade, and read the Daily Plan once. The rest can wait until you actually need it.

### Pick the edition that fits you

| Your situation | Recommended | How to start |
| --- | --- | --- |
| macOS, just want to double-click | macOS app | Download the Release ZIP, unzip, open `StockDesk.app` |
| Windows 10/11, want a real window | Windows exe | Download the Release `.exe` and double-click |
| Mostly on iPhone | iOS app | Re-sign the IPA with Sideloadly/AltStore, or run from Xcode |
| Browser use, NAS or server | Docker | Run the A-share or US container |
| Want to modify code | Source | Clone the repo and follow the steps below |

> If Gatekeeper blocks the macOS app, right-click → Open. The iOS IPA is unsigned and must be re-signed with your own Apple ID.

### KDJ alerts

Use the white **KDJ** button under Industry News in the HUB right column. It opens a dedicated page and no longer occupies Quant Models.

- Pick semiconductors, communications equipment or an index; two sectors + six indices, including CSI 1000
- Two charts: 5-minute and 30-minute
- Upper band `J >= 118` overbought; lower band `J <= -14` oversold
- The yellow box is an approximate central zone built from recent swing highs/lows
- Guidance is reference only, not a trade instruction; extremes can persist in strong trends

### First five minutes

1. **Open the HUB** — central asset hub, three actions on the left, four modules on the right.
2. **Set up the account** — gear icon → initial assets and admin name. Initial assets are just the performance baseline.
3. **Record a trade** — open Portfolio, choose “record a trade”, fill symbol, side, price, quantity and date.
4. **Build a watchlist** — click the star in the top bar, search by ticker or name.
5. **Read today's plan** — back to the HUB, open Daily Plan: market state, position advice and risk notes.
6. **Check the models** — open Quant Models: HMM suggests total exposure, percolation suggests industries and names.
7. **Share** — open any detail page and use the share button to create a full-page image for WeChat or Notes.

### A simple daily routine

```
Open the HUB
  → LIVE bar: indices, breadth, turnover, data time
  → Daily Plan: attack or defend today?
  → Portfolio: anything to stop out or trim?
  → Sectors / mood / heatmap: broad diffusion or just a few names?
  → Quant Models: HMM exposure + percolation + per-stock guidance
  → Review: write down the call, share if useful
```

Try not to trade every day. HMM and percolation describe the present; they do not predict tomorrow. Treat them as discipline and risk context, not buy/sell signals.

### Where data lives and how to back up

- macOS: `~/Library/Application Support/StockDesk`
- Windows: `%LOCALAPPDATA%\StockDesk`
- iOS: app sandbox
- Docker: mounted at `/data`

To back up, copy the whole directory. To restore, quit the app first, then put the directory back. Market caches can be lost; trades and account data are what matter.

### Run from source

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

Browser-only development:

```bash
python main.py --browser
```

### US edition

```bash
cd stockdesk-akshare/us
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python run.py
```

Open <http://127.0.0.1:8770>. It is independent from the A-share app and can run at the same time.

### Docker

A-share:

```bash
docker run --rm -p 8765:8765 \
  -v stockdesk-data:/data \
  ghcr.io/cxy2696/stockdesk-akshare-a-share:latest
```

US:

```bash
docker run --rm -p 8770:8770 \
  ghcr.io/cxy2696/stockdesk-akshare-us:latest
```

### iOS

```bash
cd stockdesk-akshare/ios
xcodegen generate
open StockDesk.xcodeproj
```

Choose your team under Signing & Capabilities, then run on a simulator or device. A free Apple ID signature lasts seven days; just run it again after expiry.

### From code to release

```
Edit source
  → local npm build / python compileall
  → commit and push to main
  → GitHub Actions CI
  → when releasing:
       - tag and create a Release, upload macOS/Windows/iOS artifacts
       - for containers, run Publish containers
       - GHCR builds and smoke-tests /api/health or /api/us/health
  → users download from Releases or Packages
```

### If something goes wrong

- **Port in use**: the app picks the next free port; use the URL in the log.
- **No macOS window**: check the menu bar — StockDesk may already be active. The window opens at the top-left of the primary display.
- **No Windows window**: install WebView2 Runtime; without it the app falls back to the browser.
- **Numbers look odd**: refresh first, then check the network. Public endpoints can be delayed.
- **Start over**: quit the app, back up and move the data directory away, then launch again for a clean account.
