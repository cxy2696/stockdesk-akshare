"""StockDesk project entry point.

The desktop launcher lives in ``desktop/main.py``; the standalone US dashboard
lives in ``us/run.py``. This file exists so the repository root has a clear
Python entry point and language metadata.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent

if __name__ == "__main__":
    print("Desktop:  cd desktop && python main.py")
    print("US:       cd us && python run.py")
    print("iOS:      open ios/StockDesk.xcodeproj")
