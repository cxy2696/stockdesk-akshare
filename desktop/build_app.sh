#!/bin/bash
# Build StockDesk.app for macOS. Run from the project root:  ./build_app.sh
#
# This produces a quick local .app (no DMG/ZIP). For a distributable build with
# checksums use ./package_macos.sh instead.
set -e
cd "$(dirname "$0")"

export PYINSTALLER_CONFIG_DIR="${PYINSTALLER_CONFIG_DIR:-$PWD/build/pyinstaller-cache}"

if [ -z "${VENV:-}" ]; then
  for candidate in .venv ../.venv ../../.venv; do
    if [ -x "$candidate/bin/python" ]; then VENV="$candidate"; break; fi
  done
fi
PY="${VENV:-}/bin/python"

if [ -z "${VENV:-}" ] || [ ! -x "$PY" ]; then
  echo "找不到 Python 环境。请先执行：" >&2
  echo "  cd desktop && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt pyinstaller" >&2
  echo "或显式指定：VENV=/path/to/venv ./build_app.sh" >&2
  exit 1
fi

echo "==> 1/5 安装依赖"
"$PY" -m pip install -q -r requirements.txt pyinstaller

echo "==> 2/5 构建 C++ 核心"
"$PY" -m pip install -q -r requirements-build.txt
"$PY" setup.py build_ext --inplace

echo "==> 3/5 构建前端"
if [ ! -d frontend/node_modules ]; then
  (cd frontend && npm install --no-audit --no-fund)
fi
(cd frontend && npm run build)

echo "==> 4/5 PyInstaller 打包"
"$PY" -m PyInstaller --noconfirm --clean stockdesk.spec

echo "==> 5/5 复制到项目根目录"
rm -rf "StockDesk.app"
cp -R "dist/StockDesk.app" "StockDesk.app"

echo ""
echo "构建完成: $(pwd)/StockDesk.app"
echo "双击打开，或执行: open StockDesk.app"
