#!/bin/bash
# Build StockDesk.app for macOS. Run from the project root:  ./build_app.sh
set -e
cd "$(dirname "$0")"

VENV="${VENV:-../.venv}"
PY="$VENV/bin/python"

if [ ! -x "$PY" ]; then
  echo "找不到 Python 环境 $VENV，先执行: python3 -m venv .venv && .venv/bin/pip install -r requirements.txt"
  exit 1
fi

echo "==> 1/4 安装依赖"
"$PY" -m pip install -q -r requirements.txt pyinstaller

echo "==> 2/4 构建前端"
if [ ! -d frontend/node_modules ]; then
  (cd frontend && npm install --no-audit --no-fund)
fi
(cd frontend && npm run build)

echo "==> 3/4 PyInstaller 打包"
"$PY" -m PyInstaller --noconfirm --clean stockdesk.spec

echo "==> 4/4 复制到项目根目录"
rm -rf "StockDesk.app"
cp -R "dist/StockDesk.app" "StockDesk.app"

echo ""
echo "构建完成: $(pwd)/StockDesk.app"
echo "双击打开，或执行: open StockDesk.app"
