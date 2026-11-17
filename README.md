# StockDesk

StockDesk 是一个在本地运行的个人股票工作台，主要面向 A 股。行情、持仓、复盘、回测、交易决策、量化模型、因子筛选和板块数据放在同一个界面里，账户与交易记录保存在本机 SQLite，不登录、不上传。

支持 macOS、Windows、iPhone 和 iPad，另有一个独立的美股版。桌面端使用 FastAPI + React，iOS 端是原生 SwiftUI。

![StockDesk HUD](screenshots/mac-hub.png)

## 当前版本

| 平台 | 版本 |
| --- | --- |
| 桌面端（源码 / 安装包） | 1.17.0 |
| iPhone / iPad | 4.1.2 (36) |
| 美股版 | 1.0.2 |
| 模型注册表 / C++ 原生核心 | 2.7.0 / 1.2.2 |

当前版本覆盖沪深京全 A 股 5,581 只。行情快照带有逐行状态（正常、停牌、无行情）和覆盖率对账，`missing=0`、`duplicates=0`；具体对账结果可在 `/api/market/coverage` 查看。

## 主要功能

- **HUD 指挥舱**：资产中枢直接进入持仓管理，左右两侧是每日策略、板块、复盘、交易决策、市场预测、回测、因子、地域、指数和模型等入口。
- **持仓与复盘**：交易流水、移动成本、已实现/浮动盈亏、FIFO 统计、净值与回撤、月度收益、仓位与现金曲线。
- **行情与个股**：自选、日/周/月 K 线、筹码分布、黄金分割、支撑压力、财务与公司资料。
- **交易决策**：按价格结构、均线、RSI、九转、资金和市场状态给出评级、买区、止损、目标和盈亏比，并写清判断依据。
- **策略回测**：10 套策略，计入佣金、印花税和滑点，支持基准对比、交易明细和绩效指标。
- **量化模型**：五指数 HMM、市场广度渗流、九转结构和综合评分，给出仓位与行业关注方向；安装 rflux 时 HMM 优先使用其 C++ 多起点训练器，未安装则自动回退。
- **板块与地域**：行业/概念跟踪、市场情绪、涨停池、个股热图、中国上市公司分布和省份龙头。
- **Ollama 辅助（可选）**：macOS/Windows 可连接本机 Ollama 生成第二意见，默认关闭，不联网调用云端模型；iOS 不集成。

## 下载与安装

| 平台 | 文件 | 说明 |
| --- | --- | --- |
| macOS 12+ Apple Silicon | `StockDesk-macOS-1.17.0.dmg` / `.zip` | 打开 DMG 后运行 `Install-StockDesk.command` |
| Windows 10/11 x64 | `StockDesk.exe` | 需要 WebView2；SmartScreen 提示时选择“仍要运行” |
| iPhone / iPad iOS 17+ | `StockDesk-iOS-4.1.2-unsigned.ipa` | 未签名，需用 Sideloadly / AltStore / Xcode 重签 |
| 浏览器 / NAS | GHCR 容器 | 见 [容器说明](docs/PACKAGES.md) |

本目录构建好的文件在 [`release/`](release/README.md)。GitHub Releases 上也有对应版本。

macOS 包是 ad-hoc 签名。首次打开如果被 Gatekeeper 拦住，右键选择“打开”，或执行：

```bash
xattr -dr com.apple.quarantine /Applications/StockDesk.app
```

## 从源码运行

```bash
cd desktop
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

cd frontend
npm ci
npm run build
cd ..

python main.py            # 原生窗口
python main.py --headless # 仅启动 API 和网页
```

Windows 对应命令：

```powershell
cd desktop
py -3.10 -m venv .venv
.venv\Scripts\pip install -r requirements.txt
cd frontend
npm ci
npm run build
cd ..
python main.py
```

构建 macOS 安装包：

```bash
cd desktop
./package_macos.sh
```

构建 iOS：

```bash
cd ios
./build_ios.sh --simulator   # 模拟器版本
./build_ios.sh               # 模拟器 + 未签名 IPA
```

第一次使用建议先读 [使用指南](docs/GUIDE.md)；安装、打包和发版细节在 [安装构建](docs/INSTALL.md)。

## 数据与隐私

行情、K 线和财务数据来自东方财富公开接口，部分分钟线/板块数据会用 akshare 或新浪接口回退。数据只用于个人研究，可能有延迟。

账户、交易、自选、设置保存在本机 SQLite。源码运行时默认在 `desktop/data/`，打包版在 `~/Library/Application Support/StockDesk/`（Windows 为 `%LOCALAPPDATA%\StockDesk`）。可通过 `STOCKDESK_DATA` 指定其他目录。

项目没有账号体系，也不会上传交易记录或持仓。Ollama 辅助只发送聚合后的市场与账户摘要，不发送交易备注。

## 项目结构

```
stockdesk/
├── desktop/        FastAPI 后端 + React 前端
├── ios/            SwiftUI iOS / iPadOS
├── us/             美股独立版
├── docs/           使用、安装、架构、模型和容器文档
├── screenshots/    桌面截图
├── release/        本机构建产物
└── .github/        CI
```

## 文档

- [使用指南](docs/GUIDE.md)
- [安装与构建](docs/INSTALL.md)
- [架构说明](docs/ARCHITECTURE.md)
- [模型说明](docs/MODELS.md)
- [Ollama 本地辅助](docs/OLLAMA.md)
- [容器部署](docs/PACKAGES.md)
- [美股版](docs/US-MARKET.md)

## 许可

个人使用项目，仅供学习与研究，不构成投资建议。代码使用 MIT License。
