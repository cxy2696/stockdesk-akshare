# Changelog · 最新版本

## 本地构建优化 / Local hardening（2026-11-17，基于 1.17.0 / iOS 4.1.2）

### C++ 架构

- `backend/native.cpp` 拆为 `native_core/core.hpp`、`percolation.cpp`（union-find）、`hmm.cpp`（scaled Baum-Welch）、`bindings.cpp`（唯一 pybind11 层）。
- 修复 `cols=0` 除零、HMM 矩阵/方差/有限值未校验、C++ 路径永远报 `converged=True`、非方形格点右边界误判等实质问题。
- `setup.py` 按平台选择编译参数（MSVC `/O2`，clang/gcc `-O3`），Windows 构建不再因 `-O3` 失败。
- 新增 20 项原生测试；模型注册表升级到 2.6.0 / native 1.1.0。

### 显示与排版

- 页头副标题在 100% 缩放下恢复单行省略，120%/150% 才换行；1280 宽度页头从 140px 放宽到 200px，避免三行裁切。
- 持仓表在 1100px 最小窗口隐藏“今日盈亏/累计盈亏/持有”次要列，股票名称不再换行；1280px 以上恢复完整列。
- 修复桌面 UI 版本号硬编码 `1.16.0`：`HudHome`、设置页、使用指南和版本比对逻辑改为构建时从 `backend/config.py` 注入 `__APP_VERSION__`，与 `/api/health` 的 1.17.0 一致；同时消除首次打开时因版本不一致触发的自动刷新。

### 稳定性

- 修复 SQLite 连接泄漏：`with sqlite3.connect(...)` 不会关闭连接，行情轮询下会累积文件描述符；新增 `db.session()` 统一提交/回滚/关闭，`portfolio.py`、`repo.py` 全量迁移。
- 启用 WAL 与 5s busy timeout；缓存写入遇到 `NaN/Infinity` 自动降级为 `null`，不再让整个接口 500。
- FastAPI 启动迁移到 lifespan，移除重复的 `on_event("startup")`。

### 质量

- 累计 43 项 pytest（含 20 项 C++/NumPy parity 与边界测试）：SQLite/TTL/NaN、持仓成本、卖出校验、FIFO 已实现盈亏、全部策略信号、API/SPA。
- 新增 `scripts/api_smoke.py` 和 `scripts/verify_release.py`；CI 增加 pytest 与 ruff F/E9。

### iOS / iPad

- HUD 版本号改为读取 `Info.plist`；iPad Pro / mini 放大中枢，新增指数/涨跌状态条；iPhone 布局不变。
- 新增 `ios/build_ios.sh`（模拟器 App + 未签名 IPA）。

### 构建

- PyInstaller spec 与 `package_macos.sh` 的版本号统一从 `backend/config.py` 读取；`build_app.sh` 自动查找 `.venv`。

## 1.17.0 / iOS 4.1.2

### KDJ 预警彻底移除

- 删除桌面端 KDJ 页面、KDJ 图表组件、KDJ API、KDJ 模型注册表条目、KDJ 回测策略与相关说明。
- 删除 iOS KDJ 页面、路由、调试入口与 KDJ 回测策略。
- 删除 KDJ 专用截图、文档章节、Windows CI KDJ 冒烟测试和模型自检 KDJ 用例。
- 保留 HMM、渗流、九转 TD、交易决策、市场预测、因子筛选、组合与回测；所有导航不再出现 KDJ。

### 显示修复

- iPhone / iPad HUD 改为三档响应式宽度：
  - iPad Pro：460pt 中枢 + 148pt 两侧模块；
  - iPad mini：370pt 中枢 + 126pt 两侧模块，不再退回手机单列；
  - iPhone：250pt 中枢 + 两列模块，首屏完整显示管理员名片与版本卡。
- iPad 交易决策保持双列；iPhone 保持单列。

### 发布

- 桌面端 **1.17.0**，iOS **4.1.2 (36)**。
- Release 资产覆盖为 1.17.0 / 4.1.2，旧版本安装包不再作为最新入口。
- 仓库清理旧 KDJ 资源与未引用文件。
