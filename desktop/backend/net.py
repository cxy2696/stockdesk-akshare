"""Network compatibility helpers.

Some networks resolve IPv6 for Eastmoney but cannot route it: the TLS
handshake completes and then the peer closes the connection (or the route
black-holes). Python's urllib tries the IPv6 address first and does not retry
the IPv4 address after a failure, which made every Eastmoney call look like an
outage and left indices / boards / fund flow empty.

Prefer IPv4 for Eastmoney hosts only, leaving every other host untouched.
"""
from __future__ import annotations

import socket

_PATCHED = False


def prefer_ipv4_eastmoney() -> None:
    global _PATCHED
    if _PATCHED:
        return
    original = socket.getaddrinfo

    def getaddrinfo(host, port, family=0, type=0, proto=0, flags=0):  # type: ignore[no-untyped-def]
        if isinstance(host, str) and "eastmoney.com" in host:
            family = socket.AF_INET
        return original(host, port, family, type, proto, flags)

    socket.getaddrinfo = getaddrinfo  # type: ignore[assignment]
    _PATCHED = True
