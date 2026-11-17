#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."

OLD="https://cxy2696.github.io/stockdesk-akshare"
NEW="https://stockdesk-akshare.is-a.dev"

if ! dig +short stockdesk-akshare.is-a.dev CNAME | grep -q 'cxy2696.github.io'; then
  echo "DNS is not ready. Expected CNAME stockdesk-akshare.is-a.dev -> cxy2696.github.io" >&2
  exit 1
fi

echo "stockdesk-akshare.is-a.dev" > docs/CNAME
python3 - <<'PY'
from pathlib import Path
old = "https://cxy2696.github.io/stockdesk-akshare"
new = "https://stockdesk-akshare.is-a.dev"
for name in ("docs/index.html", "docs/site.js"):
    p = Path(name)
    if p.exists():
        p.write_text(p.read_text().replace(old, new))
PY

echo "Updated docs/CNAME, docs/index.html, docs/site.js"
echo "Next: git add docs/CNAME docs/index.html docs/site.js && git commit -m 'chore: use official is-a.dev domain' && git push"
