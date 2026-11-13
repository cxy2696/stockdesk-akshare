# Models · 模型维护

[中文](#中文) · [English](#english)

## 中文

### 版本

当前模型注册表：**2.1.0**（`desktop/backend/model_registry.py`）

| 模型 | 版本 | 参数 | 输出 | 边界 |
| --- | --- | --- | --- | --- |
| HMM | 2.0.0 | 3 状态、80 次迭代、420 日回看、3 个起点 | 弱势/震荡/强势后验概率、置信度、熵、已持续天数、平均持续、离开概率、状态统计、中文解读 | 状态切换滞后于价格；拟合出的状态不是基本面 |
| 渗流 | 2.0.0 | 阈值 0.592746、4 邻接、最少 100 只、稳定哈希排序 | 最大簇占比、簇数量、spanning、susceptibility、随机基线、p 值、50×50 分块图、行业分组 | 格点位置不代表产业关系；单日快照会抖 |
| 九转 TD | 1.0.0 | 建仓 9 根、倒计时 13 根、对比 4 / 2 日前、420 根 | 买卖计数、倒计时、信号、偏多/偏空、评分、中文解读 | 衰竭提示，不是反转保证 |
| KDJ | 1.2.0 | KDJ(9,3,3)、上轨 118、下轨 -14、180 根 | K/D/J、RSV、MA5/20、量比、中枢、趋势 | 极值提示；强趋势会钝化 |

版本和参数都在这一个文件里。模型升级时只改注册表和对应实现，前端通过 `/api/models/meta` 读版本，不用改页面。

### HMM 2.0.0

- 输入：上证、沪深300、创业板、深证、科创50 的日对数收益，回看 420 个交易日，最少 60 个样本。
- 拟合：多起点 Baum-Welch，3 个确定性初始化，取对数似然最优的一轮；方差有下限，避免退化成单点状态。
- 排序：按状态均值从低到高固定成弱势 / 震荡 / 强势，所以不同日期、不同指数之间的状态名可以直接比较。
- 新增输出：
  - `confidence` 后验置信度、`entropy` 归一化熵（越低越确定）
  - `regime_age` 已持续天数、`expected_days` 历史平均持续、`flip_risk` 明日离开概率
  - `stats[]` 每个状态的日均收益、年化波动、夏普、胜率、样本天数、占比、自持概率
  - `summary` 一句人类可读的总结，`interpretation` 是逐条解释
- 用途：决定总仓位。读的时候概率不到 60% 就当作震荡，不因为单日概率变化调仓。

### 渗流 2.0.0

- 输入：全市场约 5,500 只股票（剔除停牌、退市、ST 和零成交）。
- 排序：按 `crc32(code)` 稳定哈希排进二维方格。上市顺序会让相邻格子高度相关、把簇撑大，哈希排序把代码打散，结果可复现。
- 结构：4 邻接找最大连通簇，`giant_occupied = 最大簇 / 上涨家数`，临界值 0.592746 来自二维方格点渗流模型。
- 新增输出：
  - `spanning`：最大簇有没有同时触及格点的四条边
  - `susceptibility`：除最大簇外的簇大小加权和，越大越接近临界
  - `random_baseline` / `p_value`：固定上涨家数、随机重排 3 次，看实际最大簇是不是排序造成的假象
  - `grid`：50×50 分块图，把全市场压进一张图，而不是只看前 2,500 只
  - `industries[]`：行业/板块分组的广度、最大簇、状态、龙头。行业字段缺失超过 60% 时按市场分组，接口里 `grouping` 会标注
- 用途：决定做哪个行业。最大簇在临界线附近时，不押单边。

### 九转 TD 1.0.0

- 建仓结构：连续 9 根收盘价低于 4 日前收盘价 = 买入 9/9；高于 = 卖出 9/9。
- 倒计时：结构完成后最多 13 根，买入方向数跌破 2 日前低点，卖出方向数突破 2 日前高点，13/13 完成。
- 信号：`buy_9` / `sell_9` / `buy_13` / `sell_13`，途中给 `watch_buy` / `watch_sell` 和 `countdown_buy` / `countdown_sell`；完成后 20 根内算有效。
- 输出：`buy` / `sell` 计数、`countdown`、`signal`、`bias`、`score`、`strength`、`read`、近 20 日高低点。
- 接口：`GET /api/market/td/{code}?limit=220`，指数和个股都能查；模型快照里同时给出 5 个指数、最多 8 只持仓、临界行业龙头的九转。
- 边界：9/9 只说明这一段卖压或买压衰竭，需要放量止跌或跌破 5 日线来确认。下跌中 9 之后还能继续跌，震荡市计数会反复清零。

### 三个模型怎么配合

| 问题 | 模型 | 输出怎么用 |
| --- | --- | --- |
| 现在该拿多少仓位 | HMM | 状态 × 置信度决定总仓位区间；弱势降仓，强势拿住 |
| 行情是扩散还是少数在动 | 渗流 | 最大簇过临界值才谈扩散；分裂时只做最强主线 |
| 哪个行业先做 | 渗流行业分组 + 资金流 | 广度 ≥ 60%、最大簇不收缩、主力流入同向 |
| 什么时候买、什么时候减 | 九转 TD | 买结构等确认再试仓，卖结构跌破 5 日线先减 |
| 短线是否极值 | KDJ | 5m / 30m 同向触发权重更高，只做提醒 |

组合结论落在模型页的「策略映射」和每日策略的模型结论条：HMM 状态 × 渗流结构 → 进攻 / 均衡偏多 / 均衡偏防守 / 防守，对应 60%–80% / 45%–65% / 25%–45% / 0%–20% 四档总仓位。

### 刷新与缓存

| 内容 | 缓存 / 刷新 |
| --- | --- |
| 模型快照 | 后端 `market:models:v5` 缓存 10 分钟；页面每 5 分钟自动刷新 |
| 每日策略 | 后端 `market:daily:v5` 缓存 2 分钟；页面每 3 分钟刷新 |
| HUB 行情 | 30 秒 |
| 个股 / 行业资金流 | 60 秒 |
| KDJ | 60 秒 |
| 手动刷新 | 模型页、KDJ 页、每日策略都有按钮 |

行情失败时的兜底：东方财富连续失败后打开 45 秒短熔断，期间直接走新浪；日线额外用新浪兜底；全市场快照、板块列表、资金流各有单飞锁，避免并发请求重复下载；资金流只取净额两端各 900 只，不再拉全表。

### 自检

```bash
python scripts/model_selftest.py
```

用合成数据离线跑，不联网：

- 注册表版本存在，`hmm` / `percolation` / `td` / `kdj` 四个模型都在
- HMM 在合成收益序列上能给出状态、概率和转移矩阵
- 渗流在 220 个样本上给出最大簇，阈值与注册表一致
- 连续 9 根下跌收盘价必须得到 `buy.count == 9`、`bias == 偏多`
- KDJ 在 180 根合成 K 线上给出 K/D/J 与趋势判断

GitHub Actions 的 `Model check` 每周一至周五定时跑，改后端代码时也会跑，支持手动触发。改完模型先跑自检，再发版。

### 更新记录

| 注册表 | 变化 |
| --- | --- |
| 2.1.0 | 新增九转 TD 1.0.0；HMM 升到 2.0.0（多起点、置信度/熵/持续天数/状态统计）；渗流升到 2.0.0（稳定哈希、spanning、susceptibility、随机基线、50×50 分块、行业分组）；模型快照缓存键升到 `market:models:v5` |
| 2.0.0 | 注册表独立，HMM 1.1.0 + 渗流 1.1.0 + KDJ 1.2.0；参数集中管理，自检接入 CI |
| 1.x | 模型参数写在各实现里，前端直接读接口字段 |

## English

### Versions

Registry version: **2.1.0**, in `desktop/backend/model_registry.py`.

| Model | Version | Parameters | Output | Limits |
| --- | --- | --- | --- | --- |
| HMM | 2.0.0 | 3 states, 80 iterations, 420-day lookback, 3 starts | weak/range/strong posteriors, confidence, entropy, regime age, expected duration, flip risk, per-state stats | state changes lag price; states are fitted, not fundamental |
| Percolation | 2.0.0 | threshold 0.592746, 4-neighbour, min 100 names, stable-hash layout | giant share, cluster count, spanning, susceptibility, random baseline, p-value, 50×50 grid, industry groups | lattice position is not an industry link; one-day snapshots wobble |
| TD Sequential | 1.0.0 | setup 9, countdown 13, lookback 4 / 2, 420 bars | buy/sell counts, countdown, signal, bias, score, plain-language read | exhaustion signal, not a reversal guarantee |
| KDJ | 1.2.0 | KDJ(9,3,3), bands 118 / -14, 180 bars | K/D/J, RSV, MA5/20, volume ratio, central zone | extreme-zone flag only |

The UI reads `/api/models/meta`, so a model upgrade does not require a page rewrite.

### HMM 2.0.0

Daily log returns of the Shanghai Composite, CSI 300, ChiNext, Shenzhen Component and STAR 50, 420 bars, at least 60 samples. Three deterministic starts run Baum-Welch; the best log-likelihood wins. States are sorted by mean into weak → range → strong, so names mean the same thing across dates and indices.

New in 2.0.0: posterior confidence, normalised entropy, regime age, average duration, next-day flip risk, per-state daily mean / annualised volatility / Sharpe / win rate, and a plain-language summary. The HMM sets total exposure; in practice, below 60% confidence treat the regime as ranging and do not resize on a single-day probability shift.

### Percolation 2.0.0

About 5,500 A-shares (suspended, delisted and ST names removed) are placed on a 2-D lattice in `crc32(code)` order. Listing order makes neighbouring sites correlated and inflates clusters; the stable hash keeps the result reproducible and spreads codes out. The largest four-neighbour cluster divided by advancing names is `giant_occupied`; 0.592746 is the 2-D square-site threshold.

New in 2.0.0: `spanning` (does the giant touch all four edges), `susceptibility`, a random-layout baseline with a p-value over three shuffles, a 50×50 block grid that keeps every stock in the picture, and industry groups with breadth, giant share and leaders. When more than 60% of rows lack an industry field, grouping falls back to market and the response says so.

### TD Sequential 1.0.0

Nine consecutive closes below the close four bars earlier form a buy setup; nine above form a sell setup. After a completed setup, up to thirteen bars that undercut the low two bars back (buy) or exceed the high two bars back (sell) complete the countdown. Signals are `buy_9` / `sell_9` / `buy_13` / `sell_13`, with `watch_*` and `countdown_*` while a structure is still forming; a completed setup stays live for 20 bars.

Endpoint: `GET /api/market/td/{code}?limit=220`. The model snapshot also carries TD for the five indices, up to eight holdings and the leaders of industries closest to criticality. A 9/9 is exhaustion; wait for a volume-backed close or a reclaim of the 5-day line before acting.

### How they fit together

| Question | Model | How to use the output |
| --- | --- | --- |
| How much exposure now | HMM | state × confidence sets the position range |
| Broad advance or a few pockets | Percolation | only call it diffusion when the giant clears the threshold |
| Which industry first | Percolation groups + flow | breadth ≥ 60%, giant not shrinking, inflow aligned |
| When to buy or trim | TD | buy setup waits for confirmation; sell setup plus a 5-day break means trim |
| Short-term extremes | KDJ | same-direction 5m / 30m triggers carry more weight |

The combined stance lives in the Models page strategy mapping and the Daily Plan conclusion strip: HMM state × percolation structure → attack / balanced-long / balanced-defensive / defensive, mapped to 60–80% / 45–65% / 25–45% / 0–20% total exposure.

### Refresh and cache

| Item | Cache / refresh |
| --- | --- |
| Model snapshot | `market:models:v5`, 10-minute backend cache; page polls every 5 minutes |
| Daily plan | `market:daily:v5`, 2-minute backend cache; page refreshes every 3 minutes |
| HUB quotes | 30 seconds |
| Stock / industry flow | 60 seconds |
| KDJ | 60 seconds |
| Manual refresh | Models, KDJ and Daily Plan |

Fallbacks: after consecutive Eastmoney failures a 45-second circuit sends calls to Sina; daily bars also fall back to Sina; the full-market snapshot, board lists and money flow each hold a single-flight lock; money flow fetches only the two tails (900 rows each).

### Self-check

```bash
python scripts/model_selftest.py
```

Offline, synthetic, no network: registry version and the four models, HMM states and transition matrix, percolation on 220 rows, a nine-down-close sequence producing `buy.count == 9` and `bias == 偏多`, and KDJ on 180 synthetic bars. GitHub Actions runs `Model check` on weekdays, on backend pushes and on demand. Run it before publishing a model change.

### Changelog

| Registry | Change |
| --- | --- |
| 2.1.0 | TD Sequential 1.0.0 added; HMM 2.0.0 (multi-start, confidence, entropy, regime age, state stats); percolation 2.0.0 (stable hash, spanning, susceptibility, baseline, 50×50 grid, industry groups); snapshot key moved to `market:models:v5` |
| 2.0.0 | Registry split out; HMM 1.1.0 + percolation 1.1.0 + KDJ 1.2.0; parameters centralised, selftest wired into CI |
| 1.x | Parameters lived in each implementation; the UI read raw fields |
