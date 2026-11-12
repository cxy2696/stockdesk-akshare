# Models · 模型维护

[中文](#中文) · [English](#english)

## 中文

### 版本

当前模型注册表：**2.0.0**

| 模型 | 版本 | 参数 |
| --- | --- | --- |
| HMM | 1.1.0 | 3 状态、60 次迭代、420 日回看 |
| 渗流 | 1.1.0 | 阈值 0.592746、4 邻接、最少 100 只 |
| KDJ | 1.2.0 | KDJ(9,3,3)、上轨 118、下轨 -14、180 根 |

版本和参数集中在 `desktop/backend/model_registry.py`。升级模型时只改注册表和对应实现，前端通过 `/api/models/meta` 读取版本，不需要改页面。

### 自动更新

- HUB 行情每 30 秒刷新
- 个股 / 行业资金流每 60 秒刷新
- KDJ 每 60 秒刷新
- 量化模型每 5 分钟刷新
- 后端按 TTL 缓存；行情失败自动回退新浪
- 手动刷新按钮可在模型页和 KDJ 页使用

### 可持续维护

- 模型参数、阈值、版本统一注册
- `scripts/model_selftest.py` 使用合成数据做离线自检
- GitHub Actions `Model check` 每周一至周五定时运行，也支持手动触发
- 修改模型后先跑自检，再发布新版本
- 自检不依赖网络，避免行情限流影响 CI

### 边界

HMM 和渗流只描述当前结构，不预测点位；KDJ 只做极值提示。模型升级不改变“非投资建议”的边界。

## English

### Versions

Registry version: **2.0.0**

| Model | Version | Parameters |
| --- | --- | --- |
| HMM | 1.1.0 | 3 states, 60 iterations, 420-day lookback |
| Percolation | 1.1.0 | threshold 0.592746, 4-neighbour, min 100 names |
| KDJ | 1.2.0 | KDJ(9,3,3), upper 118, lower -14, 180 bars |

Versions and parameters live in `desktop/backend/model_registry.py`. A model upgrade changes the registry and implementation; the UI reads `/api/models/meta`, so no page rewrite is needed.

### Automatic refresh

- HUB quotes every 30 seconds
- Stock / industry money flow every 60 seconds
- KDJ every 60 seconds
- Quant models every 5 minutes
- Backend TTL caching with Sina fallback on quote failures
- Manual refresh on the Models and KDJ pages

### Sustainable maintenance

- One registry for versions, thresholds and parameters
- `scripts/model_selftest.py` runs offline synthetic checks
- GitHub Actions `Model check` runs weekdays and can be triggered manually
- Run the selftest before publishing a model change
- No network dependency in CI, so rate limits cannot mask model regressions

### Limits

HMM and percolation describe the current structure, not future prices; KDJ only flags extremes. Upgrading a model does not change the “not investment advice” boundary.
