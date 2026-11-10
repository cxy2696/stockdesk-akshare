# Install & Build / 安装与构建

## Requirements

- Python 3.10+ (desktop), 3.9+ (US)
- Node.js 18+ and pnpm/npm for the desktop frontend
- macOS 12+ / Windows 10+ / Xcode 15+ for iOS

## Desktop development

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

`python main.py --browser` skips the native window.

## macOS app

```bash
cd desktop
./build_app.sh
open StockDesk.app
```

The script uses PyInstaller and copies the built frontend into the bundle. The app opens at the primary screen (60, 80).

## Windows one-file exe

```powershell
cd desktop
py -3.10 -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt pyinstaller
cd frontend; npm ci; npm run build; cd ..
pyinstaller --noconfirm --onefile --noconsole --name StockDesk `
  --add-data "frontend/dist;frontend_dist" main.py
```

Requirements:

- Windows 10/11 for the native Edge WebView2 window
- WebView2 Runtime (installed with Edge)
- Windows 7/8 has no WebView2 and falls back to the browser

## iOS

```bash
cd ios
xcodegen generate
open StockDesk.xcodeproj
```

Set your team in Signing & Capabilities, then run on a simulator or device.

## US edition

```bash
cd us
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python run.py --port 8770
```

No Node.js build is required; the dashboard is plain HTML/CSS/JS with a local ECharts bundle.

## Data location

- macOS: `~/Library/Application Support/StockDesk`
- Windows: `%LOCALAPPDATA%\StockDesk`
- iOS: app sandbox
- US: in-memory cache only

## Troubleshooting

- **Port in use**: the desktop launcher picks the next free port; check the console/log.
- **Blank window**: wait for the first market snapshot; check the log in the data directory.
- **Windows no window**: verify WebView2 Runtime; if missing, use the browser fallback.
- **macOS Gatekeeper**: right-click → Open on first launch.
