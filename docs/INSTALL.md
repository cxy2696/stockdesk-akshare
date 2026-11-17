# Install & Build · 安装与构建

[中文](#中文) · [English](#english)

> 第一次使用建议先看 [使用教程与流程](GUIDE.md)。 / First time here? Start with the [Guide & Workflow](GUIDE.md).

> 桌面端源码 **1.17.0**（Releases 安装包仍为 1.17.0；iOS **4.1.2 (36)**）。1.17.0 精简各页阅读负担；重新打包时把 `VERSION` 改成目标版本即可。

> Ollama 辅助判断仅 macOS / Windows 提供，默认关闭；没有安装 Ollama 或没有选中模型时不会启用。安装与配置见 [Ollama 指南](OLLAMA.md)。iOS 不集成 Ollama。

## 下载安装 / Download & install

| 平台 | 推荐文件 | 安装 |
| --- | --- | --- |
| macOS 12+ (Apple Silicon) | `StockDesk-macOS-1.17.0.dmg`（约 43 MB） | 打开 DMG，双击 `Install-StockDesk.command` |
| Windows 10/11 x64 | `StockDesk.exe`（精简单文件，约 53 MB） | 双击运行；装好 WebView2 Runtime；SmartScreen 拦截时「更多信息 → 仍要运行」 |
| iPhone iOS 17+ | `StockDesk-iOS-4.1.2-unsigned.ipa` | Sideloadly / AltStore / Xcode 重签 |
| 浏览器 / NAS | GHCR 容器 | 见 `PACKAGES.md` |

下载与校验：<https://github.com/cxy2696/stockdesk-akshare/releases>
macOS 首次打开：App 使用 ad-hoc 签名，浏览器下载后会带 `com.apple.quarantine` 标记，Gatekeeper 可能提示「无法打开」或「已损坏」。DMG / ZIP 内的 `Install-StockDesk.command` 会自动复制到 Applications 并清除该标记；也可以手动执行：

```bash
xattr -dr com.apple.quarantine /Applications/StockDesk.app
open /Applications/StockDesk.app
```

不要直接双击 DMG 里的 App 运行；先运行安装脚本或拖入 Applications 后再清除隔离标记。

Release：<https://github.com/cxy2696/stockdesk-akshare/releases/tag/v1.17.0>

## 中文

### 你需要准备

- Python 3.10 或更高版本（美股版 3.9+）
- Node.js 18+ 和 npm（只用于构建桌面前端）
- macOS 12+、Windows 10+，或 Xcode 15+（iOS）

### 桌面端开发

```bash
cd desktop
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt

cd frontend
npm ci
npm run build
cd ..

python main.py
```

如果只想调接口和页面，不想开原生窗口：

```bash
python main.py --browser
```

### Windows 首次打开

- 如果 Windows SmartScreen 提示「已保护你的电脑」：点「更多信息」→「仍要运行」。
- 需要 WebView2 Runtime；没有时程序会退回默认浏览器。
- 双击后没有窗口：查看 `%LOCALAPPDATA%\StockDesk\stockdesk.log`；也可以运行 `StockDesk.exe --browser`，用浏览器打开。
- 启动失败时会弹出错误提示，不再静默退出。

### 打包 macOS App

```bash
cd desktop
./package_macos.sh
```

版本号自动读取 `backend/config.py` 的 `APP_VERSION`；需要临时覆盖时用 `VERSION=x.y.z ./package_macos.sh`。脚本会构建前端、用 PyInstaller 生成 `dist/StockDesk.app`，并输出：

- `release/StockDesk-macOS-1.17.0.dmg` —— 打开后把 App 拖进 Applications
- `release/StockDesk-macOS-1.17.0.zip` —— 解压后打开 `StockDesk.app`
- `release/SHA256SUMS-macOS.txt` —— 打包脚本生成的下载校验和（本地汇总见根目录 `release/SHA256SUMS.txt`）

`stockdesk.spec` 已排除 `pyarrow`、`scipy`、`matplotlib`、`PIL`、`openpyxl` 等未使用的可选依赖，DMG 约 43 MB、ZIP 约 42 MB；首次打开如果被 Gatekeeper 拦住，右键 → 打开即可。

### 打包 Windows 单文件

```powershell
cd desktop
py -3.10 -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt pyinstaller
powershell -ExecutionPolicy Bypass -File .\build_win.ps1
```

`build_win.ps1` 会构建前端并调用 PyInstaller，使用与 macOS 相同的排除列表，输出 `dist/StockDesk.exe`。Windows 10/11 使用 Edge WebView2 原生窗口；没有 WebView2 时会退回浏览器。CI 会在 Windows runner 上构建并跑健康检查与板块接口冒烟测试。

### iOS

```bash
cd ios
./build_ios.sh --simulator   # 模拟器 App，无需签名（快速验证）
./build_ios.sh               # 模拟器 App + 未签名真机 IPA
```

产物在 `ios/dist/`：`StockDesk-simulator.app`、`StockDesk-iOS-<版本>-unsigned.ipa`。
真机安装：用 Xcode 打开 `StockDesk.xcodeproj`，在 Signing & Capabilities 选择自己的 Team 后运行；或用 Sideloadly / AltStore 重签 IPA。免费 Apple ID 签名 7 天有效。

### 测试与冒烟

```bash
# 后端单测 + 静态检查
pip install -r desktop/requirements-dev.txt
pytest -q tests
ruff check desktop/backend us tests --select F,E9

# 启动服务后跑端到端冒烟（另开终端）
cd desktop && python main.py --headless --port 8765
python scripts/api_smoke.py http://127.0.0.1:8765
```

### 美股版

```bash
cd us
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python run.py --port 8770
```

美股版不需要 Node.js 构建，页面和 ECharts 都已经放在本地。

### 数据放在哪里

- macOS：`~/Library/Application Support/StockDesk`
- Windows：`%LOCALAPPDATA%\StockDesk`
- iOS：App 沙盒
- 美股版：只在内存里缓存，不写账户数据

### 遇到问题时

- **端口被占用**：启动器会自动往后找空闲端口，看看终端或日志里的实际地址。
- **窗口空白**：等第一次行情快照加载完成；如果一直空白，查看数据目录里的日志。
- **Windows 没有窗口**：确认 WebView2 Runtime 已安装；没有的话会用浏览器打开。
- **macOS 提示未签名**：右键 App → 打开。

## English

> Desktop source **1.17.0** (installers 1.17.0; iOS **4.1.2 (36)**). Ollama is macOS/Windows only and off by default; without Ollama or a selected model it stays disabled. iOS does not integrate Ollama. See [Ollama guide](OLLAMA.md).

### What you need

- Python 3.10+ (US edition: 3.9+)
- Node.js 18+ and npm, only for building the desktop frontend
- macOS 12+, Windows 10+, or Xcode 15+ for iOS

### Desktop development

```bash
cd desktop
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt

cd frontend
npm ci
npm run build
cd ..

python main.py
```

If you only want the API and pages in a browser:

```bash
python main.py --browser
```

### Build the macOS app

```bash
cd desktop
./package_macos.sh
```

The version is read from `APP_VERSION` in `backend/config.py`; override it with `VERSION=x.y.z ./package_macos.sh` when needed. The script builds the frontend, runs PyInstaller, and writes:

- `release/StockDesk-macOS-1.17.0.dmg` — open and drag the app into Applications
- `release/StockDesk-macOS-1.17.0.zip` — unzip and open `StockDesk.app`
- `release/SHA256SUMS-macOS.txt` — checksums written by the packaging script (the consolidated local manifest is `release/SHA256SUMS.txt`)

`stockdesk.spec` excludes unused optional packages such as `pyarrow`, `scipy`, `matplotlib`, `PIL` and `openpyxl`; the DMG is about 43 MB and the ZIP about 42 MB. If Gatekeeper blocks the first launch, right-click → Open.

### Build the Windows one-file exe

```powershell
cd desktop
py -3.10 -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt pyinstaller
powershell -ExecutionPolicy Bypass -File .\build_win.ps1
```

`build_win.ps1` builds the frontend and calls PyInstaller with the same exclusion list, producing `dist/StockDesk.exe`. Windows 10/11 gets a native Edge WebView2 window; without WebView2 it falls back to the browser. CI builds this exe on a Windows runner and smoke-tests health and sector endpoints.

### iOS

```bash
cd ios
./build_ios.sh --simulator   # simulator app, no signing needed
./build_ios.sh               # simulator app + unsigned device IPA
```

Outputs live in `ios/dist/`: `StockDesk-simulator.app` and `StockDesk-iOS-<version>-unsigned.ipa`.
For a device, open `StockDesk.xcodeproj`, pick your team in Signing & Capabilities, then run; or re-sign the IPA with Sideloadly / AltStore. Free Apple ID signatures expire after 7 days.

### Tests and smoke

```bash
pip install -r desktop/requirements-dev.txt
pytest -q tests
ruff check desktop/backend us tests --select F,E9

cd desktop && python main.py --headless --port 8765
python scripts/api_smoke.py http://127.0.0.1:8765
```

### US edition

```bash
cd us
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python run.py --port 8770
```

No Node.js build is needed — the page and ECharts bundle are already local.

### Where data lives

- macOS: `~/Library/Application Support/StockDesk`
- Windows: `%LOCALAPPDATA%\StockDesk`
- iOS: app sandbox
- US edition: memory cache only, no account data

### If something goes wrong

- **Port already in use**: the launcher picks the next free port; check the terminal/log for the real URL.
- **Blank window**: wait for the first market snapshot. If it stays blank, check the log in the data directory.
- **No window on Windows**: make sure WebView2 Runtime is installed; otherwise the app opens in your browser.
- **macOS says the app is unsigned**: right-click the app → Open.
