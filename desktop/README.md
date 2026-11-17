# StockDesk 桌面端

源码、构建和运行说明见仓库根目录：

- [项目总览](../README.md)
- [安装与构建](../docs/INSTALL.md)
- [架构说明](../docs/ARCHITECTURE.md)

快速启动：

```bash
cd desktop
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cd frontend && npm ci && npm run build && cd ..
python main.py
```
