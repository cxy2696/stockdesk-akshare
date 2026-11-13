# Install & Build · 安装与构建

[中文](#中文) · [English](#english)

> 第一次使用建议先看 [使用教程与流程](GUIDE.md)。 / First time here? Start with the [Guide & Workflow](GUIDE.md).

> 源码版本 **1.11.0**；文中安装包示例为最近一次构建 1.10.3（iOS 3.7.3）。构建时把 `VERSION` 改成目标版本即可。

## 下载安装 / Download & install

| 平台 | 推荐文件 | 安装 |
| --- | --- | --- |
| macOS 12+ (Apple Silicon) | `StockDesk-macOS-1.10.3.dmg`（约 43 MB） | 打开 DMG，双击 `Install-StockDesk.command` |
| Windows 10/11 x64 | `StockDesk.exe`（精简单文件，约 52 MB） | 双击运行；装好 WebView2 Runtime；SmartScreen 拦截时「更多信息 → 仍要运行」 |
| iPhone iOS 17+ | `StockDesk-iOS-3.7.3-unsigned.ipa` | Sideloadly / AltStore / Xcode 重签 |
| 浏览器 / NAS | GHCR 容器 | 见 `PACKAGES.md` |

下载页：<https://cxy2696.github.io/stockdesk-akshare/#download>
macOS 首次打开：App 使用 ad-hoc 签名，浏览器下载后会带 `com.apple.quarantine` 标记，Gatekeeper 可能提示「无法打开」或「已损坏」。DMG / ZIP 内的 `Install-StockDesk.command` 会自动复制到 Applications 并清除该标记；也可以手动执行：

```bash
xattr -dr com.apple.quarantine /Applications/StockDesk.app
open /Applications/StockDesk.app
```

不要直接双击 DMG 里的 App 运行；先运行安装脚本或拖入 Applications 后再清除隔离标记。

Release：<https://github.com/cxy2696/stockdesk-akshare/releases/tag/v1.10.3>

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
- 1.10.3 在启动失败时会弹出错误提示，不再静默退出。

### 打包 macOS App

```bash
cd desktop
VERSION=1.10.3 ./package_macos.sh
```

脚本会构建前端、用 PyInstaller 生成 `dist/StockDesk.app`，并输出：

- `release/StockDesk-macOS-1.10.3.dmg` —— 打开后把 App 拖进 Applications
- `release/StockDesk-macOS-1.10.3.zip` —— 解压后打开 `StockDesk.app`
- `release/SHA256SUMS-macOS.txt` —— 下载校验和

`stockdesk.spec` 已排除 `pyarrow`、`scipy`、`matplotlib`、`PIL`、`openpyxl` 等未使用的可选依赖，DMG 约 43 MB、ZIP 约 42 MB；首次打开如果被 Gatekeeper 拦住，右键 → 打开即可。

### 打包 Windows 单文件

```powershell
cd desktop
py -3.10 -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt pyinstaller
powershell -ExecutionPolicy Bypass -File .\build_win.ps1
```

`build_win.ps1` 会构建前端并调用 PyInstaller，使用与 macOS 相同的排除列表，输出 `dist/StockDesk.exe`。Windows 10/11 使用 Edge WebView2 原生窗口；没有 WebView2 时会退回浏览器。CI 会在 Windows runner 上构建并跑健康检查、KDJ 与板块接口冒烟测试。

### iOS

```bash
cd ios
xcodegen generate
open StockDesk.xcodeproj
```

在 Signing & Capabilities 里选择自己的 Team，然后运行到模拟器或真机。

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
VERSION=1.10.3 ./package_macos.sh
```

The script builds the frontend, runs PyInstaller, and writes:

- `release/StockDesk-macOS-1.10.3.dmg` — open and drag the app into Applications
- `release/StockDesk-macOS-1.10.3.zip` — unzip and open `StockDesk.app`
- `release/SHA256SUMS-macOS.txt` — download checksums

`stockdesk.spec` excludes unused optional packages such as `pyarrow`, `scipy`, `matplotlib`, `PIL` and `openpyxl`; the DMG is about 43 MB and the ZIP about 42 MB. If Gatekeeper blocks the first launch, right-click → Open.

### Build the Windows one-file exe

```powershell
cd desktop
py -3.10 -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt pyinstaller
powershell -ExecutionPolicy Bypass -File .\build_win.ps1
```

`build_win.ps1` builds the frontend and calls PyInstaller with the same exclusion list, producing `dist/StockDesk.exe`. Windows 10/11 gets a native Edge WebView2 window; without WebView2 it falls back to the browser. CI builds this exe on a Windows runner and smoke-tests health, KDJ and sector endpoints.

### iOS

```bash
cd ios
xcodegen generate
open StockDesk.xcodeproj
```

Pick your team in Signing & Capabilities, then run on a simulator or device.

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
