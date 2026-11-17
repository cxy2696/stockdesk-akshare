# 本机构建说明

更新时间：2026-11-17。当前基线是桌面端 1.17.0、iOS 4.1.2 (36)、模型注册表 2.7.0、C++ 核心 1.2.0。

这个目录是 StockDesk 的本地源码副本。源码已与上游 `main` 同步，并做了下面这些本地修改。

## 本地改动

**全市场数据**
- 行情快照从 schema 5 升到 schema 6，股票池由静态列表加运行期发现的新上市组成。
- 每只预期股票都会保留一行，哪怕是停牌或无行情；行上带有 `quote_status`，不会静默丢数据。
- 东财分页并发抓取，单页失败重试，仍失败时用新浪数据补缺；旧版快照缓存不再命中。
- `/api/market/coverage` 返回覆盖率、缺失、重复、停牌、无行情和字段级缺失统计。
- 当前实测：5,581/5,581，`missing=0`，`duplicates=0`，停牌 2 只。

**C++ 核心**
- `backend/native.cpp` 原为单文件，现拆成 `backend/native_core/`：
  - `core.hpp`：结果类型和接口；
  - `percolation.cpp`：union-find 渗流；
  - `hmm.cpp`：Baum-Welch；
  - `census.cpp`：广度统计和覆盖率审计；
  - `bindings.cpp`：pybind11 绑定。
- 修复 `cols=0` 除零、HMM 输入未校验、假报 `converged=True`、非方形格点边界错误。
- 编译参数按平台切换，Windows 不再因 `-O3` 构建失败。

**界面**
- 页头副标题在 100% 缩放下保持单行省略，120%/150% 才换行；1280 宽度页头放宽到 200px。
- 持仓表在 1100px 窗口收起“今日盈亏 / 累计盈亏 / 持有”，股票名称不换行。
- iPad HUD 放大中枢，增加指数/涨跌状态条；iPhone 布局不变。

**后端与构建**
- SQLite 连接改为显式关闭，启用 WAL 和 busy timeout；缓存写入对 NaN/Infinity 做了兜底。
- FastAPI 启动统一到 lifespan。
- 桌面版本从 `backend/config.py` 注入前端，避免版本号不一致。
- PyInstaller 缓存隔离到项目内，package 脚本自动查找 `.venv`。

## 验证记录

| 项目 | 结果 |
| --- | --- |
| `pytest -q tests` | 52 passed |
| `ruff check desktop/backend us tests --select F,E9` | 通过 |
| `python scripts/api_smoke.py http://127.0.0.1:8765` | 47 个只读 + 3 个写接口 + SPA 通过 |
| `python scripts/coverage_check.py http://127.0.0.1:8765` | 5,581/5,581，missing=0，duplicates=0 |
| macOS DMG 启动 | 1.17.0，C++ 1.2.0，模型 2.7.0，覆盖率门禁通过 |
| iOS 模拟器 | `build_ios.sh` 构建成功，iPhone/iPad 页面已验证 |
| Windows | 官方 1.17.0 CI 产物，SHA-256 与官方一致 |

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

安装与校验步骤见 [`release/README.md`](release/README.md)。

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
- Windows 包是上游 1.17.0 CI 构建，本轮源码改动需要下一次 Windows CI 打包。
- 行情来自公开接口，仅供研究，不构成投资建议。
