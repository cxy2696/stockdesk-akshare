# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec: build StockDesk.app (macOS) with bundled frontend."""
import os
import sys
from PyInstaller.utils.hooks import collect_submodules, collect_data_files

block_cipher = None
ROOT = os.path.abspath(os.getcwd())

datas = [
    (os.path.join(ROOT, "frontend", "dist"), "frontend_dist"),
    (os.path.join(ROOT, "backend", "data"), "backend/data"),
] + collect_data_files("akshare")
hiddenimports = collect_submodules("uvicorn") + collect_submodules("akshare") + ["webview", "webview.platforms.cocoa"]

a = Analysis(
    ["main.py"],
    pathex=[ROOT],
    binaries=[],
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
        "CFBundleShortVersionString": "1.11.0",
        "CFBundleVersion": "1.11.0",
        "NSHighResolutionCapable": True,
        "LSMinimumSystemVersion": "12.0",
        "LSApplicationCategoryType": "public.app-category.finance",
        "NSRequiresAquaSystemAppearance": False,
    },
)
