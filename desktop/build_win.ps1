# Build the StockDesk Windows one-file exe.
# Usage (from desktop/):  powershell -ExecutionPolicy Bypass -File .\build_win.ps1
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Test-Path "frontend\node_modules")) {
  Push-Location frontend
  npm ci
  Pop-Location
}

Push-Location frontend
npm run build
Pop-Location

# Keep the exe small. These are optional pandas/akshare dependencies that the
# live backend does not import (verified by the API smoke test).
$excludes = @(
  "tkinter",
  "pyarrow",
  "scipy",
  "matplotlib",
  "PIL",
  "openpyxl",
  "xlsxwriter",
  "xlrd",
  "pyxlsb",
  "odf",
  "calamine",
  "IPython",
  "pytest"
)

$excludeArgs = @()
foreach ($m in $excludes) { $excludeArgs += @("--exclude-module", $m) }

python -m PyInstaller --noconfirm --clean --onefile --noconsole --name StockDesk `
  --add-data "frontend/dist;frontend_dist" `
  --add-data "backend/data/all_symbols.json;backend/data" `
  --collect-submodules backend `
  --collect-submodules akshare `
  --collect-data akshare `
  --collect-all webview `
  --collect-all pythonnet `
  --collect-all clr_loader `
  --hidden-import anyio._backends._asyncio `
  @excludeArgs `
  main.py

Write-Host ""
Write-Host "Built: $PSScriptRoot\dist\StockDesk.exe"
