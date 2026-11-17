"""Optional C++ acceleration for the StockDesk model core."""
from __future__ import annotations

try:
    from . import _native as native  # type: ignore
    NATIVE = True
    VERSION = getattr(native, "__version__", "unknown")
except Exception as exc:  # noqa: BLE001
    native = None
    NATIVE = False
    VERSION = ""
    ERROR = str(exc)
else:
    ERROR = ""


def status() -> dict:
    return {
        "backend": "C++" if NATIVE else "NumPy fallback",
        "native": NATIVE,
        "version": VERSION,
        "module": getattr(native, "__file__", None) if NATIVE else None,
    }
