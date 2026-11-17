#!/bin/bash
# Build with automatic signing and install on a USB-connected iPhone.
# Usage: ./install_to_iphone.sh <TEAM_ID>
set -e
cd "$(dirname "$0")"

TEAM_ID="${1:-${TEAM_ID:-}}"
if [ -z "$TEAM_ID" ]; then
  cat <<'MSG'
用法: ./install_to_iphone.sh <TEAM_ID>

TEAM_ID 查看方式:
  Xcode → Settings → Accounts → 选中你的 Apple ID → Team ID
  或打开 StockDesk.xcodeproj → Signing & Capabilities 里选择 Team

第一次使用还需要:
  1. 数据线连接 iPhone，点「信任此电脑」
  2. iPhone 设置 → 隐私与安全性 → 开发者模式 → 打开（会重启）
  3. 保持 iPhone 解锁
MSG
  exit 1
fi

UDID=$(xcrun devicectl list devices 2>/dev/null | awk '/physical/ && /connected/ {for (i = 1; i <= NF; i++) if ($i ~ /^[0-9A-Fa-f-]{20,}$/) {print $i; exit}}')
if [ -z "$UDID" ]; then
  echo "没有检测到已连接的真机 iPhone，请先连接数据线并信任此电脑。"
  exit 1
fi
echo "找到设备: $UDID"

xcodebuild -project StockDesk.xcodeproj -scheme StockDesk \
  -configuration Debug -destination "platform=iOS,id=$UDID" \
  -derivedDataPath ../.cache/ios-dd \
  DEVELOPMENT_TEAM="$TEAM_ID" \
  CODE_SIGN_STYLE=Automatic \
  -allowProvisioningUpdates build

APP="../.cache/ios-dd/Build/Products/Debug-iphoneos/StockDesk.app"
xcrun devicectl device install app --device "$UDID" "$APP"
xcrun devicectl device process launch --device "$UDID" com.stockdesk.app || true

cat <<'MSG'

安装完成。如果启动时提示「未受信任的开发者」或「invalid code signature」：
  打开 iPhone：设置 → 通用 → VPN 与设备管理
  → 开发者 App / Apple Development: cuixinyi.anny@gmail.com
  → 点「信任」，然后回到桌面打开 StockDesk

免费 Personal Team 签名有效期为 7 天，到期重新运行本脚本即可。
MSG
