# Packages / 包

## Container (GHCR)

`stockdesk-akshare-us` is published to GitHub Container Registry.

```bash
docker run --rm -p 8770:8770 ghcr.io/cxy2696/stockdesk-akshare-us:latest
```

Open `http://127.0.0.1:8770`.

- Image: `ghcr.io/cxy2696/stockdesk-akshare-us`
- Tags: `1.0.0`, `latest`
- Contents: US edition (FastAPI + static dashboard)
- No account data is baked into the image.

The image is built by `.github/workflows/publish-container.yml` using `us/Dockerfile`.

## Release assets

See the repository **Releases** page for:

- macOS `.zip` (StockDesk 1.9.0)
- Windows `.exe` (StockDesk 1.9.0)
- iOS unsigned `.ipa` (3.6.27)
