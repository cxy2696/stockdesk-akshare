"""A-share trading session helper."""
from __future__ import annotations

from datetime import datetime, timedelta


def last_session_date() -> str:
    """The date the latest completed/current session belongs to.

    Before the open (and at weekends) the snapshot is the previous close; using
    the wall-clock date there would label yesterday's prices as today's.
    """
    now = datetime.now()
    day = now.date()
    hm = now.hour * 100 + now.minute
    if now.weekday() >= 5:
        day -= timedelta(days=now.weekday() - 4)
    elif hm < 930:
        day -= timedelta(days=1)
        while day.weekday() >= 5:
            day -= timedelta(days=1)
    return day.isoformat()


def kline_ttl() -> int:
    """How long a daily-bar payload is safe to reuse.

    Intraday bars change every few minutes, so keep the existing short TTL
    while the market is open.  After the close (and before the next open) the
    bars are final; keeping them until the next session cuts the repeated
    K-line sweeps that made the watchlist/decision pages look blank.  The TTL
    is capped at 12 hours so an overnight cache still expires before the next
    trading day's data can be mistaken for final.
    """
    status = market_status()
    if status.get("open"):
        return 120
    if status.get("label") == "集合竞价":
        return 60
    if status.get("label") == "午间休市":
        return 900
    now = datetime.now()
    next_open = now.replace(hour=9, minute=15, second=0, microsecond=0)
    if now >= next_open:
        next_open += timedelta(days=1)
    while next_open.weekday() >= 5:
        next_open += timedelta(days=1)
    return max(60, min(12 * 3600, int((next_open - now).total_seconds())))


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
