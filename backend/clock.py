"""A-share trading session helper."""
from __future__ import annotations

from datetime import datetime


def market_status() -> dict:
    now = datetime.now()
    if now.weekday() >= 5:
        return {"open": False, "label": "休市", "now": now.strftime("%Y-%m-%d %H:%M:%S")}
    hm = now.hour * 100 + now.minute
    if 915 <= hm < 930:
        return {"open": False, "label": "集合竞价", "now": now.strftime("%H:%M:%S")}
    if 930 <= hm <= 1130 or 1300 <= hm <= 1500:
        return {"open": True, "label": "交易中", "now": now.strftime("%H:%M:%S")}
    if 1130 < hm < 1300:
        return {"open": False, "label": "午间休市", "now": now.strftime("%H:%M:%S")}
    return {"open": False, "label": "已收盘", "now": now.strftime("%H:%M:%S")}
