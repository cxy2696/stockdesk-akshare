#!/bin/bash
# Build StockDesk for iOS: simulator app + unsigned device IPA.
set -e
cd "$(dirname "$0")"

echo "==> 1/4 生成 Xcode 工程"
command -v xcodegen >/dev/null || { echo "需要 XcodeGen: brew install xcodegen"; exit 1; }
xcodegen generate

echo "==> 2/4 构建模拟器版本"
xcodebuild -project StockDesk.xcodeproj -scheme StockDesk -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' -configuration Debug \
  -derivedDataPath ../.cache/ios-dd CODE_SIGNING_ALLOWED=NO build

echo "==> 3/4 构建未签名 Release（真机）"
xcodebuild -project StockDesk.xcodeproj -scheme StockDesk -sdk iphoneos -configuration Release \
  -derivedDataPath ../.cache/ios-dd CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO build

echo "==> 4/4 打包产物"
mkdir -p dist build/Payload
rm -rf build/Payload/StockDesk.app
cp -R ../.cache/ios-dd/Build/Products/Release-iphoneos/StockDesk.app build/Payload/
(cd build && rm -f StockDesk-unsigned.ipa && zip -qry StockDesk-unsigned.ipa Payload)
cp build/StockDesk-unsigned.ipa dist/

rm -rf dist/StockDesk-simulator.app
cp -R ../.cache/ios-dd/Build/Products/Debug-iphonesimulator/StockDesk.app dist/StockDesk-simulator.app

echo ""
echo "完成:"
echo "  模拟器 App : dist/StockDesk-simulator.app"
echo "  未签名 IPA : dist/StockDesk-unsigned.ipa"
echo ""
echo "安装到真机: 用 Xcode 选择 Team 运行，或用 Sideloadly/AltStore 重签 IPA。"
