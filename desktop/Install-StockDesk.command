#!/bin/bash
# Install StockDesk.app from this DMG/ZIP, clear the quarantine flag that
# Gatekeeper adds to downloaded files, and launch the app.
set -e
cd "$(dirname "$0")"

APP="StockDesk.app"
if [ ! -d "$APP" ]; then
  echo "找不到 StockDesk.app，请确认本文件和 StockDesk.app 在同一个文件夹。"
  read -r -n 1 -p "按任意键退出..."
  exit 1
fi

DEST="${STOCKDESK_DEST:-/Applications/StockDesk.app}"
mkdir -p "$(dirname "$DEST")" 2>/dev/null || true
if [ ! -w "$(dirname "$DEST")" ]; then
  DEST="$HOME/Applications/StockDesk.app"
  mkdir -p "$(dirname "$DEST")"
fi

echo "正在安装到：$DEST"
# Quit a running copy first (ignore errors if it is not running).
osascript -e 'tell application "StockDesk" to quit' >/dev/null 2>&1 || true
rm -rf "$DEST"
ditto "$APP" "$DEST"

# The app is ad-hoc signed (no paid Developer ID). Downloaded files carry
# com.apple.quarantine, which makes Gatekeeper refuse to launch the app until
# the user explicitly allows it. Clearing the flag here is the same action as
# System Settings -> Privacy & Security -> Open Anyway.
xattr -dr com.apple.quarantine "$DEST" 2>/dev/null || true

if [ "${STOCKDESK_NO_OPEN:-0}" != "1" ]; then
  open "$DEST"
fi

echo "完成。StockDesk 已安装到 ${DEST}。"
echo "如果 macOS 仍提示无法打开，请右键 App -> 打开，或在终端执行："
echo "  xattr -dr com.apple.quarantine \"$DEST\""
sleep 3
