# Publishing on GitHub / 发布到 GitHub

## Suggested repository settings

- **Name**: `stockdesk-akshare`
- **Description**: `Local-first stock investment desk for macOS, Windows, iOS and US equities — A-share HMM/percolation models, portfolio analytics and a standalone US dashboard.`
- **Topics**: `stock-analysis`, `a-shares`, `us-stocks`, `fastapi`, `react`, `swiftui`, `pywebview`, `hmm`, `percolation`, `echarts`
- **Visibility**: private until you choose a license

## Push

```bash
cd stockdesk-akshare
git remote add origin git@github.com:<you>/stockdesk-akshare.git
git branch -M main
git push -u origin main
```

## Release assets

Do **not** commit build outputs. Attach them to a GitHub Release:

- `StockDesk-1.9.0-macOS.zip` (app bundle)
- `StockDesk-1.9.0-Windows.exe`
- `StockDesk-3.5-iOS-unsigned.ipa`

## Screenshots

Use the files in `screenshots/`:

- `mac-hub.png`
- `ios-hub.png`
- `us-market.png`

## Before making it public

1. Add a `LICENSE` (MIT/Apache-2.0/private).
2. Remove any personal account data, databases, logs and signing credentials.
3. Check that screenshots do not contain a real account balance or UID.
4. Keep the disclaimer visible in README and the app.
5. Enable branch protection and secret scanning.

## CI

`.github/workflows/ci.yml` compiles the Python sources and builds the React frontend. It does not require secrets.
