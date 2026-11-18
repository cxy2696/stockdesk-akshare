# 本机构建说明

更新时间：2026-11-18。当前基线是桌面端 1.17.0、iOS 4.1.2 (36)、模型注册表 2.7.0、C++ 核心 1.2.5。

这个目录是 StockDesk 的本地源码副本。源码已与上游 `main` 同步，并做了下面这些本地修改。

## 本地改动

**全市场数据**
- 行情快照从 schema 5 升到 schema 7，股票池由静态列表加运行期发现的新上市组成。
- 每只预期股票都会保留一行，哪怕是停牌或无行情；行上带有 `quote_status`，不会静默丢数据。
- 东财分页并发抓取，单页失败重试，仍失败时用新浪数据补缺；旧版快照缓存不再命中。
- `/api/market/coverage` 返回覆盖率、缺失、重复、停牌、无行情和字段级缺失统计。
- 正常行情源下实测：5,581/5,581，`missing=0`，`duplicates=0`，停牌 2 只；上游限流时 `data_complete=false`，不会把部分快照当完整。

**C++ 核心**
- `backend/native.cpp` 原为单文件，现拆成 `backend/native_core/`：
  - `core.hpp`：结果类型和接口；
  - `percolation.cpp`：union-find 渗流；
  - `hmm.cpp`：Baum-Welch；
  - `census.cpp`：广度统计和覆盖率审计；
  - `bindings.cpp`：pybind11 绑定。
- 修复 `cols=0` 除零、HMM 输入未校验、假报 `converged=True`、非方形格点边界错误。
- 编译参数按平台切换，Windows 不再因 `-O3` 构建失败。
- 渗流的 3 次随机重排和 12 次 bootstrap 合并为一次 `grid_batch` C++ 调用；批量路径复用 union-find 工作区，只计算 size/spanning，不分配完整 largest/sizes。5 个指数的 HMM 拟合并行执行（rflux/native 计算释放 GIL）。
- 模型快照带 `trace`：算法名、布局、引擎、种子、输入规模、格点 SHA-256 摘要、HMM 样本/重启/迭代/收敛状态，结果可复现对账。
- C++ 计算期间释放 GIL；渗流格点从 Python 到 C++ 全程使用 uint8 numpy 连续内存，避免逐次列表转换；HMM 每轮只计算一次归一化项。
- 1.2.3：HMM M 步合并权重/均值统计并预计算方差倒数；渗流最大簇按根节点扫描并保留平局顺序；本机基准约快 20%。
- 1.2.5：HMM k=3 内部循环展开，HMM kernel 约 0.157→0.136 ms；1.2.4：HMM 增加 k=3 编译期特化、B×beta 预计算、倒数归一化与 t 序 M 步；渗流改为 32 位并查集、复用工作区和根节点列表；新增 CMake/CTest 自测与独立 C++ 基准。本机 HMM 约快 45%、单格点约快 25%。
- 去冗余：渗流不再维护重复 sizes 数组，HMM 原地更新 pi；随机基准改为在完整格点重排上涨股，并合并 robust/bootstrap 为一次 native batch。

**界面**
- 页头副标题在 100% 缩放下保持单行省略，120%/150% 才换行；1280 宽度页头放宽到 200px。
- 持仓表在 1100px 窗口收起“今日盈亏 / 累计盈亏 / 持有”，股票名称不换行。
- iPad HUD 放大中枢，增加指数/涨跌状态条；iPhone 布局不变。
- 交易决策页头显示真实命中数；买入区间列加宽并禁止换行，百元价位不再折行。
- 市场预测页改走独立快速接口，不再等待 K 线扫描；自选页先渲染行情再异步合并决策。
- 修复 `-0.00%` 显示；每日策略缓存过期时明确显示“数据更新中”。

**桌面端效率、界面与历史测评**
- 新增「历史测评」页和 `/api/models/history`：滚动 220 日 HMM 重训、每 5 日评估、5 日持有；展示命中率、相关性、分状态、概率校准、模型仓位净值和最近记录。结果缓存 30 分钟，过期先出旧结果后台刷新。
- 界面保留全部板块：主导航分工作台/研究/工具并全部展示；HUD 右侧保留原 7 个模块并新增历史测评；新增研究台入口页，所有内容平铺展示，不再折叠。
- 性能：指数分析缓存 5 分钟并后台刷新；行情状态过期先返回旧结果；启动预热轻量状态、每日策略、指数分析和历史测评，减少下载包首次打开时的网络等待。
- 策略回测参照 hp-quant：新增推荐组合、自定义持仓、交易记录回放三种组合模式；统一次日开盘、T+1、费用/滑点、基准和绩效指标；保留单股规则回测。
- 修复启动预热并发导致的 libmini_racer 崩溃，预热改为顺序执行。
- 测试：新增历史测评与组合回测测试，`pytest` 共 82 项通过。

**iOS 模型与界面显示**
- 量化模型页并发加载 5 个指数，局部失败保留上次结果；显示模型口径、样本截止日、刷新时间，并提供重试。
- HMM「下一状态」改读状态转移矩阵；概率固定弱势→震荡→强势；5 日估算修正 ×100 单位；止损清仓、卖出不超过持仓、持有显示 0 股。
- 全站修复 `-0.00%`；权重/占比/胜率/获利比例等水平值去掉 `+`；支撑压力、52 周高低、九转买卖与仓位动作颜色统一。
- 每日策略标注数据截止日；预测/决策显示沪深300样本日期并先出预测再评估个股；HUD 资产等级按总资产计算；设置页显示版本号。
- iOS 渗流随机基准由格点旋转改为真正打乱上涨股位置，避免「随机重排」与真实格点相同。

**因子筛选**
- 正态分位函数增加缓存，避免同一分位在 12 个因子上重复计算。
- 候选股票增加类别覆盖率和因子覆盖率；缺失因子按类别中性处理，不再用 0 分强行拉低或抬高。
- 快照增加 `trace`：算法版本、行情快照时间、行数/候选数、入选因子、状态权重、排名变换和缺失值策略。

**rflux 参考接入**
- HMM 优先使用本地 rflux 0.7.0 的 C++ 多起点训练器；适配层只取参数、平滑概率和因果过滤概率，保留 StockDesk 自己的状态排序、质量、风险和仓位口径。
- rflux 未安装、dylib 加载失败或拟合异常时，自动回退 StockDesk C++/NumPy，不改变接口。
- `/api/health` 和设置页显示当前 HMM 引擎；模型页 HMM 明细显示引擎版本。

**后端与构建**
- SQLite 连接改为显式关闭，启用 WAL 和 busy timeout；缓存写入对 NaN/Infinity 做了兜底。
- FastAPI 启动统一到 lifespan。
- 桌面版本从 `backend/config.py` 注入前端，避免版本号不一致。
- PyInstaller 缓存隔离到项目内，package 脚本自动查找 `.venv`。
- 全市场快照改为 stale-while-revalidate：超过 TTL 时先返回最近一次可用快照并在后台单飞刷新，页面不再长时间空白。
- K 线/报价失败增加短负缓存；日/周/月 K 线 TTL 按交易时段计算（盘中 120 秒，收盘后到下一开盘前最长 12 小时）。

## 验证记录

| 项目 | 结果 |
| --- | --- |
| `pytest -q tests` | 82 passed |
| 冷启动首屏 | 概览和轻量状态不再同步抓完整快照；指数缓存单飞，HUD 2–6 秒出数据 |
| `ruff check desktop/backend us tests --select F,E9` | 通过 |
| C++ 核心自测 | `ctest` 1/1 通过；ASan/UBSan selftest 通过 |
| `python scripts/native_bench.py` | HMM kernel 约 0.136 ms（1.2.4 同机约 0.157 ms）、单格点约 0.017 ms（Apple Silicon 本机） |
| `python scripts/api_smoke.py http://127.0.0.1:8765` | 47 个只读 + 3 个写接口 + SPA 通过 |
| `python scripts/coverage_check.py http://127.0.0.1:8765` | 正常行情源下 5,581/5,581，missing=0，duplicates=0；限流时 data_complete=false |
| macOS DMG 启动 | 1.17.0，C++ 1.2.5，rflux 0.7.0，5,581 行覆盖、missing=0、未定价 4，data_complete=false（不把未定价行伪装成完整） |
| 独立安装 | 全新 `HOME` + 新数据目录启动，默认资产 200,000，未读取现有账户；18 个路由无横向溢出/控制台错误 |
| iOS 模拟器 | `build_ios.sh` 构建成功，iPhone/iPad 页面已验证 |
| Windows | 本轮源码 GitHub Actions 构建（run 44331990490）；exe 启动、health 1.17.0/C++、前端资源、组合回测 696 日、历史测评 155 期、数据状态 5581/5581/scheduler=true 冒烟通过 |

## 产物

本机产物都在 `release/`：

| 文件 | 用途 |
| --- | --- |
| `StockDesk-macOS-1.17.0.dmg` | macOS 安装包 |
| `StockDesk-macOS-1.17.0.zip` | macOS 便携版 |
| `StockDesk.exe` | Windows 10/11 x64 |
| `StockDesk-iOS-4.1.2-unsigned.ipa` | iPhone / iPad，需重签 |
| `StockDesk-simulator.app.zip` | iOS 模拟器 |
| `SHA256SUMS.txt` | 校验和 |
| `verification.json` | 构建、测试和产物的机器可读记录 |

安装与校验步骤见 GitHub Releases 的 `README`/`SHA256SUMS.txt`；本机 `release/` 不提交到 Git。

## 重新构建

```bash
# macOS
cd desktop
./package_macos.sh

# iOS
cd ios
./build_ios.sh
```

## 说明

- macOS 包仅支持 Apple Silicon，使用 ad-hoc 签名。
- iOS IPA 未签名，必须用自己的 Apple ID 重签；免费签名 7 天有效。
- Windows 包由 GitHub Actions 从本轮源码重新构建；CI 只做了启动/接口冒烟，Windows 桌面 UI 仍需在 Windows 上目测。
- 行情来自公开接口，仅供研究，不构成投资建议。
