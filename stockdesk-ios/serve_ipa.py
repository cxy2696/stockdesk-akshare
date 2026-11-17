#!/usr/bin/env python3
"""Serve the iOS build on the local network so a phone can download it.

    python serve_ipa.py            # http://<lan-ip>:8799
"""
from __future__ import annotations

import http.server
import socket
import socketserver
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DIST = ROOT / "dist"
PORT = 8799


def lan_ip() -> str:
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        return s.getsockname()[0]
    except Exception:
        return "127.0.0.1"
    finally:
        s.close()


def make_qr(url: str) -> Path:
    import qrcode

    img = qrcode.make(url)
    out = DIST / "qr.png"
    img.save(out)
    return out


PAGE = """<!doctype html>
<html lang="zh-CN"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>StockDesk · 手机安装</title>
<style>
  :root {{ color-scheme: light; }}
  body {{ margin:0; font-family:-apple-system,"PingFang SC",sans-serif; background:#F4F6FA; color:#0F172A; }}
  .wrap {{ max-width:520px; margin:0 auto; padding:28px 20px 60px; }}
  .logo {{ width:64px;height:64px;border-radius:16px;background:linear-gradient(135deg,#2563EB,#7C3AED);
          display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:28px; }}
  h1 {{ font-size:24px; margin:16px 0 4px; }}
  .sub {{ color:#55627A; font-size:13px; margin-bottom:22px; }}
  .card {{ background:#fff;border:1px solid #E4E9F2;border-radius:16px;padding:18px;margin-bottom:14px;
           box-shadow:0 6px 20px rgba(15,23,42,.05); }}
  .btn {{ display:block;text-align:center;padding:14px;border-radius:12px;text-decoration:none;font-weight:600;
          color:#fff;background:linear-gradient(135deg,#2563EB,#4F46E5);margin-top:10px; }}
  .btn.secondary {{ background:#EEF2F8;color:#0F172A;border:1px solid #E4E9F2; }}
  .hint {{ font-size:12px;color:#8B95A8;line-height:1.7;margin-top:8px; }}
  ol {{ padding-left:20px; font-size:13px; line-height:1.9; color:#334155; }}
  code {{ background:#F1F5F9;padding:1px 5px;border-radius:4px;font-size:12px; }}
  .qr {{ text-align:center;margin:8px 0 2px; }}
  .qr img {{ width:180px;height:180px;border-radius:12px;border:1px solid #E4E9F2;background:#fff; }}
  .badge {{ display:inline-block;font-size:11px;background:#E8EFFF;color:#2563EB;padding:2px 8px;border-radius:99px; }}
</style></head>
<body><div class="wrap">
  <div class="logo">S</div>
  <h1>StockDesk <span class="badge">iOS</span></h1>
  <div class="sub">完全本地运行的个人股票投资 App · v1.0</div>

  <div class="card">
    <b>1. 把安装包下载到手机</b>
    <a class="btn" href="/StockDesk-unsigned.ipa" download>下载 IPA（816 KB）</a>
    <a class="btn secondary" href="/StockDesk.app.zip" download>下载模拟器 App（zip）</a>
    <div class="hint">IPA 是未签名包，iOS 不能直接点击安装，需要用下面的方式重签。</div>
  </div>

  <div class="card">
    <b>2. 安装到 iPhone</b>
    <ol>
      <li><b>推荐：</b>Mac 上用 Xcode 打开 <code>StockDesk.xcodeproj</code>，选你的 Apple ID Team，连上 iPhone 按 ⌘R（免费，7 天有效）</li>
      <li><b>或：</b>电脑安装 <a href="https://sideloadly.io">Sideloadly</a>，连接 iPhone，拖入刚下载的 IPA，登录 Apple ID 重签安装</li>
      <li>首次运行后在 iPhone「设置 → 通用 → VPN 与设备管理」里信任证书</li>
    </ol>
    <div class="hint">想长期稳定分发 / 公开下载，需要 Apple Developer 付费账号走 TestFlight 或 App Store。</div>
  </div>

  <div class="card qr">
    <b>在手机上打开本页</b>
    <div class="hint">同一 Wi-Fi 下扫描二维码，或访问 <code>{url}</code></div>
    <img src="/qr.png" alt="QR">
  </div>
</div></body></html>
"""


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(DIST), **kwargs)

    def do_GET(self):
        if self.path in ("/", "/index.html"):
            ip = lan_ip()
            body = PAGE.format(url=f"http://{ip}:{PORT}/").encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        return super().do_GET()

    def log_message(self, fmt, *args):
        sys.stderr.write("[ipa] " + fmt % args + "\n")


def main():
    DIST.mkdir(exist_ok=True)
    ip = lan_ip()
    url = f"http://{ip}:{PORT}/"
    qr = make_qr(url)
    # zip the simulator app for easy download
    import shutil

    app = DIST / "StockDesk.app"
    if app.exists():
        shutil.make_archive(str(DIST / "StockDesk.app"), "zip", root_dir=DIST, base_dir="StockDesk.app")
    print("\n" + "=" * 52)
    print("  StockDesk 手机下载页已启动")
    print(f"  手机访问: {url}")
    print(f"  二维码:   {qr}")
    print("=" * 52 + "\n")
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("0.0.0.0", PORT), Handler) as httpd:
        httpd.serve_forever()


if __name__ == "__main__":
    main()
