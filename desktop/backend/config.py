from __future__ import annotations

import os
import sys
from pathlib import Path

APP_NAME = "StockDesk"
APP_VERSION = "1.12.0"

BASE_DIR = Path(__file__).resolve().parent


def data_dir() -> Path:
    """Where user data (db, cache) lives. Defaults to ./data next to the app."""
    override = os.environ.get("STOCKDESK_DATA")
    if override:
        p = Path(override).expanduser()
    elif sys.platform == "win32":
        p = Path(os.environ.get("LOCALAPPDATA", str(Path.home()))) / APP_NAME
    elif getattr(sys, "frozen", False):
        p = Path.home() / "Library" / "Application Support" / APP_NAME
    else:
        p = Path(__file__).resolve().parent.parent / "data"
    p.mkdir(parents=True, exist_ok=True)
    return p


def asset_root() -> Path:
    if getattr(sys, "frozen", False):
        return Path(getattr(sys, "_MEIPASS", "."))
    return Path(__file__).resolve().parent.parent


def frontend_dist() -> Path:
    """Bundled assets (PyInstaller) or the Vite build output in development."""
    frozen = asset_root() / "frontend_dist"
    if getattr(sys, "frozen", False):
        return frozen
    built = asset_root() / "frontend" / "dist"
    if (built / "index.html").exists():
        return built
    if (frozen / "index.html").exists():
        return frozen
    return built


DB_PATH = data_dir() / "stockdesk.db"
CACHE_PATH = data_dir() / "cache.db"

# Eastmoney endpoints
EM_QUOTE = "https://push2.eastmoney.com/api/qt"
EM_HIS = "https://push2his.eastmoney.com/api/qt/stock/kline/get"
EM_LIST = "https://push2.eastmoney.com/api/qt/clist/get"
EM_UT = "fa5fd1943c7b386f172d6893dbfba10b"

# spot cache: 5927 stocks ~ 3MB payload
SPOT_TTL = 180          # seconds
QUOTE_TTL = 20
KLINE_TTL = 600
INDEX_TTL = 30

DEFAULT_CAPITAL = 200_000.0

INDEXES = [
    {"code": "000001", "secid": "1.000001", "name": "上证指数", "short": "上证"},
    {"code": "399001", "secid": "0.399001", "name": "深证成指", "short": "深证"},
    {"code": "399006", "secid": "0.399006", "name": "创业板指", "short": "创业板"},
    {"code": "000300", "secid": "1.000300", "name": "沪深300", "short": "沪深300"},
    {"code": "000688", "secid": "1.000688", "name": "科创50", "short": "科创50"},
]
