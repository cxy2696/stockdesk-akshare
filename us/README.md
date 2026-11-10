# StockDesk US / 美股版

<details open>
<summary><b>English</b></summary>

Standalone US equity dashboard.

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python run.py
```

Open http://127.0.0.1:8770.

- Indices, watchlist, search, candles, movers, breadth.
- Local ECharts bundle; no build step.
- Independent from the A-share desktop app.

</details>

<details>
<summary><b>中文</b></summary>

## 中文

独立的美股仪表盘，与 A 股桌面版完全分离。

- 道琼斯 / 纳斯达克 100 / 标普 500
- 自选股增删、代码/公司搜索
- 日 K + 成交量（3M / 6M / 1Y）
- 涨幅榜 / 跌幅榜
- 市场宽度样本
- 中文 / English 顶栏切换
- 60 秒自动刷新

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python run.py
```

打开 http://127.0.0.1:8770

</details>
