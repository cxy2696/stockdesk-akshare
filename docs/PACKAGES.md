# Packages · 包

[中文](#中文) · [English](#english)

## 中文

StockDesk 在 GitHub Container Registry 上提供了两个镜像，分别对应 A 股和美股。它们都是独立的本地服务，不共享数据。

### A 股版

```bash
docker run --rm -p 8765:8765 \
  -v stockdesk-data:/data \
  ghcr.io/cxy2696/stockdesk-akshare-a-share:latest
```

打开 <http://127.0.0.1:8765>。

- 镜像：`ghcr.io/cxy2696/stockdesk-akshare-a-share`
- 标签：`1.9.0`、`latest`
- 数据：`/data` 卷，建议长期保留
- 页面：FastAPI + React HUD

### 美股版

```bash
docker run --rm -p 8770:8770 \
  ghcr.io/cxy2696/stockdesk-akshare-us:latest
```

打开 <http://127.0.0.1:8770>。

- 镜像：`ghcr.io/cxy2696/stockdesk-akshare-us`
- 标签：`1.0.0`、`latest`
- 页面：FastAPI + 原生 HTML/CSS/JS + 本地 ECharts

### 说明

- 两个镜像都是 `linux/amd64`；Apple Silicon 上由 Docker 模拟运行。
- 镜像由 `.github/workflows/publish-container.yml` 自动构建，并在发布前请求健康检查。
- 容器里不包含任何账户数据。

## English

StockDesk publishes two images on GitHub Container Registry: one for A-shares and one for US equities. They are independent local services and do not share data.

### A-share

```bash
docker run --rm -p 8765:8765 \
  -v stockdesk-data:/data \
  ghcr.io/cxy2696/stockdesk-akshare-a-share:latest
```

Open <http://127.0.0.1:8765>.

- Image: `ghcr.io/cxy2696/stockdesk-akshare-a-share`
- Tags: `1.9.0`, `latest`
- Data: the `/data` volume; keep it between runs
- UI: FastAPI + React HUD

### US edition

```bash
docker run --rm -p 8770:8770 \
  ghcr.io/cxy2696/stockdesk-akshare-us:latest
```

Open <http://127.0.0.1:8770>.

- Image: `ghcr.io/cxy2696/stockdesk-akshare-us`
- Tags: `1.0.0`, `latest`
- UI: FastAPI + plain HTML/CSS/JS + local ECharts

### Notes

- Both images are `linux/amd64`; Docker emulates them on Apple Silicon.
- `.github/workflows/publish-container.yml` builds and smoke-tests each image before publishing.
- No account data is baked into either image.
