# Changelog

## 1.17.0 / iOS 4.1.2 — 2026-11-18

### 数据与算法

- 全市场快照改为 schema 7：静态股票池加运行期发现的新上市，每只股票都有一行，并用 `ok / stale / suspended / missing` 标记行情状态。
- 东财分页改为并发抓取和单页重试，失败页用新浪数据补齐；旧版快照缓存不再使用。
- 覆盖率对账包含 `expected / present / missing / duplicates / unpriced / suspended` 和字段级缺失统计。当前全市场 5,581 只，`missing=0`、`duplicates=0`。
- 修正 `302` 创业板、`689` 科创板 CDR 的市场分类；涨跌停按 5%/10%/20%/30% 的板别阈值统计，停牌和无行情不再算作平盘。
- C++ 核心新增逐行广度统计和覆盖率审计，保持与 Python/NumPy 回退一致。

### C++ 核心

- `native.cpp` 拆成 `native_core/`：纯算法（渗流、HMM、广度/覆盖审计）与 pybind11 绑定层分开。
- 增加输入校验、真实收敛状态、非方形格点边界处理和线程安全测试。
- 编译参数按平台区分：MSVC 使用 `/O2`，clang/gcc 使用 `-O3`。
- 驱动边界优化：C++ 计算释放 GIL；渗流使用 uint8 numpy 连续缓冲；新增 `grid_batch` 把 15 次 Monte-Carlo 格点合并为一次调用；5 个指数的 HMM 并行拟合。
- HMM 归一化项从每根 K 线计算改为每轮每状态一次。

### 界面与稳定性

- 修复页头副标题在 1280/1440 宽度下换行裁切的问题。
- 持仓表在 1100px 窗口收起次要列，股票名称不再逐字换行。
- 修复 SQLite 连接泄漏，启用 WAL 和 busy timeout，缓存写入遇到 NaN/Infinity 时降级为 `null`。
- 桌面端版本号统一从 `backend/config.py` 注入，避免与 `/api/health` 不一致导致重复刷新。
- iPad HUD 放大资产中枢，并增加指数/涨跌状态条；iPhone 布局保持不变。

### 质量与构建

- 增加 59 项测试，覆盖 API、持仓、回测、C++/NumPy 一致性、全市场覆盖和并发安全。
- 增加 API 冒烟、覆盖率门禁和 release 校验脚本。
- PyInstaller 缓存隔离到项目内，避免中断构建后缓存损坏。
- 模型注册表升级到 2.7.0，C++ 核心升级到 1.2.2。
- HMM 可选接入 rflux 0.7.0 的 C++ 多起点训练器；无 rflux 时保持 StockDesk C++/NumPy 回退，健康接口和设置页显示实际引擎。
- 冷启动首屏：`/api/market/overview` 不再同步抓全市场，HUD 改用轻量状态；指数报价 20 秒缓存并单飞，5 个指数 HMM 并行拟合。
- Windows exe 由本轮源码在 GitHub Actions Windows 2022 重新构建，CI 冒烟通过并上传 release。
