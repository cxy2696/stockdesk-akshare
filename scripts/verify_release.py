#!/usr/bin/env python3
"""Verify the release/ folder: required files, hashes, versions, archive shape.

Usage:
    python scripts/verify_release.py [--dir release] [--json]
"""
from __future__ import annotations

import argparse
import hashlib
import json
import plistlib
import zipfile
from pathlib import Path

DESKTOP_VERSION = "1.17.0"
IOS_VERSION = "4.1.2"

REQUIRED = [
    f"StockDesk-macOS-{DESKTOP_VERSION}.dmg",
    f"StockDesk-macOS-{DESKTOP_VERSION}.zip",
    "StockDesk.exe",
    f"StockDesk-iOS-{IOS_VERSION}-unsigned.ipa",
    "StockDesk-simulator.app.zip",
    "SHA256SUMS.txt",
]


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def zip_plist(path: Path, member: str) -> dict | None:
    """Read a binary/XML Info.plist inside a zip without extracting it."""
    try:
        with zipfile.ZipFile(path) as zf:
            names = zf.namelist()
            match = next((n for n in names if n.endswith(member)), None)
            if not match:
                return None
            return plistlib.loads(zf.read(match))
    except (OSError, zipfile.BadZipFile, plistlib.InvalidFileException):
        return None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", default="release")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    root = Path(args.dir).resolve()
    problems: list[str] = []
    rows: list[dict] = []
    manifest: dict[str, str] = {}

    sha_file = root / "SHA256SUMS.txt"
    if sha_file.exists():
        for line in sha_file.read_text(encoding="utf-8").splitlines():
            parts = line.split()
            if len(parts) == 2:
                manifest[parts[1]] = parts[0]

    for name in REQUIRED:
        path = root / name
        if not path.exists():
            problems.append(f"missing {name}")
            rows.append({"file": name, "status": "MISSING"})
            continue
        digest = sha256(path)
        status = "OK"
        if name in manifest and manifest[name] != digest:
            status = "HASH MISMATCH"
            problems.append(f"{name}: hash mismatch")
        rows.append({"file": name, "size": path.stat().st_size, "sha256": digest, "status": status})

    # macOS ZIP must contain the app and the installer.
    mac_zip = root / f"StockDesk-macOS-{DESKTOP_VERSION}.zip"
    if mac_zip.exists():
        try:
            with zipfile.ZipFile(mac_zip) as zf:
                names = zf.namelist()
            for required in ("StockDesk.app/Contents/Info.plist", "Install-StockDesk.command"):
                if not any(n.endswith(required) for n in names):
                    problems.append(f"macOS zip missing {required}")
        except zipfile.BadZipFile:
            problems.append("macOS zip is not a valid zip")

    # iOS IPA must contain Payload/StockDesk.app with the expected version.
    ipa = root / f"StockDesk-iOS-{IOS_VERSION}-unsigned.ipa"
    if ipa.exists():
        info = zip_plist(ipa, "Payload/StockDesk.app/Info.plist")
        if info is None:
            problems.append("IPA missing Payload/StockDesk.app/Info.plist")
        else:
            version = info.get("CFBundleShortVersionString")
            if version != IOS_VERSION:
                problems.append(f"IPA version {version} != {IOS_VERSION}")

    # Simulator app must be a zip containing StockDesk.app.
    sim = root / "StockDesk-simulator.app.zip"
    if sim.exists():
        try:
            with zipfile.ZipFile(sim) as zf:
                names = zf.namelist()
            if not any(n.endswith(".app/Info.plist") for n in names):
                problems.append("simulator zip missing .app/Info.plist")
        except zipfile.BadZipFile:
            problems.append("simulator zip is not a valid zip")

    exe = root / "StockDesk.exe"
    if exe.exists():
        with exe.open("rb") as fh:
            magic = fh.read(2)
        if magic != b"MZ":
            problems.append("StockDesk.exe is not a PE executable")
        if exe.stat().st_size < 20 * 1024 * 1024:
            problems.append("StockDesk.exe is suspiciously small")

    dmg = root / f"StockDesk-macOS-{DESKTOP_VERSION}.dmg"
    if dmg.exists() and dmg.stat().st_size < 20 * 1024 * 1024:
        problems.append("DMG is suspiciously small")

    if args.json:
        print(json.dumps({"root": str(root), "rows": rows, "problems": problems}, ensure_ascii=False, indent=2))
    else:
        print(f"Release check: {root}\n")
        for row in rows:
            size = f"{row.get('size', 0) / 1024 / 1024:6.1f} MB" if row.get("size") else " " * 9
            print(f"{row['status']:>10}  {size}  {row['file']}")
        print()
        if problems:
            print("problems:")
            for p in problems:
                print(" -", p)
        else:
            print(f"all {len(REQUIRED)} required artifacts verified")

    return 1 if problems else 0


if __name__ == "__main__":
    raise SystemExit(main())
