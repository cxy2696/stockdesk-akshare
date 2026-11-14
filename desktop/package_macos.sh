#!/bin/bash
# Build and package StockDesk for macOS.
#
# Usage:
#   ./package_macos.sh                 # build + zip + dmg
#   VERSION=1.12.0 ./package_macos.sh  # explicit version label
#
# Outputs to desktop/release/:
#   StockDesk-macOS-<version>.dmg      drag-to-Applications installer
#   StockDesk-macOS-<version>.zip      portable zip
#   SHA256SUMS-macOS.txt
set -e
cd "$(dirname "$0")"

VERSION="${VERSION:-1.12.0}"
if [ -z "${VENV:-}" ]; then
  for candidate in .venv ../.venv ../../.venv; do
    if [ -x "$candidate/bin/python" ]; then VENV="$candidate"; break; fi
  done
fi
PY="${VENV:-}/bin/python"

if [ -z "${VENV:-}" ] || [ ! -x "$PY" ]; then
  echo "找不到 Python 环境。请先执行：" >&2
  echo "  cd desktop && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt pyinstaller" >&2
  echo "或显式指定：VENV=/path/to/venv ./package_macos.sh" >&2
  exit 1
fi

echo "==> 1/3 构建前端"
if [ ! -d frontend/node_modules ]; then
  (cd frontend && npm install --no-audit --no-fund)
fi
(cd frontend && npm run build)

echo "==> 2/3 PyInstaller 打包（精简版，排除未使用的重型依赖）"
"$PY" -m PyInstaller --noconfirm --clean stockdesk.spec

echo "==> 3/3 生成 DMG / ZIP / 校验和"
APP="dist/StockDesk.app"
rm -rf release
mkdir -p release
STAGE="release/.stage"
mkdir -p "$STAGE"
ditto "$APP" "$STAGE/StockDesk.app"
cp Install-StockDesk.command "$STAGE/Install-StockDesk.command"
chmod +x "$STAGE/Install-StockDesk.command"
cp MACOS-README.txt "$STAGE/安装说明.txt"

# ZIP: installer + app + readme at the archive root.
ditto -c -k --norsrc "$STAGE" "release/StockDesk-macOS-$VERSION.zip"

# DMG: same contents, plus an Applications shortcut for users who prefer drag.
ln -s /Applications "$STAGE/Applications"
hdiutil create -volname "StockDesk $VERSION" -srcfolder "$STAGE" -ov -format UDBZ \
  "release/StockDesk-macOS-$VERSION.dmg" >/dev/null
rm -rf "$STAGE"
(cd release && shasum -a 256 "StockDesk-macOS-$VERSION.dmg" "StockDesk-macOS-$VERSION.zip" > SHA256SUMS-macOS.txt)

ls -lh release
