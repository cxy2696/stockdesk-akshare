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
| 模型注册表 / C++ 原生核心 | 2.7.0 / 1.2.5 |

当前版本覆盖沪深京全 A 股 5,581 只。行情快照带有逐行状态（正常、停牌、无行情）和覆盖率对账，`missing=0`、`duplicates=0`；具体对账结果可在 `/api/market/coverage` 查看。

## 主要功能

- **HUD 指挥舱**：资产中枢直接进入持仓管理，左右两侧是每日策略、板块、复盘、交易决策、历史测评、市场预测、回测、因子、地域、指数和模型等入口（3+8）。
- **持仓与复盘**：交易流水、移动成本、已实现/浮动盈亏、FIFO 统计、净值与回撤、月度收益、仓位与现金曲线。
- **行情与个股**：自选、日/周/月 K 线、筹码分布、黄金分割、支撑压力、财务与公司资料。
- **交易决策**：按价格结构、均线、RSI、九转、资金和市场状态给出评级、买区、止损、目标和盈亏比，并写清判断依据。
- **量化模型**：五指数 HMM、市场广度渗流、九转结构和综合评分，给出仓位与行业关注方向；安装 rflux 时 HMM 优先使用其 C++ 多起点训练器，未安装则自动回退。
- **历史测评**：对沪深300/上证等指数做滚动 220 日重训、5 日持有的样本外检验，展示方向命中率、预测相关性、分状态表现、上涨概率校准和净值对比；只作研究，不是收益承诺。
- **数据新鲜度与多源兜底**：顶部常驻快照日期、更新时间、覆盖家数、缺失/未定价和实际使用来源；快照层支持东方财富 → 新浪 → 腾讯 → akshare 回退，K 线支持东财 → 新浪 → 腾讯 → akshare，新闻和板块也有独立兜底；应用内后台调度按交易时段定时刷新，并暴露 `/api/data/status`、`/api/data/sources`、`/api/data/coverage`、`/api/data/refresh`。
- **策略回测**：单股 9 套规则策略 + hp-quant 式三种组合模式——推荐组合（自选+持仓池、60 日动量选股、HMM 状态仓位、次日开盘换仓）、自定义持仓（权重/再平衡）和交易记录回放（真实流水、T+1/现金约束）。
- **板块与地域**：行业/概念跟踪、市场情绪、涨停池、个股热图、中国上市公司分布和省份龙头。
- **Ollama 辅助（可选）**：macOS/Windows 可连接本机 Ollama 生成第二意见，默认关闭，不联网调用云端模型；iOS 不集成。
- **iOS 对齐**：iPhone/iPad 已补独立市场预测、因子筛选，HUD 为 3+7 入口；完全离线，不依赖 Mac 后端。

## 下载与安装

| 平台 | 文件 | 说明 |
| --- | --- | --- |
| macOS 12+ Apple Silicon | `StockDesk-macOS-1.17.0.dmg` / `.zip` | 打开 DMG 后运行 `Install-StockDesk.command` |
| Windows 10/11 x64 | `StockDesk.exe` | 需要 WebView2；SmartScreen 提示时选择“仍要运行” |
| iPhone / iPad iOS 17+ | `StockDesk-iOS-4.1.2-unsigned.ipa` | 未签名，需用 Sideloadly / AltStore / Xcode 重签 |
| 浏览器 / NAS | GHCR 容器 | 见 [容器说明](docs/PACKAGES.md) |

安装包在 GitHub Releases 下载。仓库只保留源码和文档，构建产物不进入 Git。

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

C++ 原生核心可以用 CMake 单独构建、自测和计时（不依赖 Python）：

```bash
cd desktop
cmake -S backend/native_core -B build/native-cpp -DCMAKE_BUILD_TYPE=Release
cmake --build build/native-cpp -j
ctest --test-dir build/native-cpp --output-on-failure
./build/native-cpp/native_bench
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
