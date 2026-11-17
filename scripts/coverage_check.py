#!/usr/bin/env python3
"""Live full-market coverage gate.

Usage:
    python scripts/coverage_check.py http://127.0.0.1:8765
    STOCKDESK_BASE=http://127.0.0.1:8765 python scripts/coverage_check.py

Exit code is 0 only when every expected A-share has a row, no duplicate codes,
and every non-suspended row has a quote. Legitimate suspensions are reported
but do not fail the gate; a broad missing/stale batch does.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.request


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("base", nargs="?", default=os.environ.get("STOCKDESK_BASE", "http://127.0.0.1:8765"))
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()
    url = args.base.rstrip("/") + "/api/market/coverage"
    try:
        with urllib.request.urlopen(url, timeout=180) as resp:
            payload = json.loads(resp.read())
    except Exception as exc:  # noqa: BLE001
        print(f"coverage request failed: {exc}", file=sys.stderr)
        return 2
    data = payload.get("data") or {}
    if args.json:
        print(json.dumps(data, ensure_ascii=False, indent=2))
    else:
        print(f"market coverage: {data.get('present')}/{data.get('expected')} rows, "
              f"missing={data.get('missing')}, duplicates={data.get('duplicates')}, "
              f"suspended={data.get('suspended')}, unpriced={data.get('unpriced')}, "
              f"complete={data.get('complete')}, data_complete={data.get('data_complete')}, "
              f"fully_quoted={data.get('fully_quoted')}")
        if data.get("missing_sample"):
            print("missing sample:", data["missing_sample"])
        print("boards:", data.get("boards"), "sources:", data.get("sources"))
    problems = []
    if not data:
        problems.append("empty coverage payload")
    if int(data.get("missing") or 0) != 0:
        problems.append(f"missing={data.get('missing')}")
    if int(data.get("duplicates") or 0) != 0:
        problems.append(f"duplicates={data.get('duplicates')}")
    if int(data.get("present") or 0) < int(data.get("expected") or 0):
        problems.append("present < expected")
    if not data.get("data_complete"):
        problems.append("some non-suspended rows have no quote")
    if problems:
        print("coverage gate FAILED:", ", ".join(problems), file=sys.stderr)
        return 1
    print("coverage gate OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
