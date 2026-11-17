#!/bin/bash
# Build StockDesk for iPhone / iPad:
#   - a simulator .app (no signing required)
#   - an unsigned device .ipa (re-sign with Sideloadly / AltStore / Xcode)
#
# Usage:
#   ./build_ios.sh                 # simulator + unsigned IPA
#   ./build_ios.sh --simulator     # simulator only (fast verification)
#   ./build_ios.sh --device        # unsigned IPA only
set -euo pipefail
cd "$(dirname "$0")"

MODE="${1:-all}"
VERSION="$(awk -F'"' '/MARKETING_VERSION:/ {print $2; exit}' project.yml)"
VERSION="${VERSION:-0.0.0}"
DERIVED="build/DerivedData"
DIST="dist"

if ! command -v xcodegen >/dev/null 2>&1; then
  echo "需要 XcodeGen：brew install xcodegen" >&2
  exit 1
fi
if ! command -v xcodebuild >/dev/null 2>&1; then
  echo "需要 Xcode（xcodebuild 未找到）" >&2
  exit 1
fi

echo "==> 1/3 生成 Xcode 工程（v${VERSION}）"
xcodegen generate >/dev/null

mkdir -p "$DIST"

if [ "$MODE" != "--device" ]; then
  echo "==> 2/3 构建模拟器版本"
  xcodebuild -project StockDesk.xcodeproj -scheme StockDesk -sdk iphonesimulator \
    -destination 'generic/platform=iOS Simulator' -configuration Debug \
    -derivedDataPath "$DERIVED" CODE_SIGNING_ALLOWED=NO build \
    | grep -E "error:|warning:|BUILD (SUCCEEDED|FAILED)"
  rm -rf "$DIST/StockDesk-simulator.app"
  cp -R "$DERIVED/Build/Products/Debug-iphonesimulator/StockDesk.app" "$DIST/StockDesk-simulator.app"
  echo "    模拟器 App: $DIST/StockDesk-simulator.app"
fi

if [ "$MODE" != "--simulator" ]; then
  echo "==> 3/3 构建未签名真机版本"
  xcodebuild -project StockDesk.xcodeproj -scheme StockDesk -sdk iphoneos -configuration Release \
    -derivedDataPath "$DERIVED" CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY="" \
    build | grep -E "error:|warning:|BUILD (SUCCEEDED|FAILED)"
  APP="$DERIVED/Build/Products/Release-iphoneos/StockDesk.app"
  if [ ! -d "$APP" ]; then
    echo "真机构建产物缺失：$APP" >&2
    exit 1
  fi
  rm -rf build/Payload
  mkdir -p build/Payload
  cp -R "$APP" build/Payload/StockDesk.app
  IPA="$DIST/StockDesk-iOS-${VERSION}-unsigned.ipa"
  rm -f "$IPA"
  (cd build && zip -qry "../$IPA" Payload)
  rm -rf build/Payload
  echo "    未签名 IPA: $IPA"
  (cd "$DIST" && shasum -a 256 "$(basename "$IPA")" > "$(basename "$IPA").sha256")
fi

echo ""
echo "完成（v${VERSION}）："
echo "  安装到模拟器: xcrun simctl install booted $DIST/StockDesk-simulator.app"
echo "  安装到真机  : 用 Sideloadly/AltStore 重签 $DIST/StockDesk-iOS-${VERSION}-unsigned.ipa"
echo "  或 Xcode 打开 StockDesk.xcodeproj，选择 Team 后运行。"
