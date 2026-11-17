# StockDesk US · 美股版

[中文](#中文) · [English](#english)

完整使用流程：[使用教程与流程](../docs/GUIDE.md) · Full walkthrough: [Guide & Workflow](../docs/GUIDE.md).

## 中文

这是一个可以放在自己电脑上运行的美股仪表盘。它不依赖 Mac 后端，也不会碰 A 股桌面版的数据；打开后就是一个独立的本地网页。

你可以用它快速看盘：

- 道琼斯、纳斯达克 100、标普 500 的实时位置
- 自选股增删与本地保存
- 按代码或公司名搜索
- 日 K 线和成交量，支持 3M / 6M / 1Y
- 涨幅榜和跌幅榜
- 按成交额样本估算的市场宽度
- 顶栏「中 / EN」随时切换语言
- 每 60 秒自动刷新

### 运行

```bash
python -m venv .venv
source .venv/bin/activate       # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python run.py
```

然后打开 <http://127.0.0.1:8770>（如端口被占用会自动顺延，以终端打印的地址为准）。

行情来自东方财富公开接口，只用于研究，不构成投资建议。

## English

This is a small US equity dashboard you can run on your own machine. It does not need the Mac backend and does not touch the A-share app's data — it is simply a local web app.

A few things it is good at:

- Dow Jones, Nasdaq 100 and S&P 500 at a glance
- A watchlist that stays in your browser
- Search by ticker or company name
- Daily candles and volume for 3M / 6M / 1Y
- Gainers and losers boards
- A market-breadth estimate from the top-turnover sample
- A 中 / EN switch in the top bar
- Automatic refresh every 60 seconds

### Run

```bash
python -m venv .venv
source .venv/bin/activate       # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python run.py
```

Open <http://127.0.0.1:8770> (if the port is busy, the launcher picks the next one and prints the URL).

Quotes come from Eastmoney's public endpoints. They are for research only, not investment advice.
