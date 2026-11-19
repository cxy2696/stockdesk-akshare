# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec: build StockDesk.app (macOS) with bundled frontend."""
import os
import re
import sys
from PyInstaller.utils.hooks import collect_submodules, collect_data_files, collect_dynamic_libs

block_cipher = None
ROOT = os.path.abspath(os.getcwd())


def app_version() -> str:
    """Keep the bundle version in lockstep with backend/config.py."""
    try:
        with open(os.path.join(ROOT, "backend", "config.py"), encoding="utf-8") as fh:
            match = re.search(r'^APP_VERSION\s*=\s*"([^"]+)"', fh.read(), re.MULTILINE)
            if match:
                return match.group(1)
    except OSError:
        pass
    return "0.0.0"


VERSION = app_version()

datas = [
    (os.path.join(ROOT, "frontend", "dist"), "frontend_dist"),
    (os.path.join(ROOT, "backend", "data"), "backend/data"),
] + collect_data_files("akshare")
binaries = []
hiddenimports = collect_submodules("uvicorn") + collect_submodules("akshare") + [
    "backend._native", "backend.native", "backend.evaluation", "backend.portfolio_backtest",
    "webview", "webview.platforms.cocoa",
]

try:
    import lightgbm  # noqa: F401
    import scipy  # noqa: F401
    datas += collect_data_files("lightgbm")
    binaries += collect_dynamic_libs("lightgbm")
    hiddenimports += collect_submodules("lightgbm") + collect_submodules("scipy")
except Exception:
    pass

# Optional rflux HMM backend. It is not a hard dependency: if the package or
# its dylib is missing, StockDesk's native/NumPy path is used instead.
try:
    import rflux  # noqa: F401
    datas += collect_data_files("rflux")
    binaries += collect_dynamic_libs("rflux")
    hiddenimports += collect_submodules("rflux")
except Exception:
    pass

a = Analysis(
    ["main.py"],
    pathex=[ROOT],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    runtime_hooks=[],
    excludes=[
        "tkinter",
        # Optional heavy dependencies of pandas/akshare. The desktop backend
        # only uses pandas/numpy/akshare HTTP helpers; none of these are
        # imported by the live code paths (verified by the API smoke test).
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
        "pytest",
    ],
    cipher=block_cipher,
    noarchive=False,
)
pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="StockDesk",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch="arm64",
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=False,
    name="StockDesk",
)

app = BUNDLE(
    coll,
    name="StockDesk.app",
    icon=None,
    target_arch="arm64",
    bundle_identifier="com.stockdesk.personal",
    info_plist={
        "CFBundleName": "StockDesk",
        "CFBundleDisplayName": "StockDesk",
        "CFBundleShortVersionString": VERSION,
        "CFBundleVersion": VERSION,
        "NSHighResolutionCapable": True,
        "LSMinimumSystemVersion": "12.0",
        "LSApplicationCategoryType": "public.app-category.finance",
        "NSRequiresAquaSystemAppearance": False,
    },
)
