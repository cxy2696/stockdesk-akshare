# Architecture · 架构

[中文](#中文) · [English](#english)

## 中文

### 一眼看懂

StockDesk 由四个相对独立的部分组成，彼此通过简单的 HTTP 接口或本地数据连接：

```
macOS / Windows 桌面端
  React + Vite + AntD + ECharts
          ↕ /api
  FastAPI + SQLite + 行情适配层
          ↕
  pywebview 原生窗口

iOS
  SwiftUI + Swift Charts + URLSession
  本地 JSON 存储，直接访问东方财富

美股版
  FastAPI + 原生 HTML/CSS/JS + ECharts
  独立端口 8770，内存缓存
```

### 桌面端

- `main.py` 负责挑选空闲端口、启动 uvicorn，并打开 pywebview 窗口；原生窗口不可用时会退回浏览器。
- `backend/app.py` 提供 API 和前端静态文件。
- `backend/market.py` 负责 A 股行情、指数、K 线、搜索和板块数据。
- `backend/models.py` 实现三状态高斯 HMM、渗流最大连通簇，并把九转、行业关注和组合结论组装成模型快照。
- `backend/td.py` 是独立的 TD Sequential 实现，只吃收盘价（可选高低价），不依赖行情层。
- `backend/ollama.py` 负责本机 Ollama 的健康检查、模型列表、上下文组装和结构化辅助判断；只发送聚合数据，不发送交易备注。
- `backend/decision.py` 生成市场预测、个股买卖点、评级与层级；数据来自行情/技术/九转/模型/市场状态。
- `backend/daily.py` 并行拉行情、模型、要闻、资金流、行业趋势和仓位建议，组装每日策略响应。
- `backend/state.py` 提供市场状态、板块、资金流、指数分析、要闻、地域和公司分布。
- `backend/portfolio.py` 处理交易流水、成本、净值与回撤。
- `backend/db.py` 用 SQLite 保存账户、交易、自选和缓存。
- `frontend/src` 是 HUD、页面、主题和图表所在的位置。

### 页面与路由

本轮把重复入口合并了，路由层用重定向兜住旧地址：

| 入口 | 组件 | 说明 |
| --- | --- | --- |
| `/` | `HudHome` | 中央圆盘直接 `navigate('/portfolio')`，不再弹资产中枢菜单；左 3 右 5 共 8 个模块入口 |
| `/portfolio` | `Portfolio` | 四个 Tab：`?tab=overview\|analysis\|advice\|trades` |
| `/asset-analysis` | `Navigate` | 重定向到 `/portfolio?tab=analysis` |
| `/advice-center` | `Navigate` | 重定向到 `/portfolio?tab=advice` |
| `/index-analysis` | `IndexAnalysis` | 导出 `IndustryNews`，内容是指数分析 |
| `/industry-news` | `IndexAnalysis` | 同一页，保留旧书签 |
| `/decision` | `Decision` | 交易决策台：评级、层级、买区、止损/目标、盈亏比、原因 |
| `/forecast` | `Forecast` | 市场预测：5 日状态条件收益、上涨概率、未来状态概率 |
| `/guide` | `Guide` | 使用指南，侧栏目录 sticky |

`IndustryNews.tsx` 这个名字是历史遗留，现在渲染的是指数分析；行业要闻已经并进 `Daily.tsx` 的 `NewsCenter`，和 7×24 快讯合成一个列表。

### 模型层

HMM 的输入是五个 A 股指数的日对数收益，输出弱势 / 震荡 / 强势三种状态、后验概率、熵、持续天数、转移矩阵和每个状态的风险统计。它回答“现在该拿多少仓位”。

渗流模型把全市场约 5,500 只上涨股票放进二维格点，用 `crc32(code)` 稳定哈希排序，寻找最大的 4 邻接连通簇。上涨家数只说明“有多少”，最大簇说明“有没有连成一片”。阈值 0.592746 来自二维方格点渗流模型；样本较小时只做相对参考。快照里还带 spanning、susceptibility、随机重排基线和 p 值。

九转（`backend/td.py`）分两段：连续 9 根收盘价对比 4 日前形成建仓结构，之后最多 13 根对比 2 日前高低点形成倒计时。它只描述动能衰竭，输出里把机械计数和中文解读分开。

三个模型在 `models.model_snapshot()` 里合并，最后由 `_conclusion()` 给出 HMM × 渗流 → 进攻 / 均衡偏多 / 均衡偏防守 / 防守四档策略和总仓位。

### C++ 原生核心

`desktop/backend/native_core/` 分成四层，避免把 pybind11 和模型逻辑混在一个文件里：

| 文件 | 职责 |
| --- | --- |
| `core.hpp` | 纯 C++ 类型契约：`GridResult`、`HmmResult`，不依赖 Python |
| `percolation.cpp` | union-find 四邻接格点分析；支持非正方形/最后一行不满；只把真实矩形边界计为 `spanning` |
| `hmm.cpp` | 单变量 Gaussian HMM 的缩放前向/后向 Baum-Welch；输入归一化、方差下限、收敛判定与有限值检查 |
| `bindings.cpp` | 唯一接触 Python 的层：numpy 维度/形状/类型校验，输出固定 shape 的 numpy 数组 |
| `selftest.cpp` | 纯 C++ 自测：固定/随机格点对照 BFS、批量一致性、HMM 确定性、广度/覆盖率审计 |
| `bench.cpp` | 纯 C++ 微基准：单格点、批量格点、HMM、广度 census、覆盖率审计 |
| `CMakeLists.txt` | 脱离 CPython 的静态库 + CTest + ASan/UBSan 构建入口 |

`backend/native.py` 只报告 `C++ / NumPy fallback` 状态；`models.py` 在原生调用抛异常时自动回退到 NumPy，并读取真实的 `converged` 字段，而不是假报 `True`。pybind 绑定在纯计算期间释放 GIL，渗流格点全程使用 uint8 numpy 连续内存，Monte-Carlo 重排/自助抽样通过 `grid_batch` 一次进入 C++，批量路径复用 union-find 工作区，5 个指数的 HMM 并行拟合。1.2.5 起 HMM k=3 内部循环展开；1.2.4 起渗流使用 32 位并查集和根节点列表，HMM 对生产配置 k=3 做编译期特化并预计算 `B×beta`；核心可单独用 CMake 编译、CTest 自测和 `native_bench` 计时。模型快照带 `trace`（算法/引擎/种子/规模/格点摘要/HMM 收敛诊断），用于复现和对账。桌面端新增 `backend/evaluation.py`：对单指数做滚动 220 日 HMM 重训，每 5 个交易日取一次因果状态和 5 日预测，与实际 5 日收益比较，输出命中率、相关性、分状态表现和模型仓位净值；结果缓存 30 分钟并在后台刷新。因子筛选输出 `cross-sectional-factor-v2` trace、类别/因子覆盖率；缺失类别按可用类别权重重新归一，不把缺失值当作 0 分。回归测试 `tests/test_native.py` 覆盖 C++/NumPy parity（含 k=2/3/4）、空/满/非方形格点、NaN/坏矩阵/坏迭代次数、线程安全和回退契约；`native_selftest` 额外覆盖 C++ 侧的随机格点 BFS 对照与批量一致性。

### 桌面端效率与信息层级

- 主导航分「工作台 / 研究 / 工具」并全部展示，不删减板块；HUD 右侧保留原 7 个模块并新增历史测评。研究台作为汇总入口，市场预测、量化模型、因子、板块、指数和地域仍可直接进入。
- 所有页面不再使用折叠面板；`More` 改为平铺分区，HMM/渗流/九转/行业/边界与每日策略明细全部直接展示，通过标题、卡片和间距建立层级。
- 缓存：`market_state`、指数分析、每日策略和历史测评都采用 stale-while-revalidate（先返回旧结果、后台刷新）；启动线程预热快照、轻量状态、每日策略、指数分析和历史测评；应用内调度器按交易时段持续刷新。
- 新增 `backend/evaluation.py` 和 `/api/models/history`，以滚动窗口重训 HMM 并检验 5 日方向，结果带缓存和 `stale/age` 标记；页面见「历史测评」。

### 数据新鲜度、来源与后台刷新

- `data_status.py` 从真实缓存快照生成快照日期、更新时间、覆盖/缺失/未定价、每类缓存年龄和调度器状态；`source_health.py` 只记录真实调用结果，不把“已配置”当成“健康”。
- 新增 `/api/data/status`、`/api/data/sources`、`/api/data/coverage`、`/api/data/refresh`；顶部数据条常驻显示，每 30 秒刷新。
- `scheduler.py` 在 FastAPI lifespan 启动单线程后台任务，交易时段快刷、收盘后慢刷，顺序执行避免 akshare/libmini_racer 并发；手动刷新通过排队执行。
- 全市场快照保留东财→新浪→akshare 回退；个股/指数报价和 K 线新增腾讯独立源；新闻增加新浪滚动新闻兜底；概念板块增加 Sina newFLJK 独立兜底。

### 策略回测

组合回测分三种模式：推荐组合（自选+持仓池、60 日动量、HMM 状态仓位、20 日换仓）、自定义持仓（权重、买入持有或再平衡）和交易记录回放（真实流水、T+1/现金检查）。三者都以收盘信号、次日开盘成交，计佣金/印花税/滑点，默认上证指数基准；单股规则回测保留。

### 全市场覆盖契约

`market.fetch_spot()` 不再用“总数 ≥ 5500”猜测完整，而是每次生成带 schema 的快照：

```text
expected_codes   静态池 + 运行期发现的新上市（universe:extras:v1）
rows             每个 expected code 必有一行；缺失行情保留占位行
quote_status     ok / stale / suspended / missing
expected/captured/present/missing/duplicates/unpriced/suspended
complete         行集合完整且分页无失败
fully_quoted     所有行都有实时价格（停牌会使它为 false，但不是数据丢失）
```

分页使用 6 路并发 + 单页 3 次重试；失败页由 Sina Market Center/批量报价补缺；旧缓存 `spot:v3–v5` 不再命中。`/api/market/coverage` 用 C++ `coverage_audit`（duplicates/missing/extra）对账，`scripts/coverage_check.py` 可作为发布门禁。

### 缓存键与单飞

| 键 | TTL | 内容 |
| --- | --- | --- |
| `decision:overview:v2` | 300 秒 | 交易决策候选、评级、买卖点、市场预测 |
| `market:models:v8` | 600 秒 | HMM（过滤后/质量/风险）、渗流（bootstrap/趋势）、九转、行业关注、综合评分、模型注册表 |
| `market:daily:v8` | 120 秒 | 每日策略整页响应（行情、模型摘要、要闻、资金流、趋势、仓位建议） |
| `market:state` | 60 秒 | 市场状态、温度、指数 |
| `spot:v3` | 180 / 600 秒 | 全市场快照（默认 3 分钟，模型与市场状态读 10 分钟） |
| `fund:individual` | 60 秒 | 个股主力资金（新浪两端各 900 只） |

模型和每日策略的键名带版本号（`:v8`），改字段结构时升版本，旧缓存自然失效，不用写迁移。

Ollama 建议缓存在 `ollama:advice:v1:<model>`，10 分钟；`cached_only=1` 只读缓存，只有用户点“生成”才强制重算。

并发控制：

- `market._spot_lock`：全市场快照单飞，多个页面同时首屏只下载一次。
- `state._BOARD_LOCKS`：按 `kind` 分锁，行业和概念列表各自单飞。
- `market._FUND_LOCK`：资金流单飞；拿不到时写一个短空值，避免每个页面都重新等超时。
- 模型快照本身走 `db.cache_get`，每日策略再包一层 `market:daily:v8`，两层都命中时不再触发模型计算。

### 容错

- 东方财富短熔断：连续两次失败后打开 45 秒，期间 `_http_json` 直接抛错，调用方走新浪或 akshare；单次瞬时错误仍会正常重试。
- 日线兜底：东方财富 K 线失败后走 `_sina_klines`，再不行才用 akshare。
- 资金流：新浪 `MoneyFlow` 接口只取净额两端各 900 只并行合并，请求体积约为全表的三分之一。
- 每日策略用 5 个线程并行拉不同主机，首屏时间接近最慢的一段，而不是各段相加。网络受限时仍能在数十秒内返回，不会挂几分钟。

### 九转接口

- `backend/td.py` 只依赖收盘价，指数和个股共用。
- `GET /api/market/td/{code}?limit=220` 拉不复权日线，返回 `{code, bars, td, source}`；样本不足时 `available=false`，前端显示“样本不足”而不是报错。
- 模型快照里的 `td` 复用同一实现，给 5 个指数、最多 8 只持仓和临界行业龙头各算一份，并汇总 `counts`（买 / 卖 / 观察）。
- 每日策略的 `td` 是精简版：指数标签、计数和一句总结。

### 行业关注接口

- `GET /api/market/industry-focus` 优先读 `market:models:v8` 缓存，命中时返回 `cached: true`；没命中就现场算一次模型快照。

### Ollama 接口

- `GET/PUT /api/ollama/config`：读写 `enabled/host/model/temperature/timeout/num_predict`，默认 `enabled=false`。
- `GET /api/ollama/health`、`GET /api/ollama/models`：探测 `/api/tags` 与 `/api/version`，返回可用模型和缺失原因。
- `POST /api/ollama/advice?force=&cached_only=`：组装市场/模型/持仓聚合上下文，调用 `/api/chat`（`stream=false`、`format=json`），解析为倾向/仓位/依据/风险/动作；失败返回中文错误，不抛 500。
- 返回 `focus[]`（行业广度、最大簇、资金、龙头、关注要点）、`td` 和 `conclusion`。
- 资金字段来自板块列表；板块接口不可用时该字段为空，前端写“数据源暂未返回”。

### 前端图表

- `components/HeatmapChart.tsx`：treemap，按行业分组，面积 = 总市值、颜色 = 涨跌幅；单击板块下钻、面包屑返回、搜索与涨跌筛选，`visibleMin: 55` 隐藏过小方块。
- `components/NetWorthChart.tsx`：账户用主题色实线加面积，沪深300 用蓝色虚线；基准缺失时隐藏并标注；只有 1 个数据点时提示“第二个交易日后展开”。
- `pages/Analytics.tsx` 的趋势图：净值、MA20（`#2EC4B6` 青色实线）、MA60（`#B08CFF` 紫色虚线），单点日期只画散点。
- `pages/Regions.tsx` 和 `pages/HubMap.tsx` 共用 34 个省级行政区的静态兜底列表，接口没返回时仍能逐个切换。

### iOS

- `ios/StockDesk/Views` 放 SwiftUI 页面、HUD 和中国地图。
- `RootTabView` 的中央圆盘直接 `path.append("portfolio")`，右侧第三个入口指向 `index-analysis`，`industry-news` 也解析到指数分析。
- `DailyView` 新增模型结论卡和九转卡，主力追踪改为三列。
- `PortfolioView` 顶部加资产分析 / 投资建议两个快捷入口。
- `ios/StockDesk/Models/QuantModels.swift` 是 Swift 版 HMM 与渗流。
- `ios/StockDesk/Services` 负责行情请求与本地存储。

### 美股版

- `us/market_us.py` 访问美股指数、报价、榜单、搜索和 K 线，并做短时缓存。
- `us/app.py` 提供 API 和静态页面。
- `us/static` 是无需构建的单页仪表盘，ECharts 已放在本地。

### 安全与隐私

服务只监听本机，不需要账号密码；账户数据不会上传。行情来自公开接口，可能有延迟或缺失。

## English

### The short version

StockDesk has four fairly independent pieces, connected by simple HTTP APIs or local data:

```
macOS / Windows desktop
  React + Vite + AntD + ECharts
          ↕ /api
  FastAPI + SQLite + market adapters
          ↕
  pywebview native window

iOS
  SwiftUI + Swift Charts + URLSession
  local JSON storage, Eastmoney requests

US edition
  FastAPI + plain HTML/CSS/JS + ECharts
  its own port 8770, in-memory cache
```

### Desktop

- `main.py` finds a free port, starts uvicorn and opens a pywebview window. If the native window cannot start, it falls back to your browser.
- `backend/app.py` serves both the API and the built frontend.
- `backend/market.py` handles A-share quotes, indices, candles, search and sectors.
- `backend/models.py` contains the HMM, the percolation giant component, and assembles the model snapshot with TD, industry focus, a transparent composite score and the combined stance.
- `backend/ollama.py` talks to a local Ollama instance; aggregate data only, disabled by default.
- `backend/td.py` is a standalone TD Sequential implementation over closes (highs/lows optional).
- `backend/daily.py` fans out to quotes, models, news, flow, industry trends and position advice, then assembles the Daily Plan payload.
- `backend/state.py` covers market state, boards, flow, index analysis, news, regions and company distribution.
- `backend/db.py` stores accounts, trades, watchlists and caches in SQLite.
- `frontend/src` is where the HUD, pages, themes and charts live.

### Pages and routes

| Entry | Component | Note |
| --- | --- | --- |
| `/` | `HudHome` | the central disc navigates straight to `/portfolio`; 3 left + 5 right modules |
| `/portfolio` | `Portfolio` | four tabs via `?tab=overview\|analysis\|advice\|trades` |
| `/asset-analysis` | redirect | to `/portfolio?tab=analysis` |
| `/advice-center` | redirect | to `/portfolio?tab=advice` |
| `/index-analysis` | `IndexAnalysis` | re-exports `IndustryNews`, which now renders index analysis |
| `/industry-news` | `IndexAnalysis` | same page, old bookmarks keep working |
| `/guide` | `Guide` | nine chapters with a sticky table of contents |

The `IndustryNews.tsx` filename is historical; the news feed moved into `Daily.tsx` (`NewsCenter`), merged with the 7×24 flash feed.

### Models

The HMM looks at daily log returns of five A-share indices and returns weak / range / strong states, posteriors, entropy, regime age, a transition matrix and per-state risk statistics. In plain terms: it helps decide how much exposure to carry.

The C++ core lives in `desktop/backend/native_core/`: `core.hpp` defines Python-free result contracts, `percolation.cpp` implements union-find percolation, `hmm.cpp` implements the scaled Baum-Welch pass, `census.cpp` implements one-row-per-stock breadth and coverage audits, and `bindings.cpp` is the only pybind11 layer (shape/type validation + fixed-shape numpy outputs). `models.py` reads the real `converged` flag and falls back to NumPy on any native error; `tests/test_native.py` checks parity, edge cases, validation, thread safety and the fallback contract.

`market.fetch_spot()` now emits an explicit coverage contract: every expected code becomes a row (`quote_status` ok/stale/suspended/missing), failed pages are retried and repaired from Sina, and `complete`/`fully_quoted` distinguish representation from live pricing. `/api/market/coverage` uses the C++ coverage audit (duplicates/missing/extra), and `scripts/coverage_check.py` is a release gate. The HUD uses `/api/market/state?light=1`; it reads only cached breadth and never blocks on the full snapshot, while index quotes are cached for 20 seconds and single-flighted.

The percolation model places about 5,500 stocks on a 2-D lattice in `crc32(code)` order and finds the largest four-neighbour cluster. The number of rising stocks tells you *how many*; the largest cluster tells you whether they are *connected*. 0.592746 is the 2-D square-site threshold; with small samples, treat it as a relative guide. The snapshot also reports spanning, susceptibility, a random-layout baseline and a p-value.

`backend/td.py` runs the two-phase TD structure: nine closes versus four bars back, then up to thirteen bars versus the two-bar high/low. It separates the mechanical count from the plain-language reading.

`models.model_snapshot()` merges all three, and `_conclusion()` maps HMM state × breadth regime to attack / balanced-long / balanced-defensive / defensive with a total exposure range.

### Cache keys and single-flight

| Key | TTL | Contents |
| --- | --- | --- |
| `market:models:v8` | 600 s | HMM (filtered/quality/risk), percolation (bootstrap/trend), TD, industry focus, ensemble, registry meta |
| `market:daily:v8` | 120 s | full Daily Plan payload |
| `market:state` | 60 s | market state, temperature, indices |
| `spot:v3` | 180 / 600 s | full-market snapshot (3 min by default, 10 min for models and market state) |
| `fund:individual` | 60 s | stock-level main flow (two Sina tails, 900 rows each) |

Model and daily-plan keys carry a version suffix (`:v8`), so a payload change only needs a bump — no migration code.

Concurrency:

- `market._spot_lock` — one download of the full snapshot even when several pages start together.
- `state._BOARD_LOCKS` — one lock per board kind (industry and concept fetch independently).
- `market._FUND_LOCK` — one flow fetch; failures are cached briefly so every page does not wait out its own timeout.
- The model snapshot is cached, and Daily Plan wraps it again in `market:daily:v8`, so a second page hit never recomputes.

### Failure handling

- Eastmoney circuit breaker: two quick failures open a 45-second circuit; while open, callers go straight to Sina or akshare. A transient error still retries normally.
- Daily bars: Eastmoney → `_sina_klines` → akshare.
- Money flow: both sorted tails (900 rows each) are fetched in parallel and merged, about a third of the full-table payload.
- Daily Plan fans out across five hosts, so first paint is close to the slowest section instead of the sum. Under a restricted network it still returns in tens of seconds rather than minutes.

### TD endpoint

- `GET /api/market/td/{code}?limit=220` pulls unadjusted daily bars and returns `{code, bars, td, source}`. Too few samples return `available=false` so the UI can say “sample too short” instead of erroring.
- The model snapshot reuses the same implementation for five indices, up to eight holdings and the leaders of the most critical industries, and sums the buy / sell / watch counts.
- Daily Plan uses a compact form: index label, counts and one summary line.

### Industry focus endpoint

- `GET /api/market/industry-focus` reads `market:models:v8` first (`cached: true`), otherwise computes a snapshot.
- Ollama: `GET/PUT /api/ollama/config`, `GET /api/ollama/health`, `GET /api/ollama/models`, `POST /api/ollama/advice`; local-only, disabled by default.
- Returns `focus[]` (breadth, giant share, flow, leader, focus line), `td` and `conclusion`.
- Flow comes from the board list; when boards are unavailable the field is empty and the UI says “data source has not returned”.

### Charts

- `HeatmapChart.tsx`: treemap grouped by industry, area = market cap, colour = change; drill-down, breadcrumb, search, up/down filters, `visibleMin: 55`.
- `NetWorthChart.tsx`: account line in the theme colour with a fill, CSI 300 as a blue dashed line; a missing benchmark hides the line and labels the legend; single-point data shows a note, not a blank chart.
- `Analytics.tsx` trend chart: NAV, MA20 (`#2EC4B6`, solid), MA60 (`#B08CFF`, dashed); a one-day series plots points only.
- `Regions.tsx` and `HubMap.tsx` share the 34-province static fallback list, so every province stays switchable when the endpoint is empty.

### iOS

- `ios/StockDesk/Views` contains SwiftUI screens, the HUD and the China map.
- `RootTabView`'s central disc goes straight to portfolio; the third right entry points at `index-analysis`, and `industry-news` resolves to the same screen.
- `DailyView` adds a model-conclusion card and a TD card; the flow card becomes three columns.
- `PortfolioView` adds asset-analysis and advice shortcuts at the top.
- `ios/StockDesk/Models/QuantModels.swift` is the Swift HMM and percolation implementation.
- `ios/StockDesk/Services` handles quotes and local storage.

### US edition

- `us/market_us.py` talks to US index, quote, mover, search and candle endpoints, with short-lived caching.
- `us/app.py` serves the API and static page.
- `us/static` is a no-build dashboard with a local ECharts bundle.

### Security and privacy

The server binds to localhost only. There are no accounts or passwords, and portfolio data is never uploaded. Public market data can be delayed or incomplete.
