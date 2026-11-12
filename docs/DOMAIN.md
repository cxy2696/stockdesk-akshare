# Official domain · 官方域名

Target: **https://stockdesk-akshare.is-a.dev/**

The `.com` domain is not registered. The free `.is-a.dev` subdomain is used instead.

## 1. Register the subdomain manually

`is-a.dev` explicitly asks that requests are not generated or submitted by AI. Submit this manually:

1. Fork `is-a-dev/register`.
2. Add `domains/stockdesk-akshare.json` using the file in this repository (`docs/domains/stockdesk-akshare.json`).
3. Replace the owner email with a reachable address if needed.
4. Open a pull request against `is-a-dev/register:main`.
5. Wait for review and merge.

The record must be:

```json
{
  "owner": { "username": "cxy2696", "email": "you@example.com" },
  "records": { "CNAME": "cxy2696.github.io" }
}
```

## 2. Verify DNS

After merge:

```bash
dig +short stockdesk-akshare.is-a.dev CNAME
# cxy2696.github.io.
```

## 3. Activate GitHub Pages

Only after DNS resolves:

```bash
gh api -X PUT repos/cxy2696/stockdesk-akshare/pages \
  -f cname=stockdesk-akshare.is-a.dev \
  -F https_enforced=true
```

Then add `docs/CNAME` with:

```text
stockdesk-akshare.is-a.dev
```

## 4. Publish metadata and links

Run the repository helper:

```bash
./scripts/activate_custom_domain.sh
git add docs/CNAME docs/index.html docs/site.js
git commit -m "chore: use official is-a.dev domain"
git push
```

The script updates:

- `og:url`
- `og:image`
- site share text
- canonical link
- `docs/CNAME`

## 5. Verify

```bash
curl -I https://stockdesk-akshare.is-a.dev/
curl -I https://stockdesk-akshare.is-a.dev/StockDesk-macOS-1.10.0.zip
```

Expected:

- HTTPS 200
- GitHub Pages certificate valid
- Old `cxy2696.github.io/stockdesk-akshare/` still reachable or redirects
- Direct macOS / Windows / iOS downloads work

## Why not `.com`

`stockdesk-akshare.com` is currently unregistered (WHOIS: no match). It is not free and requires a registrar account and annual renewal. The free `is-a.dev` option keeps the official site zero-cost while preserving the StockDesk brand.
