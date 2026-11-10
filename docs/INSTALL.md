# Install & Build · 安装与构建

[中文](#中文) · [English](#english)

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

### 打包 macOS App

```bash
cd desktop
./build_app.sh
open StockDesk.app
```

构建脚本会把前端产物一起放进 App。首次打开如果被 Gatekeeper 拦住，右键 → 打开即可。

### 打包 Windows 单文件

```powershell
cd desktop
py -3.10 -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt pyinstaller

cd frontend
npm ci
npm run build
cd ..

pyinstaller --noconfirm --onefile --noconsole --name StockDesk `
  --add-data "frontend/dist;frontend_dist" main.py
```

Windows 10/11 使用 Edge WebView2 原生窗口；Windows 7/8 没有 WebView2 时会退回浏览器。

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
./build_app.sh
open StockDesk.app
```

The build script copies the built frontend into the bundle. If Gatekeeper blocks the first launch, right-click → Open.

### Build the Windows one-file exe

```powershell
cd desktop
py -3.10 -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt pyinstaller

cd frontend
npm ci
npm run build
cd ..

pyinstaller --noconfirm --onefile --noconsole --name StockDesk `
  --add-data "frontend/dist;frontend_dist" main.py
```

Windows 10/11 gets a native Edge WebView2 window. Windows 7/8 has no WebView2 and falls back to the browser.

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
